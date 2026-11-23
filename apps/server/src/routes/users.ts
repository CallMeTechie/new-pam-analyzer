import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { hashPassword, randomToken } from '../auth/crypto.js';
import { disconnectUserDevices } from '../auth/devices.js';
import { canManageCompany, currentUser, requireManage } from '../auth/middleware.js';
import { deleteUserSessions } from '../auth/sessions.js';
import type { Db } from '../db/index.js';
import { companies, ROLES, type Role, users } from '../db/schema.js';
import { type AppEnv, HttpError, idParam, jsonBody, notFound, parse, type SessionUser } from '../http.js';
import { isKnownLocale, localeCode } from '../services/languages.js';
import { email, password } from './auth.js';
import { inviteUser } from './connect.js';

export const userRoutes = new Hono<AppEnv>();

function listUsers(db: Db, where: ReturnType<typeof eq> | undefined) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      locale: users.locale,
      companyId: users.companyId,
      companyName: companies.name,
      disabled: sql<boolean>`${users.disabledAt} is not null`.mapWith(Boolean),
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      devices: sql<number>`(select count(*) from "devices" d where d.user_id = "users"."id" and d.disconnected_at is null)`,
      /** Open invitation (password not set yet): until when it is valid; `null` without one. */
      inviteUntil: sql<
        number | null
      >`(select max(k.expires_at) from "connect_codes" k where k.user_id = "users"."id" and k.purpose = 'invite' and k.revoked_at is null and k.password_set_at is null and k.expires_at > (unixepoch() * 1000))`,
    })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(where)
    .orderBy(asc(companies.name), asc(users.name))
    .all();
}

const companyOf = (db: Db, companyId: number) =>
  db
    .select({ id: companies.id, isService: companies.isService })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();

/** `admin` exists only in the service company and may only be granted by an administrator. */
function checkRole(actor: SessionUser, role: Role, companyIsService: boolean): void {
  if (role !== 'admin') return;
  if (!companyIsService) throw new HttpError(400, 'invalid_role', 'Administrators must belong to the service company.');
  if (actor.role !== 'admin') throw new HttpError(403, 'forbidden', 'Only administrators can grant this role.');
}

/** At least one active administrator must remain. */
function ensureOtherAdmin(db: Db, userId: number): void {
  const others =
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), ne(users.id, userId)))
      .get()?.n ?? 0;
  if (others === 0) throw new HttpError(400, 'last_admin', 'The last administrator cannot be removed.');
}

userRoutes.get('/', (c) => {
  const user = currentUser(c);
  const requested = c.req.query('companyId') ? Number(c.req.query('companyId')) : null;
  const db = c.get('db');
  if (requested) {
    requireManage(c, requested);
    return c.json({ items: listUsers(db, eq(users.companyId, requested)) });
  }
  if (user.role === 'admin' && user.isService) return c.json({ items: listUsers(db, undefined) });
  requireManage(c, user.companyId);
  return c.json({ items: listUsers(db, eq(users.companyId, user.companyId)) });
});

userRoutes.post('/', async (c) => {
  const actor = currentUser(c);
  const body = parse(
    z.object({
      companyId: z.number().int().positive(),
      email,
      name: z.string().trim().min(1).max(100),
      role: z.enum(ROLES),
      locale: localeCode.default('en'),
      /** Optional: without it the member chooses the password through the invitation. */
      password: password.optional(),
      /** Send the invitation by e-mail (when a mail server is configured). */
      sendInvite: z.boolean().default(false),
    }),
    await jsonBody(c),
  );
  requireManage(c, body.companyId);
  const db = c.get('db');
  const company = companyOf(db, body.companyId);
  if (!company) throw notFound('Company');
  checkRole(actor, body.role, company.isService);
  if (body.locale && !isKnownLocale(db, body.locale)) {
    throw new HttpError(400, 'invalid_request', 'This language is not available.');
  }
  if (db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get()) {
    throw new HttpError(409, 'email_taken', 'A user with this e-mail address already exists.');
  }
  const { password: initial, sendInvite, ...fields } = body;
  const { id } = db
    .insert(users)
    .values({
      ...fields,
      // Without an initial password nobody can sign in until the invitation sets one.
      passwordHash: await hashPassword(initial ?? randomToken(32)),
      mustChangePassword: true,
    })
    .returning({ id: users.id })
    .get();
  const invite = await inviteUser(c, id, actor.id, sendInvite);
  return c.json({ user: listUsers(db, eq(users.id, id))[0], invite }, 201);
});

/** New invitation for a member (replaces an older one): link, QR code and code for the app. */
userRoutes.post('/:id/invite', async (c) => {
  const { actor, row, db } = target(c);
  if (row.disabledAt) throw new HttpError(400, 'user_disabled', 'The account is disabled.');
  const body = parse(z.object({ send: z.boolean().default(false) }), await jsonBody(c));
  const invite = await inviteUser(c, row.id, actor.id, body.send);
  return c.json({ user: listUsers(db, eq(users.id, row.id))[0], invite });
});

function target(c: Context<AppEnv>) {
  const id = idParam(c);
  const db = c.get('db');
  const row = db
    .select({ id: users.id, companyId: users.companyId, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, id))
    .get();
  const actor = currentUser(c);
  if (!row || !canManageCompany(actor, row.companyId)) throw notFound('User');
  return { actor, row, db };
}

userRoutes.patch('/:id', async (c) => {
  const { actor, row, db } = target(c);
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      email: email.optional(),
      role: z.enum(ROLES).optional(),
      locale: localeCode.optional(),
      disabled: z.boolean().optional(),
      /** Move to another company (administrators only). */
      companyId: z.number().int().positive().optional(),
      /** New initial password; the user must change it at the next sign-in. */
      password: password.optional(),
    }),
    await jsonBody(c),
  );
  const self = row.id === actor.id;
  if (self && (body.role !== undefined || body.disabled !== undefined)) {
    throw new HttpError(400, 'self_change', 'You cannot change your own role or disable yourself.');
  }
  if (row.role === 'admin' && actor.role !== 'admin') throw notFound('User');
  if (body.locale && !isKnownLocale(db, body.locale)) {
    throw new HttpError(400, 'invalid_request', 'This language is not available.');
  }
  const moving = body.companyId !== undefined && body.companyId !== row.companyId;
  if (moving) {
    if (actor.role !== 'admin' || !actor.isService)
      throw new HttpError(403, 'forbidden', 'Only administrators can move users.');
    if (self) throw new HttpError(400, 'self_change', 'You cannot move yourself to another company.');
    if (!companyOf(db, body.companyId as number)) throw notFound('Company');
  }
  const targetCompany = companyOf(db, moving ? (body.companyId as number) : row.companyId);
  if (body.role) checkRole(actor, body.role, targetCompany?.isService ?? false);
  else if (moving && row.role === 'admin' && !targetCompany?.isService) {
    throw new HttpError(400, 'invalid_role', 'Administrators must belong to the service company.');
  }
  if (row.role === 'admin' && ((body.role && body.role !== 'admin') || body.disabled)) ensureOtherAdmin(db, row.id);
  if (body.email) {
    const other = db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get();
    if (other && other.id !== row.id)
      throw new HttpError(409, 'email_taken', 'A user with this e-mail address already exists.');
  }

  const { disabled, password: newPassword, ...fields } = body;
  db.update(users)
    .set({
      ...fields,
      ...(disabled === undefined ? {} : { disabledAt: disabled ? (row.disabledAt ?? new Date()) : null }),
      ...(newPassword
        ? {
            passwordHash: await hashPassword(newPassword),
            mustChangePassword: true,
            failedLogins: 0,
            lockedUntil: null,
          }
        : {}),
    })
    .where(eq(users.id, row.id))
    .run();
  if (disabled || newPassword || moving) {
    deleteUserSessions(db, row.id);
    disconnectUserDevices(db, row.id);
  }
  return c.json({ user: listUsers(db, eq(users.id, row.id))[0] });
});

userRoutes.delete('/:id', (c) => {
  const { actor, row, db } = target(c);
  if (row.id === actor.id) throw new HttpError(400, 'self_change', 'You cannot delete yourself.');
  if (row.role === 'admin') {
    if (actor.role !== 'admin') throw notFound('User');
    ensureOtherAdmin(db, row.id);
  }
  db.delete(users).where(eq(users.id, row.id)).run();
  return c.body(null, 204);
});
