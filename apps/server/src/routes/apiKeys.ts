import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { disconnectDevice, generateApiKey } from '../auth/apiKeys.js';
import { canManageCompany, currentUser, requireManage } from '../auth/middleware.js';
import type { Db } from '../db/index.js';
import { apiKeys, companies, devices, users } from '../db/schema.js';
import { type AppEnv, idParam, jsonBody, notFound, parse } from '../http.js';
import { getGeneralSettings } from '../services/settings.js';

export const apiKeyRoutes = new Hono<AppEnv>();
export const deviceRoutes = new Hono<AppEnv>();

const maxConnections = z.number().int().min(1).max(1000);

function deviceList(db: Db, apiKeyId: number) {
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
    .where(and(eq(devices.apiKeyId, apiKeyId), isNull(devices.disconnectedAt)))
    .orderBy(desc(devices.lastSeenAt))
    .all();
}

function listKeys(db: Db, where: ReturnType<typeof eq>) {
  return db
    .select({
      id: apiKeys.id,
      companyId: apiKeys.companyId,
      companyName: companies.name,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      maxConnections: apiKeys.maxConnections,
      revoked: sql<boolean>`${apiKeys.revokedAt} is not null`.mapWith(Boolean),
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .innerJoin(companies, eq(apiKeys.companyId, companies.id))
    .where(where)
    .orderBy(sql`${apiKeys.revokedAt} is not null`, asc(apiKeys.name))
    .all()
    .map((key) => ({ ...key, devices: key.revoked ? [] : deviceList(db, key.id) }));
}

/** API keys of a company (`?companyId=`, default: own company), including the connected devices. */
apiKeyRoutes.get('/', (c) => {
  const user = currentUser(c);
  const companyId = Number(c.req.query('companyId') ?? user.companyId);
  requireManage(c, companyId);
  return c.json({ items: listKeys(c.get('db'), eq(apiKeys.companyId, companyId)), ...getGeneralSettings(c.get('db')) });
});

/** Creates a key. The full key is returned only in this response. */
apiKeyRoutes.post('/', async (c) => {
  const user = currentUser(c);
  const db = c.get('db');
  const body = parse(
    z.object({
      companyId: z.number().int().positive().default(user.companyId),
      name: z.string().trim().min(1).max(80),
      maxConnections: maxConnections.optional(),
    }),
    await jsonBody(c),
  );
  requireManage(c, body.companyId);
  if (!db.select({ id: companies.id }).from(companies).where(eq(companies.id, body.companyId)).get()) {
    throw notFound('Company');
  }
  const { key, prefix, hash } = generateApiKey();
  const { id } = db
    .insert(apiKeys)
    .values({
      companyId: body.companyId,
      name: body.name,
      prefix,
      keyHash: hash,
      maxConnections: body.maxConnections ?? getGeneralSettings(db).defaultMaxConnections,
      createdBy: user.id,
    })
    .returning({ id: apiKeys.id })
    .get();
  return c.json({ apiKey: listKeys(db, eq(apiKeys.id, id))[0], key }, 201);
});

function keyFor(c: Context<AppEnv>) {
  const id = idParam(c);
  const db = c.get('db');
  const row = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!row || !canManageCompany(currentUser(c), row.companyId)) throw notFound('API key');
  return { row, db };
}

/** Rename or change the limit. Lowering the limit keeps devices that are already connected. */
apiKeyRoutes.patch('/:id', async (c) => {
  const { row, db } = keyFor(c);
  const body = parse(
    z.object({ name: z.string().trim().min(1).max(80).optional(), maxConnections: maxConnections.optional() }),
    await jsonBody(c),
  );
  db.update(apiKeys).set(body).where(eq(apiKeys.id, row.id)).run();
  return c.json({ apiKey: listKeys(db, eq(apiKeys.id, row.id))[0] });
});

/** Revokes a key and disconnects all its devices. */
apiKeyRoutes.delete('/:id', (c) => {
  const { row, db } = keyFor(c);
  const now = new Date();
  db.transaction((tx) => {
    tx.update(apiKeys)
      .set({ revokedAt: row.revokedAt ?? now })
      .where(eq(apiKeys.id, row.id))
      .run();
    tx.update(devices)
      .set({ disconnectedAt: now })
      .where(and(eq(devices.apiKeyId, row.id), isNull(devices.disconnectedAt)))
      .run();
  });
  return c.body(null, 204);
});

/** Disconnects a device and frees its slot. */
deviceRoutes.delete('/:id', (c) => {
  const id = idParam(c);
  const db = c.get('db');
  const row = db
    .select({ id: devices.id, companyId: apiKeys.companyId })
    .from(devices)
    .innerJoin(apiKeys, eq(devices.apiKeyId, apiKeys.id))
    .where(eq(devices.id, id))
    .get();
  if (!row || !canManageCompany(currentUser(c), row.companyId)) throw notFound('Device');
  disconnectDevice(db, row.id);
  return c.body(null, 204);
});
