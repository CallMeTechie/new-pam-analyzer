import { and, count, countDistinct, desc, eq, gte, inArray, isNull, lte, or, type SQL, sql, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { companies, devices, logEntries, results, users } from '../db/schema.js';
import { type AppEnv, idParam, notFound, parse } from '../http.js';
import { LOG_LEVELS, LOG_SOURCES, SERVER_STARTED, storageInfo } from '../services/logs.js';
import { mailConfig } from '../services/mail.js';
import { getGeneralSettings } from '../services/settings.js';
import { SERVER_VERSION } from './meta.js';
import { escapeLike } from './results.js';

/** Logs & Monitoring for the administrators of the service company. */
export const logRoutes = new Hono<AppEnv>();
export const monitoringRoutes = new Hono<AppEnv>();

/** Comma-separated values, unknown ones dropped. */
const list = (allowed: readonly string[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((x) => allowed.includes(x)) : []));

const filterSchema = z.object({
  /** `server`, `windows`, `android`, `other` or `apps` (all apps), comma-separated. */
  source: list([...LOG_SOURCES, 'apps']),
  level: list(LOG_LEVELS),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  companyId: z.coerce.number().int().positive().optional(),
  deviceId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
});
type Filter = z.infer<typeof filterSchema>;

function where(f: Filter, withLevel = true): SQL | undefined {
  const sources = f.source.includes('apps')
    ? [...new Set([...f.source.filter((s) => s !== 'apps'), 'windows', 'android', 'other'])]
    : f.source;
  const term = f.q ? `%${escapeLike(f.q)}%` : null;
  return and(
    sources.length ? inArray(logEntries.source, sources) : undefined,
    withLevel && f.level.length ? inArray(logEntries.level, f.level) : undefined,
    f.from ? gte(logEntries.lastAt, f.from) : undefined,
    f.to ? lte(logEntries.occurredAt, f.to) : undefined,
    f.companyId ? eq(logEntries.companyId, f.companyId) : undefined,
    f.deviceId ? eq(logEntries.deviceId, f.deviceId) : undefined,
    term
      ? or(
          sql`${logEntries.message} like ${term} escape '\\'`,
          sql`${logEntries.category} like ${term} escape '\\'`,
          sql`${logEntries.deviceName} like ${term} escape '\\'`,
          sql`${logEntries.system} like ${term} escape '\\'`,
          sql`${users.name} like ${term} escape '\\'`,
          sql`${users.email} like ${term} escape '\\'`,
        )
      : undefined,
  );
}

const columns = {
  id: logEntries.id,
  level: logEntries.level,
  source: logEntries.source,
  category: logEntries.category,
  message: logEntries.message,
  count: logEntries.count,
  occurredAt: logEntries.occurredAt,
  lastAt: logEntries.lastAt,
  appVersion: logEntries.appVersion,
  deviceId: logEntries.deviceId,
  deviceName: logEntries.deviceName,
  system: logEntries.system,
  companyId: logEntries.companyId,
  companyName: companies.name,
  userId: logEntries.userId,
  userName: users.name,
  hasDetails: sql<number>`${logEntries.details} is not null`,
  hasHistory: sql<number>`${logEntries.history} is not null`,
};

logRoutes.get('/', (c) => {
  requireAdmin(c);
  const query = parse(
    filterSchema.extend({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    c.req.query(),
  );
  const db = c.get('db');
  const base = () =>
    db
      .select(columns)
      .from(logEntries)
      .leftJoin(companies, eq(logEntries.companyId, companies.id))
      .leftJoin(users, eq(logEntries.userId, users.id));
  const items = base()
    .where(where(query))
    .orderBy(desc(logEntries.lastAt), desc(logEntries.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all()
    .map((r) => ({ ...r, hasDetails: Boolean(r.hasDetails), hasHistory: Boolean(r.hasHistory) }));
  const total =
    db
      .select({ n: count() })
      .from(logEntries)
      .leftJoin(users, eq(logEntries.userId, users.id))
      .where(where(query))
      .get()?.n ?? 0;
  // Counts per level for the filter chips: the same filter without the level.
  const levels = Object.fromEntries(
    db
      .select({ level: logEntries.level, n: count() })
      .from(logEntries)
      .leftJoin(users, eq(logEntries.userId, users.id))
      .where(where(query, false))
      .groupBy(logEntries.level)
      .all()
      .map((r) => [r.level, r.n]),
  );
  return c.json({ items, total, levels, retentionDays: getGeneralSettings(db).logRetentionDays });
});

/** Everything that matches, one JSON object per line. */
logRoutes.get('/export', (c) => {
  requireAdmin(c);
  const query = parse(filterSchema, c.req.query());
  const rows = c
    .get('db')
    .select({ ...columns, details: logEntries.details, history: logEntries.history, context: logEntries.context })
    .from(logEntries)
    .leftJoin(companies, eq(logEntries.companyId, companies.id))
    .leftJoin(users, eq(logEntries.userId, users.id))
    .where(where(query))
    .orderBy(desc(logEntries.lastAt))
    .limit(50_000)
    .all();
  const body = rows
    .map(({ hasDetails: _d, hasHistory: _h, ...r }) =>
      JSON.stringify({ ...r, occurredAt: r.occurredAt.toISOString(), lastAt: r.lastAt.toISOString() }),
    )
    .join('\n');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return c.body(body ? `${body}\n` : '', 200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'content-disposition': `attachment; filename="pam-analyzer-logs-${stamp}.jsonl"`,
  });
});

logRoutes.get('/:id', (c) => {
  requireAdmin(c);
  const db = c.get('db');
  const row = db
    .select({
      ...columns,
      details: logEntries.details,
      history: logEntries.history,
      context: logEntries.context,
      fingerprint: logEntries.fingerprint,
    })
    .from(logEntries)
    .leftJoin(companies, eq(logEntries.companyId, companies.id))
    .leftJoin(users, eq(logEntries.userId, users.id))
    .where(eq(logEntries.id, idParam(c)))
    .get();
  if (!row) throw notFound('Log entry');
  // The same message in the last 7 days, on how many devices.
  const same = db
    .select({ n: sum(logEntries.count), devices: countDistinct(logEntries.deviceId) })
    .from(logEntries)
    .where(
      and(eq(logEntries.fingerprint, row.fingerprint), gte(logEntries.lastAt, new Date(Date.now() - 7 * 86_400_000))),
    )
    .get();
  const { fingerprint: _f, hasDetails: _d, hasHistory: _h, ...entry } = row;
  return c.json({ entry: { ...entry, same: { count: Number(same?.n ?? 0), devices: same?.devices ?? 0 } } });
});

logRoutes.delete('/:id', (c) => {
  requireAdmin(c);
  const done = c
    .get('db')
    .delete(logEntries)
    .where(eq(logEntries.id, idParam(c)))
    .run();
  if (!done.changes) throw notFound('Log entry');
  return c.body(null, 204);
});

/** Empties the protocol (or, with `?deviceId=`, the entries of one device). */
logRoutes.delete('/', (c) => {
  requireAdmin(c);
  const deviceId = c.req.query('deviceId') ? Number(c.req.query('deviceId')) : null;
  const done = c
    .get('db')
    .delete(logEntries)
    .where(deviceId ? eq(logEntries.deviceId, deviceId) : undefined)
    .run();
  return c.json({ deleted: done.changes });
});

/** The tiles above the protocol. */
monitoringRoutes.get('/', (c) => {
  requireAdmin(c);
  const db = c.get('db');
  const config = c.get('config');
  const day = new Date(Date.now() - 86_400_000);
  const created = db.select({ n: count() }).from(results).where(gte(results.createdAt, day)).get()?.n ?? 0;
  const rejected = Number(
    db
      .select({ n: sql<number>`coalesce(sum(json_extract(${logEntries.context}, '$.rejected')), 0)` })
      .from(logEntries)
      .where(and(eq(logEntries.category, 'upload'), gte(logEntries.lastAt, day)))
      .get()?.n ?? 0,
  );
  const problems = db
    .select({ level: logEntries.level, source: logEntries.source, n: sum(logEntries.count) })
    .from(logEntries)
    .where(and(gte(logEntries.lastAt, day), inArray(logEntries.level, ['crash', 'error', 'warning', 'report'])))
    .groupBy(logEntries.level, logEntries.source)
    .all();
  const tally = (pick: (r: (typeof problems)[number]) => boolean) =>
    problems.filter(pick).reduce((s, r) => s + Number(r.n ?? 0), 0);
  const connected = db
    .select({ appVersion: devices.appVersion, lastSeenAt: devices.lastSeenAt, queued: devices.queuedFiles })
    .from(devices)
    .where(isNull(devices.disconnectedAt))
    .all();
  const versions = new Map<string, number>();
  for (const d of connected) versions.set(d.appVersion ?? '?', (versions.get(d.appVersion ?? '?') ?? 0) + 1);
  const lastMailFailure = db
    .select({ at: logEntries.lastAt })
    .from(logEntries)
    .where(eq(logEntries.category, 'mail'))
    .orderBy(desc(logEntries.lastAt))
    .get();
  const now = Date.now();
  return c.json({
    server: {
      version: SERVER_VERSION,
      startedAt: SERVER_STARTED.toISOString(),
      uptimeSeconds: Math.round((now - SERVER_STARTED.getTime()) / 1000),
    },
    storage: storageInfo(config.databaseFile, config.dataDir),
    uploads: { created, rejected },
    problems: {
      errors: tally((r) => r.level === 'crash' || r.level === 'error'),
      warnings: tally((r) => r.level === 'warning'),
      reports: tally((r) => r.level === 'report'),
      server: tally((r) => r.source === 'server' && (r.level === 'crash' || r.level === 'error')),
      apps: tally((r) => r.source !== 'server' && (r.level === 'crash' || r.level === 'error')),
    },
    devices: {
      connected: connected.length,
      active: connected.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < 15 * 60_000).length,
      versions: [...versions].map(([version, n]) => ({ version, n })).sort((a, b) => b.n - a.n),
    },
    queues: {
      files: connected.reduce((s, d) => s + (d.queued ?? 0), 0),
      devices: connected.filter((d) => (d.queued ?? 0) > 0).length,
    },
    mail: {
      configured: mailConfig(db, config) !== null,
      lastFailureAt: lastMailFailure?.at.toISOString() ?? null,
    },
    retentionDays: getGeneralSettings(db).logRetentionDays,
  });
});
