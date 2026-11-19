import type { InputFile } from '../lib/evaluate';
import type { Store } from '../lib/store';
import type { Channel } from '../lib/types';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}
export interface HttpResponse {
  status: number;
  text: string;
}

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string | null;
}

/**
 * Everything that differs between the Windows app (Tauri) and the browser preview used for
 * development and tests. The rest of the app is plain TypeScript and React.
 */
export interface Platform {
  kind: 'tauri' | 'browser';
  /** Platform name sent to the server when connecting. */
  os: 'windows' | 'android' | 'ios' | 'macos' | 'linux' | 'other';
  version: string;
  store: Store;
  /** File dialog for `.dat` and `.zip` files. */
  pickFiles(): Promise<InputFile[]>;
  /**
   * Files dropped on the window or passed by a double-click in Explorer (also while the app is
   * already running). `onDrag` reports whether files are being dragged over the window.
   */
  onFiles(onDrop: (files: InputFile[]) => void, onDrag: (over: boolean) => void): () => void;
  /** HTTP without browser CORS rules; `status` 0 means the server could not be reached. */
  request(url: string, init: HttpRequest): Promise<HttpResponse>;
  /** Device token, kept in the Windows Credential Manager. */
  secret: { get(): Promise<string | null>; set(value: string): Promise<void>; clear(): Promise<void> };
  /** Shows the file in Explorer; `false` if it does not exist any more. */
  reveal(path: string): Promise<boolean>;
  /** Folder that holds the local data. */
  dataLocation(): Promise<string>;
  openDataLocation(): Promise<void>;
  defaultDeviceName(): Promise<string>;
  /** `null` where the app cannot update itself (browser preview). */
  updates: {
    check(channel: Channel): Promise<UpdateInfo | null>;
    /** Downloads and installs the update found by `check`, then restarts the app. */
    install(onProgress: (fraction: number | null) => void): Promise<void>;
  } | null;
}
