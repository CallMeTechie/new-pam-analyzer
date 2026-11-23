import { randomInt } from 'node:crypto';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { companies, connectCodes, devices, users } from '../db/schema.js';
import { type DevicePrincipal, HttpError, type SessionUser } from '../http.js';
import { getGeneralSettings } from '../services/settings.js';
import { randomToken, sha256 } from './crypto.js';
import { activeUser, sessionUserColumns } from './sessions.js';

export const DEVICE_TOKEN_PREFIX = 'pamd_';

/** Without 0/O, 1/I/L: easy to read aloud and to type. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const DAY = 24 * 60 * 60_000;
export const CODE_TTL = { invite: 7 * DAY, device: 10 * 60_000 } as const;
export type CodePurpose = keyof typeof CODE_TTL;

/** `7kq4-m2xp`, ` 7KQ4 M2XP ` and `7KQ4M2XP` are the same code. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Code as shown: `7KQ4-M2XP`. */
export function formatCode(code: string): string {
  const c = normaliseCode(code);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/**
 * Creates a one-time code for a user. Older open codes of the same purpose stop working, so a lost
 * invitation is simply replaced. Only the hash is stored; the code is returned once.
 */
export function createConnectCode(
  db: Db,
  input: { userId: number; purpose: CodePurpose; createdBy: number | null },
): { code: string; expiresAt: Date } {
  const code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL[input.purpose]);
  db.transaction((tx) => {
    tx.update(connectCodes)
      .set({ revokedAt: now })
      .where(
        and(
          eq(connectCodes.userId, input.userId),
          eq(connectCodes.purpose, input.purpose),
          isNull(connectCodes.revokedAt),
        ),
      )
      .run();
    tx.insert(connectCodes)
      .values({
        userId: input.userId,
        purpose: input.purpose,
        codeHash: sha256(code),
        expiresAt,
        createdBy: input.createdBy,
      })
      .run();
  });
  return { code: formatCode(code), expiresAt };
}

/** A code that is not expired, replaced or for a disabled account; `null` otherwise. */
export function findConnectCode(db: Db, code: string) {
  const normalised = normaliseCode(code);
  if (normalised.length !== CODE_LENGTH) return null;
  return (
    db
      .select({
        id: connectCodes.id,
        userId: connectCodes.userId,
        purpose: connectCodes.purpose,
        expiresAt: connectCodes.expiresAt,
        passwordSetAt: connectCodes.passwordSetAt,
        deviceConnectedAt: connectCodes.deviceConnectedAt,
        companyId: users.companyId,
        userName: users.name,
        email: users.email,
        companyName: companies.name,
        mustChangePassword: users.mustChangePassword,
      })
      .from(connectCodes)
      .innerJoin(users, eq(connectCodes.userId, users.id))
      .innerJoin(companies, eq(users.companyId, companies.id))
      .where(
        and(
          eq(connectCodes.codeHash, sha256(normalised)),
          isNull(connectCodes.revokedAt),
          gt(connectCodes.expiresAt, new Date()),
          activeUser,
        ),
      )
      .get() ?? null
  );
}

/** Open invitation of a user (not expired, password not set yet), for the member lists. */
export function pendingInvite(db: Db, userId: number): Date | null {
  return (
    db
      .select({ expiresAt: connectCodes.expiresAt })
      .from(connectCodes)
      .where(
        and(
          eq(connectCodes.userId, userId),
          eq(connectCodes.purpose, 'invite'),
          isNull(connectCodes.revokedAt),
          isNull(connectCodes.passwordSetAt),
          gt(connectCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(connectCodes.createdAt))
      .get()?.expiresAt ?? null
  );
}

/** Devices a user may connect at the same time: the company's limit, else the general default. */
export function deviceLimit(db: Db, companyId: number): number {
  const company = db
    .select({ max: companies.maxDevicesPerUser })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  return company?.max ?? getGeneralSettings(db).maxDevicesPerUser;
}

export function activeDevices(db: Db, userId: number): number {
  return (
    db
      .select({ n: count() })
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.disconnectedAt)))
      .get()?.n ?? 0
  );
}

export interface ConnectRequest {
  code: string;
  installId: string;
  name: string;
  platform: string;
  appVersion?: string | undefined;
}

/**
 * Connects an app installation with a one-time code (invitation or "connect device" code). The
 * same installation of the same user reuses its slot and gets a new token. Each code connects one
 * device; the limit of devices per user applies.
 */
export function connectDevice(db: Db, req: ConnectRequest): { token: string; deviceId: number; userId: number } {
  const code = findConnectCode(db, req.code);
  if (!code || code.deviceConnectedAt) {
    throw new HttpError(401, 'invalid_code', 'The code is invalid, expired or already used.');
  }
  const token = DEVICE_TOKEN_PREFIX + randomToken(32);
  return db.transaction((tx) => {
    const now = new Date();
    const existing = tx
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, code.userId), eq(devices.installId, req.installId), isNull(devices.disconnectedAt)))
      .get();
    let deviceId: number;
    if (existing) {
      tx.update(devices)
        .set({
          tokenHash: sha256(token),
          name: req.name,
          platform: req.platform,
          appVersion: req.appVersion ?? null,
          lastSeenAt: now,
        })
        .where(eq(devices.id, existing.id))
        .run();
      deviceId = existing.id;
    } else {
      const max = deviceLimit(tx as unknown as Db, code.companyId);
      if (activeDevices(tx as unknown as Db, code.userId) >= max) {
        throw new HttpError(409, 'device_limit', 'All devices of this account are in use.', { maxDevices: max });
      }
      deviceId = tx
        .insert(devices)
        .values({
          userId: code.userId,
          installId: req.installId,
          name: req.name,
          platform: req.platform,
          appVersion: req.appVersion ?? null,
          tokenHash: sha256(token),
          lastSeenAt: now,
        })
        .returning({ id: devices.id })
        .get().id;
    }
    tx.update(connectCodes).set({ deviceConnectedAt: now }).where(eq(connectCodes.id, code.id)).run();
    return { token, deviceId, userId: code.userId };
  });
}

const SEEN_INTERVAL = 5 * 60_000;

/** Resolves a device token. Fails if the device, its user or the company is no longer active. */
export function principalForDevice(db: Db, token: string): { user: SessionUser; device: DevicePrincipal } | null {
  if (!token.startsWith(DEVICE_TOKEN_PREFIX)) return null;
  const row = db
    .select({ ...sessionUserColumns, deviceId: devices.id, lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(and(eq(devices.tokenHash, sha256(token)), isNull(devices.disconnectedAt), activeUser))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (!row.lastSeenAt || now - row.lastSeenAt.getTime() > SEEN_INTERVAL) {
    db.update(devices)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(devices.id, row.deviceId))
      .run();
  }
  const { deviceId, lastSeenAt: _, ...user } = row;
  return { user, device: { id: deviceId, companyId: user.companyId } };
}

export function disconnectDevice(db: Db, deviceId: number): void {
  db.update(devices)
    .set({ disconnectedAt: new Date() })
    .where(and(eq(devices.id, deviceId), isNull(devices.disconnectedAt)))
    .run();
}

/** Disconnects every device of a user, e.g. when the account is disabled or deleted. */
export function disconnectUserDevices(db: Db, userId: number): void {
  db.update(devices)
    .set({ disconnectedAt: new Date() })
    .where(and(eq(devices.userId, userId), isNull(devices.disconnectedAt)))
    .run();
}

export function countDeviceUploads(db: Db, deviceId: number, n: number): void {
  if (n <= 0) return;
  db.update(devices)
    .set({ uploadCount: sql`${devices.uploadCount} + ${n}` })
    .where(eq(devices.id, deviceId))
    .run();
}
