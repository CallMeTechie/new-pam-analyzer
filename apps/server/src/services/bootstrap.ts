import { and, count, eq } from 'drizzle-orm';
import { hashPassword } from '../auth/crypto.js';
import type { ServerConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { companies, users } from '../db/schema.js';

/**
 * First start: creates the service company and, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and
 * no administrator exists yet, the first administrator. Existing accounts are never changed.
 */
export async function bootstrap(db: Db, config: ServerConfig, log: (msg: string) => void = console.log): Promise<void> {
  let service = db.select().from(companies).where(eq(companies.isService, true)).get();
  if (!service) {
    service = db.insert(companies).values({ name: config.serviceCompanyName, isService: true }).returning().get();
    log(`Created service company "${service.name}".`);
  }
  const admins =
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.companyId, service.id)))
      .get()?.n ?? 0;
  if (admins > 0) return;
  if (!config.adminEmail || !config.adminPassword) {
    log('No administrator exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create one.');
    return;
  }
  if (config.adminPassword.length < 12) {
    log('ADMIN_PASSWORD must have at least 12 characters; no administrator was created.');
    return;
  }
  db.insert(users)
    .values({
      companyId: service.id,
      email: config.adminEmail,
      name: 'Administrator',
      passwordHash: await hashPassword(config.adminPassword),
      role: 'admin',
      mustChangePassword: true,
    })
    .run();
  log(`Created administrator ${config.adminEmail}.`);
}
