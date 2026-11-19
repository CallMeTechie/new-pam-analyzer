import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { de } from './de';
import { en } from './en';

/**
 * Every visible text lives in a catalog. English is the main language and the fallback for
 * missing texts. A new language is one more catalog in `CATALOGS`; numbers, dates and plural forms
 * follow the locale through `Intl`.
 */
export type Plural = { one: string; other: string; zero?: string; two?: string; few?: string; many?: string };
export type Message = string | Plural;
export type Catalog = typeof en;
export type MessageKey = keyof Catalog;

export interface CatalogEntry {
  name: string;
  messages: Partial<Record<MessageKey, Message>>;
  /** Built into the app (English, German) or imported by an administrator. */
  builtin: boolean;
}

/** All languages; imported catalogs are added at runtime and may extend built-in ones. */
export const CATALOGS: Record<string, CatalogEntry> = {
  en: { name: 'English', messages: en, builtin: true },
  de: { name: 'Deutsch', messages: de, builtin: true },
};

const BUILTIN: Record<string, CatalogEntry> = { ...CATALOGS };

/** Adds catalogs imported on the server; an imported built-in language overrides single texts. */
export function registerCatalogs(list: { code: string; name: string; messages: Record<string, unknown> }[]): void {
  for (const code of Object.keys(CATALOGS)) if (!BUILTIN[code]) delete CATALOGS[code];
  for (const [code, entry] of Object.entries(BUILTIN)) CATALOGS[code] = entry;
  for (const c of list) {
    const base = BUILTIN[c.code];
    CATALOGS[c.code] = {
      name: c.name,
      messages: { ...(base?.messages ?? {}), ...(c.messages as Partial<Record<MessageKey, Message>>) },
      builtin: Boolean(base),
    };
  }
}
export const DEFAULT_LOCALE = 'en';
export type Vars = Record<string, string | number>;

export function translate(locale: string, key: MessageKey, vars: Vars = {}): string {
  let msg: Message = CATALOGS[locale]?.messages[key] ?? en[key] ?? key;
  if (typeof msg === 'object') {
    const n = Number(vars.n ?? 0);
    const form = new Intl.PluralRules(locale).select(n) as keyof Plural;
    msg = msg[form] ?? msg.other;
  }
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

const STORAGE_KEY = 'pam-locale';

export function initialLocale(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Imported languages are loaded later; until then English is shown.
    if (saved && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(saved)) return saved;
  } catch {
    // no storage available
  }
  const browser = navigator.language?.slice(0, 2);
  return browser && CATALOGS[browser] ? browser : DEFAULT_LOCALE;
}

export interface I18n {
  locale: string;
  setLocale(locale: string): void;
  t(key: MessageKey, vars?: Vars): string;
  /** Fixed number of decimals; `–` for missing values. */
  num(value: number | null | undefined, digits?: number): string;
  int(value: number): string;
  /** Machine time `YYYY-MM-DD HH:mm:ss` (no zone conversion). */
  dateTime(value: string | null | undefined): string;
  date(value: string | null | undefined): string;
  /** Absolute instant (ISO string or ms) in the browser's zone. */
  instant(value: string | number | Date | null | undefined): string;
  relative(value: string | number | Date | null | undefined): string;
  /** Loads imported language catalogs again, e.g. after an import. */
  reloadCatalogs?(): Promise<void>;
}

const I18nContext = createContext<I18n | null>(null);

const machineDate = (s: string) => {
  const [y = 0, mo = 1, d = 1, h = 0, mi = 0] = s.split(/[- :T]/).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
};

export function makeI18n(locale: string, setLocale: (l: string) => void = () => {}): I18n {
  const formats = new Map<number, Intl.NumberFormat>();
  const nf = (d: number) => {
    let f = formats.get(d);
    if (!f) {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
      formats.set(d, f);
    }
    return f;
  };
  const ints = new Intl.NumberFormat(locale);
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const dOnly = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const local = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return {
    locale,
    setLocale,
    t: (key, vars) => translate(locale, key, vars),
    num: (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '–' : nf(d).format(v)),
    int: (v) => ints.format(v),
    dateTime: (v) => (v ? dt.format(machineDate(v)) : '–'),
    date: (v) => (v ? dOnly.format(machineDate(v)) : '–'),
    instant: (v) => (v === null || v === undefined ? '–' : local.format(new Date(v))),
    relative: (v) => {
      if (v === null || v === undefined) return '–';
      const diff = (new Date(v).getTime() - Date.now()) / 1000;
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(Math.round(diff), 'second');
      if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
      if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
      return local.format(new Date(v));
    },
  };
}

type CatalogList = { code: string; name: string; messages: Record<string, unknown> }[];

async function serverCatalogs(): Promise<CatalogList | null> {
  const res = await fetch('/api/i18n', { credentials: 'same-origin' });
  if (!res.ok) return null;
  return ((await res.json()) as { catalogs: CatalogList }).catalogs;
}

/**
 * `loadCatalogs` supplies imported languages; the web loads them from its server, the apps from
 * the connected server or not at all.
 */
export function I18nProvider({
  children,
  loadCatalogs = serverCatalogs,
}: {
  children: ReactNode;
  loadCatalogs?: () => Promise<CatalogList | null>;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [revision, setRevision] = useState(0);
  const reloadCatalogs = useCallback(async () => {
    try {
      const list = await loadCatalogs();
      if (!list) return;
      registerCatalogs(list);
      setRevision((r) => r + 1);
    } catch {
      // the built-in languages stay available
    }
  }, [loadCatalogs]);
  useEffect(() => {
    void reloadCatalogs();
  }, [reloadCatalogs]);
  const setLocale = useCallback((next: string) => {
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // no storage available
    }
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);
  const value = useMemo(
    () => ({ ...makeI18n(CATALOGS[locale] ? locale : DEFAULT_LOCALE, setLocale), reloadCatalogs }),
    [locale, setLocale, revision, reloadCatalogs],
  );
  document.documentElement.lang = locale;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
