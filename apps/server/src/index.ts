import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { deleteExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { bootstrap } from './services/bootstrap.js';

const config = loadConfig();

function open() {
  try {
    return openDatabase(config.databaseFile);
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code === 'SQLITE_CANTOPEN' || code === 'EACCES' || code === 'EROFS') {
      const uid = process.getuid?.() ?? '?';
      console.error(
        `ERROR: The database ${config.databaseFile} cannot be opened (${code}).\n` +
          `The server runs as uid ${uid} and needs read and write access to ${config.dataDir}.\n` +
          'With the official image this is fixed automatically on start; otherwise give that user, ' +
          'or "Everyone", write access to the folder.',
      );
      process.exit(1);
    }
    throw error;
  }
}

const database = open();
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
