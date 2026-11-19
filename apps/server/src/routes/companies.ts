import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { canReadCompany, requireAdmin, requireAuth } from '../auth/middleware.js';
import type { Db } from '../db/index.js';
import { companies, machines, results } from '../db/schema.js';
import { type AppEnv, HttpError, idParam, jsonBody, notFound, parse } from '../http.js';

export const companyRoutes = new Hono<AppEnv>();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const companyBody = z.object({
  name: z.string().trim().min(1).max(120),
  number: optionalText(40),
  location: optionalText(120),
  notes: optionalText(2000),
});

function listCompanies(db: Db, onlyId?: number) {
  const n = (table: string, extra = '') =>
    sql<number>`(select count(*) from ${sql.raw(table)} t where t.company_id = "companies"."id" ${sql.raw(extra)})`;
  return db
    .select({
      id: companies.id,
      name: companies.name,
      number: companies.number,
      location: companies.location,
      notes: companies.notes,
      isService: companies.isService,
      disabled: sql<boolean>`${companies.disabledAt} is not null`.mapWith(Boolean),
      createdAt: companies.createdAt,
      users: n('users', 'and t.disabled_at is null'),
      apiKeys: n('api_keys', 'and t.revoked_at is null'),
      machines: n('machines'),
      results: n('results', 'and t.deleted_at is null'),
      lastResultAt: sql<
        string | null
      >`(select max(t.test_date) from results t where t.company_id = "companies"."id" and t.deleted_at is null)`,
    })
    .from(companies)
    .where(onlyId ? eq(companies.id, onlyId) : undefined)
    .orderBy(sql`${companies.isService} desc`, asc(companies.name))
    .all();
}

companyRoutes.get('/', (c) => {
  const auth = requireAuth(c);
  const db = c.get('db');
  if (auth.kind === 'user' && auth.user.isService) return c.json({ items: listCompanies(db) });
  const own = auth.kind === 'device' ? auth.device.companyId : auth.user.companyId;
  return c.json({ items: listCompanies(db, own) });
});

companyRoutes.post('/', async (c) => {
  requireAdmin(c);
  const body = parse(companyBody, await jsonBody(c));
  const db = c.get('db');
  if (db.select({ id: companies.id }).from(companies).where(eq(companies.name, body.name)).get()) {
    throw new HttpError(409, 'name_taken', 'A company with this name already exists.');
  }
  const { id } = db.insert(companies).values(body).returning({ id: companies.id }).get();
  return c.json({ company: listCompanies(db, id)[0] }, 201);
});

companyRoutes.get('/:id', (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  if (!canReadCompany(auth, id)) throw notFound('Company');
  const company = listCompanies(c.get('db'), id)[0];
  if (!company) throw notFound('Company');
  return c.json({ company });
});

companyRoutes.patch('/:id', async (c) => {
  requireAdmin(c);
  const id = idParam(c);
  const body = parse(companyBody.partial().extend({ disabled: z.boolean().optional() }), await jsonBody(c));
  const db = c.get('db');
  const company = db.select().from(companies).where(eq(companies.id, id)).get();
  if (!company) throw notFound('Company');
  if (body.disabled && company.isService) {
    throw new HttpError(400, 'service_company', 'The service company cannot be disabled.');
  }
  if (body.name && body.name !== company.name) {
    if (db.select({ id: companies.id }).from(companies).where(eq(companies.name, body.name)).get()) {
      throw new HttpError(409, 'name_taken', 'A company with this name already exists.');
    }
  }
  const { disabled, ...fields } = body;
  db.update(companies)
    .set({
      ...fields,
      ...(disabled === undefined ? {} : { disabledAt: disabled ? (company.disabledAt ?? new Date()) : null }),
    })
    .where(eq(companies.id, id))
    .run();
  return c.json({ company: listCompanies(db, id)[0] });
});

/** Machines of a company with their line and number of results. */
companyRoutes.get('/:id/machines', (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  if (!canReadCompany(auth, id)) throw notFound('Company');
  const items = c
    .get('db')
    .select({
      id: machines.id,
      machineNo: machines.machineNo,
      family: machines.family,
      model: machines.model,
      line: machines.line,
      results: sql<number>`count(${results.id})`,
      lastResultAt: sql<string | null>`max(${results.testDate})`,
      heads: sql<number>`count(distinct ${results.headType} || '|' || ${results.headSerial})`,
    })
    .from(machines)
    .leftJoin(results, and(eq(results.machineId, machines.id), isNull(results.deletedAt)))
    .where(eq(machines.companyId, id))
    .groupBy(machines.id)
    .orderBy(asc(machines.line), asc(machines.machineNo))
    .all();
  return c.json({ items });
});
