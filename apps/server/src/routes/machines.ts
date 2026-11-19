import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { canManageCompany, currentUser } from '../auth/middleware.js';
import { machines } from '../db/schema.js';
import { type AppEnv, idParam, jsonBody, notFound, parse } from '../http.js';

export const machineRoutes = new Hono<AppEnv>();

/** Sets the line (section) of a machine. */
machineRoutes.patch('/:id', async (c) => {
  const user = currentUser(c);
  const id = idParam(c);
  const db = c.get('db');
  const row = db.select().from(machines).where(eq(machines.id, id)).get();
  if (!row || row.companyId === null || !canManageCompany(user, row.companyId)) throw notFound('Machine');
  const body = parse(
    z.object({
      line: z
        .string()
        .trim()
        .max(60)
        .transform((v) => v || null)
        .nullable(),
    }),
    await jsonBody(c),
  );
  db.update(machines).set(body).where(eq(machines.id, id)).run();
  return c.json({ machine: db.select().from(machines).where(eq(machines.id, id)).get() });
});
