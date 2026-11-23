import { type CoefficientConfig, CPK_THRESHOLDS, type CpkThresholds, DEFAULT_CONFIG, validThresholds } from '@pam/core';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { resultShafts, results, settings } from '../db/schema.js';

export interface VersionedConfig {
  /** `default` for the built-in values, otherwise the ISO time of the change. */
  version: string;
  config: CoefficientConfig;
}

export const DEFAULT_VERSIONED: VersionedConfig = { version: 'default', config: DEFAULT_CONFIG };

const CURRENT = 'coefficients';
const versionKey = (version: string) => `coefficients@${version}`;

const typeKey = z.string().trim().min(1).max(24);
const tolerance = z.number().positive().max(1000);
const count = z.number().int().positive().max(100000);

export const coefficientConfigSchema = z.object({
  cpkCoefficients: z.record(typeKey, tolerance),
  dynaheadTools: z.record(typeKey, tolerance),
  placementCounts: z.record(typeKey, z.union([count, z.literal('tool_dependent'), z.null()])),
  dynaheadToolPlacements: z.record(typeKey, count),
  defaultCoefficient: tolerance,
});

/** Raw setting (JSON); for settings kept by other services, e.g. the mail server. */
export function readSetting<T>(db: Db, key: string): T | undefined {
  return read<T>(db, key);
}

export function writeSetting(db: Db, key: string, value: unknown, userId: number | null): void {
  write(db, key, value, userId);
}

function read<T>(db: Db, key: string): T | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value as T | undefined;
}

function write(db: Db, key: string, value: unknown, userId: number | null): void {
  const updatedAt = new Date();
  db.insert(settings)
    .values({ key, value, updatedBy: userId, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: userId, updatedAt } })
    .run();
}

export function getCoefficientConfig(db: Db): VersionedConfig {
  return read<VersionedConfig>(db, CURRENT) ?? DEFAULT_VERSIONED;
}

/** The configuration a result was evaluated with; every version ever saved is kept. */
export function getCoefficientConfigVersion(db: Db, version: string): VersionedConfig {
  if (version === 'default') return DEFAULT_VERSIONED;
  return read<VersionedConfig>(db, versionKey(version)) ?? getCoefficientConfig(db);
}

export function setCoefficientConfig(db: Db, config: CoefficientConfig, userId: number): VersionedConfig {
  const value: VersionedConfig = { version: new Date().toISOString(), config };
  db.transaction((tx) => {
    write(tx as unknown as Db, versionKey(value.version), value, userId);
    write(tx as unknown as Db, CURRENT, value, userId);
  });
  return value;
}

export const generalSettingsSchema = z.object({
  /** Proposed maximum number of devices for a new API key. */
  /** Devices (apps) per user, unless the company sets its own limit. */
  maxDevicesPerUser: z.number().int().min(1).max(100),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

const GENERAL = 'general';
export const DEFAULT_GENERAL: GeneralSettings = { maxDevicesPerUser: 3 };

export function getGeneralSettings(db: Db): GeneralSettings {
  const stored = read<Partial<GeneralSettings> & { defaultMaxConnections?: number }>(db, GENERAL) ?? {};
  return { maxDevicesPerUser: stored.maxDevicesPerUser ?? DEFAULT_GENERAL.maxDevicesPerUser };
}

export function setGeneralSettings(db: Db, value: GeneralSettings, userId: number): GeneralSettings {
  write(db, GENERAL, value, userId);
  return value;
}

const RATING = 'rating';

export const thresholdsSchema = z
  .object({
    warning: z.number().positive().max(99),
    good: z.number().positive().max(99),
    excellent: z.number().positive().max(99),
  })
  .refine(validThresholds, { message: 'Thresholds must be ascending: warning < good < excellent.' });

/** Current rating thresholds; the calculation core's defaults until an administrator changes them. */
export function getThresholds(db: Db): CpkThresholds {
  return read<CpkThresholds>(db, RATING) ?? CPK_THRESHOLDS;
}

const ratingSql = (column: unknown, t: CpkThresholds) =>
  sql`case when ${column} is null then null
    when ${column} < ${t.warning} then 'critical'
    when ${column} < ${t.good} then 'warning'
    when ${column} < ${t.excellent} then 'good'
    else 'excellent' end`;

/** Saves new thresholds and rates every stored result and holder again. */
export function setThresholds(db: Db, t: CpkThresholds, userId: number): CpkThresholds {
  db.transaction((tx) => {
    write(tx as unknown as Db, RATING, t, userId);
    tx.update(results)
      .set({ rating: ratingSql(results.cpkXY, t) })
      .run();
    tx.update(resultShafts)
      .set({ rating: ratingSql(resultShafts.cpkXY, t) })
      .run();
  });
  return t;
}
