import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { ServerConfig } from './config.js';
import type { Db } from './db/index.js';
import type { Role } from './db/schema.js';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  companyId: number;
  /** Member of the service company (FUJI Service): may see every company. */
  isService: boolean;
  locale: string;
  mustChangePassword: boolean;
}

/** A connected app installation; acts on behalf of its user within the user's company. */
export interface DevicePrincipal {
  id: number;
  companyId: number;
}

export type Auth = { kind: 'user'; user: SessionUser } | { kind: 'device'; user: SessionUser; device: DevicePrincipal };

export interface AppEnv {
  Variables: {
    db: Db;
    config: ServerConfig;
    auth: Auth | null;
  };
}

/**
 * Error with a language-neutral `code` that the web UI and apps translate.
 * `message` is English and meant for logs and developers.
 */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);

export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'invalid_request', 'The request is invalid.', result.error.flatten());
  }
  return result.data;
}

export async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
}

export function idParam(c: Context, name = 'id'): number {
  const id = Number(c.req.param(name));
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}
