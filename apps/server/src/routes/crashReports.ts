import { count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { companies, crashReports } from '../db/schema.js';
import { type AppEnv, notFound, parse } from '../http.js';

/** Crash reports of the apps, for the FUJI Service administrators. */
export const crashReportRoutes = new Hono<AppEnv>();

crashReportRoutes.get('/', (c) => {
  requireAdmin(c);
  const query = parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
    c.req.query(),
  );
  const db = c.get('db');
  const items = db
    .select({
      id: crashReports.id,
      platform: crashReports.platform,
      appVersion: crashReports.appVersion,
      deviceName: crashReports.deviceName,
      system: crashReports.system,
      kind: crashReports.kind,
      message: crashReports.message,
      report: crashReports.report,
      occurredAt: crashReports.occurredAt,
      createdAt: crashReports.createdAt,
      companyName: companies.name,
    })
    .from(crashReports)
    .leftJoin(companies, eq(crashReports.companyId, companies.id))
    .orderBy(desc(crashReports.occurredAt), desc(crashReports.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(crashReports).get()?.n ?? 0;
  return c.json({ items, total });
});

crashReportRoutes.delete('/:id', (c) => {
  requireAdmin(c);
  const id = Number(c.req.param('id'));
  const done = c.get('db').delete(crashReports).where(eq(crashReports.id, id)).run();
  if (!done.changes) throw notFound('Crash report');
  return c.body(null, 204);
});
