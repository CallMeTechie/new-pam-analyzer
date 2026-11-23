import { inflateSync } from 'fflate';

/**
 * Reads ZIP archives of any size in the browser: only the central directory and one entry at a
 * time are loaded (`Blob.slice`), so archives of several gigabytes do not have to fit in memory.
 * Supports ZIP64, "stored" and "deflate" — what Windows, macOS and the machines write.
 */

export interface ZipEntry {
  /** Path inside the archive. */
  path: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
  encrypted: boolean;
  /** Modification time as written in the archive (local wall-clock time, `YYYY-MM-DD HH:mm:ss`). */
  modified: string | null;
}

export class ZipError extends Error {}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const pad = (n: number) => String(n).padStart(2, '0');

async function slice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  if (start < 0 || end > blob.size || start > end) throw new ZipError('Offset outside the archive.');
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function dosTime(date: number, time: number): string | null {
  const y = 1980 + (date >> 9);
  const mo = (date >> 5) & 0x0f;
  const d = date & 0x1f;
  const h = time >> 11;
  const mi = (time >> 5) & 0x3f;
  const s = (time & 0x1f) * 2;
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/** Entries of an archive, from its central directory. */
export async function listZip(blob: Blob): Promise<ZipEntry[]> {
  if (blob.size < 22) throw new ZipError('Not a ZIP archive.');
  const tailStart = Math.max(0, blob.size - 22 - 65535);
  const tail = await slice(blob, tailStart, blob.size);
  const tv = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a ZIP archive.');
  let count = tv.getUint16(eocd + 10, true);
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tv.getUint32(locator, true) !== 0x07064b50) throw new ZipError('ZIP64 locator missing.');
    const at = Number(tv.getBigUint64(locator + 8, true));
    const z = view(await slice(blob, at, at + 56));
    if (z.getUint32(0, true) !== 0x06064b50) throw new ZipError('ZIP64 directory missing.');
    count = Number(z.getBigUint64(32, true));
    cdSize = Number(z.getBigUint64(40, true));
    cdOffset = Number(z.getBigUint64(48, true));
  }
  const cd = await slice(blob, cdOffset, cdOffset + cdSize);
  const v = view(cd);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipError('Damaged directory.');
    const flags = v.getUint16(p + 8, true);
    const nameLength = v.getUint16(p + 28, true);
    const extraLength = v.getUint16(p + 30, true);
    const commentLength = v.getUint16(p + 32, true);
    let compressedSize = v.getUint32(p + 20, true);
    let size = v.getUint32(p + 24, true);
    let offset = v.getUint32(p + 42, true);
    // ZIP64: the 64-bit values follow in the extra field, in this order, for each value that is 0xFFFFFFFF.
    let e = p + 46 + nameLength;
    const extraEnd = e + extraLength;
    while (e + 4 <= extraEnd) {
      const id = v.getUint16(e, true);
      const len = v.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        const next = () => {
          const value = Number(v.getBigUint64(q, true));
          q += 8;
          return value;
        };
        if (size === 0xffffffff) size = next();
        if (compressedSize === 0xffffffff) compressedSize = next();
        if (offset === 0xffffffff) offset = next();
      }
      e += 4 + len;
    }
    entries.push({
      path: (flags & 0x800 ? utf8 : latin1).decode(cd.subarray(p + 46, p + 46 + nameLength)),
      method: v.getUint16(p + 10, true),
      compressedSize,
      size,
      offset,
      encrypted: (flags & 1) === 1,
      modified: dosTime(v.getUint16(p + 14, true), v.getUint16(p + 12, true)),
    });
    p = extraEnd + commentLength;
  }
  return entries;
}

/** Content of one entry. */
export async function readEntry(blob: Blob, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.encrypted) throw new ZipError('Encrypted entry.');
  const header = view(await slice(blob, entry.offset, entry.offset + 30));
  if (header.getUint32(0, true) !== 0x04034b50) throw new ZipError('Damaged entry.');
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const data = await slice(blob, start, start + entry.compressedSize);
  if (entry.method === 0 || entry.size === 0) return entry.method === 0 ? data : new Uint8Array(0);
  if (entry.method === 8) return inflateSync(data, { out: new Uint8Array(entry.size) });
  throw new ZipError('Unsupported compression.');
}
