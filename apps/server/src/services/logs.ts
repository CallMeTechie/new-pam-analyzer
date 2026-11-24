import { statfsSync, statSync } from 'node:fs';
import { and, count, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { logEntries } from '../db/schema.js';

/**
 * Logs & Monitoring: one protocol for the server and the connected apps. Writing never throws: a
 * protocol that breaks the request it describes would make things worse.
 */

export const LOG_LEVELS = ['crash', 'error', 'warning', 'info', 'report'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const LOG_SOURCES = ['server', 'windows', 'android', 'other'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export interface LogInput {
  level: LogLevel;
  source: LogSource;
  category: string;
  message: string;
  details?: string | null;
  history?: string | null;
  context?: Record<string, unknown> | null;
  deviceId?: number | null;
  companyId?: number | null;
  userId?: number | null;
  appVersion?: string | null;
  deviceName?: string | null;
  system?: string | null;
  clientId?: string | null;
  occurredAt?: Date;
  /** Equal entries within this time only raise the count (default 10 minutes; 0: never merge). */
  mergeWithinMs?: number;
}

/** When this server process started (Monitoring: uptime). */
export const SERVER_STARTED = new Date();

const MAX_MESSAGE = 1000;
const MAX_DETAILS = 200_000;
const MAX_HISTORY = 50_000;
const MAX_CONTEXT = 20_000;
const MERGE_DEFAULT = 10 * 60_000;
/** Entries an app may send per hour; more are accepted (so it deletes them) but not stored. */
export const DEVICE_LIMIT_PER_HOUR = 100;

const cut = (value: string | null | undefined, max: number) =>
  value ? (value.length > max ? `${value.slice(0, max)}\n…` : value) : null;

/** Numbers, ids and quoted values vary between equal messages; they do not count for "equal". */
export function fingerprint(level: string, source: string, category: string, message: string): string {
  const core = message
    .replace(/0x[0-9a-f]+/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return `${level}|${source}|${category}|${core}`;
}

export function writeLog(db: Db, input: LogInput): { id: number; merged: boolean } | null {
  try {
    const message = (input.message.replace(/\s+$/g, '').slice(0, MAX_MESSAGE) || '–').trim() || '–';
    const at = input.occurredAt ?? new Date();
    const print = fingerprint(input.level, input.source, input.category, message);
    const window = input.mergeWithinMs ?? MERGE_DEFAULT;
    const clientId = input.clientId?.slice(0, 100) ?? null;
    // An app resends what it did not get an answer for: an id seen before changes nothing.
    if (clientId && input.deviceId) {
      const seen = db
        .select({ id: logEntries.id })
        .from(logEntries)
        .where(
          and(
            eq(logEntries.deviceId, input.deviceId),
            or(eq(logEntries.clientId, clientId), sql`instr(${logEntries.mergedIds}, ${`|${clientId}|`}) > 0`),
          ),
        )
        .get();
      if (seen) return { id: seen.id, merged: true };
    }
    if (window > 0 && input.level !== 'report') {
      const same = db
        .select({ id: logEntries.id })
        .from(logEntries)
        .where(
          and(
            eq(logEntries.fingerprint, print),
            input.deviceId ? eq(logEntries.deviceId, input.deviceId) : isNull(logEntries.deviceId),
            gte(logEntries.lastAt, new Date(at.getTime() - window)),
          ),
        )
        .orderBy(sql`${logEntries.lastAt} desc`)
        .get();
      if (same) {
        db.update(logEntries)
          .set({
            count: sql`${logEntries.count} + 1`,
            lastAt: at,
            // Remember the app's id (the last 50 are enough for resends).
            ...(clientId
              ? { mergedIds: sql`substr(coalesce(${logEntries.mergedIds}, '|') || ${`${clientId}|`}, -5000)` }
              : {}),
          })
          .where(eq(logEntries.id, same.id))
          .run();
        return { id: same.id, merged: true };
      }
    }
    let context = input.context ?? null;
    if (context && JSON.stringify(context).length > MAX_CONTEXT) context = { truncated: true };
    const row = db
      .insert(logEntries)
      .values({
        level: input.level,
        source: input.source,
        category: input.category.slice(0, 40) || 'other',
        message,
        details: cut(input.details, MAX_DETAILS),
        history: cut(input.history, MAX_HISTORY),
        context,
        deviceId: input.deviceId ?? null,
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
        appVersion: input.appVersion?.slice(0, 40) ?? null,
        deviceName: input.deviceName?.slice(0, 120) ?? null,
        system: input.system?.slice(0, 200) ?? null,
        clientId,
        fingerprint: print,
        occurredAt: at,
        lastAt: at,
      })
      .onConflictDoNothing()
      .returning({ id: logEntries.id })
      .get();
    return row ? { id: row.id, merged: false } : null;
  } catch (error) {
    console.error('Could not write a log entry:', error);
    return null;
  }
}

/** Server event; also printed, so `docker logs` shows it. */
export function serverLog(
  db: Db,
  level: Exclude<LogLevel, 'report' | 'crash'>,
  category: string,
  message: string,
  extra: Omit<LogInput, 'level' | 'source' | 'category' | 'message'> = {},
): void {
  const line = `[${level}] ${category}: ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  writeLog(db, { ...extra, level, source: 'server', category, message });
}

/** Entries an app sent in the last hour (for the limit per device). */
export function recentDeviceEntries(db: Db, deviceId: number): number {
  return (
    db
      .select({ n: count() })
      .from(logEntries)
      .where(and(eq(logEntries.deviceId, deviceId), gte(logEntries.createdAt, new Date(Date.now() - 3_600_000))))
      .get()?.n ?? 0
  );
}

/** Deletes entries older than the retention. */
export function deleteOldLogs(db: Db, days: number): number {
  const before = new Date(Date.now() - days * 86_400_000);
  return db.delete(logEntries).where(lt(logEntries.lastAt, before)).run().changes;
}

export interface StorageInfo {
  databaseBytes: number;
  freeBytes: number | null;
  totalBytes: number | null;
}

/** Size of the database (with its write-ahead log) and free space in the data folder. */
export function storageInfo(databaseFile: string, dataDir: string): StorageInfo {
  const size = (file: string) => {
    try {
      return statSync(file).size;
    } catch {
      return 0;
    }
  };
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  try {
    const fs = statfsSync(dataDir);
    freeBytes = fs.bavail * fs.bsize;
    totalBytes = fs.blocks * fs.bsize;
  } catch {
    // not available on this system
  }
  const databaseBytes =
    databaseFile === ':memory:' ? 0 : size(databaseFile) + size(`${databaseFile}-wal`) + size(`${databaseFile}-shm`);
  return { databaseBytes, freeBytes, totalBytes };
}

export const LOW_DISK_BYTES = 1024 ** 3;

/** Warns once a day while less than 1 GB is free on the data folder. */
export function checkDisk(db: Db, databaseFile: string, dataDir: string): void {
  const { freeBytes } = storageInfo(databaseFile, dataDir);
  if (freeBytes === null || freeBytes >= LOW_DISK_BYTES) return;
  serverLog(db, 'warning', 'disk', `Little space left on ${dataDir}: ${Math.round(freeBytes / 1024 ** 2)} MB free`, {
    context: { freeBytes },
    mergeWithinMs: 24 * 3_600_000,
  });
}
