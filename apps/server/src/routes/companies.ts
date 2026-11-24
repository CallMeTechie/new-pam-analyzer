import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { canReadCompany, requireAdmin, requireAuth, requireManage } from '../auth/middleware.js';
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
      /** Changes with every new logo; `null` without logo. Use as cache buster for the logo URL. */
      logoVersion: sql<number | null>`${companies.logoUpdatedAt}`,
      disabled: sql<boolean>`${companies.disabledAt} is not null`.mapWith(Boolean),
      createdAt: companies.createdAt,
      users: n('users', 'and t.disabled_at is null'),
      devices: sql<number>`(select count(*) from devices d join users u on u.id = d.user_id where u.company_id = "companies"."id" and d.disconnected_at is null)`,
      maxDevicesPerUser: companies.maxDevicesPerUser,
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
  if (auth.user.isService) return c.json({ items: listCompanies(db) });
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

/** Devices per user for a company (company admins for their own company); `null`: the default. */
companyRoutes.put('/:id/device-limit', async (c) => {
  const id = idParam(c);
  requireManage(c, id);
  const body = parse(z.object({ maxDevicesPerUser: z.number().int().min(1).max(100).nullable() }), await jsonBody(c));
  const db = c.get('db');
  if (!db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).get()) throw notFound('Company');
  db.update(companies).set({ maxDevicesPerUser: body.maxDevicesPerUser }).where(eq(companies.id, id)).run();
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

const MAX_LOGO_BYTES = 512 * 1024;

/** Detects PNG, JPEG and WebP from the first bytes; anything else (e.g. SVG) is refused. */
function imageType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  return null;
}

/** Logo of a company (PNG, JPEG or WebP up to 512 KB); administrators and the company admin. */
companyRoutes.put(
  '/:id/logo',
  bodyLimit({
    maxSize: MAX_LOGO_BYTES + 64 * 1024,
    onError: () => {
      throw new HttpError(413, 'logo_too_large', 'The logo may be at most 512 KB.');
    },
  }),
  async (c) => {
    const id = idParam(c);
    requireManage(c, id);
    const form = await c.req.parseBody();
    const file = form.logo;
    if (!(file instanceof File)) throw new HttpError(400, 'no_files', 'No logo was uploaded.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) throw new HttpError(413, 'logo_too_large', 'The logo may be at most 512 KB.');
    const type = imageType(bytes);
    if (!type) throw new HttpError(400, 'invalid_logo', 'The logo must be a PNG, JPEG or WebP image.');
    const db = c.get('db');
    if (!db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).get()) throw notFound('Company');
    db.update(companies)
      .set({ logo: Buffer.from(bytes), logoType: type, logoUpdatedAt: new Date() })
      .where(eq(companies.id, id))
      .run();
    return c.json({ company: listCompanies(db, id)[0] });
  },
);

companyRoutes.delete('/:id/logo', (c) => {
  const id = idParam(c);
  requireManage(c, id);
  const db = c.get('db');
  db.update(companies).set({ logo: null, logoType: null, logoUpdatedAt: null }).where(eq(companies.id, id)).run();
  return c.body(null, 204);
});

companyRoutes.get('/:id/logo', (c) => {
  const auth = requireAuth(c);
  const id = idParam(c);
  if (!canReadCompany(auth, id)) throw notFound('Company');
  const row = c
    .get('db')
    .select({ logo: companies.logo, type: companies.logoType })
    .from(companies)
    .where(eq(companies.id, id))
    .get();
  if (!row?.logo || !row.type) throw notFound('Logo');
  c.header('content-type', row.type);
  c.header('cache-control', 'private, max-age=86400');
  c.header('x-content-type-options', 'nosniff');
  return c.body(new Uint8Array(row.logo));
});
