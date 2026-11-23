import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Role } from '../db/schema.js';
import { type AppEnv, type Auth, HttpError, type SessionUser } from '../http.js';
import { principalForDevice } from './devices.js';
import { SESSION_COOKIE, userForSession } from './sessions.js';

/** Paths an account with an initial password may still use. */
const OPEN_PATHS = ['/api/auth/', '/api/i18n', '/api/version'];

/** Resolves the caller from the session cookie or an `Authorization: Bearer pamd_…` device token. */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = c.get('db');
  const header = c.req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    const principal = principalForDevice(db, header.slice(7).trim());
    if (!principal) {
      throw new HttpError(401, 'device_disconnected', 'This device is not connected (any more). Please connect again.');
    }
    c.set('auth', { kind: 'device', ...principal });
  } else {
    const token = getCookie(c, SESSION_COOKIE);
    const user = token ? userForSession(db, token, c.get('config').sessionTtlDays) : null;
    c.set('auth', user ? { kind: 'user', user } : null);
    // Accounts with an initial password may only change it (and read or end their session).
    if (user?.mustChangePassword && !OPEN_PATHS.some((p) => c.req.path.startsWith(p))) {
      throw new HttpError(403, 'password_change_required', 'Please change your initial password first.');
    }
  }
  await next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie sessions: state-changing requests must come from our own origin.
 * Requests with a device token carry no cookie and are not affected.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || c.get('auth')?.kind === 'device') return next();
  if (!getCookie(c, SESSION_COOKIE)) return next();
  const allowed = new Set([new URL(c.req.url).origin]);
  const publicUrl = c.get('config').publicUrl;
  if (publicUrl) allowed.add(new URL(publicUrl).origin);
  const origin = c.req.header('origin') ?? originOf(c.req.header('referer'));
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, 'cross_origin', 'Request from a foreign origin was rejected.');
  }
  return next();
};

function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

type AuthContext = Pick<Context<AppEnv>, 'get'>;

const forbidden = () => new HttpError(403, 'forbidden', 'You do not have permission for this action.');

/** Signed-in web user or connected device. */
export function requireAuth(c: AuthContext): Auth {
  const auth = c.get('auth');
  if (!auth) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  return auth;
}

/** Signed-in web user (not a device), optionally with one of the given roles. */
export function currentUser(c: AuthContext, roles?: Role[]): SessionUser {
  const auth = c.get('auth');
  if (auth?.kind !== 'user') throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  if (roles && !roles.includes(auth.user.role)) throw forbidden();
  return auth.user;
}

/** FUJI Service administrator. */
export function requireAdmin(c: AuthContext): SessionUser {
  const user = currentUser(c);
  if (user.role !== 'admin' || !user.isService) throw forbidden();
  return user;
}

/**
 * Companies whose results the caller may read: `null` means all (service staff without a filter).
 * Others are limited to their own company; asking for another one is forbidden.
 */
export function readScope(auth: Auth, requested?: number | null): number | null {
  if (auth.kind === 'device') {
    if (requested && requested !== auth.device.companyId) throw forbidden();
    return auth.device.companyId;
  }
  if (auth.user.isService) return requested ?? null;
  if (requested && requested !== auth.user.companyId) throw forbidden();
  return auth.user.companyId;
}

export function canReadCompany(auth: Auth, companyId: number | null): boolean {
  if (auth.kind === 'user' && auth.user.isService) return true;
  const own = auth.kind === 'device' ? auth.device.companyId : auth.user.companyId;
  return companyId === own;
}

/** Users and API keys of a company: service administrators, and company admins of that company. */
export function canManageCompany(user: SessionUser, companyId: number): boolean {
  if (user.role === 'admin' && user.isService) return true;
  return user.role === 'companyAdmin' && user.companyId === companyId;
}

export function requireManage(c: AuthContext, companyId: number): SessionUser {
  const user = currentUser(c);
  if (!canManageCompany(user, companyId)) throw forbidden();
  return user;
}
