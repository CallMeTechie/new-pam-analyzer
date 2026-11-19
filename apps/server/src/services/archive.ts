import { unzipSync } from 'fflate';

export interface UploadFile {
  name: string;
  bytes: Uint8Array;
  /** Modification date of the original file (browser `File.lastModified`, ZIP entry date, app). */
  lastModified?: Date;
}

export interface SkippedFile {
  name: string;
  reason: 'unsupported_type' | 'invalid_archive' | 'file_too_large' | 'too_many_files';
}

const MAX_DEPTH = 2;
export const MAX_FILES = 5000;

/** Converts a wall-clock time in a time zone into an absolute instant. */
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(asUtc - (shown - asUtc));
}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

/**
 * Modification dates of the entries of a ZIP archive, read from its central directory.
 * ZIP stores local wall-clock time without a zone; the machines' time zone is applied.
 * Archives that cannot be read this way (e.g. ZIP64) simply yield no dates.
 */
export function zipEntryDates(bytes: Uint8Array, timeZone: string): Map<string, Date> {
  const dates = new Map<string, Date>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return dates;
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries && offset + 46 <= bytes.length; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const flags = view.getUint16(offset + 8, true);
    const time = view.getUint16(offset + 12, true);
    const date = view.getUint16(offset + 14, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    // Same decoding as fflate, so the names match its entry keys.
    const name = (flags & 0x800 ? utf8 : latin1).decode(nameBytes);
    const y = 1980 + (date >> 9);
    const mo = (date >> 5) & 0x0f;
    const d = date & 0x1f;
    const h = time >> 11;
    const mi = (time >> 5) & 0x3f;
    const s = (time & 0x1f) * 2;
    if (mo >= 1 && mo <= 12 && d >= 1 && h <= 23 && mi <= 59 && s <= 59) {
      dates.set(name, zonedTime(y, mo, d, h, mi, s, timeZone));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return dates;
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export interface ExpandOptions {
  maxFileBytes: number;
  timeZone: string;
}

/** Expands ZIP archives (also nested ones) into the `.dat` files they contain. */
export function expandUpload(
  file: UploadFile,
  options: ExpandOptions,
  depth = 0,
): { files: UploadFile[]; skipped: SkippedFile[] } {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.dat')) {
    return file.bytes.length > options.maxFileBytes
      ? { files: [], skipped: [{ name: file.name, reason: 'file_too_large' }] }
      : { files: [file], skipped: [] };
  }
  if (!lower.endsWith('.zip') || depth > MAX_DEPTH) {
    return { files: [], skipped: [{ name: file.name, reason: 'unsupported_type' }] };
  }

  const skipped: SkippedFile[] = [];
  let accepted = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(file.bytes, {
      filter: (entry) => {
        if (entry.name.endsWith('/') || entry.name.startsWith('__MACOSX/')) return false;
        const name = entry.name.toLowerCase();
        if (!name.endsWith('.dat') && !name.endsWith('.zip')) {
          skipped.push({ name: baseName(entry.name), reason: 'unsupported_type' });
          return false;
        }
        if (entry.originalSize > options.maxFileBytes * (name.endsWith('.zip') ? 20 : 1)) {
          skipped.push({ name: baseName(entry.name), reason: 'file_too_large' });
          return false;
        }
        if (++accepted > MAX_FILES) {
          if (accepted === MAX_FILES + 1) skipped.push({ name: file.name, reason: 'too_many_files' });
          return false;
        }
        return true;
      },
    });
  } catch {
    return { files: [], skipped: [{ name: file.name, reason: 'invalid_archive' }] };
  }

  const dates = zipEntryDates(file.bytes, options.timeZone);
  const files: UploadFile[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    const lastModified = dates.get(path);
    const inner = expandUpload(
      { name: baseName(path), bytes, ...(lastModified ? { lastModified } : {}) },
      options,
      depth + 1,
    );
    files.push(...inner.files);
    skipped.push(...inner.skipped);
  }
  return { files: files.slice(0, MAX_FILES), skipped };
}
