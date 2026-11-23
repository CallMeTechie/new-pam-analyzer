import { addPluginListener, Channel as IpcChannel, invoke } from '@tauri-apps/api/core';
import { appConfigDir } from '@tauri-apps/api/path';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import Database from '@tauri-apps/plugin-sql';
import type { InputFile } from '../lib/evaluate';
import { sqlStore } from '../lib/store';
import type { CrashReport, Platform, Posture, UpdateInfo } from './types';

/** A file the Android plugin copied into the app's cache. */
interface SharedFile {
  path: string;
  name: string;
  modified?: number;
}

async function readShared(files: SharedFile[]): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const f of files) {
    try {
      const buffer = await invoke<ArrayBuffer>('read_file', { path: f.path });
      out.push({ name: f.name, path: null, bytes: new Uint8Array(buffer), lastModified: f.modified ?? null });
    } catch {
      // unreadable files are left out
    }
  }
  return out;
}

/** Inverse of `version-code` in `.github/scripts/app-release.mjs`: 400002 -> 0.4.0-beta.2, 400099 -> 0.4.0. */
export function versionFromCode(code: number): string {
  const build = code % 1000;
  const patch = Math.floor(code / 1000) % 100;
  const minor = Math.floor(code / 100_000) % 100;
  const major = Math.floor(code / 10_000_000);
  return `${major}.${minor}.${patch}${build === 99 ? '' : `-beta.${build}`}`;
}

/** Text of a rejected plugin call: Kotlin's `invoke.reject(message, code)` arrives as `{ message, code }`. */
export function pluginError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const { message, code } = e as { message?: unknown; code?: unknown };
    if (typeof message === 'string' || typeof code === 'string') {
      return [code, message].filter((x) => typeof x === 'string' && x).join(': ');
    }
    try {
      return JSON.stringify(e);
    } catch {
      // fall through
    }
  }
  return String(e);
}

const pam = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(`plugin:pam|${command}`, args);

interface AndroidUpdate extends UpdateInfo {
  asset: { url: string; signature: string };
}

/**
 * Android: SQLite in the app's storage, files from the picker, "Share" and "Open with" through
 * the app's plugin (PamPlugin.kt), token in the Keystore, Android print dialog, fold posture,
 * signed APK updates (the version from Google Play is updated by Play).
 */
export async function androidPlatform(version: string): Promise<Platform> {
  const db = await Database.load('sqlite:pam.db');
  const distribution = await pam<{ value: 'play' | 'apk' }>('distribution')
    .then((r) => r.value)
    .catch(() => 'apk' as const);
  let found: AndroidUpdate | null = null;

  return {
    kind: 'tauri',
    formFactor: 'mobile',
    os: 'android',
    version,
    store: await sqlStore(db),
    async pickFiles() {
      const res = await pam<{ files: SharedFile[] }>('pickFiles');
      return readShared(res.files);
    },
    onFiles(onDrop) {
      const listener = addPluginListener<{ files: SharedFile[] }>('pam', 'open-files', async (event) => {
        const files = await readShared(event.files);
        if (files.length) onDrop(files);
      });
      // Files the app was started with ("Share" or "Open with" while it was closed).
      void pam<{ files: SharedFile[] }>('takeOpenFiles').then(async (res) => {
        const files = await readShared(res.files);
        if (files.length) onDrop(files);
      });
      return () => void listener.then((l) => l.unregister());
    },
    async request(url, init) {
      try {
        const res = await tauriFetch(url, {
          method: init.method,
          headers: init.headers ?? {},
          ...(init.body === undefined ? {} : { body: init.body as BodyInit }),
          connectTimeout: 15_000,
        });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: 0, text: String(e) };
      }
    },
    secret: {
      get: () => pam<{ value: string | null }>('secretGet').then((r) => r.value ?? null),
      set: (value) => pam('secretSet', { value }),
      clear: () => pam('secretClear'),
    },
    reveal: async () => false,
    dataLocation: () => appConfigDir(),
    openDataLocation: async () => {},
    defaultDeviceName: () => pam<{ name: string }>('deviceName').then((r) => r.name),
    print: () => pam('printPage'),
    openUrl: (url) => openUrl(url),
    // Scanner of Google Play services (PamPlugin.scanQr): own camera screen, no camera permission.
    async scanQr() {
      try {
        const res = await pam<{ content: string | null }>('scanQr');
        return res.content || null;
      } catch (e) {
        throw new Error(pluginError(e));
      }
    },
    // Java/Kotlin crashes (CrashLog.kt) and Rust panics (crash.rs) are stored apart.
    async crashReports() {
      const [native, panics] = await Promise.all([
        pam<{ reports: CrashReport[] }>('crashReports').then(
          (r) => r.reports,
          () => [],
        ),
        invoke<CrashReport[]>('crash_reports').catch(() => []),
      ]);
      return [...native, ...panics].sort((a, b) => a.occurredAt - b.occurredAt);
    },
    async deleteCrashReports(ids) {
      await Promise.all([pam('crashReportsDelete', { ids }), invoke('crash_reports_delete', { ids })]);
    },
    onPosture(listener) {
      void pam<Posture>('posture').then(listener);
      const l = addPluginListener<Posture>('pam', 'posture', listener);
      return () => void l.then((x) => x.unregister());
    },
    ...(distribution === 'play'
      ? {
          // Google Play installs the update; the version is the one of the Play track the user takes part in.
          updatesBy: 'play' as const,
          updates: {
            async check() {
              const res = await pam<{ available: boolean; versionCode: number }>('playUpdateCheck');
              return res.available ? { version: versionFromCode(res.versionCode), notes: '', date: null } : null;
            },
            async install() {
              await pam('playUpdateStart');
            },
          },
        }
      : {
          updates: {
            async check(channel) {
              found = await invoke<AndroidUpdate | null>('update_check', { channel });
              return found;
            },
            async install(onProgress) {
              if (!found) throw new Error('no update');
              const progress = new IpcChannel<{ downloaded: number; total: number | null }>();
              progress.onmessage = (m) => onProgress(m.total ? m.downloaded / m.total : null);
              const path = await invoke<string>('update_download', { asset: found.asset, progress });
              // Android shows its installer; the first time it asks to allow installing apps.
              const res = await pam<{ needsPermission: boolean }>('installApk', { path });
              if (res.needsPermission) throw new Error('install_permission');
            },
          },
        }),
  };
}
