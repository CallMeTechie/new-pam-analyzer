/**
 * Logs & Monitoring in the app: a short protocol of what the app did (history, the last 200 lines,
 * kept across restarts) and the reports waiting for the server. Errors and warnings become reports
 * (with the history before them) unless sending is switched off; "Report a problem" always does.
 * Reports wait while the app is offline and go out with the next connection. Never contains PAM
 * files, passwords or tokens.
 */

export type DiagLevel = 'error' | 'warning' | 'info' | 'report';

export interface DiagEntry {
  id: string;
  level: Exclude<DiagLevel, 'info'>;
  category: string;
  message: string;
  details?: string;
  history?: string;
  context?: Record<string, unknown>;
  occurredAt: number;
  appVersion?: string;
  system?: string;
}

interface DiagState {
  autoSend: boolean;
  pending: number;
  /** Bumped on every change; for React. */
  version: number;
}

const HISTORY_LINES = 200;
const MAX_PENDING = 200;
/** The same message again within this time only goes into the history. */
const REPEAT_MS = 60_000;
const KEYS = { history: 'pam.diag.history', pending: 'pam.diag.pending', autoSend: 'pam.diag.autoSend' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the protocol is a help, not a must.
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Model and system, as far as the WebView tells (e.g. "Android 16 · SM-X210", "Windows NT 10.0"). */
export function systemInfo(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const android = /Android ([\d.]+);\s*([^;)]+)/.exec(ua);
  if (android) return `Android ${android[1]} · ${(android[2] ?? '').replace(/ Build\/.*/, '').trim()}`;
  const windows = /Windows NT ([\d.]+)/.exec(ua);
  if (windows) return `Windows NT ${windows[1]}`;
  return ua.slice(0, 120);
}

function errorText(error: unknown): { message: string; details?: string } {
  if (error instanceof Error)
    return { message: error.message || error.name, ...(error.stack ? { details: error.stack } : {}) };
  if (error && typeof error === 'object' && 'message' in error)
    return { message: String((error as { message: unknown }).message) };
  return { message: String(error) };
}

export class Diag {
  private history: string[] = load<string[]>(KEYS.history, []);
  private pending: DiagEntry[] = load<DiagEntry[]>(KEYS.pending, []);
  private autoSend = load<boolean>(KEYS.autoSend, true);
  private recent = new Map<string, number>();
  private listeners = new Set<() => void>();
  private state: DiagState = { autoSend: this.autoSend, pending: this.pending.length, version: 0 };
  /** Set by the engine: sends the reports soon when connected. */
  onQueued: (() => void) | null = null;
  appVersion = '';

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.state;

  private changed() {
    this.state = { autoSend: this.autoSend, pending: this.pending.length, version: this.state.version + 1 };
    for (const l of this.listeners) l();
  }

  private line(level: DiagLevel, category: string, message: string) {
    const tag = { error: 'ERROR', warning: 'WARN ', info: 'INFO ', report: 'USER ' }[level];
    this.history.push(`${stamp()} ${tag} ${category}: ${message.replace(/\s+/g, ' ').slice(0, 500)}`);
    if (this.history.length > HISTORY_LINES) this.history.splice(0, this.history.length - HISTORY_LINES);
    save(KEYS.history, this.history);
  }

  private queue(entry: Omit<DiagEntry, 'id' | 'occurredAt' | 'appVersion' | 'system' | 'history'>, history = true) {
    const key = `${entry.level}|${entry.category}|${entry.message}`;
    const now = Date.now();
    if (entry.level !== 'report' && now - (this.recent.get(key) ?? 0) < REPEAT_MS) return;
    this.recent.set(key, now);
    this.pending.push({
      ...entry,
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      occurredAt: now,
      ...(this.appVersion ? { appVersion: this.appVersion } : {}),
      system: systemInfo(),
      ...(history ? { history: this.history.join('\n') } : {}),
    });
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    save(KEYS.pending, this.pending);
    this.changed();
    this.onQueued?.();
  }

  info(category: string, message: string) {
    this.line('info', category, message);
  }

  warn(category: string, message: string, context?: Record<string, unknown>) {
    this.line('warning', category, message);
    if (this.autoSend) this.queue({ level: 'warning', category, message, ...(context ? { context } : {}) });
  }

  error(category: string, error: unknown, context?: Record<string, unknown>) {
    const { message, details } = errorText(error);
    this.line('error', category, message);
    if (this.autoSend)
      this.queue({
        level: 'error',
        category,
        message,
        ...(details ? { details } : {}),
        ...(context ? { context } : {}),
      });
  }

  /** "Report a problem": the user's description, with the history and device facts when wanted. */
  report(text: string, options: { history: boolean; device: boolean; context?: Record<string, unknown> }) {
    this.line('report', 'user', text);
    this.queue(
      {
        level: 'report',
        category: 'user',
        message: text.trim().slice(0, 1000) || '–',
        ...(options.device && options.context ? { context: options.context } : {}),
      },
      options.history,
    );
  }

  setAutoSend(on: boolean) {
    this.autoSend = on;
    save(KEYS.autoSend, on);
    this.line('info', 'diagnostics', on ? 'Sending error reports switched on' : 'Sending error reports switched off');
    this.changed();
  }

  historyText(): string {
    return this.history.join('\n');
  }

  /** Reports to send, oldest first. */
  take(max: number): DiagEntry[] {
    return this.pending.slice(0, max);
  }

  /** The server accepted these. */
  ack(ids: string[]) {
    const done = new Set(ids);
    this.pending = this.pending.filter((e) => !done.has(e.id));
    save(KEYS.pending, this.pending);
    this.changed();
  }
}

export const diag = new Diag();

/** Errors nothing else caught in the app's pages. */
export function captureGlobalErrors(target: Window = window) {
  target.addEventListener('error', (e) =>
    diag.error('js', e.error ?? e.message, { source: e.filename, line: e.lineno }),
  );
  target.addEventListener('unhandledrejection', (e) => diag.error('js', e.reason));
}
