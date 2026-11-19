import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { deleteExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { bootstrap } from './services/bootstrap.js';

const config = loadConfig();
const database = openDatabase(config.databaseFile);
await bootstrap(database.db, config);

const app = createApp(database.db, config);
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`PAM Analyzer server listening on http://${info.address}:${info.port}`);
});

const cleanup = setInterval(() => deleteExpiredSessions(database.db), 60 * 60 * 1000);
cleanup.unref();

function shutdown() {
  clearInterval(cleanup);
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
