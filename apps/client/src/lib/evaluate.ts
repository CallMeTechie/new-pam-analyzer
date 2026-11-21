import {
  type AnalysisResult,
  analyzePamFile,
  type CoefficientConfig,
  type CpkThresholds,
  PamParseError,
  type ParsedPamFile,
  parsePamFile,
} from '@pam/core';
import type { ResultDetail, ResultRow } from '@web/lib/api';
import { unzipSync } from 'fflate';
import type { EvalConfig, LocalResult } from './types';

/** A file as it reaches the app: opened, dropped or passed by a double-click. */
export interface InputFile {
  name: string;
  /** Full path on this PC, if known. */
  path: string | null;
  bytes: Uint8Array;
  lastModified: number | null;
}

export type RejectReason = 'file_too_large' | 'empty_file' | 'unreadable' | 'no_measurements' | 'unsupported_type';

/** Same limit as the server. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const decoder = new TextDecoder('utf-8');
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** `.dat` files directly; `.zip` archives are opened (also nested once), everything else is skipped. */
export function expandInput(file: InputFile, depth = 0): { files: InputFile[]; skipped: string[] } {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.dat')) return { files: [file], skipped: [] };
  if (lower.endsWith('.zip') && depth < 2) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(file.bytes);
    } catch {
      return { files: [], skipped: [file.name] };
    }
    const out: InputFile[] = [];
    const skipped: string[] = [];
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith('/')) continue;
      const base = name.split('/').pop() ?? name;
      const inner = expandInput({ name: base, path: null, bytes, lastModified: file.lastModified }, depth + 1);
      out.push(...inner.files);
      skipped.push(...inner.skipped);
    }
    return { files: out, skipped };
  }
  return { files: [], skipped: [file.name] };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parses a file exactly like the server does on upload. */
export function parseFile(
  bytes: Uint8Array,
  name: string,
  lastModified: number | null,
  importedAt: number,
  timeZone: string | null = null,
): ParsedPamFile {
  const at = new Date(importedAt);
  return parsePamFile(decoder.decode(bytes), name, {
    timeZone: timeZone ?? localZone(),
    uploadedAt: at,
    now: at,
    ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
  });
}

export function analyze(parsed: ParsedPamFile, config: EvalConfig, coefficient?: number): AnalysisResult {
  return analyzePamFile(parsed, {
    config: config.coefficients as CoefficientConfig,
    thresholds: config.thresholds as CpkThresholds,
    ...(coefficient === undefined ? {} : { coefficient }),
  });
}

/** List columns of a result, as the server stores them. */
export function metrics(parsed: ParsedPamFile, analysis: AnalysisResult) {
  const h = parsed.header;
  return {
    machineNo: h.machineNo,
    machineFamily: h.machineFamily,
    headType: h.headType,
    headSerial: h.headSerial,
    toolType: h.toolType,
    toolSerial: h.toolSerial,
    h08mVariant: h.h08mVariant,
    testDate: h.testDate ?? '',
    dateSource: h.dateSource as LocalResult['dateSource'],
    cpkX: analysis.head.x.cpk,
    cpkY: analysis.head.y.cpk,
    cpkXY: analysis.head.cpkXY,
    rating: analysis.head.rating,
    measured: analysis.measuredComponents,
    expected: analysis.expectedComponents,
    failed: analysis.failedMeasurements,
    componentStatus: analysis.componentStatus,
    warnings: parsed.warnings.length,
  } satisfies Partial<LocalResult>;
}

/**
 * Evaluates one file; `null` analysis means rejected with `reason`.
 */
export function evaluate(
  file: InputFile,
  config: EvalConfig,
  importedAt: number,
): { ok: true; parsed: ParsedPamFile; analysis: AnalysisResult } | { ok: false; reason: RejectReason } {
  if (file.bytes.length > MAX_FILE_BYTES) return { ok: false, reason: 'file_too_large' };
  let parsed: ParsedPamFile;
  try {
    parsed = parseFile(file.bytes, file.name, file.lastModified, importedAt, config.timeZone);
  } catch (error) {
    return { ok: false, reason: error instanceof PamParseError ? 'empty_file' : 'unreadable' };
  }
  if (parsed.measurements.length === 0) return { ok: false, reason: 'no_measurements' };
  return { ok: true, parsed, analysis: analyze(parsed, config) };
}

/** Row of the web result lists for a local result. */
export function toRow(r: LocalResult): ResultRow {
  return {
    id: r.id,
    companyId: null,
    companyName: null,
    machineNo: r.machineNo,
    machineFamily: r.machineFamily,
    line: null,
    customer: r.customer ?? null,
    headType: r.headType,
    headSerial: r.headSerial,
    toolType: r.toolType,
    toolSerial: r.toolSerial,
    h08mVariant: r.h08mVariant,
    testDate: r.testDate,
    dateSource: r.dateSource,
    cpkX: r.cpkX,
    cpkY: r.cpkY,
    cpkXY: r.cpkXY,
    rating: r.rating,
    measured: r.measured,
    expected: r.expected,
    failed: r.failed,
    componentStatus: r.componentStatus,
    warnings: r.warnings,
    fileName: r.fileName,
    source: 'app',
    createdAt: new Date(r.importedAt).toISOString(),
  };
}

/** Full evaluation for the result page, in the format of `GET /api/results/:id`. */
export function detail(r: LocalResult, bytes: Uint8Array, config: EvalConfig): ResultDetail {
  const parsed = parseFile(bytes, r.fileName, r.fileModifiedAt, r.importedAt, config.timeZone);
  return {
    result: {
      id: r.id,
      companyId: null,
      companyName: null,
      companyLogoVersion: null,
      line: null,
      customer: r.customer ?? null,
      fileName: r.fileName,
      fileSize: r.fileSize,
      testDate: r.testDate,
      dateSource: r.dateSource,
      source: 'app',
      createdAt: new Date(r.importedAt).toISOString(),
      configVersion: config.version,
    },
    header: parsed.header,
    shaftCount: parsed.shaftCount,
    warnings: parsed.warnings,
    invalidLines: parsed.invalidLines,
    measurements: parsed.measurements,
    analysis: analyze(parsed, config),
    config: config.coefficients,
    thresholds: config.thresholds,
  };
}
