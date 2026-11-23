import { useSyncExternalStore } from 'react';
import { ApiError, api, notifyDataChanged, type UploadResponse } from './api';
import { emptyResponse, expandFiles, type UploadLimits, type UploadProgress, uploadItems } from './uploadQueue';

/**
 * The upload runs in the background, independent of the page: one can keep working while it runs;
 * the layout shows its progress as a toast with a bar at the bottom edge.
 */

export type UploadStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export interface UploadState {
  status: UploadStatus;
  progress: UploadProgress | null;
  /** Archives read so far while preparing. */
  archives: { done: number; total: number } | null;
  response: UploadResponse | null;
  error: ApiError | null;
}

const idle: UploadState = { status: 'idle', progress: null, archives: null, response: null, error: null };
let state: UploadState = idle;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<UploadState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useBackgroundUpload(): UploadState {
  return useSyncExternalStore(subscribe, () => state);
}

const DEFAULT_LIMITS: UploadLimits = { maxFileBytes: 10 * 1024 * 1024, maxUploadBytes: 200 * 1024 * 1024 };

async function limits(): Promise<UploadLimits> {
  try {
    const v = await api.get<{ upload?: UploadLimits }>('/version');
    return v.upload ?? DEFAULT_LIMITS;
  } catch {
    return DEFAULT_LIMITS;
  }
}

function warnOnLeave(e: BeforeUnloadEvent) {
  e.preventDefault();
}

export function isUploading(): boolean {
  return state.status === 'running';
}

/** Starts an upload; returns at once. */
export function startUpload(files: File[], companyId: number | null): void {
  if (state.status === 'running') return;
  const own = new AbortController();
  controller = own;
  const merged = emptyResponse();
  set({ ...idle, status: 'running' });
  window.addEventListener('beforeunload', warnOnLeave);
  void (async () => {
    try {
      const max = await limits();
      const { items, skipped } = await expandFiles(files, max, (done, total) => set({ archives: { done, total } }));
      merged.skipped.push(...skipped);
      merged.summary.skipped += skipped.length;
      await uploadItems(items, {
        limits: max,
        companyId,
        signal: own.signal,
        merged,
        onProgress: (progress) => set({ progress }),
      });
      set({ status: 'done', response: merged });
    } catch (err) {
      const error = err instanceof ApiError ? err : new ApiError(0, 'internal_error', String(err));
      set({ status: error.code === 'aborted' ? 'cancelled' : 'failed', error, response: merged });
    } finally {
      window.removeEventListener('beforeunload', warnOnLeave);
      if (controller === own) controller = null;
      // Dashboard and lists show the new results right away.
      if (merged.results.length) notifyDataChanged();
    }
  })();
}

export function cancelUpload(): void {
  controller?.abort();
}

/** Closes the toast of a finished upload. */
export function dismissUpload(): void {
  if (state.status !== 'running') set(idle);
}
