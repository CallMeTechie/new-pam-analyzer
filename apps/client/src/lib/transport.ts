import { ApiError, type ApiTransport, type Profile } from '@web/lib/api';
import type { Engine } from './engine';
import { detail, toRow } from './evaluate';

/**
 * Answers the API requests of the web pages that the app reuses (result page, head history,
 * language choice) from the data on this PC.
 */
export function localTransport(engine: Engine): ApiTransport {
  const profile = (): Profile => {
    const s = engine.snapshot;
    return {
      id: 0,
      email: '',
      name: s.connection?.userName ?? 'PAM Analyzer',
      role: 'user',
      locale: s.locale ?? document.documentElement.lang ?? 'en',
      mustChangePassword: false,
      company: { id: 0, name: s.connection?.companyName ?? '', isService: false, logoVersion: null },
    };
  };
  const notFound = () => new ApiError(404, 'not_found', 'Result not found.');

  return async (method, path, body) => {
    const url = new URL(path, 'http://local');
    const p = url.pathname;
    if (method === 'GET' && p === '/auth/session') return { user: profile() };
    if (method === 'PATCH' && p === '/auth/me') {
      const locale = (body as { locale?: string } | undefined)?.locale;
      if (locale) await engine.setLocale(locale);
      return { user: profile() };
    }
    if (method === 'GET' && p === '/settings/rating') return engine.snapshot.config.thresholds;
    if (method === 'GET' && p === '/i18n') return { catalogs: [] };

    const m = /^\/results\/(\d+)(\/history)?$/.exec(p);
    if (method === 'GET' && m) {
      const id = Number(m[1]);
      const row = engine.snapshot.rows.find((r) => r.id === id);
      if (!row) throw notFound();
      if (m[2]) {
        const items = engine.snapshot.rows
          .filter((r) => r.headType === row.headType && r.headSerial === row.headSerial)
          .sort((a, b) => a.testDate.localeCompare(b.testDate) || a.id - b.id)
          .map(toRow);
        return { headType: row.headType, headSerial: row.headSerial, items };
      }
      return detail(row, await engine.platform.store.file(id), engine.snapshot.config);
    }
    throw new ApiError(404, 'not_found', `${method} ${p} is not available in the app.`);
  };
}
