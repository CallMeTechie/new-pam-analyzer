import { describe, expect, it } from 'vitest';
import { ADMIN, PASSWORD, setup } from './helpers.js';

async function world() {
  const t = await setup();
  const admin = await t.login(ADMIN.email, ADMIN.password);
  const a = (await admin.json('POST', '/api/companies', { name: 'Customer A', location: 'Plant 1' })).body.company.id;
  const b = (await admin.json('POST', '/api/companies', { name: 'Customer B' })).body.company.id;
  await t.createUser(a, 'boss@a.test', 'companyAdmin');
  await t.createUser(a, 'worker@a.test', 'user');
  await t.createUser(b, 'boss@b.test', 'companyAdmin');
  return {
    t,
    admin,
    a,
    b,
    bossA: await t.login('boss@a.test', PASSWORD),
    workerA: await t.login('worker@a.test', PASSWORD),
  };
}

describe('Firmen', () => {
  it('Administratoren legen Firmen an, Namen sind eindeutig', async () => {
    const { admin } = await world();
    const list = await admin.json('GET', '/api/companies');
    expect(list.body.items.map((c: any) => c.name)).toEqual(['FUJI Service', 'Customer A', 'Customer B']);
    const dup = await admin.json('POST', '/api/companies', { name: 'Customer A' });
    expect(dup).toMatchObject({ status: 409, body: { error: { code: 'name_taken' } } });
  });

  it('Firmenbenutzer sehen nur ihre eigene Firma', async () => {
    const { bossA, b, a } = await world();
    const list = await bossA.json('GET', '/api/companies');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: a, users: 2 });
    expect((await bossA.json('GET', `/api/companies/${b}`)).status).toBe(404);
    expect((await bossA.json('POST', '/api/companies', { name: 'X' })).status).toBe(403);
  });

  it('die Service-Firma kann nicht deaktiviert werden', async () => {
    const { admin } = await world();
    const service = (await admin.json('GET', '/api/companies')).body.items[0];
    const res = await admin.json('PATCH', `/api/companies/${service.id}`, { disabled: true });
    expect(res.body.error.code).toBe('service_company');
  });
});

describe('Benutzerverwaltung', () => {
  it('der Firmen-Admin verwaltet die Benutzer seiner Firma', async () => {
    const { bossA, a, b } = await world();
    const created = await bossA.json('POST', '/api/users', {
      companyId: a,
      email: 'New@A.test',
      name: 'New',
      role: 'user',
      password: 'initial-password-1',
    });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ email: 'new@a.test', mustChangePassword: true, companyId: a });
    const other = await bossA.json('POST', '/api/users', {
      companyId: b,
      email: 'x@b.test',
      name: 'X',
      role: 'user',
      password: 'initial-password-1',
    });
    expect(other.status).toBe(403);
    const list = await bossA.json('GET', '/api/users');
    expect(list.body.items.map((u: any) => u.email).sort()).toEqual(['boss@a.test', 'new@a.test', 'worker@a.test']);
  });

  it('nur Administratoren vergeben die Rolle admin, und nur in der Service-Firma', async () => {
    const { bossA, admin, a } = await world();
    const user = { email: 'adm@a.test', name: 'A', role: 'admin', password: 'initial-password-1' };
    expect((await bossA.json('POST', '/api/users', { ...user, companyId: a })).body.error.code).toBe('invalid_role');
    expect((await admin.json('POST', '/api/users', { ...user, companyId: a })).body.error.code).toBe('invalid_role');
  });

  it('normale Benutzer sehen keine Benutzerliste', async () => {
    const { workerA } = await world();
    expect((await workerA.json('GET', '/api/users')).status).toBe(403);
  });

  it('niemand ändert die eigene Rolle; der letzte Administrator bleibt', async () => {
    const { admin, bossA } = await world();
    const me = (await admin.json('GET', '/api/auth/me')).body.user;
    expect((await admin.json('PATCH', `/api/users/${me.id}`, { role: 'user' })).body.error.code).toBe('self_change');
    const bossMe = (await bossA.json('GET', '/api/auth/me')).body.user;
    expect((await bossA.json('PATCH', `/api/users/${bossMe.id}`, { disabled: true })).body.error.code).toBe(
      'self_change',
    );
    // Administratoren sind für Firmen-Admins unsichtbar.
    expect((await bossA.json('DELETE', `/api/users/${me.id}`)).status).toBe(404);
  });

  it('deaktivierte Benutzer verlieren ihre Sitzungen', async () => {
    const { bossA, workerA } = await world();
    const worker = (await workerA.json('GET', '/api/auth/me')).body.user;
    await bossA.json('PATCH', `/api/users/${worker.id}`, { disabled: true });
    expect((await workerA.json('GET', '/api/auth/me')).status).toBe(401);
  });
});
