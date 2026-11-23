import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

/** Folder with the SQL migrations, both from `src/db` and from `dist/db`. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface Database_ {
  db: Db;
  sqlite: Database.Database;
  close(): void;
}

/** Opens (and if needed creates) the database and applies all pending migrations. */
export function openDatabase(file: string, migrationsFolder = MIGRATIONS_FOLDER): Database_ {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  // Migrations that rebuild a table (drop + rename) must not cascade into the tables that point
  // at it; the migrator runs in a transaction, where PRAGMA foreign_keys has no effect.
  sqlite.pragma('foreign_keys = OFF');
  migrate(db, { migrationsFolder });
  const broken = sqlite.pragma('foreign_key_check') as unknown[];
  if (broken.length > 0) throw new Error(`Database migration left ${broken.length} broken references.`);
  sqlite.pragma('foreign_keys = ON');
  return { db, sqlite, close: () => sqlite.close() };
}

export { schema };
