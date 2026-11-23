import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { authenticate, sameOrigin } from './auth/middleware.js';
import type { ServerConfig } from './config.js';
import type { Db } from './db/index.js';
import { type AppEnv, HttpError } from './http.js';
import { appRoutes } from './routes/app.js';
import { authRoutes } from './routes/auth.js';
import { companyRoutes } from './routes/companies.js';
import { connectRoutes, deviceRoutes } from './routes/connect.js';
import { crashReportRoutes } from './routes/crashReports.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { machineRoutes } from './routes/machines.js';
import { metaRoutes } from './routes/meta.js';
import { resultRoutes } from './routes/results.js';
import { settingsRoutes } from './routes/settings.js';
import { uploadRoutes } from './routes/uploads.js';
import { userRoutes } from './routes/users.js';

export function createApp(db: Db, config: ServerConfig) {
  const app = new Hono<AppEnv>();

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
      },
    }),
  );
  app.get('/health', (c) => c.json({ status: 'ok' }));

  const api = new Hono<AppEnv>();
  api.use(async (c, next) => {
    c.set('db', db);
    c.set('config', config);
    c.header('cache-control', 'no-store');
    await next();
  });
  api.use(authenticate, sameOrigin);
  api.route('/auth', authRoutes);
  api.route('/', metaRoutes);
  api.route('/app', appRoutes);
  api.route('/companies', companyRoutes);
  api.route('/users', userRoutes);
  api.route('/connect', connectRoutes);
  api.route('/devices', deviceRoutes);
  api.route('/machines', machineRoutes);
  api.route('/uploads', uploadRoutes);
  api.route('/results', resultRoutes);
  api.route('/dashboard', dashboardRoutes);
  api.route('/settings', settingsRoutes);
  api.route('/crash-reports', crashReportRoutes);
  api.all('*', () => {
    throw new HttpError(404, 'not_found', 'Unknown API endpoint.');
  });
  app.route('/api', api);

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(
        { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
        error.status,
      );
    }
    console.error(error);
    return c.json({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } }, 500);
  });

  // Web UI (single-page app): static files, otherwise index.html.
  if (existsSync(config.webDir)) {
    const root = relative(process.cwd(), config.webDir) || '.';
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ root, path: 'index.html' }));
  }
  return app;
}
