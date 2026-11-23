import { and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { readScope, requireAuth } from '../auth/middleware.js';
import { companies, machines, results } from '../db/schema.js';
import { type AppEnv, HttpError, parse } from '../http.js';
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

/** All calendar days from `from` to `to` (inclusive), oldest first. */
function dayRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const n = Math.round((Date.parse(`${to}T00:00:00Z`) - start) / 86_400_000) + 1;
  return Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Figures for the overview: totals, results per day, rating distribution and the latest results. */
dashboardRoutes.get('/', (c) => {
  const auth = requireAuth(c);
  const query = parse(
    z.object({
      companyId: z.coerce.number().int().positive().optional(),
      days: z.coerce.number().int().min(7).max(365).default(30),
      // A fixed period instead of the last `days` days, e.g. the current calendar week.
      from: isoDay.optional(),
      to: isoDay.optional(),
    }),
    c.req.query(),
  );
  if ((query.from === undefined) !== (query.to === undefined) || (query.from && query.to && query.from > query.to)) {
    throw new HttpError(400, 'invalid_request', 'from and to belong together, from <= to');
  }
  const db = c.get('db');
  const scope = readScope(auth, query.companyId);
  const timeZone = c.get('config').timeZone;
  const days =
    query.from && query.to
      ? dayRange(query.from, query.to).slice(0, 366)
      : calendarDays(localDay(new Date(), timeZone), query.days);
  const since = days[0] as string;
  const until = days.at(-1) as string;
  const active = and(isNull(results.deletedAt), scopeFilter(scope));
  const inPeriod = and(active, gte(results.testDate, `${since} 00:00:00`), lte(results.testDate, `${until} 23:59:59`));

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
    .select({
      day: sql<string>`substr(${results.testDate}, 1, 10)`,
      n: count(),
      critical: sql<number>`sum(case when ${results.rating} = 'critical' then 1 else 0 end)`,
    })
    .from(results)
    .where(inPeriod)
    .groupBy(sql`substr(${results.testDate}, 1, 10)`)
    .all();
  const byDay = new Map(perDayRows.map((r) => [r.day, r]));
  const perDay = days.map((day) => ({ day, results: byDay.get(day)?.n ?? 0, critical: byDay.get(day)?.critical ?? 0 }));

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
    period: { days: days.length, since, until },
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
