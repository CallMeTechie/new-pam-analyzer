import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { apiKeys, companies, devices, users } from '../db/schema.js';
import { type DevicePrincipal, HttpError, type SessionUser } from '../http.js';
import { randomToken, sha256 } from './crypto.js';
import { activeUser, sessionUserColumns } from './sessions.js';

export const API_KEY_PREFIX = 'pam_';
export const DEVICE_TOKEN_PREFIX = 'pamd_';

/** Generates a new key. Only the hash is stored; the key is shown exactly once. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = API_KEY_PREFIX + randomToken(32);
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 8), hash: sha256(key) };
}

/** Number of devices currently connected through a key. */
export function activeConnections(db: Db, apiKeyId: number): number {
  return (
    db
      .select({ n: count() })
      .from(devices)
      .where(and(eq(devices.apiKeyId, apiKeyId), isNull(devices.disconnectedAt)))
      .get()?.n ?? 0
  );
}

export interface ConnectRequest {
  apiKey: string;
  userId: number;
  installId: string;
  name: string;
  platform: string;
  appVersion?: string | undefined;
}

/**
 * Connects an app installation. The user must belong to the key's company. Reconnecting the same
 * installation with the same key and user reuses its slot and issues a new token.
 */
export function connectDevice(db: Db, req: ConnectRequest): { token: string; deviceId: number; apiKeyId: number } {
  const key = db
    .select({
      id: apiKeys.id,
      companyId: apiKeys.companyId,
      maxConnections: apiKeys.maxConnections,
      revokedAt: apiKeys.revokedAt,
      companyDisabledAt: companies.disabledAt,
    })
    .from(apiKeys)
    .innerJoin(companies, eq(apiKeys.companyId, companies.id))
    .where(eq(apiKeys.keyHash, sha256(req.apiKey.trim())))
    .get();
  if (!key || key.revokedAt || key.companyDisabledAt) {
    throw new HttpError(401, 'invalid_api_key', 'The API key is invalid or has been revoked.');
  }
  const user = db.select({ companyId: users.companyId }).from(users).where(eq(users.id, req.userId)).get();
  if (user?.companyId !== key.companyId) {
    throw new HttpError(403, 'wrong_company', 'This API key belongs to another company.');
  }

  const token = DEVICE_TOKEN_PREFIX + randomToken(32);
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.apiKeyId, key.id),
          eq(devices.userId, req.userId),
          eq(devices.installId, req.installId),
          isNull(devices.disconnectedAt),
        ),
      )
      .get();
    const now = new Date();
    tx.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, key.id)).run();
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
      return { token, deviceId: existing.id, apiKeyId: key.id };
    }
    const used =
      tx
        .select({ n: count() })
        .from(devices)
        .where(and(eq(devices.apiKeyId, key.id), isNull(devices.disconnectedAt)))
        .get()?.n ?? 0;
    if (used >= key.maxConnections) {
      throw new HttpError(409, 'connection_limit', 'All connections of this API key are in use.', {
        maxConnections: key.maxConnections,
      });
    }
    const device = tx
      .insert(devices)
      .values({
        apiKeyId: key.id,
        userId: req.userId,
        installId: req.installId,
        name: req.name,
        platform: req.platform,
        appVersion: req.appVersion ?? null,
        tokenHash: sha256(token),
        lastSeenAt: now,
      })
      .returning({ id: devices.id })
      .get();
    return { token, deviceId: device.id, apiKeyId: key.id };
  });
}

const SEEN_INTERVAL = 5 * 60_000;

/** Resolves a device token. Fails if the device, its key, its user or the company is no longer active. */
export function principalForDevice(db: Db, token: string): { user: SessionUser; device: DevicePrincipal } | null {
  if (!token.startsWith(DEVICE_TOKEN_PREFIX)) return null;
  const row = db
    .select({
      ...sessionUserColumns,
      deviceId: devices.id,
      apiKeyId: devices.apiKeyId,
      keyCompanyId: apiKeys.companyId,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .innerJoin(apiKeys, eq(devices.apiKeyId, apiKeys.id))
    .innerJoin(users, eq(devices.userId, users.id))
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(
      and(eq(devices.tokenHash, sha256(token)), isNull(devices.disconnectedAt), isNull(apiKeys.revokedAt), activeUser),
    )
    .get();
  if (!row || row.keyCompanyId !== row.companyId) return null;
  const now = Date.now();
  if (!row.lastSeenAt || now - row.lastSeenAt.getTime() > SEEN_INTERVAL) {
    db.update(devices)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(devices.id, row.deviceId))
      .run();
    db.update(apiKeys)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiKeys.id, row.apiKeyId))
      .run();
  }
  const { deviceId, apiKeyId, keyCompanyId, lastSeenAt: _, ...user } = row;
  return { user, device: { id: deviceId, apiKeyId, companyId: keyCompanyId } };
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
