import { join, resolve } from 'node:path';

export interface ServerConfig {
  port: number;
  host: string;
  /** Directory for the SQLite database (mounted as a Docker volume). */
  dataDir: string;
  databaseFile: string;
  /** Public address, e.g. https://pam.example.com. Used for cookie security and the CSRF origin check. */
  publicUrl: string | null;
  cookieSecure: boolean;
  sessionTtlDays: number;
  maxUploadBytes: number;
  maxFileBytes: number;
  loginMaxAttempts: number;
  loginLockMinutes: number;
  /** Time zone of the machines; used for ZIP entry dates and the upload time. */
  timeZone: string;
  /** Folder with the built web UI; served when it exists. */
  webDir: string;
  /** Name of the service company created on first start. */
  serviceCompanyName: string;
  /** Optional mail server for invitations; without it the invitation link is handed over by hand. */
  smtp: SmtpConfig | null;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS from the start (port 465); otherwise STARTTLS when the server offers it. */
  secure: boolean;
  user: string | null;
  password: string | null;
  /** Sender, e.g. `PAM Analyzer <pam@example.com>`. */
  from: string;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function validTimeZone(value: string | undefined): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = resolve(env.DATA_DIR ?? './data');
  const publicUrl = env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/+$/, '') : null;
  return {
    port: int(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir,
    databaseFile: env.DATABASE_FILE ?? join(dataDir, 'pam.sqlite'),
    publicUrl,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : publicUrl?.startsWith('https://') === true,
    sessionTtlDays: int(env.SESSION_TTL_DAYS, 7),
    maxUploadBytes: int(env.MAX_UPLOAD_MB, 200) * 1024 * 1024,
    maxFileBytes: int(env.MAX_FILE_MB, 10) * 1024 * 1024,
    loginMaxAttempts: int(env.LOGIN_MAX_ATTEMPTS, 5),
    loginLockMinutes: int(env.LOGIN_LOCK_MINUTES, 15),
    timeZone: validTimeZone(env.TIME_ZONE) ?? 'Europe/Berlin',
    webDir: resolve(env.WEB_DIR ?? './public'),
    serviceCompanyName: env.SERVICE_COMPANY_NAME?.trim() || 'FUJI Service',
    smtp: env.SMTP_HOST?.trim()
      ? {
          host: env.SMTP_HOST.trim(),
          port: int(env.SMTP_PORT, 587),
          secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : int(env.SMTP_PORT, 587) === 465,
          user: env.SMTP_USER?.trim() || null,
          password: env.SMTP_PASSWORD ?? null,
          from: env.SMTP_FROM?.trim() || `PAM Analyzer <${env.SMTP_USER?.trim() || 'pam@localhost'}>`,
        }
      : null,
  };
}
