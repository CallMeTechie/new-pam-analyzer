import { addPluginListener, Channel as IpcChannel, invoke } from '@tauri-apps/api/core';
import { appConfigDir } from '@tauri-apps/api/path';
import { Format, scan } from '@tauri-apps/plugin-barcode-scanner';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import Database from '@tauri-apps/plugin-sql';
import type { InputFile } from '../lib/evaluate';
import { sqlStore } from '../lib/store';
import type { Platform, Posture, UpdateInfo } from './types';

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
    async scanQr() {
      try {
        const res = await scan({ windowed: false, formats: [Format.QRCode] });
        return res.content || null;
      } catch {
        return null;
      }
    },
    onPosture(listener) {
      void pam<Posture>('posture').then(listener);
      const l = addPluginListener<Posture>('pam', 'posture', listener);
      return () => void l.then((x) => x.unregister());
    },
    ...(distribution === 'play'
      ? { updatesBy: 'play' as const, updates: null }
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
