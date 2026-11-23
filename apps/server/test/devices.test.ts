import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, openDatabase } from '../src/db/index.js';
import { ADMIN, fixture, PASSWORD, setup } from './helpers.js';

async function world() {
  const t = await setup();
  const admin = await t.login(ADMIN.email, ADMIN.password);
  const a = await t.createCompany('Customer A');
  const b = await t.createCompany('Customer B');
  await t.createUser(a, 'boss@a.test', 'companyAdmin');
  const workerId = await t.createUser(a, 'worker@a.test');
  await t.createUser(b, 'worker@b.test');
  const bossA = await t.login('boss@a.test', PASSWORD);
  const worker = await t.login('worker@a.test', PASSWORD);
  /** A fresh "connect device" code of the worker. */
  const deviceCode = async () => (await worker.json('POST', '/api/devices/connect-code')).body.code as string;
  return { t, admin, a, b, bossA, worker, workerId, deviceCode };
}

const device = (code: string, installId = 'install-0001') => ({
  code,
  installId,
  deviceName: 'Tablet line 3',
  platform: 'android',
  appVersion: '1.0.0',
});

describe('Einladungen', () => {
  it('ein neues Mitglied bekommt eine Einladung statt eines Startpassworts', async () => {
    const { t, bossA, a } = await world();
    const res = await bossA.json('POST', '/api/users', {
      companyId: a,
      email: 'new@a.test',
      name: 'Line Operator',
      role: 'user',
    });
    expect(res.status).toBe(201);
    const { invite, user } = res.body;
    expect(invite.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(invite.url).toBe(`http://localhost/connect/${invite.code.replace('-', '')}`);
    expect(invite.emailed).toBe(false);
    expect(user.inviteUntil).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    // The page behind the link.
    const page = t.client();
    const info = await page.json('GET', `/api/connect/${invite.code.toLowerCase()}`);
    expect(info.body).toMatchObject({
      purpose: 'invite',
      name: 'Line Operator',
      needsPassword: true,
      companyName: 'Customer A',
    });
    expect((await page.json('POST', `/api/connect/${invite.code}/password`, { password: 'short' })).status).toBe(400);
    expect(
      (await page.json('POST', `/api/connect/${invite.code}/password`, { password: 'operator-pass-1' })).status,
    ).toBe(200);
    expect(
      (await page.json('POST', `/api/connect/${invite.code}/password`, { password: 'operator-pass-2' })).status,
    ).toBe(404);
    const me = await t.login('new@a.test', 'operator-pass-1');
    expect((await me.json('GET', '/api/auth/me')).body.user.mustChangePassword).toBe(false);

    // The same invitation connects one device, once.
    const app = t.client();
    const connected = await app.json('POST', '/api/app/connect', device(invite.code));
    expect(connected.status).toBe(201);
    expect(connected.body).toMatchObject({ companyName: 'Customer A', userName: 'Line Operator' });
    expect(connected.body.token).toMatch(/^pamd_/);
    const again = await t.client().json('POST', '/api/app/connect', device(invite.code, 'install-0002'));
    expect(again.body.error.code).toBe('invalid_code');
  });

  it('eine neue Einladung ersetzt die alte; fremde Firmen können nicht einladen', async () => {
    const { t, bossA, admin, b } = await world();
    const { user, invite: first } = (
      await admin.json('POST', '/api/users', { companyId: b, email: 'x@b.test', name: 'X', role: 'user' })
    ).body;
    expect((await bossA.json('POST', `/api/users/${user.id}/invite`, {})).status).toBe(404);
    const second = (await admin.json('POST', `/api/users/${user.id}/invite`, {})).body.invite;
    expect((await t.client().json('GET', `/api/connect/${first.code}`)).status).toBe(404);
    expect((await t.client().json('GET', `/api/connect/${second.code}`)).status).toBe(200);
  });
});

describe('Geräteverbindungen', () => {
  it('ein Code verbindet genau ein Gerät mit dem eigenen Konto', async () => {
    const { t, deviceCode } = await world();
    const code = await deviceCode();
    const app = t.client();
    const res = await app.json('POST', '/api/app/connect', device(code));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ companyName: 'Customer A', userName: 'worker', algorithmVersion: '1.0.0' });
    expect(res.body.coefficients.config.defaultCoefficient).toBe(50);
    expect((await t.client().json('POST', '/api/app/connect', device(code, 'install-0002'))).status).toBe(401);
    expect((await t.client().json('POST', '/api/app/connect', device('ABCD-EFGH'))).body.error.code).toBe(
      'invalid_code',
    );
  });

  it('Codes laufen ab', async () => {
    const { t, deviceCode } = await world();
    const code = await deviceCode();
    t.db.run('update connect_codes set expires_at = 0' as never);
    expect((await t.client().json('POST', '/api/app/connect', device(code))).status).toBe(401);
  });

  it('begrenzt die Geräte je Benutzer; dieselbe Installation belegt keinen weiteren Platz', async () => {
    const { t, bossA, a, worker, deviceCode } = await world();
    expect((await bossA.json('PUT', `/api/companies/${a}/device-limit`, { maxDevicesPerUser: 2 })).status).toBe(200);
    const c = t.client();
    expect((await c.json('POST', '/api/app/connect', device(await deviceCode(), 'install-1'))).status).toBe(201);
    expect((await c.json('POST', '/api/app/connect', device(await deviceCode(), 'install-2'))).status).toBe(201);
    expect((await c.json('POST', '/api/app/connect', device(await deviceCode(), 'install-1'))).status).toBe(201);
    const full = await c.json('POST', '/api/app/connect', device(await deviceCode(), 'install-3'));
    expect(full).toMatchObject({ status: 409, body: { error: { code: 'device_limit', details: { maxDevices: 2 } } } });

    const mine = (await worker.json('GET', '/api/devices')).body;
    expect(mine).toMatchObject({ maxDevicesPerUser: 2 });
    expect(mine.items).toHaveLength(2);
    expect((await bossA.json('GET', `/api/devices?companyId=${a}`)).body.items).toHaveLength(2);
    expect((await worker.req('DELETE', `/api/devices/${mine.items[0].id}`)).status).toBe(204);
    expect((await c.json('POST', '/api/app/connect', device(await deviceCode(), 'install-3'))).status).toBe(201);
  });

  it('Firmen-Admins setzen nur das Limit ihrer Firma', async () => {
    const { bossA, b } = await world();
    expect((await bossA.json('PUT', `/api/companies/${b}/device-limit`, { maxDevicesPerUser: 9 })).status).toBe(403);
  });

  it('der alte Token wird beim erneuten Verbinden ungültig', async () => {
    const { t, deviceCode } = await world();
    const first = (await t.client().json('POST', '/api/app/connect', device(await deviceCode()))).body.token;
    await t.client().json('POST', '/api/app/connect', device(await deviceCode()));
    const app = t.client();
    app.setToken(first);
    expect((await app.json('GET', '/api/app/config')).body.error.code).toBe('device_disconnected');
  });

  it('Trennen und Deaktivieren des Benutzers beenden die Verbindung', async () => {
    const { t, bossA, workerId, deviceCode } = await world();
    const connect = async (installId: string) => {
      const app = t.client();
      app.setToken((await app.json('POST', '/api/app/connect', device(await deviceCode(), installId))).body.token);
      return app;
    };
    const app1 = await connect('install-1');
    expect((await app1.json('GET', '/api/app/config')).status).toBe(200);
    expect((await app1.req('DELETE', '/api/app/connection')).status).toBe(204);
    expect((await app1.json('GET', '/api/app/config')).status).toBe(401);

    const app2 = await connect('install-2');
    await bossA.json('PATCH', `/api/users/${workerId}`, { disabled: true });
    expect((await app2.json('GET', '/api/app/config')).status).toBe(401);
  });

  it('Geräte laden für die Firma ihres Benutzers hoch', async () => {
    const { t, bossA, a, worker, deviceCode } = await world();
    const app = t.client();
    app.setToken((await app.json('POST', '/api/app/connect', device(await deviceCode()))).body.token);
    const up = await app.upload([fixture('nxt')]);
    expect(up.body.summary).toMatchObject({ created: 1 });
    const list = await bossA.json('GET', '/api/results');
    expect(list.body.items[0]).toMatchObject({ companyId: a, source: 'app' });
    expect((await app.upload([fixture('nxt', 1)], { companyId: '999' })).status).toBe(403);
    expect((await worker.json('GET', '/api/devices')).body.items[0].uploadCount).toBe(1);
  });
});

describe('Absturzberichte', () => {
  const report = (id: string) => ({
    id,
    kind: 'android',
    occurredAt: Date.UTC(2026, 10, 23, 7),
    appVersion: '0.4.0-beta.2',
    system: 'Pixel · Android 16',
    message: 'java.lang.IllegalStateException: boom',
    report: 'java.lang.IllegalStateException: boom\n\tat app.Main.run(Main.kt:1)',
  });

  it('verbundene Apps senden Berichte; Doppelte zählen einmal; nur Administratoren sehen sie', async () => {
    const { t, admin, bossA, deviceCode } = await world();
    const app = t.client();
    expect((await app.json('POST', '/api/app/crash-reports', { reports: [report('r1')] })).status).toBe(401);
    app.setToken((await app.json('POST', '/api/app/connect', device(await deviceCode()))).body.token);
    const sent = await app.json('POST', '/api/app/crash-reports', { reports: [report('r1'), report('r2')] });
    expect(sent.body.accepted).toEqual(['r1', 'r2']);
    await app.json('POST', '/api/app/crash-reports', { reports: [report('r1')] });

    expect((await bossA.json('GET', '/api/crash-reports')).status).toBe(403);
    const list = await admin.json('GET', '/api/crash-reports');
    expect(list.body.total).toBe(2);
    expect(list.body.items[0]).toMatchObject({
      platform: 'android',
      deviceName: 'Tablet line 3',
      companyName: 'Customer A',
      kind: 'android',
      appVersion: '0.4.0-beta.2',
    });
    expect((await admin.req('DELETE', `/api/crash-reports/${list.body.items[0].id}`)).status).toBe(204);
    expect((await admin.json('GET', '/api/crash-reports')).body.total).toBe(1);
  });
});

describe('Migration von API-Keys zu Codes', () => {
  it('verbundene Geräte und ihre Ergebnisse bleiben erhalten', () => {
    // The database as it was with API keys (migrations up to 0003).
    const dir = mkdtempSync(join(tmpdir(), 'pam-migration-'));
    const old = join(dir, 'drizzle');
    mkdirSync(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'));
    const before = journal.entries.filter((e: { tag: string }) => e.tag < '0004');
    for (const e of before) copyFileSync(join(MIGRATIONS_FOLDER, `${e.tag}.sql`), join(old, `${e.tag}.sql`));
    writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: before }));
    const file = join(dir, 'pam.sqlite');

    const first = openDatabase(file, old);
    first.sqlite.exec(`
      insert into companies (id, name) values (1, 'Customer A');
      insert into users (id, company_id, email, name, password_hash, role) values (1, 1, 'w@a.test', 'W', 'x', 'user');
      insert into api_keys (id, company_id, name, prefix, key_hash, max_connections) values (1, 1, 'K', 'pam_x', 'h', 5);
      insert into devices (id, api_key_id, user_id, install_id, name, platform, token_hash) values (7, 1, 1, 'i', 'Tab', 'android', 't');
      insert into crash_reports (device_id, company_id, client_id, platform, kind, message, report, occurred_at)
        values (7, 1, 'c1', 'android', 'android', 'm', 'r', 1);
    `);
    first.close();

    const next = openDatabase(file);
    const device = next.sqlite.prepare('select id, user_id from devices').get();
    expect(device).toEqual({ id: 7, user_id: 1 });
    expect(next.sqlite.prepare('select device_id from crash_reports').get()).toEqual({ device_id: 7 });
    expect(next.sqlite.prepare("select name from sqlite_master where name = 'api_keys'").get()).toBeUndefined();
    next.close();
  });
});
