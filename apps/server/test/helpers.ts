import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/crypto.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { companies, type Role, users } from '../src/db/schema.js';
import { bootstrap } from '../src/services/bootstrap.js';

export const FIXTURES = fileURLToPath(new URL('../../../packages/core/test/fixtures/', import.meta.url));

export function fixture(family: 'nxt' | 'nxtr' | 'aimex', index = 0): { name: string; bytes: Uint8Array } {
  const dir = `${FIXTURES}${family}/`;
  const name = readdirSync(dir)
    .filter((f) => f.endsWith('.dat'))
    .sort()[index];
  if (!name) throw new Error(`No fixture ${family}#${index}`);
  return { name, bytes: new Uint8Array(readFileSync(dir + name)) };
}

/** Default administrator created on the first start. */
export const ADMIN = { email: 'admin@example.com', password: 'admin1234' };
export const PASSWORD = 'user-password-123';
const ORIGIN = 'http://localhost';

export interface Client {
  /** Sends a request; JSON bodies are serialized, cookies are kept. */
  req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  json<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
  upload(
    files: { name: string; bytes: Uint8Array; lastModified?: number }[],
    fields?: Record<string, string>,
  ): Promise<{ status: number; body: any }>;
  setToken(token: string | null): void;
}

export async function setup(overrides: Partial<ServerConfig> = {}, options: { keepInitialPassword?: boolean } = {}) {
  const config: ServerConfig = {
    ...loadConfig({}),
    databaseFile: ':memory:',
    webDir: '/nonexistent',
    ...overrides,
  };
  const database = openDatabase(':memory:');
  await bootstrap(database.db, config, () => {});
  // Most tests skip the forced change of the administrator's initial password.
  if (!options.keepInitialPassword) database.db.update(users).set({ mustChangePassword: false }).run();
  const app = createApp(database.db, config);
  const db = database.db;

  function client(): Client {
    let cookie: string | null = null;
    let token: string | null = null;
    const req = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const init: RequestInit & { headers: Record<string, string> } = {
        method,
        headers: { origin: ORIGIN, ...headers },
      };
      if (cookie) init.headers.cookie = cookie;
      if (token) init.headers.authorization = `Bearer ${token}`;
      if (body instanceof FormData) init.body = body;
      else if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers['content-type'] = 'application/json';
      }
      const res = await app.request(path, init);
      const set = res.headers.get('set-cookie');
      if (set) {
        const value = set.split(';')[0] ?? '';
        cookie = value.endsWith('=') ? null : value;
      }
      return res;
    };
    return {
      req,
      async json(method, path, body) {
        const res = await req(method, path, body);
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
      },
      async upload(files, fields = {}) {
        const form = new FormData();
        for (const f of files) {
          form.append('files', new File([f.bytes], f.name));
          form.append('lastModified', String(f.lastModified ?? ''));
        }
        for (const [k, v] of Object.entries(fields)) form.append(k, v);
        const res = await req('POST', '/api/uploads', form);
        return { status: res.status, body: await res.json() };
      },
      setToken(value) {
        token = value;
      },
    };
  }

  async function login(email: string, password: string): Promise<Client> {
    const c = client();
    const res = await c.json('POST', '/api/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
    return c;
  }

  async function createCompany(name: string): Promise<number> {
    return db.insert(companies).values({ name }).returning({ id: companies.id }).get().id;
  }

  async function createUser(companyId: number, email: string, role: Role = 'user'): Promise<number> {
    return db
      .insert(users)
      .values({
        companyId,
        email,
        name: email.split('@')[0] ?? email,
        role,
        passwordHash: await hashPassword(PASSWORD),
      })
      .returning({ id: users.id })
      .get().id;
  }

  return { app, db, config, client, login, createCompany, createUser, close: database.close };
}
