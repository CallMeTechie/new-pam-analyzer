import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { batchItems, expandFiles, type UploadItem } from '../src/lib/uploadQueue';
import { listZip, readEntry } from '../src/lib/zip';

const enc = new TextEncoder();
const limits = { maxFileBytes: 1024, maxUploadBytes: 200 * 1024 * 1024 };
const file = (name: string, bytes: Uint8Array, lastModified = 0) =>
  new File([bytes as Uint8Array<ArrayBuffer>], name, { lastModified });

/** ZIP64 end records (as written by Windows for very large archives) in front of the normal end record. */
function withZip64(zip: Uint8Array): Uint8Array {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  const count = v.getUint16(eocd + 10, true);
  const cdSize = v.getUint32(eocd + 12, true);
  const cdOffset = v.getUint32(eocd + 16, true);
  const z64 = new Uint8Array(56 + 20);
  const zv = new DataView(z64.buffer);
  zv.setUint32(0, 0x06064b50, true);
  zv.setBigUint64(4, 44n, true);
  zv.setBigUint64(24, BigInt(count), true);
  zv.setBigUint64(32, BigInt(count), true);
  zv.setBigUint64(40, BigInt(cdSize), true);
  zv.setBigUint64(48, BigInt(cdOffset), true);
  zv.setUint32(56, 0x07064b50, true);
  zv.setBigUint64(64, BigInt(eocd), true);
  zv.setUint32(72, 1, true);
  const end = zip.slice(eocd);
  const ev = new DataView(end.buffer);
  ev.setUint16(8, 0xffff, true);
  ev.setUint16(10, 0xffff, true);
  ev.setUint32(12, 0xffffffff, true);
  ev.setUint32(16, 0xffffffff, true);
  const out = new Uint8Array(eocd + z64.length + end.length);
  out.set(zip.subarray(0, eocd));
  out.set(z64, eocd);
  out.set(end, eocd + z64.length);
  return out;
}

describe('ZIP im Browser', () => {
  it('liest Einträge, Datum und Inhalt (gepackt und ungepackt)', async () => {
    const zip = zipSync({
      'M1/a.dat': [enc.encode('A'.repeat(500)), { mtime: new Date(2026, 6, 14, 13, 26, 0) }],
      'b.dat': [enc.encode('bee'), { level: 0 }],
    });
    const entries = await listZip(new Blob([zip as Uint8Array<ArrayBuffer>]));
    expect(entries.map((e) => [e.path, e.size, e.modified?.slice(0, 16)])).toEqual([
      ['M1/a.dat', 500, '2026-07-14 13:26'],
      ['b.dat', 3, expect.any(String)],
    ]);
    const blob = new Blob([zip as Uint8Array<ArrayBuffer>]);
    expect(new TextDecoder().decode(await readEntry(blob, entries[0]!))).toBe('A'.repeat(500));
    expect(new TextDecoder().decode(await readEntry(blob, entries[1]!))).toBe('bee');
  });

  it('versteht ZIP64-Archive', async () => {
    const zip = withZip64(zipSync({ 'x.dat': enc.encode('xyz') }));
    const blob = new Blob([zip as Uint8Array<ArrayBuffer>]);
    const [entry] = await listZip(blob);
    expect(entry?.path).toBe('x.dat');
    expect(new TextDecoder().decode(await readEntry(blob, entry!))).toBe('xyz');
  });

  it('entpackt verschachtelte Archive und überspringt fremde, zu große und kaputte Dateien', async () => {
    const inner = zipSync({ 'inner.dat': [enc.encode('in'), { mtime: new Date(2026, 6, 15, 8, 5, 10) }] });
    const outer = zipSync({
      'M3/one.dat': enc.encode('one'),
      'inner.zip': inner,
      'readme.txt': enc.encode('x'),
      'big.dat': new Uint8Array(2000),
      '__MACOSX/._one.dat': enc.encode('mac'),
    });
    const { items, skipped } = await expandFiles(
      [
        file('archive.zip', outer),
        file('plain.dat', enc.encode('p'), 1_700_000_000_000),
        file('broken.zip', enc.encode('no zip')),
      ],
      limits,
    );
    expect(items.map((i) => i.name).sort()).toEqual(['inner.dat', 'one.dat', 'plain.dat']);
    expect(items.find((i) => i.name === 'inner.dat')?.modifiedLocal).toBe('2026-07-15 08:05:10');
    expect(items.find((i) => i.name === 'plain.dat')?.lastModified).toBe(1_700_000_000_000);
    expect(await (await items.find((i) => i.name === 'inner.dat')!.read()).text()).toBe('in');
    expect(skipped).toEqual(
      expect.arrayContaining([
        { name: 'readme.txt', reason: 'unsupported_type' },
        { name: 'big.dat', reason: 'file_too_large' },
        { name: 'broken.zip', reason: 'invalid_archive' },
      ]),
    );
    expect(skipped).toHaveLength(3);
  });

  it('teilt viele Dateien in Pakete nach Größe und Anzahl', () => {
    const item = (size: number): UploadItem => ({ name: 'x.dat', size, read: async () => new Blob() });
    expect(batchItems([item(60), item(60), item(60)], 100).map((b) => b.length)).toEqual([1, 1, 1]);
    expect(
      batchItems(
        Array.from({ length: 1000 }, () => item(1)),
        1e9,
      ).map((b) => b.length),
    ).toEqual([300, 300, 300, 100]);
  });
});
