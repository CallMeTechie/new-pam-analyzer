import { and, desc, eq, isNull } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { hashPassword } from '../auth/crypto.js';
import {
  type CodePurpose,
  createConnectCode,
  deviceLimit,
  disconnectDevice,
  findConnectCode,
  normaliseCode,
} from '../auth/devices.js';
import { canManageCompany, currentUser, requireManage } from '../auth/middleware.js';
import { deleteUserSessions } from '../auth/sessions.js';
import type { Db } from '../db/index.js';
import { companies, connectCodes, devices, users } from '../db/schema.js';
import { type AppEnv, HttpError, idParam, jsonBody, notFound, parse } from '../http.js';
import { sendInvite } from '../services/mail.js';
import { password } from './auth.js';

/**
 * Address the QR codes and invitation links point to: the public address when configured, else the
 * address the browser used (the web UI sends `Origin` with every change).
 */
export function baseUrl(c: Context<AppEnv>): string {
  const configured = c.get('config').publicUrl;
  if (configured) return configured;
  const origin = c.req.header('origin');
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  return new URL(c.req.url).origin;
}

export interface IssuedCode {
  code: string;
  /** `https://<server>/connect/<code>`: opens the web page, and the apps read server and code from it. */
  url: string;
  expiresAt: string;
}

export function issueCode(c: Context<AppEnv>, userId: number, purpose: CodePurpose, createdBy: number): IssuedCode {
  const { code, expiresAt } = createConnectCode(c.get('db'), { userId, purpose, createdBy });
  return { code, url: `${baseUrl(c)}/connect/${normaliseCode(code)}`, expiresAt: expiresAt.toISOString() };
}

/**
 * New invitation for a user (also replaces a lost one). With `send` and a mail server configured the
 * link goes out by e-mail; otherwise the person who invites hands it over.
 */
export async function inviteUser(
  c: Context<AppEnv>,
  userId: number,
  actorId: number,
  send: boolean,
): Promise<IssuedCode & { emailed: boolean; mailError?: string }> {
  const issued = issueCode(c, userId, 'invite', actorId);
  const smtp = c.get('config').smtp;
  if (!send || !smtp) return { ...issued, emailed: false };
  const user = c
    .get('db')
    .select({ email: users.email, name: users.name, locale: users.locale, companyName: companies.name })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.id, userId))
    .get();
  if (!user) return { ...issued, emailed: false };
  try {
    await sendInvite(smtp, {
      to: user.email,
      name: user.name,
      companyName: user.companyName,
      link: issued.url,
      code: issued.code,
      expiresAt: new Date(issued.expiresAt),
      locale: user.locale,
    });
    return { ...issued, emailed: true };
  } catch (error) {
    return { ...issued, emailed: false, mailError: error instanceof Error ? error.message : String(error) };
  }
}

/* ----------------------------- public: /api/connect/:code ----------------------------- */

export const connectRoutes = new Hono<AppEnv>();

/** What the page behind an invitation or connect link shows. Never reveals whether other codes exist. */
connectRoutes.get('/:code', (c) => {
  const code = findConnectCode(c.get('db'), c.req.param('code'));
  if (!code) throw new HttpError(404, 'invalid_code', 'The code is invalid, expired or already used.');
  return c.json({
    purpose: code.purpose,
    name: code.userName,
    email: code.email,
    companyName: code.companyName,
    expiresAt: code.expiresAt.toISOString(),
    /** The invitation still sets the first password. */
    needsPassword: code.purpose === 'invite' && !code.passwordSetAt,
    deviceConnected: Boolean(code.deviceConnectedAt),
  });
});

/** Sets the first password with an invitation; afterwards the member signs in normally. */
connectRoutes.post('/:code/password', async (c) => {
  const db = c.get('db');
  const code = findConnectCode(db, c.req.param('code'));
  if (code?.purpose !== 'invite' || code.passwordSetAt) {
    throw new HttpError(404, 'invalid_code', 'The code is invalid, expired or already used.');
  }
  const body = parse(z.object({ password }), await jsonBody(c));
  const now = new Date();
  const hash = await hashPassword(body.password);
  db.transaction((tx) => {
    tx.update(users)
      .set({ passwordHash: hash, mustChangePassword: false, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, code.userId))
      .run();
    tx.update(connectCodes).set({ passwordSetAt: now }).where(eq(connectCodes.id, code.id)).run();
  });
  deleteUserSessions(db, code.userId);
  return c.json({ email: code.email });
});

/* ----------------------------- devices: /api/devices ----------------------------- */

export const deviceRoutes = new Hono<AppEnv>();

function deviceList(db: Db, where: ReturnType<typeof and>) {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      platform: devices.platform,
      appVersion: devices.appVersion,
      userId: devices.userId,
      userName: users.name,
      uploadCount: devices.uploadCount,
      lastSeenAt: devices.lastSeenAt,
      createdAt: devices.createdAt,
    })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(and(isNull(devices.disconnectedAt), where))
    .orderBy(desc(devices.lastSeenAt))
    .all();
}

/** Own devices, or with `?companyId=` all devices of a company (company admins and administrators). */
deviceRoutes.get('/', (c) => {
  const user = currentUser(c);
  const db = c.get('db');
  const companyId = c.req.query('companyId') ? Number(c.req.query('companyId')) : null;
  if (companyId) {
    requireManage(c, companyId);
    return c.json({
      items: deviceList(db, eq(users.companyId, companyId)),
      maxDevicesPerUser: deviceLimit(db, companyId),
    });
  }
  return c.json({
    items: deviceList(db, eq(devices.userId, user.id)),
    maxDevicesPerUser: deviceLimit(db, user.companyId),
  });
});

/** Code for one more device of the signed-in user (10 minutes, once). */
deviceRoutes.post('/connect-code', (c) => {
  const user = currentUser(c);
  return c.json(issueCode(c, user.id, 'device', user.id), 201);
});

/** Disconnects a device: own devices, or any device of a company one manages. */
deviceRoutes.delete('/:id', (c) => {
  const id = idParam(c);
  const db = c.get('db');
  const user = currentUser(c);
  const row = db
    .select({ id: devices.id, userId: devices.userId, companyId: users.companyId })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(eq(devices.id, id))
    .get();
  if (!row || (row.userId !== user.id && !canManageCompany(user, row.companyId))) throw notFound('Device');
  disconnectDevice(db, row.id);
  return c.body(null, 204);
});
