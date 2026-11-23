import { describe, expect, it } from 'vitest';
// The real server, in-process: the app talks to it exactly like over the network.
import { ADMIN, PASSWORD, setup } from '../../server/test/helpers';
import { Engine, normalizeServer } from '../src/lib/engine';
import { localTransport } from '../src/lib/transport';
import type { HttpRequest } from '../src/platform/types';
import { fixture, testPlatform } from './helpers';

const SERVER = 'https://pam.example.test';

async function world() {
  const t = await setup();
  const companyId = await t.createCompany('Customer A');
  await t.createUser(companyId, 'boss@a.test', 'companyAdmin');
  await t.createUser(companyId, 'worker@a.test');
  const worker = await t.login('worker@a.test', PASSWORD);
  /** A fresh "connect another device" code of the worker, as shown on the web. */
  const code = async () => (await worker.json('POST', '/api/devices/connect-code')).body.code as string;
  let online = true;
  const handler = async (url: string, init: HttpRequest) => {
    if (!online) return { status: 0, text: 'offline' };
    const res = await t.app.request(url.replace(SERVER, ''), {
      method: init.method,
      headers: init.headers ?? {},
      ...(init.body === undefined ? {} : { body: init.body as BodyInit }),
    });
    return { status: res.status, text: await res.text() };
  };
  const platform = testPlatform(handler);
  const engine = new Engine(platform);
  await engine.init();
  const admin = await t.login(ADMIN.email, ADMIN.password);
  return {
    t,
    code,
    worker,
    engine,
    platform,
    admin,
    setOnline: (v: boolean) => {
      online = v;
    },
    connect: async () => engine.connect({ server: SERVER, code: await code(), deviceName: 'PC 1' }),
  };
}

describe('normalizeServer', () => {
  it('adds https and drops trailing slashes', () => {
    expect(normalizeServer('pam.example.com/')).toBe('https://pam.example.com');
    expect(normalizeServer(' http://10.0.0.5:3080// ')).toBe('http://10.0.0.5:3080');
  });
});

describe('Engine', () => {
  it('evaluates offline, recognises duplicates and rejects unreadable files', async () => {
    const { engine } = await world();
    const a = fixture('nxt', 5);
    const summary = await engine.importFiles([
      a,
      { ...a, name: 'copy.dat' },
      fixture('aimex', 2),
      { name: 'notes.txt', path: null, bytes: new Uint8Array([1]), lastModified: null },
      { name: 'empty.dat', path: null, bytes: new Uint8Array(), lastModified: null },
    ]);
    expect(summary.created).toHaveLength(2);
    expect(summary.duplicates).toHaveLength(1);
    expect(summary.rejected.map((r) => r.reason).sort()).toEqual(['empty_file', 'unsupported_type']);
    const rows = engine.snapshot.rows;
    expect(rows.every((r) => r.upload === 'local')).toBe(true);
    expect(rows.find((r) => r.fileName === a.name)?.headType).toBe('H24');
  });

  it('answers the web pages from local data', async () => {
    const { engine } = await world();
    const { created } = await engine.importFiles([fixture('aimex', 2), fixture('aimex', 10)]);
    const api = localTransport(engine);
    const id = created[0] ?? 0;
    const detail = (await api('GET', `/results/${id}`)) as {
      analysis: { shafts: unknown[] };
      header: { headType: string };
    };
    expect(detail.header.headType).toBe('V12');
    expect(detail.analysis.shafts).toHaveLength(12);
    const history = (await api('GET', `/results/${id}/history`)) as { items: unknown[] };
    expect(history.items).toHaveLength(2);
    await expect(api('GET', '/results/999')).rejects.toMatchObject({ status: 404 });
  });

  it('connects, uploads the queue and evaluates like the server', async () => {
    const { engine, admin, connect } = await world();
    await engine.importFiles([fixture('aimex', 2)]);
    await connect();
    await engine.sync();
    const s = engine.snapshot;
    expect(s.connection).toMatchObject({ companyName: 'Customer A', userName: 'worker', deviceName: 'PC 1' });
    expect(s.config.source).toBe('server');
    expect(s.rows.map((r) => r.upload)).toEqual(['uploaded']);
    const server = await admin.json('GET', '/api/results');
    expect(server.body.items).toHaveLength(1);
    expect(server.body.items[0]).toMatchObject({ source: 'app', companyName: 'Customer A' });
    // Same result on the PC and on the server.
    expect(server.body.items[0].cpkXY).toBeCloseTo(s.rows[0]?.cpkXY ?? 0, 10);
    expect(server.body.items[0].testDate).toBe(s.rows[0]?.testDate);
  });

  it('sends stored crash reports once connected and deletes the accepted ones', async () => {
    const { engine, platform, admin, connect } = await world();
    let stored = [
      {
        id: 'android-1',
        kind: 'android' as const,
        occurredAt: Date.UTC(2026, 10, 23, 7),
        appVersion: '0.4.0-beta.2',
        system: 'Pixel · Android 16',
        message: 'java.lang.IllegalStateException: boom',
        report: 'java.lang.IllegalStateException: boom\n\tat app.Main.run(Main.kt:1)',
      },
    ];
    platform.crashReports = async () => stored;
    platform.deleteCrashReports = async (ids) => {
      stored = stored.filter((r) => !ids.includes(r.id));
    };
    await connect();
    await engine.sync();
    expect(stored).toEqual([]);
    const list = (await admin.json('GET', '/api/crash-reports')).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      kind: 'android',
      deviceName: 'PC 1',
      message: 'java.lang.IllegalStateException: boom',
    });
  });

  it('keeps files in the queue while the server cannot be reached', async () => {
    const { engine, admin, connect, setOnline } = await world();
    await connect();
    setOnline(false);
    await engine.importFiles([fixture('nxtr', 1)]);
    await engine.sync();
    expect(engine.snapshot.server).toBe('offline');
    expect(engine.snapshot.rows[0]?.upload).toBe('queued');
    setOnline(true);
    await engine.sync();
    expect(engine.snapshot.server).toBe('online');
    expect(engine.snapshot.rows[0]?.upload).toBe('uploaded');
    expect((await admin.json('GET', '/api/results')).body.items).toHaveLength(1);
  });

  it('re-rates local results when the server changes the thresholds', async () => {
    const { engine, admin, connect } = await world();
    await connect();
    await engine.importFiles([fixture('nxtr', 1)]);
    await engine.sync();
    const before = engine.snapshot.rows[0]?.rating;
    expect(before).toBeTruthy();
    await admin.json('PUT', '/api/settings/rating', { warning: 10, good: 20, excellent: 30 });
    await engine.refreshConfig();
    expect(engine.snapshot.config.thresholds.warning).toBe(10);
    expect(engine.snapshot.rows[0]?.rating).toBe('critical');
  });

  it('reports errors of the server with their code', async () => {
    const { engine, code } = await world();
    await expect(engine.connect({ server: SERVER, code: 'ABCD-EFGH', deviceName: 'PC' })).rejects.toMatchObject({
      code: 'invalid_code',
    });
    await expect(engine.connect({ server: 'not a url', code: await code(), deviceName: 'PC' })).rejects.toMatchObject({
      code: 'invalid_server',
    });
    expect(engine.snapshot.connection).toBeNull();
  });

  it('notices a device disconnected on the web and disconnects', async () => {
    const { engine, connect, worker } = await world();
    await connect();
    const devices = (await worker.json('GET', '/api/devices')).body.items as { id: number }[];
    await worker.req('DELETE', `/api/devices/${devices[0]?.id}`);
    await engine.importFiles([fixture('nxt', 0)]);
    await engine.sync();
    expect(engine.snapshot.server).toBe('revoked');
    await engine.disconnect();
    expect(engine.snapshot.connection).toBeNull();
    expect(engine.snapshot.rows[0]?.upload).toBe('local');
    expect(await engine.platform.secret.get()).toBeNull();
  });
});
