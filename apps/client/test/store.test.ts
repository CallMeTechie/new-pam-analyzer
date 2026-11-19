import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { memoryStore, type SqlDatabase, type Store, sqlStore } from '../src/lib/store';
import type { LocalResult } from '../src/lib/types';

/** `@tauri-apps/plugin-sql` on top of node:sqlite: `$1` placeholders, `lastInsertId`. */
function nodeSql(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  const sql = (q: string) => q.replace(/\$(\d+)/g, '?$1');
  return {
    async execute(q, values = []) {
      const r = db.prepare(sql(q)).run(...(values as never[]));
      return { lastInsertId: Number(r.lastInsertRowid), rowsAffected: Number(r.changes) };
    },
    async select<T>(q: string, values: unknown[] = []) {
      return db.prepare(sql(q)).all(...(values as never[])) as T;
    },
  };
}

const row = (sha256: string): Omit<LocalResult, 'id'> => ({
  sha256,
  fileName: 'a.dat',
  filePath: null,
  fileSize: 3,
  fileModifiedAt: null,
  importedAt: 1,
  machineNo: 'M6IIIXNo1',
  machineFamily: 'nxt',
  headType: 'H24',
  headSerial: '1',
  toolType: null,
  toolSerial: null,
  h08mVariant: null,
  testDate: '2026-01-01 10:00:00',
  dateSource: 'header',
  cpkX: 1,
  cpkY: 2,
  cpkXY: 1,
  rating: 'warning',
  measured: 10,
  expected: 10,
  failed: 0,
  componentStatus: 'complete',
  warnings: 0,
  upload: 'local',
  uploadError: null,
  uploadedAt: null,
  serverResultId: null,
});

describe.each([
  ['memory', async () => memoryStore()],
  ['sqlite', async () => sqlStore(nodeSql())],
] as [string, () => Promise<Store>][])('%s store', (_name, make) => {
  it('keeps results, files and settings', async () => {
    const store = await make();
    const file = new TextEncoder().encode('x'.repeat(5000));
    const id = await store.insert(row('abc'), file);
    expect((await store.get(id))?.headType).toBe('H24');
    expect((await store.byHash('abc'))?.id).toBe(id);
    expect(await store.byHash('nope')).toBeNull();
    expect(await store.file(id)).toEqual(file);
    await store.update(id, { upload: 'queued' });
    expect((await store.all()).map((r) => [r.id, r.upload])).toEqual([[id, 'queued']]);
    await store.setSetting('channel', 'beta');
    expect(await store.setting('channel')).toBe('beta');
    await store.setSetting('channel', null);
    expect(await store.setting('channel')).toBeNull();
  });
});
