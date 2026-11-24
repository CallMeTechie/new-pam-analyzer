import { ALGORITHM_VERSION } from '@pam/core';
import { eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { connectDevice, disconnectDevice } from '../auth/devices.js';
import { requireAuth } from '../auth/middleware.js';
import { companies, devices, users } from '../db/schema.js';
import { type AppEnv, HttpError, jsonBody, parse } from '../http.js';
import { DEVICE_LIMIT_PER_HOUR, LOG_LEVELS, type LogSource, recentDeviceEntries, writeLog } from '../services/logs.js';
import { getCoefficientConfig, getThresholds } from '../services/settings.js';

/**
 * Endpoints for the Windows, Android and iOS apps. An app connects once with a one-time code (from an
 * invitation or from "My account → Connect device") and then uses the returned device token.
 */
export const appRoutes = new Hono<AppEnv>();

const PLATFORMS = ['windows', 'android', 'ios', 'macos', 'linux', 'other'] as const;

appRoutes.post('/connect', async (c) => {
  const body = parse(
    z.object({
      /** One-time code from an invitation or from "My account → Connect device", e.g. `7KQ4-M2XP`. */
      code: z.string().trim().min(4).max(40),
      installId: z.string().trim().min(8).max(100),
      deviceName: z.string().trim().min(1).max(100),
      platform: z.enum(PLATFORMS),
      appVersion: z.string().trim().max(40).optional(),
    }),
    await jsonBody(c),
  );
  const db = c.get('db');
  const { token, deviceId, userId } = connectDevice(db, {
    code: body.code,
    installId: body.installId,
    name: body.deviceName,
    platform: body.platform,
    appVersion: body.appVersion,
  });
  const info = db
    .select({ userName: users.name, locale: users.locale, companyId: companies.id, companyName: companies.name })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.id, userId))
    .get();
  return c.json({ token, deviceId, ...info, ...appConfig(c.get('db'), c.get('config').timeZone) }, 201);
});

function appConfig(db: AppEnv['Variables']['db'], timeZone: string) {
  return {
    algorithmVersion: ALGORITHM_VERSION,
    /** Time zone of the machines, for test dates taken from file dates (since app 0.1). */
    timeZone,
    cpkThresholds: getThresholds(db),
    coefficients: getCoefficientConfig(db),
  };
}

/** Current evaluation settings, so offline results match the server. */
appRoutes.get('/config', (c) => {
  const auth = requireAuth(c);
  if (auth.kind !== 'device') throw new HttpError(403, 'forbidden', 'Only for connected devices.');
  return c.json(appConfig(c.get('db'), c.get('config').timeZone));
});

/** The app disconnects itself and frees its slot. */
appRoutes.delete('/connection', (c) => {
  const auth = requireAuth(c);
  if (auth.kind !== 'device') throw new HttpError(403, 'forbidden', 'Only for connected devices.');
  disconnectDevice(c.get('db'), auth.device.id);
  return c.body(null, 204);
});

const crashReport = z.object({
  id: z.string().trim().min(1).max(100),
  kind: z.enum(['android', 'panic']),
  occurredAt: z.number().int().positive(),
  appVersion: z.string().trim().max(40).optional(),
  system: z.string().trim().max(200).optional(),
  message: z.string().max(1000),
  report: z.string().max(200_000),
});

const logEntry = z.object({
  /** Id the app gave the entry; a resend is stored once. */
  id: z.string().trim().min(1).max(100),
  level: z.enum(LOG_LEVELS),
  category: z.string().trim().min(1).max(40),
  message: z.string().max(1000),
  details: z.string().max(200_000).optional(),
  history: z.string().max(50_000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.number().int().positive(),
  appVersion: z.string().trim().max(40).optional(),
  system: z.string().trim().max(200).optional(),
});

function deviceOf(c: Context<AppEnv>) {
  const auth = requireAuth(c);
  if (auth.kind !== 'device') throw new HttpError(403, 'forbidden', 'Only for connected devices.');
  const device = c
    .get('db')
    .select({ name: devices.name, platform: devices.platform, appVersion: devices.appVersion })
    .from(devices)
    .where(eq(devices.id, auth.device.id))
    .get();
  const platform = device?.platform;
  const source: LogSource = platform === 'windows' || platform === 'android' ? platform : 'other';
  return { auth, device, source };
}

/**
 * Logs & Monitoring: crashes, errors, warnings and problem reports of the app, sent once it is
 * connected; with them the app reports its upload queue. Returns the ids it may delete; an entry sent
 * twice is stored once. More than 100 entries per hour from one device are accepted but not stored.
 */
appRoutes.post('/logs', async (c) => {
  const { auth, device, source } = deviceOf(c);
  const body = parse(
    z.object({
      entries: z.array(logEntry).max(100),
      state: z.object({ queued: z.number().int().min(0).max(1_000_000).optional() }).optional(),
    }),
    await jsonBody(c),
  );
  const db = c.get('db');
  if (body.state?.queued !== undefined)
    db.update(devices).set({ queuedFiles: body.state.queued }).where(eq(devices.id, auth.device.id)).run();
  let room = DEVICE_LIMIT_PER_HOUR - recentDeviceEntries(db, auth.device.id);
  let dropped = 0;
  for (const e of body.entries) {
    if (room <= 0 && e.level !== 'report') {
      dropped++;
      continue;
    }
    const stored = writeLog(db, {
      level: e.level,
      source,
      category: e.category,
      message: e.message,
      details: e.details ?? null,
      history: e.history ?? null,
      context: e.context ?? null,
      deviceId: auth.device.id,
      companyId: auth.device.companyId,
      userId: auth.user.id,
      appVersion: e.appVersion ?? device?.appVersion ?? null,
      deviceName: device?.name ?? null,
      system: e.system ?? null,
      clientId: e.id,
      occurredAt: new Date(e.occurredAt),
    });
    if (stored && !stored.merged) room--;
  }
  if (dropped)
    writeLog(db, {
      level: 'warning',
      source,
      category: 'limit',
      message: `More than ${DEVICE_LIMIT_PER_HOUR} entries in one hour: ${dropped} not stored`,
      deviceId: auth.device.id,
      companyId: auth.device.companyId,
      userId: auth.user.id,
      deviceName: device?.name ?? null,
      mergeWithinMs: 3_600_000,
    });
  return c.json({ accepted: body.entries.map((e) => e.id) });
});

/** Crash reports of app versions before Logs & Monitoring; stored in the same protocol. */
appRoutes.post('/crash-reports', async (c) => {
  const { auth, device, source } = deviceOf(c);
  const body = parse(z.object({ reports: z.array(crashReport).max(50) }), await jsonBody(c));
  const db = c.get('db');
  for (const r of body.reports) {
    writeLog(db, {
      level: 'crash',
      source,
      category: r.kind,
      message: r.message,
      details: r.report,
      deviceId: auth.device.id,
      companyId: auth.device.companyId,
      userId: auth.user.id,
      appVersion: r.appVersion ?? device?.appVersion ?? null,
      deviceName: device?.name ?? null,
      system: r.system ?? null,
      clientId: r.id,
      occurredAt: new Date(r.occurredAt),
      mergeWithinMs: 0,
    });
  }
  return c.json({ accepted: body.reports.map((r) => r.id) });
});
