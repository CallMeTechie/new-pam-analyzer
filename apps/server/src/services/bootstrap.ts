import { and, count, eq } from 'drizzle-orm';
import { hashPassword } from '../auth/crypto.js';
import type { ServerConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { companies, users } from '../db/schema.js';
import { writeSetting } from './settings.js';

/**
 * Default administrator of a new installation. E-mail address and password are publicly known
 * and must both be changed at the first sign-in; until then the account can do nothing else.
 */
export const DEFAULT_ADMIN = { email: 'admin@example.com', password: 'admin1234' } as const;

/**
 * Set to `false` when the server creates the service company; the first administrator then names it
 * right after replacing the default credentials (`POST /api/auth/service-company`).
 */
export const SERVICE_NAMED_SETTING = 'serviceCompanyNamed';

/**
 * First start: creates the service company and, while no administrator exists, the default
 * administrator. Existing accounts are never changed.
 */
export async function bootstrap(db: Db, config: ServerConfig, log: (msg: string) => void = console.log): Promise<void> {
  let service = db.select().from(companies).where(eq(companies.isService, true)).get();
  if (!service) {
    service = db.insert(companies).values({ name: config.serviceCompanyName, isService: true }).returning().get();
    writeSetting(db, SERVICE_NAMED_SETTING, false, null);
    log(`Created service company "${service.name}".`);
  }
  const admins =
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.companyId, service.id)))
      .get()?.n ?? 0;
  if (admins > 0) return;
  if (db.select({ id: users.id }).from(users).where(eq(users.email, DEFAULT_ADMIN.email)).get()) {
    log(`No administrator exists, but ${DEFAULT_ADMIN.email} is taken by another account.`);
    return;
  }
  db.insert(users)
    .values({
      companyId: service.id,
      email: DEFAULT_ADMIN.email,
      name: 'Administrator',
      passwordHash: await hashPassword(DEFAULT_ADMIN.password),
      role: 'admin',
      mustChangePassword: true,
    })
    .run();
  log(
    `Created the default administrator ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}. ` +
      'E-mail address and password must be changed at the first sign-in.',
  );
}
