import { gunzipSync, gzipSync } from 'node:zlib';
import {
  type AnalysisResult,
  analyzePamFile,
  type CoefficientConfig,
  type CpkThresholds,
  PamParseError,
  type ParsedPamFile,
  parsePamFile,
} from '@pam/core';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { sha256 } from '../auth/crypto.js';
import type { Db } from '../db/index.js';
import { machines, resultShafts, results, type Source } from '../db/schema.js';
import type { UploadFile } from './archive.js';
import type { VersionedConfig } from './settings.js';

export type IngestStatus = 'created' | 'duplicate' | 'rejected';

export interface IngestOutcome {
  fileName: string;
  status: IngestStatus;
  resultId?: number;
  /** Language-neutral reason for `rejected`. */
  reason?: 'file_too_large' | 'empty_file' | 'unreadable' | 'no_measurements';
  machineNo?: string;
  headType?: string;
  headSerial?: string;
  cpkXY?: number | null;
  rating?: string | null;
  testDate?: string | null;
  dateSource?: string;
  failed?: number;
  warnings?: string[];
}

export interface IngestContext {
  source: Source;
  config: VersionedConfig;
  thresholds: CpkThresholds;
  maxFileBytes: number;
  timeZone: string;
  /** Company the result belongs to; `null` only for unassigned uploads by service staff. */
  companyId: number | null;
  userId?: number | null;
  deviceId?: number | null;
  /** Upload time; last source for the test date. */
  uploadedAt?: Date;
}

const sameCompany = (column: typeof results.companyId | typeof machines.companyId, companyId: number | null): SQL =>
  companyId === null ? isNull(column) : eq(column, companyId);

const decoder = new TextDecoder('utf-8');

/** Customer names: trimmed, single spaces, at most 120 characters; empty → none. */
export function cleanCustomer(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.replace(/\s+/g, ' ').trim().slice(0, 120);
  return v || undefined;
}

/** Test date set by the user, `YYYY-MM-DD HH:mm(:ss)`; anything else is ignored. */
export function cleanTestDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, sec = '00'] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) || Number(h) > 23 || Number(mi) > 59)
    return undefined;
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}

/** Parses a stored file again exactly as on upload. */
export function parseStoredFile(
  row: { fileGz: Buffer; fileName: string; fileModifiedAt: Date | null; createdAt: Date },
  timeZone: string,
): { content: string; parsed: ParsedPamFile } {
  const content = decoder.decode(gunzipSync(row.fileGz));
  const parsed = parsePamFile(content, row.fileName, {
    timeZone,
    uploadedAt: row.createdAt,
    ...(row.fileModifiedAt ? { lastModified: row.fileModifiedAt } : {}),
  });
  return { content, parsed };
}

/** Column values for `results` and `result_shafts` from an analysis. */
export function metricColumns(parsed: ParsedPamFile, analysis: AnalysisResult, configVersion: string) {
  const { head } = analysis;
  return {
    row: {
      coefficient: analysis.coefficient,
      coefficientSource: analysis.coefficientSource,
      algorithmVersion: analysis.algorithmVersion,
      configVersion,
      cpX: head.x.cp,
      cpkX: head.x.cpk,
      cpY: head.y.cp,
      cpkY: head.y.cpk,
      cpkXY: head.cpkXY,
      rating: head.rating,
      meanX: head.x.mean,
      meanY: head.y.mean,
      meanQ: head.q.mean,
      sigma3X: head.x.sigma3,
      sigma3Y: head.y.sigma3,
      sigma3Q: head.q.sigma3,
      measured: analysis.measuredComponents,
      expected: analysis.expectedComponents,
      failed: analysis.failedMeasurements,
      componentStatus: analysis.componentStatus,
      warnings: parsed.warnings.length,
      h08mVariant: parsed.header.h08mVariant,
      toolType: parsed.header.toolType,
      toolSerial: parsed.header.toolSerial,
    },
    shafts: analysis.shafts.map((s) => ({
      shaft: s.shaft,
      label: s.label,
      count: s.count,
      cpkX: s.x.cpk,
      cpkY: s.y.cpk,
      cpkXY: s.cpkXY,
      rating: s.rating,
    })),
  };
}

/** Evaluates one PAM file, detects duplicates and stores it together with its metrics. */
export function ingestFile(db: Db, file: UploadFile, ctx: IngestContext): IngestOutcome {
  const base = { fileName: file.name };
  if (file.bytes.length > ctx.maxFileBytes) return { ...base, status: 'rejected', reason: 'file_too_large' };

  const hash = sha256(file.bytes);
  const existing = db
    .select({ id: results.id })
    .from(results)
    .where(and(eq(results.sha256, hash), sameCompany(results.companyId, ctx.companyId), isNull(results.deletedAt)))
    .get();
  if (existing) return { ...base, status: 'duplicate', resultId: existing.id };

  const uploadedAt = ctx.uploadedAt ?? new Date();
  let parsed: ParsedPamFile;
  try {
    parsed = parsePamFile(decoder.decode(file.bytes), file.name, {
      timeZone: ctx.timeZone,
      uploadedAt,
      now: uploadedAt,
      ...(file.lastModified ? { lastModified: file.lastModified } : {}),
    });
  } catch (error) {
    return { ...base, status: 'rejected', reason: error instanceof PamParseError ? 'empty_file' : 'unreadable' };
  }
  if (parsed.measurements.length === 0) return { ...base, status: 'rejected', reason: 'no_measurements' };

  const analysis = analyzePamFile(parsed, {
    config: ctx.config.config as CoefficientConfig,
    thresholds: ctx.thresholds,
  });
  const { row, shafts } = metricColumns(parsed, analysis, ctx.config.version);
  const h = parsed.header;

  const resultId = db.transaction((tx) => {
    let machine = tx
      .select({ id: machines.id })
      .from(machines)
      .where(and(eq(machines.machineNo, h.machineNo), sameCompany(machines.companyId, ctx.companyId)))
      .get();
    if (!machine) {
      machine = tx
        .insert(machines)
        .values({
          companyId: ctx.companyId,
          machineNo: h.machineNo,
          family: h.machineFamily,
          model: h.machineModel || null,
        })
        .returning({ id: machines.id })
        .get();
    }
    const inserted = tx
      .insert(results)
      .values({
        ...row,
        sha256: hash,
        fileName: file.name,
        fileSize: file.bytes.length,
        fileGz: gzipSync(file.bytes, { level: 9 }),
        fileModifiedAt: file.lastModified ?? null,
        machineNo: h.machineNo,
        machineFamily: h.machineFamily,
        headType: h.headType,
        headSerial: h.headSerial,
        testDate: file.testDate ?? h.testDate ?? '',
        dateSource: file.testDate ? 'manual' : h.dateSource,
        customer: file.customer ?? null,
        companyId: ctx.companyId,
        machineId: machine.id,
        source: ctx.source,
        uploadedBy: ctx.userId ?? null,
        deviceId: ctx.deviceId ?? null,
        createdAt: uploadedAt,
      })
      .returning({ id: results.id })
      .get();
    if (shafts.length)
      tx.insert(resultShafts)
        .values(shafts.map((s) => ({ ...s, resultId: inserted.id })))
        .run();
    return inserted.id;
  });

  return {
    ...base,
    status: 'created',
    resultId,
    machineNo: h.machineNo,
    headType: h.headType,
    headSerial: h.headSerial,
    cpkXY: analysis.head.cpkXY,
    rating: analysis.head.rating,
    testDate: file.testDate ?? h.testDate,
    dateSource: file.testDate ? 'manual' : h.dateSource,
    failed: analysis.failedMeasurements,
    warnings: parsed.warnings.map((w) => w.code),
  };
}
