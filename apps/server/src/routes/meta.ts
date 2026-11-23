import { readFileSync } from 'node:fs';
import { ALGORITHM_VERSION } from '@pam/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireAdmin } from '../auth/middleware.js';
import { type AppEnv, HttpError, jsonBody, notFound, parse } from '../http.js';
import { catalogSchema, deleteCatalog, listCatalogs, localeCode, putCatalog } from '../services/languages.js';
import { mailConfig } from '../services/mail.js';

/** Version of the server package, read once on start (works from `src` and from `dist`). */
export const SERVER_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/** Public metadata: version and imported language catalogs (also needed on the sign-in page). */
export const metaRoutes = new Hono<AppEnv>();

metaRoutes.get('/version', (c) =>
  c.json({
    version: SERVER_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    /** Invitations can be sent by e-mail. */
    mail: mailConfig(c.get('db'), c.get('config')) !== null,
    /** Limits the web UI sizes its upload batches by (it unpacks ZIP archives itself). */
    upload: { maxFileBytes: c.get('config').maxFileBytes, maxUploadBytes: c.get('config').maxUploadBytes },
  }),
);

metaRoutes.get('/i18n', (c) => c.json({ catalogs: listCatalogs(c.get('db')) }));

metaRoutes.put(
  '/i18n/:code',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: () => {
      throw new HttpError(413, 'upload_too_large', 'The language file is too large.');
    },
  }),
  async (c) => {
    const user = requireAdmin(c);
    const code = parse(localeCode, c.req.param('code'));
    const body = parse(catalogSchema, await jsonBody(c));
    return c.json({ catalog: putCatalog(c.get('db'), code, body, user.id) });
  },
);

metaRoutes.delete('/i18n/:code', (c) => {
  const user = requireAdmin(c);
  if (!deleteCatalog(c.get('db'), c.req.param('code'), user.id)) throw notFound('Language');
  return c.body(null, 204);
});
