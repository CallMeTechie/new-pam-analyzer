import { analyzePamFile, type CoefficientConfig } from '@pam/core';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { canReadCompany, currentUser, readScope, requireAdmin, requireAuth } from '../auth/middleware.js';
import type { Db } from '../db/index.js';
import { companies, machines, results } from '../db/schema.js';
import { type AppEnv, HttpError, idParam, jsonBody, notFound, parse } from '../http.js';
import { cleanCustomer, cleanTestDate, parseStoredFile } from '../services/ingest.js';
import { getCoefficientConfigVersion, getThresholds } from '../services/settings.js';

export const resultRoutes = new Hono<AppEnv>();

const FAMILIES = ['nxt', 'nxtr', 'aimex', 'unknown'] as const;
const RATINGS = ['critical', 'warning', 'good', 'excellent'] as const;

/** Columns of a result in lists. */
export const listColumns = {
  id: results.id,
  companyId: results.companyId,
  companyName: companies.name,
  machineNo: results.machineNo,
  machineFamily: results.machineFamily,
  line: machines.line,
  headType: results.headType,
  headSerial: results.headSerial,
  toolType: results.toolType,
  toolSerial: results.toolSerial,
  h08mVariant: results.h08mVariant,
  customer: results.customer,
  testDate: results.testDate,
  dateSource: results.dateSource,
  cpkX: results.cpkX,
  cpkY: results.cpkY,
  cpkXY: results.cpkXY,
  rating: results.rating,
  measured: results.measured,
  expected: results.expected,
  failed: results.failed,
  componentStatus: results.componentStatus,
  warnings: results.warnings,
  fileName: results.fileName,
  source: results.source,
  createdAt: results.createdAt,
  /** Who uploaded it and with which app; the app shows it in its server view. */
  uploadedByName: sql<string | null>`(select u.name from users u where u.id = ${results.uploadedBy})`,
  deviceName: sql<string | null>`(select d.name from devices d where d.id = ${results.deviceId})`,
  deviceId: results.deviceId,
};

export function scopeFilter(companyId: number | null): SQL | undefined {
  return companyId === null ? undefined : eq(results.companyId, companyId);
}

export const escapeLike = (term: string) => term.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Every search term must match one of the identifying fields. */
function searchFilter(q: string): SQL | undefined {
  const terms = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return undefined;
  return and(
    ...terms.map((term) => {
      const pattern = `%${escapeLike(term)}%`;
      const field = (column: SQLWrapper) => sql`${column} like ${pattern} escape '\\'`;
      return or(
        field(results.machineNo),
        field(results.headSerial),
        field(results.headType),
        field(results.toolSerial),
        field(results.fileName),
        field(results.customer),
        field(machines.line),
        field(companies.name),
        field(sql`${results.headType} || ' ' || ${results.headSerial}`),
      );
    }),
  );
}

const listQuery = z.object({
  companyId: z.coerce.number().int().positive().optional(),
  q: z.string().max(200).optional(),
  family: z.enum(FAMILIES).optional(),
  rating: z.enum(RATINGS).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  machineNo: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['testDate', '-testDate', 'cpkXY', '-cpkXY', 'createdAt', '-createdAt']).default('-testDate'),
  // Keeps the rows of one test day (newest day first) or one customer (A–Z, without customer last) together.
  group: z.enum(['date', 'customer']).optional(),
});

resultRoutes.get('/', (c) => {
  const auth = requireAuth(c);
  const query = parse(listQuery, c.req.query());
  const db = c.get('db');
  const where = and(
    isNull(results.deletedAt),
    scopeFilter(readScope(auth, query.companyId)),
    query.q ? searchFilter(query.q) : undefined,
    query.family ? eq(results.machineFamily, query.family) : undefined,
    query.rating ? eq(results.rating, query.rating) : undefined,
    query.from ? gte(results.testDate, `${query.from} 00:00:00`) : undefined,
    query.to ? lte(results.testDate, `${query.to} 23:59:59`) : undefined,
    query.machineNo ? eq(results.machineNo, query.machineNo) : undefined,
  );
  const sortColumn = { testDate: results.testDate, cpkXY: results.cpkXY, createdAt: results.createdAt }[
    query.sort.replace('-', '') as 'testDate' | 'cpkXY' | 'createdAt'
  ];
  const order = query.sort.startsWith('-') ? desc(sortColumn) : asc(sortColumn);
  const groupOrder =
    query.group === 'date'
      ? [desc(sql`substr(${results.testDate}, 1, 10)`)]
      : query.group === 'customer'
        ? [sql`${results.customer} is null or ${results.customer} = ''`, sql`lower(${results.customer})`]
        : [];
  const base = () =>
    db
      .select(listColumns)
      .from(results)
      .leftJoin(companies, eq(results.companyId, companies.id))
      .leftJoin(machines, eq(results.machineId, machines.id));
  const items = base()
    .where(where)
    .orderBy(...groupOrder, order, desc(results.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total =
    db
      .select({ n: count() })
      .from(results)
      .leftJoin(companies, eq(results.companyId, companies.id))
      .leftJoin(machines, eq(results.machineId, machines.id))
      .where(where)
      .get()?.n ?? 0;
  return c.json({ items, total, page: query.page, pageSize: query.pageSize });
});

/** Customer names used so far, for autocompletion in the app; `q` filters. */
resultRoutes.get('/customers', (c) => {
  const auth = requireAuth(c);
  const query = parse(
    z.object({ q: z.string().max(120).optional(), companyId: z.coerce.number().int().positive().optional() }),
    c.req.query(),
  );
  const db = c.get('db');
  const term = query.q?.trim();
  const rows = db
    .select({ name: results.customer, n: count(), last: sql<string>`max(${results.testDate})` })
    .from(results)
    .where(
      and(
        isNull(results.deletedAt),
        sql`${results.customer} is not null`,
        scopeFilter(readScope(auth, query.companyId)),
        term ? sql`${results.customer} like ${`%${escapeLike(term)}%`} escape '\\'` : undefined,
      ),
    )
    .groupBy(results.customer)
    .orderBy(desc(sql`max(${results.testDate})`))
    .limit(50)
    .all();
  return c.json({ items: rows.map((r) => ({ name: r.name ?? '', results: r.n, lastTest: r.last })) });
});

function loadResult(c: Context<AppEnv>, db: Db) {
  const auth = requireAuth(c);
  const id = idParam(c);
  const row = db
    .select()
    .from(results)
    .where(and(eq(results.id, id), isNull(results.deletedAt)))
    .get();
  if (!row || !canReadCompany(auth, row.companyId)) throw notFound('Result');
  return row;
}

/** Full evaluation, recomputed from the stored file with the configuration it was stored with. */
resultRoutes.get('/:id', (c) => {
  const db = c.get('db');
  const row = loadResult(c, db);
  const { parsed } = parseStoredFile(row, c.get('config').timeZone);
  const versioned = getCoefficientConfigVersion(db, row.configVersion);
  const thresholds = getThresholds(db);
  const analysis = analyzePamFile(parsed, {
    config: versioned.config as CoefficientConfig,
    thresholds,
    ...(row.coefficientSource === 'manual' ? { coefficient: row.coefficient } : {}),
  });
  const meta = db
    .select({
      companyName: companies.name,
      companyLogoVersion: sql<number | null>`${companies.logoUpdatedAt}`,
      line: machines.line,
    })
    .from(results)
    .leftJoin(companies, eq(results.companyId, companies.id))
    .leftJoin(machines, eq(results.machineId, machines.id))
    .where(eq(results.id, row.id))
    .get();
  return c.json({
    result: {
      id: row.id,
      companyId: row.companyId,
      companyName: meta?.companyName ?? null,
      companyLogoVersion: meta?.companyLogoVersion ?? null,
      line: meta?.line ?? null,
      customer: row.customer,
      fileName: row.fileName,
      fileSize: row.fileSize,
      testDate: row.testDate,
      dateSource: row.dateSource,
      source: row.source,
      createdAt: row.createdAt,
      configVersion: row.configVersion,
    },
    header: parsed.header,
    shaftCount: parsed.shaftCount,
    warnings: parsed.warnings,
    invalidLines: parsed.invalidLines,
    measurements: parsed.measurements,
    analysis,
    /** Configuration the result was evaluated with, so the UI can recompute with another coefficient. */
    config: versioned.config,
    thresholds,
  });
});

/**
 * Customer and test date of a result, e.g. entered in the app after the upload.
 * `testDate: null` returns to the date from the file.
 */
resultRoutes.patch('/:id', async (c) => {
  const db = c.get('db');
  const row = loadResult(c, db);
  const body = parse(
    z.object({
      customer: z.string().max(200).nullable().optional(),
      testDate: z.string().max(40).nullable().optional(),
    }),
    await jsonBody(c),
  );
  const patch: Partial<typeof results.$inferInsert> = {};
  if (body.customer !== undefined) patch.customer = cleanCustomer(body.customer) ?? null;
  if (body.testDate === null) {
    const { parsed } = parseStoredFile(row, c.get('config').timeZone);
    patch.testDate = parsed.header.testDate ?? row.testDate;
    patch.dateSource = parsed.header.dateSource;
  } else if (body.testDate !== undefined) {
    const testDate = cleanTestDate(body.testDate);
    if (!testDate) throw new HttpError(400, 'invalid_request', 'testDate must be YYYY-MM-DD HH:mm:ss.');
    patch.testDate = testDate;
    patch.dateSource = 'manual';
  }
  if (Object.keys(patch).length) db.update(results).set(patch).where(eq(results.id, row.id)).run();
  const updated = db
    .select(listColumns)
    .from(results)
    .leftJoin(companies, eq(results.companyId, companies.id))
    .leftJoin(machines, eq(results.machineId, machines.id))
    .where(eq(results.id, row.id))
    .get();
  return c.json({ result: updated });
});

/** Original `.dat` file. */
resultRoutes.get('/:id/file', (c) => {
  const db = c.get('db');
  const row = loadResult(c, db);
  const { content } = parseStoredFile(row, c.get('config').timeZone);
  c.header('content-type', 'text/plain; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${row.fileName.replace(/[^\w.@() -]/g, '_')}"`);
  return c.body(content);
});

/** All results of the same head (type and serial number) within the same company, oldest first. */
resultRoutes.get('/:id/history', (c) => {
  const db = c.get('db');
  const row = loadResult(c, db);
  // The service company follows a head through all companies; everybody else within their own.
  const everywhere = requireAuth(c).user.isService;
  const items = db
    .select(listColumns)
    .from(results)
    .leftJoin(companies, eq(results.companyId, companies.id))
    .leftJoin(machines, eq(results.machineId, machines.id))
    .where(
      and(
        isNull(results.deletedAt),
        eq(results.headType, row.headType),
        eq(results.headSerial, row.headSerial),
        everywhere
          ? undefined
          : row.companyId === null
            ? isNull(results.companyId)
            : eq(results.companyId, row.companyId),
      ),
    )
    .orderBy(asc(results.testDate), asc(results.id))
    .all();
  return c.json({ headType: row.headType, headSerial: row.headSerial, items });
});

/** Soft delete; company admins for their company, administrators for all. */
resultRoutes.delete('/:id', (c) => {
  const db = c.get('db');
  const row = loadResult(c, db);
  const user = currentUser(c);
  const allowed =
    (user.role === 'admin' && user.isService) || (user.role === 'companyAdmin' && user.companyId === row.companyId);
  if (!allowed) throw new HttpError(403, 'forbidden', 'You do not have permission for this action.');
  db.update(results).set({ deletedAt: new Date(), deletedBy: user.id }).where(eq(results.id, row.id)).run();
  return c.body(null, 204);
});

/** Assigns results to a company (administrators), e.g. unassigned uploads by service staff. */
resultRoutes.post('/assign', async (c) => {
  requireAdmin(c);
  const body = parse(
    z.object({ ids: z.array(z.number().int().positive()).min(1).max(5000), companyId: z.number().int().positive() }),
    await jsonBody(c),
  );
  const db = c.get('db');
  if (!db.select({ id: companies.id }).from(companies).where(eq(companies.id, body.companyId)).get()) {
    throw notFound('Company');
  }
  let moved = 0;
  db.transaction((tx) => {
    const rows = tx
      .select({ id: results.id, machineNo: results.machineNo, machineFamily: results.machineFamily })
      .from(results)
      .where(inArray(results.id, body.ids))
      .all();
    for (const r of rows) {
      let machine = tx
        .select({ id: machines.id })
        .from(machines)
        .where(and(eq(machines.companyId, body.companyId), eq(machines.machineNo, r.machineNo)))
        .get();
      if (!machine) {
        machine = tx
          .insert(machines)
          .values({ companyId: body.companyId, machineNo: r.machineNo, family: r.machineFamily })
          .returning({ id: machines.id })
          .get();
      }
      tx.update(results).set({ companyId: body.companyId, machineId: machine.id }).where(eq(results.id, r.id)).run();
      moved++;
    }
  });
  return c.json({ moved });
});
