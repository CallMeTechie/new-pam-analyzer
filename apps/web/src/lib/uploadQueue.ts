import { ApiError, type UploadResponse, uploadFiles } from './api';
import { listZip, readEntry, ZipError } from './zip';

/**
 * Upload of any number of `.dat` files and ZIP archives of any size: archives are unpacked in the
 * browser (one entry at a time), the PAM files go to the server in batches below its request limit,
 * a failed batch is sent again, and the upload can be cancelled — what was stored until then stays.
 */

export interface UploadItem {
  name: string;
  size: number;
  /** `File.lastModified` of a file chosen directly. */
  lastModified?: number;
  /** Date of a ZIP entry (wall-clock time of the machines). */
  modifiedLocal?: string;
  read(): Promise<Blob>;
}

export interface SkippedItem {
  name: string;
  reason: 'unsupported_type' | 'invalid_archive' | 'file_too_large';
}

export interface UploadLimits {
  maxFileBytes: number;
  maxUploadBytes: number;
}

export interface UploadProgress {
  phase: 'prepare' | 'upload';
  doneFiles: number;
  totalFiles: number;
  doneBytes: number;
  totalBytes: number;
}

const MAX_DEPTH = 2;
/** Nested archives are unpacked in memory. */
const MAX_NESTED_BYTES = 512 * 1024 * 1024;
const BATCH_FILES = 300;
const BATCH_BYTES = 40 * 1024 * 1024;
const RETRIES = [2000, 5000, 10000];

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const isDat = (name: string) => /\.dat$/i.test(name);
const isZip = (name: string) => /\.zip$/i.test(name);

/** The PAM files of the chosen files; ZIP archives (also nested ones) are only listed here. */
export async function expandFiles(
  files: File[],
  limits: UploadLimits,
  onArchive?: (done: number, total: number) => void,
): Promise<{ items: UploadItem[]; skipped: SkippedItem[] }> {
  const items: UploadItem[] = [];
  const skipped: SkippedItem[] = [];
  const archives = files.filter((f) => isZip(f.name)).length;
  let archivesDone = 0;

  async function archive(blob: Blob, name: string, depth: number) {
    let entries: Awaited<ReturnType<typeof listZip>>;
    try {
      entries = await listZip(blob);
    } catch {
      skipped.push({ name, reason: 'invalid_archive' });
      return;
    }
    for (const entry of entries) {
      if (entry.path.endsWith('/') || entry.path.startsWith('__MACOSX/')) continue;
      const entryName = baseName(entry.path);
      if (entry.encrypted) {
        skipped.push({ name: entryName, reason: 'invalid_archive' });
      } else if (isDat(entryName)) {
        if (entry.size > limits.maxFileBytes) skipped.push({ name: entryName, reason: 'file_too_large' });
        else
          items.push({
            name: entryName,
            size: entry.size,
            ...(entry.modified ? { modifiedLocal: entry.modified } : {}),
            read: async () => new Blob([(await readEntry(blob, entry)) as Uint8Array<ArrayBuffer>]),
          });
      } else if (isZip(entryName) && depth < MAX_DEPTH) {
        if (entry.size > MAX_NESTED_BYTES) {
          skipped.push({ name: entryName, reason: 'file_too_large' });
          continue;
        }
        try {
          const inner = new Blob([(await readEntry(blob, entry)) as Uint8Array<ArrayBuffer>]);
          await archive(inner, entryName, depth + 1);
        } catch (err) {
          if (!(err instanceof ZipError) && !(err instanceof Error)) throw err;
          skipped.push({ name: entryName, reason: 'invalid_archive' });
        }
      } else {
        skipped.push({ name: entryName, reason: 'unsupported_type' });
      }
    }
  }

  for (const file of files) {
    if (isDat(file.name)) {
      if (file.size > limits.maxFileBytes) skipped.push({ name: file.name, reason: 'file_too_large' });
      else items.push({ name: file.name, size: file.size, lastModified: file.lastModified, read: async () => file });
    } else if (isZip(file.name)) {
      await archive(file, file.name, 0);
      onArchive?.(++archivesDone, archives);
    }
  }
  return { items, skipped };
}

export function batchItems(items: UploadItem[], maxBytes: number): UploadItem[][] {
  const out: UploadItem[][] = [];
  let current: UploadItem[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length && (size + item.size > maxBytes || current.length >= BATCH_FILES)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.size;
  }
  if (current.length) out.push(current);
  return out;
}

const retryable = (err: unknown) =>
  err instanceof ApiError && err.code !== 'aborted' && (err.status === 0 || err.status >= 502);

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError(0, 'aborted', 'Cancelled.'));
    });
  });
}

export function emptyResponse(): UploadResponse {
  return { summary: { created: 0, duplicate: 0, rejected: 0, skipped: 0 }, results: [], skipped: [] };
}

/**
 * Sends the items in batches. `merged` collects the outcome as it goes, so a cancelled or failed
 * upload still shows what was stored.
 */
export async function uploadItems(
  items: UploadItem[],
  options: {
    limits: UploadLimits;
    companyId: number | null;
    signal: AbortSignal;
    merged: UploadResponse;
    onProgress(p: UploadProgress): void;
  },
): Promise<void> {
  const { merged, signal } = options;
  const maxBytes = Math.max(1024 * 1024, Math.min(BATCH_BYTES, options.limits.maxUploadBytes * 0.8));
  const totalBytes = items.reduce((s, i) => s + i.size, 0) || 1;
  let doneBytes = 0;
  let doneFiles = 0;
  const report = (fraction = 0, size = 0) =>
    options.onProgress({
      phase: 'upload',
      doneFiles,
      totalFiles: items.length,
      doneBytes: doneBytes + fraction * size,
      totalBytes,
    });
  report();
  for (const batch of batchItems(items, maxBytes)) {
    if (signal.aborted) throw new ApiError(0, 'aborted', 'Cancelled.');
    const blobs = await Promise.all(batch.map((i) => i.read()));
    const form = new FormData();
    batch.forEach((item, i) => {
      form.append('files', blobs[i] as Blob, item.name);
      form.append('lastModified', item.lastModified ? String(item.lastModified) : '');
      form.append('modifiedLocal', item.modifiedLocal ?? '');
    });
    if (options.companyId) form.append('companyId', String(options.companyId));
    const size = batch.reduce((s, i) => s + i.size, 0);
    let res: UploadResponse | null = null;
    for (let attempt = 0; !res; attempt++) {
      try {
        res = await uploadFiles(form, (p) => report(p, size), signal);
      } catch (err) {
        const delay = RETRIES[attempt];
        if (!retryable(err) || delay === undefined) throw err;
        report();
        await wait(delay, signal);
      }
    }
    doneBytes += size;
    doneFiles += batch.length;
    for (const k of Object.keys(merged.summary) as (keyof UploadResponse['summary'])[])
      merged.summary[k] += res.summary[k];
    merged.results.push(...res.results);
    merged.skipped.push(...res.skipped);
    report();
  }
}
