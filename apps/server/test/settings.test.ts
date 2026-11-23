import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ADMIN, fixture, PASSWORD, setup } from './helpers.js';

/** Smallest valid PNG (1×1 pixel). */
function png(): Uint8Array {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

describe('Bewertungsgrenzen', () => {
  it('Administratoren ändern die Grenzen; vorhandene Ergebnisse werden neu bewertet', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const a = await t.createCompany('Customer A');
    const up = await admin.upload([fixture('nxt', 0)], { companyId: String(a) });
    const { cpkXY } = up.body.results[0];
    expect((await admin.json('GET', '/api/settings/rating')).body).toMatchObject({
      warning: 1,
      good: 1.33,
      excellent: 1.67,
    });

    // Grenzen so legen, dass dieses Ergebnis sicher „kritisch“ ist.
    const strict = { warning: cpkXY + 0.5, good: cpkXY + 1, excellent: cpkXY + 2 };
    expect((await admin.json('PUT', '/api/settings/rating', strict)).status).toBe(200);
    const list = await admin.json('GET', '/api/results');
    expect(list.body.items[0].rating).toBe('critical');
    const detail = await admin.json('GET', `/api/results/${list.body.items[0].id}`);
    expect(detail.body.analysis.head.rating).toBe('critical');
    expect(detail.body.thresholds).toEqual(strict);
    for (const s of detail.body.analysis.shafts) {
      const expected =
        s.cpkXY < strict.warning
          ? 'critical'
          : s.cpkXY < strict.good
            ? 'warning'
            : s.cpkXY < strict.excellent
              ? 'good'
              : 'excellent';
      expect(s.rating).toBe(expected);
    }
  });

  it('weist ungültige Grenzen ab und lässt nur Administratoren ändern', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const bad = await admin.json('PUT', '/api/settings/rating', { warning: 1.5, good: 1.33, excellent: 1.67 });
    expect(bad.body.error.code).toBe('invalid_request');
    const a = await t.createCompany('Customer A');
    await t.createUser(a, 'boss@a.test', 'companyAdmin');
    const boss = await t.login('boss@a.test', PASSWORD);
    expect((await boss.json('PUT', '/api/settings/rating', { warning: 1, good: 2, excellent: 3 })).status).toBe(403);
  });
});

describe('Firmenlogo', () => {
  it('Firmen-Admins laden ein Logo hoch, andere Firmen sehen es nicht', async () => {
    const t = await setup();
    const a = await t.createCompany('Customer A');
    const b = await t.createCompany('Customer B');
    await t.createUser(a, 'boss@a.test', 'companyAdmin');
    await t.createUser(b, 'worker@b.test');
    const boss = await t.login('boss@a.test', PASSWORD);
    const form = new FormData();
    form.append('logo', new File([png()], 'logo.png'));
    const res = await boss.json('PUT', `/api/companies/${a}/logo`, form);
    expect(res.status).toBe(200);
    expect(res.body.company.logoVersion).toBeGreaterThan(0);
    const img = await boss.req('GET', `/api/companies/${a}/logo`);
    expect(img.headers.get('content-type')).toBe('image/png');
    const other = await t.login('worker@b.test', PASSWORD);
    expect((await other.req('GET', `/api/companies/${a}/logo`)).status).toBe(404);
    expect((await other.json('PUT', `/api/companies/${a}/logo`, form)).status).toBe(403);
    expect((await boss.req('DELETE', `/api/companies/${a}/logo`)).status).toBe(204);
    expect((await boss.req('GET', `/api/companies/${a}/logo`)).status).toBe(404);
  });

  it('nimmt nur PNG, JPEG und WebP an', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const a = await t.createCompany('Customer A');
    const form = new FormData();
    form.append('logo', new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg'));
    const res = await admin.json('PUT', `/api/companies/${a}/logo`, form);
    expect(res.body.error.code).toBe('invalid_logo');
  });
});

describe('Sprachen und Version', () => {
  it('Administratoren importieren Sprachkataloge, die jeder lesen kann', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const catalog = {
      name: 'Français',
      messages: {
        'nav.results': 'Résultats',
        'results.count': { one: '{total} résultat', other: '{total} résultats' },
      },
    };
    expect((await admin.json('PUT', '/api/i18n/fr', catalog)).status).toBe(200);
    const anonymous = await t.client().json('GET', '/api/i18n');
    expect(anonymous.body.catalogs).toMatchObject([{ code: 'fr', name: 'Français' }]);
    expect((await admin.json('PUT', '/api/i18n/FR!', catalog)).status).toBe(400);
    expect((await admin.json('PUT', '/api/i18n/it', { name: 'Italiano', messages: { x: { one: 'a' } } })).status).toBe(
      400,
    );
    // Benutzer können die importierte Sprache wählen.
    expect((await admin.json('PATCH', '/api/auth/me', { locale: 'fr' })).body.user.locale).toBe('fr');
    expect((await admin.req('DELETE', '/api/i18n/fr')).status).toBe(204);
  });

  it('nennt die Version ohne Anmeldung', async () => {
    const t = await setup();
    const res = await t.client().json('GET', '/api/version');
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('E-Mail-Server', () => {
  it('wird in den Einstellungen gepflegt; das Passwort kommt nie zurück', async () => {
    const t = await setup();
    const admin = await t.login(ADMIN.email, ADMIN.password);
    expect((await admin.json('GET', '/api/settings/mail')).body).toMatchObject({ source: 'none', host: '' });
    expect((await admin.json('GET', '/api/version')).body.mail).toBe(false);

    const saved = await admin.json('PUT', '/api/settings/mail', {
      host: '127.0.0.1',
      port: 1,
      secure: false,
      user: 'pam@example.test',
      password: 'smtp-secret',
      from: 'PAM <pam@example.test>',
    });
    expect(saved.body).toMatchObject({ source: 'settings', host: '127.0.0.1', passwordSet: true });
    expect(JSON.stringify(saved.body)).not.toContain('smtp-secret');
    // Saving without a password keeps the stored one.
    const again = await admin.json('PUT', '/api/settings/mail', { ...saved.body, port: 2, password: undefined });
    expect(again.body).toMatchObject({ port: 2, passwordSet: true });
    expect((await admin.json('GET', '/api/version')).body.mail).toBe(true);

    // Nothing listens on port 2: the test mail reports the reason.
    const test = await admin.json('POST', '/api/settings/mail/test', {});
    expect(test.status).toBe(502);
    expect(test.body.error.code).toBe('mail_failed');

    await t.createUser(await t.createCompany('A'), 'boss@a.test', 'companyAdmin');
    const boss = await t.login('boss@a.test', PASSWORD);
    expect((await boss.json('GET', '/api/settings/mail')).status).toBe(403);
  });
});
