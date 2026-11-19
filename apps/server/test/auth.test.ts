import { describe, expect, it } from 'vitest';
import { ADMIN, PASSWORD, setup } from './helpers.js';

describe('Anmeldung', () => {
  it('legt beim ersten Start Service-Firma und den Standard-Administrator an', async () => {
    const t = await setup({}, { keepInitialPassword: true });
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const me = await admin.json('GET', '/api/auth/me');
    expect(me.body.user).toMatchObject({
      email: ADMIN.email,
      role: 'admin',
      mustChangePassword: true,
      company: { name: 'FUJI Service', isService: true },
    });
  });

  it('lehnt falsche Passwörter ab und sperrt nach zu vielen Versuchen', async () => {
    const t = await setup({ loginMaxAttempts: 3 });
    const c = t.client();
    for (let i = 0; i < 3; i++) {
      const res = await c.json('POST', '/api/auth/login', { email: ADMIN.email, password: 'wrong-password' });
      expect(res.body.error.code).toBe('invalid_credentials');
    }
    const locked = await c.json('POST', '/api/auth/login', ADMIN);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('account_locked');
  });

  it('meldet unbekannte Adressen wie falsche Passwörter', async () => {
    const t = await setup();
    const res = await t.client().json('POST', '/api/auth/login', { email: 'nobody@pam.test', password: 'x' });
    expect(res).toMatchObject({ status: 401, body: { error: { code: 'invalid_credentials' } } });
  });

  it('sperrt Benutzer deaktivierter Firmen aus', async () => {
    const t = await setup();
    const companyId = await t.createCompany('Customer A');
    await t.createUser(companyId, 'a@customer.test');
    const admin = await t.login(ADMIN.email, ADMIN.password);
    await admin.json('PATCH', `/api/companies/${companyId}`, { disabled: true });
    const res = await t.client().json('POST', '/api/auth/login', { email: 'a@customer.test', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('meldet ab und verlangt danach eine neue Anmeldung', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    expect((await admin.req('POST', '/api/auth/logout')).status).toBe(204);
    expect((await admin.json('GET', '/api/auth/me')).status).toBe(401);
  });

  it('weist zustandsändernde Anfragen fremder Herkunft ab', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const res = await admin.req('PATCH', '/api/auth/me', { locale: 'de' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('cross_origin');
  });

  it('ändert das Passwort und hebt die Pflicht zur Änderung auf', async () => {
    const t = await setup({}, { keepInitialPassword: true });
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const wrong = await admin.json('POST', '/api/auth/password', {
      currentPassword: 'nope',
      newPassword: 'new-password-456',
    });
    expect(wrong.body.error.code).toBe('wrong_password');
    const short = await admin.json('POST', '/api/auth/password', {
      currentPassword: ADMIN.password,
      newPassword: 'short',
    });
    expect(short.body.error.code).toBe('invalid_request');
    // Der Standard-Administrator muss auch eine eigene E-Mail-Adresse wählen.
    const keepEmail = await admin.json('POST', '/api/auth/password', {
      currentPassword: ADMIN.password,
      newPassword: 'new-password-456',
    });
    expect(keepEmail.body.error.code).toBe('email_change_required');
    const ok = await admin.req('POST', '/api/auth/password', {
      currentPassword: ADMIN.password,
      newPassword: 'new-password-456',
      newEmail: 'It@Plant.test',
    });
    expect(ok.status).toBe(204);
    const me = (await admin.json('GET', '/api/auth/me')).body.user;
    expect(me).toMatchObject({ email: 'it@plant.test', mustChangePassword: false });
    await expect(t.login(ADMIN.email, ADMIN.password)).rejects.toThrow();
    await expect(t.login(ADMIN.email, 'new-password-456')).rejects.toThrow();
    await t.login('it@plant.test', 'new-password-456');
  });

  it('mit Startpasswort ist nur die Passwortänderung erlaubt', async () => {
    const t = await setup({}, { keepInitialPassword: true });
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const blocked = await admin.json('GET', '/api/results');
    expect(blocked).toMatchObject({ status: 403, body: { error: { code: 'password_change_required' } } });
    expect((await admin.json('GET', '/api/auth/me')).status).toBe(200);
    await admin.req('POST', '/api/auth/password', {
      currentPassword: ADMIN.password,
      newPassword: 'new-password-456',
      newEmail: 'it@plant.test',
    });
    expect((await admin.json('GET', '/api/results')).status).toBe(200);
  });

  it('legt den Standard-Administrator nur an, solange es keinen Administrator gibt', async () => {
    const t = await setup({}, { keepInitialPassword: true });
    const admin = await t.login(ADMIN.email, ADMIN.password);
    await admin.req('POST', '/api/auth/password', {
      currentPassword: ADMIN.password,
      newPassword: 'new-password-456',
      newEmail: 'it@plant.test',
    });
    const { bootstrap } = await import('../src/services/bootstrap.js');
    await bootstrap(t.db, t.config, () => {});
    await expect(t.login(ADMIN.email, ADMIN.password)).rejects.toThrow();
  });

  it('speichert die Sprache des Benutzers', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const res = await admin.json('PATCH', '/api/auth/me', { locale: 'de' });
    expect(res.body.user.locale).toBe('de');
    expect((await admin.json('PATCH', '/api/auth/me', { locale: 'xx' })).status).toBe(400);
  });
});
