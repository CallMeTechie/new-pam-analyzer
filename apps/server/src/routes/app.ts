import { ALGORITHM_VERSION } from '@pam/core';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { connectDevice, disconnectDevice } from '../auth/apiKeys.js';
import { checkCredentials } from '../auth/login.js';
import { requireAuth } from '../auth/middleware.js';
import { companies, crashReports, devices, users } from '../db/schema.js';
import { type AppEnv, HttpError, jsonBody, parse } from '../http.js';
import { getCoefficientConfig, getThresholds } from '../services/settings.js';

/**
 * Endpoints for the Windows, Android and iOS apps. An app connects once with an API key of the
 * company plus the user's e-mail and password and then uses the returned device token.
 */
export const appRoutes = new Hono<AppEnv>();

const PLATFORMS = ['windows', 'android', 'ios', 'macos', 'linux', 'other'] as const;

appRoutes.post('/connect', async (c) => {
  const body = parse(
    z.object({
      apiKey: z.string().trim().min(10).max(200),
      email: z.string().trim().toLowerCase().max(200),
      password: z.string().min(1).max(200),
      installId: z.string().trim().min(8).max(100),
      deviceName: z.string().trim().min(1).max(100),
      platform: z.enum(PLATFORMS),
      appVersion: z.string().trim().max(40).optional(),
    }),
    await jsonBody(c),
  );
  const db = c.get('db');
  const userId = await checkCredentials(db, c.get('config'), body.email, body.password);
  const account = db.select({ mustChange: users.mustChangePassword }).from(users).where(eq(users.id, userId)).get();
  if (account?.mustChange) {
    throw new HttpError(
      403,
      'password_change_required',
      'Please sign in on the web once and change your initial password.',
    );
  }
  const { token, deviceId } = connectDevice(db, {
    apiKey: body.apiKey,
    userId,
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

/**
 * Crash reports the app stored while it was not connected (or crashed). Returns the ids it may delete;
 * a report sent twice is stored once.
 */
appRoutes.post('/crash-reports', async (c) => {
  const auth = requireAuth(c);
  if (auth.kind !== 'device') throw new HttpError(403, 'forbidden', 'Only for connected devices.');
  const body = parse(z.object({ reports: z.array(crashReport).max(50) }), await jsonBody(c));
  const db = c.get('db');
  const device = db
    .select({ name: devices.name, platform: devices.platform, appVersion: devices.appVersion })
    .from(devices)
    .where(eq(devices.id, auth.device.id))
    .get();
  for (const r of body.reports) {
    db.insert(crashReports)
      .values({
        deviceId: auth.device.id,
        companyId: auth.device.companyId,
        clientId: r.id,
        platform: device?.platform ?? 'other',
        appVersion: r.appVersion ?? device?.appVersion ?? null,
        deviceName: device?.name ?? null,
        system: r.system ?? null,
        kind: r.kind,
        message: r.message.slice(0, 1000) || '–',
        report: r.report,
        occurredAt: new Date(r.occurredAt),
      })
      .onConflictDoNothing()
      .run();
  }
  return c.json({ accepted: body.reports.map((r) => r.id) });
});
