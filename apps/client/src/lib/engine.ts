import { type CoefficientConfig, CPK_THRESHOLDS, type CpkThresholds, DEFAULT_CONFIG } from '@pam/core';
import type { Platform, UpdateInfo } from '../platform/types';
import { diag } from './diag';
import {
  analyze,
  evaluate,
  expandInput,
  type InputFile,
  metrics,
  parseFile,
  type RejectReason,
  sha256Hex,
} from './evaluate';
import { uploadBody } from './multipart';
import type { Channel, Connection, DateChoice, EvalConfig, LocalResult, Theme } from './types';

export const DEFAULT_EVAL: EvalConfig = {
  coefficients: DEFAULT_CONFIG,
  version: 'default',
  thresholds: CPK_THRESHOLDS,
  timeZone: null,
  source: 'default',
  fetchedAt: null,
};

/** Upload batch size; the server evaluates each file again. */
const BATCH = 10;
const RETRY_MS = 60_000;
const CONFIG_REFRESH_MS = 30 * 60_000;

export type ServerState = 'off' | 'online' | 'offline' | 'revoked';

export interface ImportProgress {
  done: number;
  total: number;
  /** File being evaluated. */
  name: string;
}

/** Local machine time `YYYY-MM-DD HH:mm:ss` of a date. */
/** The later of two `YYYY-MM-DD HH:mm:ss` timestamps. */
const later = (a: string, b: string): string => (a > b ? a : b);

export function machineTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface ImportSummary {
  created: number[];
  duplicates: number[];
  rejected: { name: string; reason: RejectReason }[];
}

export interface EngineState {
  ready: boolean;
  rows: LocalResult[];
  config: EvalConfig;
  connection: Connection | null;
  server: ServerState;
  syncing: boolean;
  channel: Channel;
  theme: Theme;
  locale: string | null;
  update: UpdateInfo | null;
  updateChecked: number | null;
}

/** Error from the server or the network, with the server's language-neutral code. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Normalizes what the user typed as server address: scheme, no trailing slash. */
export function normalizeServer(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const url = new URL(s);
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

/** Coefficients as the server sends them: the configuration and its version. */
interface ServerCoefficients {
  version: string;
  config: CoefficientConfig;
}

interface ServerConfig {
  coefficients: ServerCoefficients;
  thresholds: CpkThresholds;
  timeZone?: string;
}

const sameConfig = (a: EvalConfig, b: ServerConfig) =>
  a.version === b.coefficients.version &&
  a.timeZone === (b.timeZone ?? null) &&
  JSON.stringify(a.coefficients) === JSON.stringify(b.coefficients.config) &&
  JSON.stringify(a.thresholds) === JSON.stringify(b.thresholds);

/**
 * The app's state and work: importing and evaluating files, the local history, the connection to
 * the server and the upload queue. React reads it through `useEngine`.
 */
export class Engine {
  private state: EngineState = {
    ready: false,
    rows: [],
    config: DEFAULT_EVAL,
    connection: null,
    server: 'off',
    syncing: false,
    channel: 'stable',
    theme: 'system',
    locale: null,
    update: null,
    updateChecked: null,
  };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private syncRunning: Promise<void> | null = null;

  private logTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly platform: Platform) {
    diag.appVersion = platform.version;
    // A new report goes out a few seconds later when connected (several errors in one go).
    diag.onQueued = () => {
      if (this.logTimer) clearTimeout(this.logTimer);
      this.logTimer = setTimeout(() => void this.sendLogs(), 3000);
    };
  }

  get snapshot(): EngineState {
    return this.state;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
  private get store() {
    return this.platform.store;
  }

  async init(): Promise<void> {
    diag.info('app', `Started ${this.platform.version} (${this.platform.os})`);
    const [rows, config, connection, channel, locale, theme] = await Promise.all([
      this.store.all(),
      this.store.setting<EvalConfig>('config'),
      this.store.setting<Connection>('connection'),
      this.store.setting<Channel>('channel'),
      this.store.setting<string>('locale'),
      this.store.setting<Theme>('theme'),
    ]);
    const token = connection ? await this.platform.secret.get() : null;
    this.set({
      ready: true,
      rows,
      config: config ? { ...DEFAULT_EVAL, ...config } : DEFAULT_EVAL,
      connection: connection && token ? connection : null,
      server: connection && token ? 'online' : 'off',
      channel: channel ?? 'stable',
      theme: theme ?? 'system',
      locale,
    });
    if (this.state.connection) {
      void this.refreshConfig().catch(() => {});
      void this.sync();
    }
  }

  async setLocale(locale: string): Promise<void> {
    await this.store.setSetting('locale', locale);
    this.set({ locale });
  }

  async setTheme(theme: Theme): Promise<void> {
    await this.store.setSetting('theme', theme);
    this.set({ theme });
  }

  async setChannel(channel: Channel): Promise<void> {
    await this.store.setSetting('channel', channel);
    this.set({ channel, update: null, updateChecked: null });
  }

  // ---------- files ----------

  /** Evaluates and stores files; ZIP archives are opened, duplicates are recognised by content. */
  async importFiles(input: InputFile[], onProgress?: (p: ImportProgress) => void): Promise<ImportSummary> {
    const summary: ImportSummary = { created: [], duplicates: [], rejected: [] };
    const files: InputFile[] = [];
    for (const f of input) {
      const e = expandInput(f);
      files.push(...e.files);
      for (const name of e.skipped) summary.rejected.push({ name, reason: 'unsupported_type' });
    }
    const queued = this.state.connection !== null;
    for (const [i, file] of files.entries()) {
      onProgress?.({ done: i, total: files.length, name: file.name });
      // Let the window paint the progress between files.
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      const hash = await sha256Hex(file.bytes);
      const existing = await this.store.byHash(hash);
      if (existing) {
        summary.duplicates.push(existing.id);
        continue;
      }
      const importedAt = Date.now();
      const result = evaluate(file, this.state.config, importedAt);
      if (!result.ok) {
        summary.rejected.push({ name: file.name, reason: result.reason });
        diag.warn('file', `File not readable: ${file.name} (${result.reason})`);
        continue;
      }
      const row: Omit<LocalResult, 'id'> = {
        sha256: hash,
        fileName: file.name,
        filePath: file.path,
        fileSize: file.bytes.length,
        fileModifiedAt: file.lastModified,
        importedAt,
        ...metrics(result.parsed, result.analysis),
        customer: null,
        metaDirty: false,
        upload: queued ? 'queued' : 'local',
        uploadError: null,
        uploadedAt: null,
        serverResultId: null,
      };
      summary.created.push(await this.store.insert(row, file.bytes));
    }
    onProgress?.({ done: files.length, total: files.length, name: '' });
    diag.info(
      'import',
      `${files.length} file(s): ${summary.created.length} new, ${summary.duplicates.length} known, ${summary.rejected.length} not readable`,
    );
    this.set({ rows: await this.store.all() });
    if (queued && summary.created.length) void this.sync();
    return summary;
  }

  /** Evaluates all stored files again, e.g. after the server changed coefficients or thresholds. */
  private async reevaluateAll(): Promise<void> {
    for (const r of this.state.rows) {
      try {
        const bytes = await this.store.file(r.id);
        const parsed = parseFile(bytes, r.fileName, r.fileModifiedAt, r.importedAt, this.state.config.timeZone);
        const m = metrics(parsed, analyze(parsed, this.state.config));
        // A test date set by hand stays.
        if (r.dateSource === 'manual') {
          m.testDate = r.testDate;
          m.dateSource = 'manual';
        }
        await this.store.update(r.id, m);
      } catch {
        // keep the previous values of a file that cannot be read
      }
    }
    this.set({ rows: await this.store.all() });
  }

  // ---------- server ----------

  private async call<T>(
    path: string,
    init: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      json?: unknown;
      body?: Uint8Array;
      contentType?: string;
      token?: string | null;
      server?: string;
    },
  ): Promise<T> {
    const server = init.server ?? this.state.connection?.server;
    if (!server) throw new ServerError(0, 'not_connected', 'Not connected.');
    const headers: Record<string, string> = { accept: 'application/json' };
    const token = init.token === undefined ? await this.platform.secret.get() : init.token;
    if (token) headers.authorization = `Bearer ${token}`;
    let body: string | Uint8Array | undefined;
    if (init.json !== undefined) {
      body = JSON.stringify(init.json);
      headers['content-type'] = 'application/json';
    } else if (init.body) {
      body = init.body;
      if (init.contentType) headers['content-type'] = init.contentType;
    }
    const res = await this.platform.request(`${server}/api${path}`, {
      method: init.method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    if (res.status === 0) throw new ServerError(0, 'network_error', res.text || 'The server cannot be reached.');
    if (res.status === 204) return undefined as T;
    let data: unknown = null;
    try {
      data = res.text ? JSON.parse(res.text) : null;
    } catch {
      throw new ServerError(res.status, 'not_pam_server', 'The address does not answer like a PAM Analyzer server.');
    }
    if (res.status >= 400) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ServerError(res.status, err?.code ?? 'internal_error', err?.message ?? `HTTP ${res.status}`);
    }
    return data as T;
  }

  /** Reads from the server with the device token, e.g. the results of the whole company. */
  async remote<T>(path: string): Promise<T> {
    if (!this.state.connection) throw new ServerError(0, 'not_connected', 'Not connected.');
    return this.call<T>(path, { method: 'GET' });
  }

  private async installId(): Promise<string> {
    let id = await this.store.setting<string>('installId');
    if (!id) {
      id = crypto.randomUUID();
      await this.store.setSetting('installId', id);
    }
    return id;
  }

  /** Connects with a one-time code (invitation or "My account → Connect another device"). */
  async connect(input: { server: string; code: string; deviceName: string }): Promise<void> {
    let server: string;
    try {
      server = normalizeServer(input.server);
    } catch {
      throw new ServerError(0, 'invalid_server', 'Invalid server address.');
    }
    const res = await this.call<{
      token: string;
      userName: string;
      companyName: string;
      locale: string;
      cpkThresholds: CpkThresholds;
      coefficients: ServerCoefficients;
      timeZone?: string;
    }>('/app/connect', {
      method: 'POST',
      server,
      token: null,
      json: {
        code: input.code.trim().toUpperCase(),
        installId: await this.installId(),
        deviceName: input.deviceName.trim(),
        platform: this.platform.os,
        appVersion: this.platform.version,
      },
    });
    await this.platform.secret.set(res.token);
    const connection: Connection = {
      server,
      deviceName: input.deviceName.trim(),
      userName: res.userName,
      companyName: res.companyName,
      connectedAt: Date.now(),
      lastSyncAt: Date.now(),
    };
    await this.store.setSetting('connection', connection);
    // Everything evaluated on this PC so far goes to the server as well.
    for (const r of this.state.rows) if (r.upload === 'local') await this.store.update(r.id, { upload: 'queued' });
    this.set({ connection, server: 'online', rows: await this.store.all() });
    await this.applyConfig({
      coefficients: res.coefficients,
      thresholds: res.cpkThresholds,
      ...(res.timeZone ? { timeZone: res.timeZone } : {}),
    });
    diag.info('connection', `Connected to ${server} as ${res.userName} (${res.companyName})`);
    void this.sync();
  }

  /** Frees the device slot on the server (if reachable) and forgets the token. */
  async disconnect(): Promise<void> {
    try {
      if (this.state.server !== 'revoked') await this.call('/app/connection', { method: 'DELETE' });
    } catch {
      // the administrator can still remove the device on the web
    }
    await this.platform.secret.clear();
    await this.store.setSetting('connection', null);
    for (const r of this.state.rows) if (r.upload === 'queued') await this.store.update(r.id, { upload: 'local' });
    if (this.timer) clearTimeout(this.timer);
    diag.info('connection', 'Disconnected');
    this.set({ connection: null, server: 'off', rows: await this.store.all() });
  }

  private async applyConfig(next: ServerConfig): Promise<void> {
    const changed = !sameConfig(this.state.config, next);
    const config: EvalConfig = {
      coefficients: next.coefficients.config,
      version: next.coefficients.version,
      thresholds: next.thresholds,
      timeZone: next.timeZone ?? null,
      source: 'server',
      fetchedAt: Date.now(),
    };
    await this.store.setSetting('config', config);
    this.set({ config });
    if (changed) await this.reevaluateAll();
  }

  async refreshConfig(): Promise<void> {
    const res = await this.call<{ coefficients: ServerCoefficients; cpkThresholds: CpkThresholds; timeZone?: string }>(
      '/app/config',
      { method: 'GET' },
    );
    await this.applyConfig({
      coefficients: res.coefficients,
      thresholds: res.cpkThresholds,
      ...(res.timeZone ? { timeZone: res.timeZone } : {}),
    });
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), ms);
  }

  /** Uploads the queue; on network errors it tries again a minute later. */
  sync(): Promise<void> {
    if (!this.syncRunning) {
      this.syncRunning = this.runSync().finally(() => {
        this.syncRunning = null;
      });
    }
    return this.syncRunning;
  }

  private async runSync(): Promise<void> {
    const connection = this.state.connection;
    if (!connection || this.state.server === 'revoked') return;
    this.set({ syncing: true });
    try {
      if (!connection.lastSyncAt || Date.now() - connection.lastSyncAt > CONFIG_REFRESH_MS) await this.refreshConfig();
      for (;;) {
        const batch = this.state.rows.filter((r) => r.upload === 'queued').slice(0, BATCH);
        if (batch.length === 0) break;
        const files = await Promise.all(
          batch.map(async (r) => ({
            name: r.fileName,
            bytes: await this.store.file(r.id),
            lastModified: r.fileModifiedAt,
          })),
        );
        const { body, contentType } = uploadBody(files);
        const res = await this.call<{ results: { status: string; resultId?: number; reason?: string }[] }>('/uploads', {
          method: 'POST',
          body,
          contentType,
        });
        const now = Date.now();
        for (const [i, r] of batch.entries()) {
          const outcome = res.results[i];
          if (outcome && outcome.status !== 'rejected') {
            await this.store.update(r.id, {
              upload: 'uploaded',
              uploadedAt: now,
              uploadError: null,
              serverResultId: outcome.resultId ?? null,
              // A file that was on the server already keeps its customer there; send ours.
              metaDirty: outcome.status === 'duplicate' && Boolean(r.customer || r.dateSource === 'manual'),
            });
          } else {
            await this.store.update(r.id, { upload: 'rejected', uploadError: outcome?.reason ?? 'unreadable' });
            diag.warn('upload', `File not accepted by the server: ${r.fileName} (${outcome?.reason ?? 'unreadable'})`);
          }
        }
        this.set({ rows: await this.store.all() });
      }
      // Customer or test date changed after the upload.
      for (const r of this.state.rows.filter((x) => x.metaDirty && x.upload === 'uploaded' && x.serverResultId)) {
        try {
          await this.call(`/results/${r.serverResultId}`, {
            method: 'PATCH',
            json: { customer: r.customer ?? null, testDate: r.dateSource === 'manual' ? r.testDate : null },
          });
          await this.store.update(r.id, { metaDirty: false });
        } catch (error) {
          // The result was deleted on the server: nothing to update.
          if (error instanceof ServerError && error.status === 404) await this.store.update(r.id, { metaDirty: false });
          else throw error;
        }
      }
      this.set({ rows: await this.store.all() });
      await this.sendCrashReports();
      await this.sendLogs();
      const updated = { ...connection, lastSyncAt: Date.now() };
      await this.store.setSetting('connection', updated);
      this.set({ connection: updated, server: 'online' });
      this.schedule(CONFIG_REFRESH_MS);
    } catch (error) {
      if (error instanceof ServerError && error.status === 401) {
        // Token revoked or device removed by the administrator.
        diag.warn('connection', 'The server disconnected this device');
        this.set({ server: 'revoked' });
      } else {
        if (this.state.server !== 'offline') {
          const waiting = this.state.rows.filter((r) => r.upload === 'queued').length;
          diag.warn('connection', `Server not reachable – ${waiting} file(s) waiting`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        this.set({ server: 'offline' });
        this.schedule(RETRY_MS);
      }
    } finally {
      this.set({ syncing: false });
    }
  }

  /** Crash reports stored on the device go to the server once it is reachable; a failure waits for the next sync. */
  private async sendCrashReports(): Promise<void> {
    try {
      const reports = (await this.platform.crashReports?.()) ?? [];
      for (let i = 0; i < reports.length; i += 20) {
        const { accepted } = await this.call<{ accepted: string[] }>('/app/crash-reports', {
          method: 'POST',
          json: { reports: reports.slice(i, i + 20) },
        });
        await this.platform.deleteCrashReports?.(accepted);
      }
    } catch {
      // Not important enough to mark the connection as offline.
    }
  }

  /**
   * Reports of Logs & Monitoring go to the server when connected, with the number of files still
   * waiting for upload; a failure keeps them for the next try.
   */
  async sendLogs(): Promise<void> {
    if (!this.state.connection || this.state.server === 'revoked') return;
    const queued = this.state.rows.filter((r) => r.upload === 'queued').length;
    try {
      let entries = diag.take(50);
      do {
        const { accepted } = await this.call<{ accepted: string[] }>('/app/logs', {
          method: 'POST',
          json: { entries, state: { queued } },
        });
        diag.ack(accepted);
        if (!accepted.length) break;
        entries = diag.take(50);
      } while (entries.length);
    } catch {
      // Offline or the server is older: the reports wait.
    }
  }

  // ---------- customer and test date ----------

  /**
   * Customer and test date for results, e.g. after an import. `date`: from the file (the parsed
   * date), today, or a chosen day (keeping the time of day from the file).
   */
  async assign(ids: number[], input: { customer: string | null; date: DateChoice }): Promise<void> {
    const customer = input.customer?.replace(/\s+/g, ' ').trim() || null;
    for (const id of ids) {
      const r = await this.store.get(id);
      if (!r) continue;
      const patch: Partial<LocalResult> = { customer };
      if (input.date.kind === 'today') {
        patch.testDate = machineTime(new Date());
        patch.dateSource = 'manual';
      } else if (input.date.kind === 'date') {
        const time = r.testDate.slice(11) || '12:00:00';
        patch.testDate = `${input.date.date} ${time}`;
        patch.dateSource = 'manual';
      } else if (r.dateSource === 'manual') {
        const bytes = await this.store.file(id);
        const parsed = parseFile(bytes, r.fileName, r.fileModifiedAt, r.importedAt, this.state.config.timeZone);
        patch.testDate = parsed.header.testDate ?? r.testDate;
        patch.dateSource = parsed.header.dateSource;
      }
      // Already on the server: send the change with the next sync.
      if (r.upload === 'uploaded') patch.metaDirty = true;
      await this.store.update(id, patch);
    }
    this.set({ rows: await this.store.all() });
    if (this.state.connection) void this.sync();
  }

  /** Customer names for autocompletion: used on this PC and, when connected, on the server. */
  async customerSuggestions(query = ''): Promise<string[]> {
    const q = query.trim().toLowerCase();
    const counts = new Map<string, { n: number; last: string }>();
    for (const r of this.state.rows) {
      if (!r.customer) continue;
      const c = counts.get(r.customer) ?? { n: 0, last: '' };
      counts.set(r.customer, { n: c.n + 1, last: later(r.testDate, c.last) });
    }
    if (this.state.connection && this.state.server !== 'revoked') {
      try {
        const res = await this.call<{ items: { name: string; results: number; lastTest: string }[] }>(
          `/results/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`,
          { method: 'GET' },
        );
        for (const c of res.items) {
          const local = counts.get(c.name);
          counts.set(c.name, {
            n: (local?.n ?? 0) + c.results,
            last: later(local?.last ?? '', c.lastTest),
          });
        }
      } catch {
        // offline: names from this PC only
      }
    }
    return [...counts.entries()]
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => b[1].last.localeCompare(a[1].last) || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }

  /** Puts a rejected file back into the queue, e.g. after the server was updated. */
  async retry(id: number): Promise<void> {
    await this.store.update(id, { upload: this.state.connection ? 'queued' : 'local', uploadError: null });
    this.set({ rows: await this.store.all() });
    void this.sync();
  }

  // ---------- updates ----------

  async checkUpdate(): Promise<UpdateInfo | null> {
    const updates = this.platform.updates;
    if (!updates) return null;
    const update = await updates.check(this.state.channel);
    this.set({ update, updateChecked: Date.now() });
    return update;
  }
}
