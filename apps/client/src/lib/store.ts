import { gunzipSync, gzipSync } from 'fflate';
import type { LocalResult } from './types';

/**
 * Local data of the app: results with their original files and settings. The Windows app keeps
 * them in SQLite in the user profile; the browser preview and the tests keep them in memory.
 */
export interface Store {
  all(): Promise<LocalResult[]>;
  get(id: number): Promise<LocalResult | null>;
  byHash(sha256: string): Promise<LocalResult | null>;
  insert(row: Omit<LocalResult, 'id'>, file: Uint8Array): Promise<number>;
  update(id: number, patch: Partial<Omit<LocalResult, 'id'>>): Promise<void>;
  file(id: number): Promise<Uint8Array>;
  setting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;
}

export function memoryStore(): Store {
  const rows = new Map<number, LocalResult>();
  const files = new Map<number, Uint8Array>();
  const settings = new Map<string, string>();
  let next = 1;
  return {
    async all() {
      return [...rows.values()].map((r) => ({ ...r }));
    },
    async get(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async byHash(sha256) {
      for (const r of rows.values()) if (r.sha256 === sha256) return { ...r };
      return null;
    },
    async insert(row, file) {
      const id = next++;
      rows.set(id, { ...row, id });
      files.set(id, file.slice());
      return id;
    },
    async update(id, patch) {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, ...patch, id });
    },
    async file(id) {
      const f = files.get(id);
      if (!f) throw new Error(`No file for result ${id}`);
      return f.slice();
    },
    async setting<T>(key: string) {
      const v = settings.get(key);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    async setSetting(key, value) {
      if (value === null || value === undefined) settings.delete(key);
      else settings.set(key, JSON.stringify(value));
    },
  };
}

/** Minimal interface of `@tauri-apps/plugin-sql`, so the store can be tested without Tauri. */
export interface SqlDatabase {
  execute(query: string, values?: unknown[]): Promise<{ lastInsertId?: number; rowsAffected: number }>;
  select<T>(query: string, values?: unknown[]): Promise<T>;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/**
 * SQLite store. Results are kept as JSON documents, so new fields need no migration; the original
 * file is stored gzip-compressed in its own table.
 */
export async function sqlStore(db: SqlDatabase): Promise<Store> {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, sha256 TEXT NOT NULL UNIQUE, data TEXT NOT NULL)',
  );
  await db.execute('CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, gz TEXT NOT NULL)');
  await db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const parse = (r: { id: number; data: string }): LocalResult => ({
    ...(JSON.parse(r.data) as LocalResult),
    id: r.id,
  });
  const store: Store = {
    async all() {
      return (await db.select<{ id: number; data: string }[]>('SELECT id, data FROM results ORDER BY id')).map(parse);
    },
    async get(id) {
      const [r] = await db.select<{ id: number; data: string }[]>('SELECT id, data FROM results WHERE id = $1', [id]);
      return r ? parse(r) : null;
    },
    async byHash(sha256) {
      const [r] = await db.select<{ id: number; data: string }[]>('SELECT id, data FROM results WHERE sha256 = $1', [
        sha256,
      ]);
      return r ? parse(r) : null;
    },
    async insert(row, file) {
      const res = await db.execute('INSERT INTO results (sha256, data) VALUES ($1, $2)', [
        row.sha256,
        JSON.stringify(row),
      ]);
      const id = Number(res.lastInsertId);
      await db.execute('INSERT OR REPLACE INTO files (id, gz) VALUES ($1, $2)', [id, toBase64(gzipSync(file))]);
      return id;
    },
    async update(id, patch) {
      const current = await store.get(id);
      if (!current) return;
      const { id: _id, ...rest } = { ...current, ...patch };
      await db.execute('UPDATE results SET data = $1 WHERE id = $2', [JSON.stringify(rest), id]);
    },
    async file(id) {
      const [r] = await db.select<{ gz: string }[]>('SELECT gz FROM files WHERE id = $1', [id]);
      if (!r) throw new Error(`No file for result ${id}`);
      return gunzipSync(fromBase64(r.gz));
    },
    async setting<T>(key: string) {
      const [r] = await db.select<{ value: string }[]>('SELECT value FROM settings WHERE key = $1', [key]);
      return r ? (JSON.parse(r.value) as T) : null;
    },
    async setSetting(key, value) {
      if (value === null || value === undefined) await db.execute('DELETE FROM settings WHERE key = $1', [key]);
      else
        await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', [key, JSON.stringify(value)]);
    },
  };
  return store;
}
