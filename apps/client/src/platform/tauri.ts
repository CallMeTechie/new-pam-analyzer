import { Channel as IpcChannel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appConfigDir } from '@tauri-apps/api/path';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import Database from '@tauri-apps/plugin-sql';
import type { InputFile } from '../lib/evaluate';
import { sqlStore } from '../lib/store';
import type { CrashReport, Platform, UpdateInfo } from './types';

interface FileMeta {
  name: string;
  modified: number | null;
}

async function readPaths(paths: string[]): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const path of paths) {
    try {
      const meta = await invoke<FileMeta>('file_meta', { path });
      const buffer = await invoke<ArrayBuffer>('read_file', { path });
      out.push({ name: meta.name, path, bytes: new Uint8Array(buffer), lastModified: meta.modified });
    } catch {
      // folders and unreadable files are left out
    }
  }
  return out;
}

/** The Windows app: SQLite in the user profile, native dialogs, Credential Manager, updater. */
export async function tauriPlatform(version: string): Promise<Platform> {
  const db = await Database.load('sqlite:pam.db');
  return {
    kind: 'tauri',
    formFactor: 'desktop',
    os: 'windows',
    version,
    store: await sqlStore(db),
    async pickFiles() {
      const picked = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'PAM', extensions: ['dat', 'zip'] }],
      });
      if (!picked) return [];
      return readPaths(Array.isArray(picked) ? picked : [picked]);
    },
    onFiles(onDrop, onDrag) {
      const stops: Promise<() => void>[] = [];
      stops.push(
        getCurrentWebview().onDragDropEvent(async (event) => {
          const p = event.payload;
          if (p.type === 'enter' || p.type === 'over') onDrag(true);
          else if (p.type === 'leave') onDrag(false);
          else if (p.type === 'drop') {
            onDrag(false);
            const files = await readPaths(p.paths);
            if (files.length) onDrop(files);
          }
        }),
      );
      // Double-click on a .dat file while the app is running.
      stops.push(
        listen<string[]>('open-files', async (event) => {
          const files = await readPaths(event.payload);
          if (files.length) onDrop(files);
        }),
      );
      // Files the app was started with.
      void invoke<string[]>('take_start_files').then(async (paths) => {
        const files = await readPaths(paths);
        if (files.length) onDrop(files);
      });
      return () => {
        for (const s of stops) void s.then((stop) => stop());
      };
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
      get: () => invoke<string | null>('secret_get'),
      set: (value) => invoke('secret_set', { value }),
      clear: () => invoke('secret_clear'),
    },
    async reveal(path) {
      if (!(await invoke<boolean>('path_exists', { path }))) return false;
      await revealItemInDir(path);
      return true;
    },
    dataLocation: () => appConfigDir(),
    async openDataLocation() {
      await openPath(await appConfigDir());
    },
    defaultDeviceName: () => invoke<string>('device_name'),
    crashReports: () => invoke<CrashReport[]>('crash_reports'),
    deleteCrashReports: (ids) => invoke('crash_reports_delete', { ids }),
    setWindowTheme: (theme) => getCurrentWindow().setTheme(theme),
    openUrl: (url) => openUrl(url),
    updates: {
      check: (channel) => invoke<UpdateInfo | null>('update_check', { channel }),
      async install(onProgress) {
        const progress = new IpcChannel<{ downloaded: number; total: number | null }>();
        progress.onmessage = (m) => onProgress(m.total ? m.downloaded / m.total : null);
        await invoke('update_install', { progress });
      },
    },
  };
}
