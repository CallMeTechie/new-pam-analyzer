import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { settings } from '../db/schema.js';

/**
 * Language catalogs imported by an administrator. They extend or replace the catalogs built
 * into the web UI; texts missing in a catalog fall back to English there.
 */
export interface LanguageCatalog {
  code: string;
  name: string;
  messages: Record<string, string | Record<string, string>>;
  updatedAt: string;
}

const KEY = 'languages';
const text = z.string().max(4000);
const plural = z.record(z.enum(['zero', 'one', 'two', 'few', 'many', 'other']), text).refine((p) => 'other' in p, {
  message: 'Plural texts need at least "other".',
});

export const localeCode = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Use a language code like "fr" or "pt-BR".');

export const catalogSchema = z.object({
  name: z.string().trim().min(1).max(60),
  messages: z
    .record(z.string().max(120), z.union([text, plural]))
    .refine((m) => Object.keys(m).length > 0 && Object.keys(m).length <= 5000, { message: 'No or too many texts.' }),
});

function all(db: Db): Record<string, LanguageCatalog> {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  return (row?.value as Record<string, LanguageCatalog> | undefined) ?? {};
}

function save(db: Db, value: Record<string, LanguageCatalog>, userId: number): void {
  const updatedAt = new Date();
  db.insert(settings)
    .values({ key: KEY, value, updatedBy: userId, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: userId, updatedAt } })
    .run();
}

export function listCatalogs(db: Db): LanguageCatalog[] {
  return Object.values(all(db)).sort((a, b) => a.code.localeCompare(b.code));
}

export function putCatalog(
  db: Db,
  code: string,
  catalog: z.infer<typeof catalogSchema>,
  userId: number,
): LanguageCatalog {
  const value = all(db);
  const entry: LanguageCatalog = { code, ...catalog, updatedAt: new Date().toISOString() };
  value[code] = entry;
  save(db, value, userId);
  return entry;
}

export function deleteCatalog(db: Db, code: string, userId: number): boolean {
  const value = all(db);
  if (!(code in value)) return false;
  delete value[code];
  save(db, value, userId);
  return true;
}

/** Languages built into the web UI and the apps. */
export const BUILTIN_LOCALES = ['en', 'de'];

export function isKnownLocale(db: Db, code: string): boolean {
  return BUILTIN_LOCALES.includes(code) || code in all(db);
}
