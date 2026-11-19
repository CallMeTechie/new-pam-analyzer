import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { readScope, requireAuth } from '../auth/middleware.js';
import { companies, machines, results } from '../db/schema.js';
import { type AppEnv, parse } from '../http.js';
import { listColumns, scopeFilter } from './results.js';

export const dashboardRoutes = new Hono<AppEnv>();

/** Local date `YYYY-MM-DD` in the machines' time zone. */
function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** The `days` calendar days ending today, oldest first. */
function calendarDays(today: string, days: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Figures for the overview: totals, results per day, rating distribution and the latest results. */
dashboardRoutes.get('/', (c) => {
  const auth = requireAuth(c);
  const query = parse(
    z.object({
      companyId: z.coerce.number().int().positive().optional(),
      days: z.coerce.number().int().min(7).max(365).default(30),
    }),
    c.req.query(),
  );
  const db = c.get('db');
  const scope = readScope(auth, query.companyId);
  const timeZone = c.get('config').timeZone;
  const days = calendarDays(localDay(new Date(), timeZone), query.days);
  const since = days[0] as string;
  const active = and(isNull(results.deletedAt), scopeFilter(scope));
  const inPeriod = and(active, gte(results.testDate, `${since} 00:00:00`));

  const totals = db
    .select({
      results: count(),
      heads: sql<number>`count(distinct ${results.headType} || '|' || ${results.headSerial})`,
      machines: sql<number>`count(distinct ${results.machineId})`,
    })
    .from(results)
    .where(active)
    .get();

  const perDayRows = db
    .select({ day: sql<string>`substr(${results.testDate}, 1, 10)`, n: count() })
    .from(results)
    .where(inPeriod)
    .groupBy(sql`substr(${results.testDate}, 1, 10)`)
    .all();
  const byDay = new Map(perDayRows.map((r) => [r.day, r.n]));
  const perDay = days.map((day) => ({ day, results: byDay.get(day) ?? 0 }));

  const ratings = Object.fromEntries(
    db
      .select({ rating: results.rating, n: count() })
      .from(results)
      .where(inPeriod)
      .groupBy(results.rating)
      .all()
      .map((r) => [r.rating ?? 'none', r.n]),
  );

  const latest = db
    .select(listColumns)
    .from(results)
    .leftJoin(companies, eq(results.companyId, companies.id))
    .leftJoin(machines, eq(results.machineId, machines.id))
    .where(active)
    .orderBy(desc(results.createdAt), desc(results.id))
    .limit(10)
    .all();

  return c.json({
    period: { days: query.days, since },
    totals: {
      ...totals,
      inPeriod: perDay.reduce((sum, d) => sum + d.results, 0),
      ...(scope === null ? { companies: db.select({ n: count() }).from(companies).get()?.n ?? 0 } : {}),
    },
    perDay,
    ratings,
    latest,
  });
});
