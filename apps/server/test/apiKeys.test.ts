import { describe, expect, it } from 'vitest';
import { ADMIN, fixture, PASSWORD, setup } from './helpers.js';

async function world() {
  const t = await setup();
  const admin = await t.login(ADMIN.email, ADMIN.password);
  const a = await t.createCompany('Customer A');
  const b = await t.createCompany('Customer B');
  await t.createUser(a, 'boss@a.test', 'companyAdmin');
  await t.createUser(a, 'worker@a.test');
  await t.createUser(a, 'second@a.test');
  await t.createUser(b, 'worker@b.test');
  const bossA = await t.login('boss@a.test', PASSWORD);
  return { t, admin, a, b, bossA };
}

const device = (key: string, email: string, installId = 'install-0001') => ({
  apiKey: key,
  email,
  password: PASSWORD,
  installId,
  deviceName: 'Tablet line 3',
  platform: 'android',
  appVersion: '1.0.0',
});

describe('API-Keys', () => {
  it('der Firmen-Admin erstellt Keys; der Key wird genau einmal gezeigt', async () => {
    const { bossA } = await world();
    const res = await bossA.json('POST', '/api/api-keys', { name: 'Line 3 tablets', maxConnections: 2 });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^pam_[\w-]{43}$/);
    expect(res.body.apiKey).toMatchObject({ name: 'Line 3 tablets', maxConnections: 2, devices: [] });
    expect(res.body.key.startsWith(res.body.apiKey.prefix)).toBe(true);
    const list = await bossA.json('GET', '/api/api-keys');
    expect(JSON.stringify(list.body)).not.toContain(res.body.key);
  });

  it('übernimmt ohne Angabe die Standard-Anzahl aus den Einstellungen', async () => {
    const { admin, bossA } = await world();
    await admin.json('PUT', '/api/settings/general', { defaultMaxConnections: 7 });
    const res = await bossA.json('POST', '/api/api-keys', { name: 'Default' });
    expect(res.body.apiKey.maxConnections).toBe(7);
  });

  it('Firmen-Admins sehen keine Keys anderer Firmen, Administratoren schon', async () => {
    const { admin, bossA, b } = await world();
    await admin.json('POST', '/api/api-keys', { companyId: b, name: 'B key' });
    expect((await bossA.json('GET', `/api/api-keys?companyId=${b}`)).status).toBe(403);
    expect((await admin.json('GET', `/api/api-keys?companyId=${b}`)).body.items).toHaveLength(1);
  });
});

describe('Geräteverbindungen', () => {
  it('jeder Benutzer der Firma verbindet sich über jeden Key der Firma', async () => {
    const { t, bossA } = await world();
    const { key } = (await bossA.json('POST', '/api/api-keys', { name: 'K', maxConnections: 3 })).body;
    const app = t.client();
    const res = await app.json('POST', '/api/app/connect', device(key, 'worker@a.test'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ companyName: 'Customer A', algorithmVersion: '1.0.0' });
    expect(res.body.token).toMatch(/^pamd_/);
    expect(res.body.coefficients.config.defaultCoefficient).toBe(50);
  });

  it('Konten mit Startpasswort verbinden keine Geräte', async () => {
    const { t, bossA, a } = await world();
    const { key } = (await bossA.json('POST', '/api/api-keys', { name: 'K' })).body;
    await bossA.json('POST', '/api/users', {
      companyId: a,
      email: 'new@a.test',
      name: 'New',
      role: 'user',
      password: PASSWORD,
    });
    const res = await t.client().json('POST', '/api/app/connect', device(key, 'new@a.test'));
    expect(res).toMatchObject({ status: 403, body: { error: { code: 'password_change_required' } } });
  });

  it('Benutzer anderer Firmen können sich nicht verbinden', async () => {
    const { t, bossA } = await world();
    const { key } = (await bossA.json('POST', '/api/api-keys', { name: 'K' })).body;
    const res = await t.client().json('POST', '/api/app/connect', device(key, 'worker@b.test'));
    expect(res).toMatchObject({ status: 403, body: { error: { code: 'wrong_company' } } });
  });

  it('begrenzt die Verbindungen je Key; erneutes Verbinden derselben Installation belegt keinen Platz', async () => {
    const { t, bossA } = await world();
    const { key } = (await bossA.json('POST', '/api/api-keys', { name: 'K', maxConnections: 2 })).body;
    const c = t.client();
    expect((await c.json('POST', '/api/app/connect', device(key, 'worker@a.test', 'install-1'))).status).toBe(201);
    expect((await c.json('POST', '/api/app/connect', device(key, 'second@a.test', 'install-2'))).status).toBe(201);
    const again = await c.json('POST', '/api/app/connect', device(key, 'worker@a.test', 'install-1'));
    expect(again.status).toBe(201);
    const full = await c.json('POST', '/api/app/connect', device(key, 'boss@a.test', 'install-3'));
    expect(full).toMatchObject({
      status: 409,
      body: { error: { code: 'connection_limit', details: { maxConnections: 2 } } },
    });

    const keys = (await bossA.json('GET', '/api/api-keys')).body.items;
    expect(keys[0].devices).toHaveLength(2);
    expect((await bossA.req('DELETE', `/api/devices/${keys[0].devices[0].id}`)).status).toBe(204);
    expect((await c.json('POST', '/api/app/connect', device(key, 'boss@a.test', 'install-3'))).status).toBe(201);
  });

  it('der alte Token wird beim erneuten Verbinden ungültig', async () => {
    const { t, bossA } = await world();
    const { key } = (await bossA.json('POST', '/api/api-keys', { name: 'K' })).body;
    const first = (await t.client().json('POST', '/api/app/connect', device(key, 'worker@a.test'))).body.token;
    await t.client().json('POST', '/api/app/connect', device(key, 'worker@a.test'));
    const app = t.client();
    app.setToken(first);
    expect((await app.json('GET', '/api/app/config')).body.error.code).toBe('device_disconnected');
  });

  it('Widerruf des Keys, Trennen und Deaktivieren des Benutzers beenden die Verbindung', async () => {
    const { t, bossA } = await world();
    const { key, apiKey } = (await bossA.json('POST', '/api/api-keys', { name: 'K' })).body;
    const connect = async (installId: string) => {
      const app = t.client();
      app.setToken((await app.json('POST', '/api/app/connect', device(key, 'worker@a.test', installId))).body.token);
      return app;
    };

    const app1 = await connect('install-1');
    expect((await app1.json('GET', '/api/app/config')).status).toBe(200);
    expect((await app1.req('DELETE', '/api/app/connection')).status).toBe(204);
    expect((await app1.json('GET', '/api/app/config')).status).toBe(401);

    const app2 = await connect('install-2');
    const worker = (await bossA.json('GET', '/api/users')).body.items.find((u: any) => u.email === 'worker@a.test');
    await bossA.json('PATCH', `/api/users/${worker.id}`, { disabled: true });
    expect((await app2.json('GET', '/api/app/config')).status).toBe(401);
    await bossA.json('PATCH', `/api/users/${worker.id}`, { disabled: false });

    const app3 = await connect('install-3');
    expect((await bossA.req('DELETE', `/api/api-keys/${apiKey.id}`)).status).toBe(204);
    expect((await app3.json('GET', '/api/app/config')).status).toBe(401);
    const res = await t.client().json('POST', '/api/app/connect', device(key, 'worker@a.test', 'install-4'));
    expect(res.body.error.code).toBe('invalid_api_key');
  });

  it('Geräte laden für ihre Firma hoch', async () => {
    const { t, bossA, a } = await world();
    const { key } = (await bossA.json('POST', '/api/api-keys', { name: 'K' })).body;
    const app = t.client();
    app.setToken((await app.json('POST', '/api/app/connect', device(key, 'worker@a.test'))).body.token);
    const up = await app.upload([fixture('nxt')]);
    expect(up.body.summary).toMatchObject({ created: 1 });
    const list = await bossA.json('GET', '/api/results');
    expect(list.body.items[0]).toMatchObject({ companyId: a, source: 'app' });
    expect((await app.upload([fixture('nxt', 1)], { companyId: '999' })).status).toBe(403);
    const keys = (await bossA.json('GET', '/api/api-keys')).body.items;
    expect(keys[0].devices[0].uploadCount).toBe(1);
  });
});
