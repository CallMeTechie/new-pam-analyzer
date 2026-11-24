import { sql } from 'drizzle-orm';
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`);

/**
 * - `admin`: FUJI Service administrator; manages all companies, users, keys and settings.
 * - `companyAdmin`: manages the users and API keys of their own company.
 * - `user`: sees and uploads the results of their own company.
 *
 * Members of the service company (FUJI Service) see the results of every company,
 * whatever their role.
 */
export const ROLES = ['admin', 'companyAdmin', 'user'] as const;
export type Role = (typeof ROLES)[number];

/** Tenants. Users, API keys, machines and results belong to exactly one company. */
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  number: text('number'),
  location: text('location'),
  notes: text('notes'),
  /** The operator of the installation (FUJI Service). Exactly one company has this flag. */
  isService: integer('is_service', { mode: 'boolean' }).notNull().default(false),
  /** Logo (PNG, JPEG or WebP, at most 512 KB). */
  logo: blob('logo', { mode: 'buffer' }),
  logoType: text('logo_type'),
  logoUpdatedAt: integer('logo_updated_at', { mode: 'timestamp_ms' }),
  /** Devices (apps) per user; `null`: the default of the general settings. */
  maxDevicesPerUser: integer('max_devices_per_user'),
  disabledAt: integer('disabled_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    locale: text('locale').notNull().default('en'),
    /** Set for accounts created with an initial password by an administrator. */
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
    disabledAt: integer('disabled_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('users_company_idx').on(t.companyId)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself is only in the cookie. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** A device (app installation) connected through an API key by a user. Counts towards the key's limit. */
export const devices = sqliteTable(
  'devices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Random id the app creates once per installation; reconnecting reuses the slot. */
    installId: text('install_id').notNull(),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    appVersion: text('app_version'),
    /** SHA-256 of the device token. */
    tokenHash: text('token_hash').notNull().unique(),
    uploadCount: integer('upload_count').notNull().default(0),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    /** Files in the app's upload queue, as last reported with its log entries. */
    queuedFiles: integer('queued_files'),
    disconnectedAt: integer('disconnected_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('devices_user_idx').on(t.userId)],
);

/**
 * One-time codes that connect an app to a user account, shown as QR code and as text.
 * - `invite`: created with an invitation (7 days); sets the first password on the web once and
 *   connects one device once.
 * - `device`: created by the user under "My account" (10 minutes); connects one device.
 */
export const connectCodes = sqliteTable(
  'connect_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['invite', 'device'] }).notNull(),
    /** SHA-256 of the normalised code. */
    codeHash: text('code_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    passwordSetAt: integer('password_set_at', { mode: 'timestamp_ms' }),
    deviceConnectedAt: integer('device_connected_at', { mode: 'timestamp_ms' }),
    /** Replaced by a newer code of the same purpose. */
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('connect_codes_user_idx').on(t.userId)],
);

/** Machines are created automatically on upload; a line (section) can be assigned afterwards. */
export const machines = sqliteTable(
  'machines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    machineNo: text('machine_no').notNull(),
    family: text('family').notNull(),
    model: text('model'),
    line: text('line'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('machines_company_no_idx').on(t.companyId, t.machineNo)],
);

export const SOURCES = ['web', 'app'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * One PAM run. The original file is stored gzip-compressed and is the source of truth;
 * the metric columns allow searching, history and trends without reading the file.
 */
export const results = sqliteTable(
  'results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** `null` only for results that staff uploaded without a company and that are not assigned yet. */
    companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    machineId: integer('machine_id').references(() => machines.id, { onDelete: 'set null' }),
    sha256: text('sha256').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    fileGz: blob('file_gz', { mode: 'buffer' }).notNull(),
    /** Modification date of the original file (ms), kept so the file can be parsed again identically. */
    fileModifiedAt: integer('file_modified_at', { mode: 'timestamp_ms' }),

    machineNo: text('machine_no').notNull(),
    machineFamily: text('machine_family').notNull(),
    headType: text('head_type').notNull(),
    headSerial: text('head_serial').notNull(),
    toolType: text('tool_type'),
    toolSerial: text('tool_serial'),
    h08mVariant: text('h08m_variant'),
    /** Customer (plant) where the head was measured, entered by the technician in the app. */
    customer: text('customer'),
    /** Local machine time `YYYY-MM-DD HH:mm:ss`: header timestamp, file modification date or upload time. */
    testDate: text('test_date').notNull(),
    dateSource: text('date_source').notNull(),

    coefficient: real('coefficient').notNull(),
    coefficientSource: text('coefficient_source').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    configVersion: text('config_version').notNull(),

    cpX: real('cp_x'),
    cpkX: real('cpk_x'),
    cpY: real('cp_y'),
    cpkY: real('cpk_y'),
    cpkXY: real('cpk_xy'),
    rating: text('rating'),
    meanX: real('mean_x').notNull(),
    meanY: real('mean_y').notNull(),
    meanQ: real('mean_q').notNull(),
    sigma3X: real('sigma3_x').notNull(),
    sigma3Y: real('sigma3_y').notNull(),
    sigma3Q: real('sigma3_q').notNull(),
    measured: integer('measured').notNull(),
    expected: integer('expected'),
    failed: integer('failed').notNull(),
    componentStatus: text('component_status').notNull(),
    warnings: integer('warnings').notNull().default(0),

    source: text('source', { enum: SOURCES }).notNull(),
    uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    deletedBy: integer('deleted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('results_company_date_idx').on(t.companyId, t.testDate),
    index('results_head_idx').on(t.headSerial, t.headType, t.testDate),
    index('results_machine_idx').on(t.machineNo),
    index('results_sha_idx').on(t.sha256),
    index('results_test_date_idx').on(t.testDate),
    index('results_created_idx').on(t.createdAt),
    index('results_customer_idx').on(t.companyId, t.customer),
  ],
);

/** Metrics per holder. */
export const resultShafts = sqliteTable(
  'result_shafts',
  {
    resultId: integer('result_id')
      .notNull()
      .references(() => results.id, { onDelete: 'cascade' }),
    shaft: integer('shaft').notNull(),
    label: text('label').notNull(),
    count: integer('count').notNull(),
    cpkX: real('cpk_x'),
    cpkY: real('cpk_y'),
    cpkXY: real('cpk_xy'),
    rating: text('rating'),
  },
  (t) => [primaryKey({ columns: [t.resultId, t.shaft] })],
);

/** Key-value settings; values are JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
});

/**
 * Logs & Monitoring: one protocol for the server and the connected apps (crashes, errors, warnings,
 * information and problems reported by users). The same message from the same place within a few
 * minutes only raises `count`.
 */
export const logEntries = sqliteTable(
  'log_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** `crash`, `error`, `warning`, `info` or `report` (problem reported by a user). */
    level: text('level').notNull(),
    /** `server`, or the platform of the app: `windows`, `android`, `other`. */
    source: text('source').notNull(),
    /** Short code of what happened, e.g. `http`, `startup`, `mail`, `login`, `panic`, `upload`. */
    category: text('category').notNull(),
    message: text('message').notNull(),
    /** Stack trace or full report. */
    details: text('details'),
    /** The app's log lines before the event (ring buffer). */
    history: text('history'),
    /** Further facts as JSON: path, status, free space, queued files … */
    context: text('context', { mode: 'json' }),
    deviceId: integer('device_id').references(() => devices.id, { onDelete: 'set null' }),
    companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    appVersion: text('app_version'),
    deviceName: text('device_name'),
    /** Model and system version, e.g. "Google Pixel 10 Pro Fold · Android 16". */
    system: text('system'),
    /** Id the app gave the entry, so a resend after a lost answer is not stored twice. */
    clientId: text('client_id'),
    /** Ids of the app's entries counted into this one (`|id|id|`), for the same reason. */
    mergedIds: text('merged_ids'),
    /** Same level, source, category and message: equal entries are counted, not repeated. */
    fingerprint: text('fingerprint').notNull(),
    count: integer('count').notNull().default(1),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    lastAt: integer('last_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('log_entries_client_idx').on(t.deviceId, t.clientId),
    index('log_entries_last_idx').on(t.lastAt),
    index('log_entries_fingerprint_idx').on(t.fingerprint, t.lastAt),
  ],
);
