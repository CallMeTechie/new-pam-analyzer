import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { checkCredentials } from '../auth/login.js';
import { currentUser } from '../auth/middleware.js';
import { createSession, deleteSession, deleteUserSessions, SESSION_COOKIE, userForSession } from '../auth/sessions.js';
import { companies, users } from '../db/schema.js';
import { type AppEnv, HttpError, jsonBody, parse } from '../http.js';
import { DEFAULT_ADMIN, SERVICE_NAMED_SETTING } from '../services/bootstrap.js';
import { isKnownLocale, localeCode } from '../services/languages.js';
import { readSetting, writeSetting } from '../services/settings.js';

export const password = z.string().min(12, 'at least 12 characters').max(200);
export const email = z.string().trim().toLowerCase().email().max(200);

export const authRoutes = new Hono<AppEnv>();

function profile(db: AppEnv['Variables']['db'], userId: number) {
  const row = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      locale: users.locale,
      mustChangePassword: users.mustChangePassword,
      company: {
        id: companies.id,
        name: companies.name,
        isService: companies.isService,
        logoVersion: sql<number | null>`${companies.logoUpdatedAt}`,
      },
    })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.id, userId))
    .get();
  if (!row) return row;
  return {
    ...row,
    /** The service company still has to be named (new installation, an administrator of the service company). */
    nameServiceCompany:
      row.role === 'admin' && row.company.isService && readSetting<boolean>(db, SERVICE_NAMED_SETTING) === false,
  };
}

authRoutes.post('/login', async (c) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200) }), await jsonBody(c));
  const config = c.get('config');
  const db = c.get('db');
  const userId = await checkCredentials(db, config, body.email, body.password);
  const { token, expiresAt } = createSession(db, userId, config.sessionTtlDays);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
  return c.json({ user: profile(db, userId) });
});

authRoutes.post('/logout', (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(c.get('db'), token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

authRoutes.get('/me', (c) => {
  const user = currentUser(c);
  return c.json({ user: profile(c.get('db'), user.id) });
});

authRoutes.patch('/me', async (c) => {
  const user = currentUser(c);
  const body = parse(
    z.object({ name: z.string().trim().min(1).max(100).optional(), locale: localeCode.optional() }),
    await jsonBody(c),
  );
  const db = c.get('db');
  if (body.locale && !isKnownLocale(db, body.locale)) {
    throw new HttpError(400, 'invalid_request', 'This language is not available.');
  }
  db.update(users).set(body).where(eq(users.id, user.id)).run();
  return c.json({ user: profile(db, user.id) });
});

/**
 * Changes the password. The default administrator (`admin@example.com`) must also choose a
 * real e-mail address, so no publicly known credentials remain.
 */
authRoutes.post('/password', async (c) => {
  const user = currentUser(c);
  const body = parse(
    z.object({ currentPassword: z.string().max(200), newPassword: password, newEmail: email.optional() }),
    await jsonBody(c),
  );
  const db = c.get('db');
  const row = db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).get();
  if (!row || !(await verifyPassword(body.currentPassword, row.hash))) {
    throw new HttpError(400, 'wrong_password', 'The current password is wrong.');
  }
  if (body.newPassword === body.currentPassword || body.newPassword === DEFAULT_ADMIN.password) {
    throw new HttpError(400, 'same_password', 'Choose a password that differs from the current one.');
  }
  const newEmail = body.newEmail && body.newEmail !== user.email ? body.newEmail : undefined;
  if (user.email === DEFAULT_ADMIN.email && !newEmail) {
    throw new HttpError(400, 'email_change_required', 'Choose your own e-mail address instead of the default one.');
  }
  if (newEmail === DEFAULT_ADMIN.email) {
    throw new HttpError(400, 'email_change_required', 'Choose your own e-mail address instead of the default one.');
  }
  if (newEmail && db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).get()) {
    throw new HttpError(409, 'email_taken', 'A user with this e-mail address already exists.');
  }
  db.update(users)
    .set({
      passwordHash: await hashPassword(body.newPassword),
      mustChangePassword: false,
      ...(newEmail ? { email: newEmail } : {}),
    })
    .where(eq(users.id, user.id))
    .run();
  deleteUserSessions(db, user.id, getCookie(c, SESSION_COOKIE));
  return c.body(null, 204);
});

/**
 * Names the service company of a new installation: the step right after the default administrator
 * replaced the default credentials. Later it is renamed like any company under Companies.
 */
authRoutes.post('/service-company', async (c) => {
  const user = currentUser(c);
  const db = c.get('db');
  if (user.role !== 'admin' || !user.isService) throw new HttpError(403, 'forbidden', 'Administrators only.');
  if (user.mustChangePassword) {
    throw new HttpError(403, 'password_change_required', 'Replace the default credentials first.');
  }
  const body = parse(z.object({ name: z.string().trim().min(1).max(120) }), await jsonBody(c));
  const taken = db.select({ id: companies.id }).from(companies).where(eq(companies.name, body.name)).get();
  if (taken && taken.id !== user.companyId) {
    throw new HttpError(409, 'name_taken', 'A company with this name already exists.');
  }
  db.update(companies).set({ name: body.name }).where(eq(companies.id, user.companyId)).run();
  writeSetting(db, SERVICE_NAMED_SETTING, true, user.id);
  return c.json({ user: profile(db, user.id) });
});

/** Lets the web UI check a session without an error status. */
authRoutes.get('/session', (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? userForSession(c.get('db'), token, c.get('config').sessionTtlDays) : null;
  return c.json({ user: user ? profile(c.get('db'), user.id) : null });
});
