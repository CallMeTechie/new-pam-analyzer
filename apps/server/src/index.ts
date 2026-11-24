import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { deleteExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { SERVER_VERSION } from './routes/meta.js';
import { bootstrap } from './services/bootstrap.js';
import { checkDisk, deleteOldLogs, serverLog } from './services/logs.js';
import { getGeneralSettings } from './services/settings.js';

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
serverLog(
  database.db,
  'info',
  'startup',
  `Started · v${SERVER_VERSION}${database.migrated ? ` · ${database.migrated} migration(s) applied` : ''}`,
  { context: { version: SERVER_VERSION, migrated: database.migrated }, mergeWithinMs: 0 },
);

const app = createApp(database.db, config);
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`PAM Analyzer server listening on http://${info.address}:${info.port}`);
});

// Hourly: expired sessions, log entries past their retention, free space on the data folder.
function housekeeping() {
  deleteExpiredSessions(database.db);
  deleteOldLogs(database.db, getGeneralSettings(database.db).logRetentionDays);
  checkDisk(database.db, config.databaseFile, config.dataDir);
}
housekeeping();
const cleanup = setInterval(housekeeping, 60 * 60 * 1000);
cleanup.unref();

function shutdown() {
  clearInterval(cleanup);
  serverLog(database.db, 'info', 'startup', 'Stopped', { mergeWithinMs: 0 });
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
// Errors nothing else caught: in the protocol, so they can be found later.
process.on('unhandledRejection', (reason) => {
  serverLog(
    database.db,
    'error',
    'process',
    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
    {
      details: reason instanceof Error ? (reason.stack ?? null) : null,
    },
  );
});
process.on('uncaughtException', (error) => {
  serverLog(database.db, 'error', 'process', `Uncaught exception: ${error.message}`, { details: error.stack ?? null });
  // The process is in an unknown state: end it; Docker starts it again.
  process.exit(1);
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
