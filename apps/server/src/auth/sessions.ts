import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { companies, sessions, users } from '../db/schema.js';
import type { SessionUser } from '../http.js';
import { randomToken, sha256 } from './crypto.js';

export const SESSION_COOKIE = 'pam_session';

const DAY = 24 * 60 * 60 * 1000;

/** Columns that make up a {@link SessionUser}; shared by session and device lookups. */
export const sessionUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  companyId: users.companyId,
  isService: companies.isService,
  locale: users.locale,
  mustChangePassword: users.mustChangePassword,
};

/** Users that may act: neither the account nor its company is disabled. */
export const activeUser = and(isNull(users.disabledAt), isNull(companies.disabledAt));

export function createSession(db: Db, userId: number, ttlDays: number): { token: string; expiresAt: Date } {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlDays * DAY);
  db.insert(sessions)
    .values({ id: sha256(token), userId, expiresAt })
    .run();
  return { token, expiresAt };
}

/** Returns the user of a valid session and extends it (sliding expiry). */
export function userForSession(db: Db, token: string, ttlDays: number): SessionUser | null {
  const id = sha256(token);
  const row = db
    .select({ ...sessionUserColumns, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()), activeUser))
    .get();
  if (!row) return null;
  if (row.expiresAt.getTime() - Date.now() < (ttlDays * DAY) / 2) {
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + ttlDays * DAY) })
      .where(eq(sessions.id, id))
      .run();
  }
  const { expiresAt: _, ...user } = row;
  return user;
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.id, sha256(token)))
    .run();
}

/** Signs a user out everywhere, optionally keeping one session (the one changing the password). */
export function deleteUserSessions(db: Db, userId: number, keepToken?: string): void {
  const keep = keepToken ? sha256(keepToken) : null;
  const rows = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).all();
  for (const row of rows) if (row.id !== keep) db.delete(sessions).where(eq(sessions.id, row.id)).run();
}

export function deleteExpiredSessions(db: Db): void {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
}
