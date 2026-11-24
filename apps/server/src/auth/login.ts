import { eq } from 'drizzle-orm';
import type { ServerConfig } from '../config.js';
import type { Db } from '../db/index.js';
import { companies, users } from '../db/schema.js';
import { HttpError } from '../http.js';
import { serverLog } from '../services/logs.js';
import { verifyPassword } from './crypto.js';

/** Hash of a random password, so unknown e-mail addresses take as long as wrong passwords. */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const invalid = () => new HttpError(401, 'invalid_credentials', 'E-mail address or password is wrong.');

/**
 * Checks e-mail and password with a per-account lockout after repeated failures.
 * Returns the user id. Disabled accounts and companies fail like a wrong password.
 */
export async function checkCredentials(db: Db, config: ServerConfig, email: string, password: string): Promise<number> {
  const row = db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      failedLogins: users.failedLogins,
      lockedUntil: users.lockedUntil,
      disabledAt: users.disabledAt,
      companyDisabledAt: companies.disabledAt,
    })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.email, email.trim().toLowerCase()))
    .get();

  if (!row) {
    await verifyPassword(password, DUMMY_HASH);
    throw invalid();
  }
  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    throw new HttpError(429, 'account_locked', 'Too many failed sign-in attempts. Please try again later.', {
      lockedUntil: row.lockedUntil.toISOString(),
    });
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    const failed = row.failedLogins + 1;
    const lock = failed >= config.loginMaxAttempts;
    db.update(users)
      .set({
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + config.loginLockMinutes * 60_000) : row.lockedUntil,
      })
      .where(eq(users.id, row.id))
      .run();
    if (lock)
      serverLog(
        db,
        'warning',
        'login',
        `Account locked for ${config.loginLockMinutes} minutes after ${failed} failed sign-ins`,
        {
          userId: row.id,
          context: { lockedMinutes: config.loginLockMinutes },
        },
      );
    throw invalid();
  }
  if (row.disabledAt || row.companyDisabledAt) throw invalid();
  db.update(users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, row.id))
    .run();
  return row.id;
}
