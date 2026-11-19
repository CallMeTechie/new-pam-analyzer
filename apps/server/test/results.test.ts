import { analyzePamFile, parsePamFile } from '@pam/core';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ADMIN, fixture, PASSWORD, setup } from './helpers.js';

async function world() {
  const t = await setup();
  const admin = await t.login(ADMIN.email, ADMIN.password);
  const a = await t.createCompany('Customer A');
  const b = await t.createCompany('Customer B');
  await t.createUser(a, 'boss@a.test', 'companyAdmin');
  await t.createUser(a, 'worker@a.test');
  await t.createUser(b, 'worker@b.test');
  return {
    t,
    admin,
    a,
    b,
    bossA: await t.login('boss@a.test', PASSWORD),
    workerA: await t.login('worker@a.test', PASSWORD),
    workerB: await t.login('worker@b.test', PASSWORD),
  };
}

describe('Upload', () => {
  it('wertet aus, speichert und erkennt Duplikate innerhalb der Firma', async () => {
    const { workerA, workerB, a } = await world();
    const file = fixture('nxt');
    const first = await workerA.upload([file]);
    expect(first.status).toBe(200);
    expect(first.body.summary).toEqual({ created: 1, duplicate: 0, rejected: 0, skipped: 0 });
    const expected = analyzePamFile(parsePamFile(new TextDecoder().decode(file.bytes), file.name));
    expect(first.body.results[0]).toMatchObject({
      status: 'created',
      cpkXY: expected.head.cpkXY,
      rating: expected.head.rating,
    });

    const again = await workerA.upload([file]);
    expect(again.body.results[0]).toMatchObject({ status: 'duplicate', resultId: first.body.results[0].resultId });
    // Dieselbe Datei bei einer anderen Firma ist kein Duplikat und verrät nichts über Firma A.
    const other = await workerB.upload([file]);
    expect(other.body.results[0].status).toBe('created');
    expect(other.body.results[0].resultId).not.toBe(first.body.results[0].resultId);

    const list = await workerA.json('GET', '/api/results');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ companyId: a, companyName: 'Customer A', source: 'web' });
  });

  it('Prüfdatum: Kopfzeile, sonst Änderungsdatum, sonst Upload-Zeitpunkt', async () => {
    const { workerA } = await world();
    const nxtr = fixture('nxtr');
    const header = await workerA.upload([nxtr]);
    expect(header.body.results[0].dateSource).toBe('header');

    const modified = await workerA.upload([{ ...fixture('nxt', 0), lastModified: Date.UTC(2026, 6, 14, 11, 26) }]);
    expect(modified.body.results[0]).toMatchObject({ dateSource: 'file_modified', testDate: '2026-07-14 13:26:00' });

    const before = Date.now();
    const upload = await workerA.upload([fixture('nxt', 1)]);
    expect(upload.body.results[0].dateSource).toBe('upload');
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(before));
    expect(upload.body.results[0].testDate.slice(0, 10)).toBe(day);
  });

  it('entpackt ZIP-Archive (auch verschachtelt) und nimmt das Datum der Einträge', async () => {
    const { workerA } = await world();
    const f1 = fixture('nxt', 0);
    const f2 = fixture('aimex', 0);
    const inner = zipSync({ [f2.name]: [f2.bytes, { mtime: new Date(2026, 6, 15, 8, 5, 10) }] });
    const outer = zipSync({
      [`M3/${f1.name}`]: [f1.bytes, { mtime: new Date(2026, 6, 14, 13, 26, 0) }],
      'inner.zip': inner,
      'readme.txt': new TextEncoder().encode('x'),
    });
    const res = await workerA.upload([{ name: 'PAM@NXT.202607141326.zip', bytes: outer }]);
    expect(res.body.summary).toMatchObject({ created: 2, skipped: 1 });
    expect(res.body.skipped).toEqual([{ name: 'readme.txt', reason: 'unsupported_type' }]);
    const byName = Object.fromEntries(res.body.results.map((r: any) => [r.fileName, r]));
    expect(byName[f1.name]).toMatchObject({ dateSource: 'file_modified', testDate: '2026-07-14 13:26:00' });
    expect(byName[f2.name]).toMatchObject({ dateSource: 'file_modified', testDate: '2026-07-15 08:05:10' });
  });

  it('weist unbrauchbare Dateien mit Grund ab', async () => {
    const { workerA } = await world();
    const enc = new TextEncoder();
    const res = await workerA.upload([
      { name: 'empty.dat', bytes: enc.encode('') },
      { name: 'header-only.dat', bytes: enc.encode(fixture('nxt').name) },
      { name: 'broken.zip', bytes: enc.encode('not a zip') },
      { name: 'photo.jpg', bytes: enc.encode('x') },
    ]);
    expect(res.body.results.map((r: any) => [r.fileName, r.reason])).toEqual([
      ['empty.dat', 'empty_file'],
      ['header-only.dat', 'no_measurements'],
    ]);
    expect(res.body.skipped).toEqual([
      { name: 'broken.zip', reason: 'invalid_archive' },
      { name: 'photo.jpg', reason: 'unsupported_type' },
    ]);
  });

  it('Service-Mitarbeiter laden für eine gewählte Firma hoch oder lassen das Ergebnis offen', async () => {
    const { admin, workerA, a } = await world();
    const forA = await admin.upload([fixture('nxt', 2)], { companyId: String(a) });
    expect(forA.body.summary.created).toBe(1);
    expect((await workerA.json('GET', '/api/results')).body.total).toBe(1);

    const open = await admin.upload([fixture('nxt', 3)]);
    const id = open.body.results[0].resultId;
    expect((await admin.json('GET', `/api/results/${id}`)).body.result.companyId).toBeNull();
    expect((await workerA.json('GET', `/api/results/${id}`)).status).toBe(404);
    await admin.json('POST', '/api/results/assign', { ids: [id], companyId: a });
    expect((await workerA.json('GET', `/api/results/${id}`)).status).toBe(200);
  });

  it('weist zu große Uploads ab', async () => {
    const t = await setup({ maxUploadBytes: 1000 });
    const admin = await t.login(ADMIN.email, ADMIN.password);
    const res = await admin.upload([fixture('nxt')]);
    expect(res).toMatchObject({ status: 413, body: { error: { code: 'upload_too_large' } } });
  });

  it('Firmenbenutzer können nicht für andere Firmen hochladen', async () => {
    const { workerA, b } = await world();
    expect((await workerA.upload([fixture('nxt')], { companyId: String(b) })).status).toBe(403);
  });
});

describe('Ergebnisse', () => {
  async function seeded() {
    const w = await world();
    await w.workerA.upload([
      { ...fixture('nxt', 0), lastModified: Date.UTC(2026, 0, 10, 9) },
      { ...fixture('nxt', 1), lastModified: Date.UTC(2026, 1, 10, 9) },
      fixture('nxtr', 0),
      fixture('aimex', 0),
    ]);
    await w.workerB.upload([fixture('aimex', 1)]);
    return w;
  }

  it('Firmen sehen nur ihre Ergebnisse, der Service alle', async () => {
    const { workerA, workerB, admin, b } = await seeded();
    expect((await workerA.json('GET', '/api/results')).body.total).toBe(4);
    expect((await workerB.json('GET', '/api/results')).body.total).toBe(1);
    expect((await admin.json('GET', '/api/results')).body.total).toBe(5);
    expect((await admin.json('GET', `/api/results?companyId=${b}`)).body.total).toBe(1);
    const counts = (await admin.json('GET', '/api/companies')).body.items.map((c: any) => [
      c.name,
      c.results,
      c.machines,
    ]);
    expect(counts).toEqual([
      ['FUJI Service', 0, 0],
      ['Customer A', 4, 4],
      ['Customer B', 1, 1],
    ]);
    expect((await workerA.json('GET', `/api/results?companyId=${b}`)).status).toBe(403);
    const idB = (await workerB.json('GET', '/api/results')).body.items[0].id;
    expect((await workerA.json('GET', `/api/results/${idB}`)).status).toBe(404);
    expect((await workerA.req('GET', `/api/results/${idB}/file`)).status).toBe(404);
  });

  it('sucht über Maschine, Kopf und Dateiname und filtert nach Familie, Bewertung und Datum', async () => {
    const { workerA } = await seeded();
    const all = (await workerA.json('GET', '/api/results')).body.items;
    const sample = all.find((r: any) => r.machineFamily === 'nxt');
    const bySerial = await workerA.json('GET', `/api/results?q=${encodeURIComponent(sample.headSerial)}`);
    expect(bySerial.body.items.every((r: any) => r.headSerial.includes(sample.headSerial))).toBe(true);
    const combined = await workerA.json(
      'GET',
      `/api/results?q=${encodeURIComponent(`${sample.headType} ${sample.headSerial}`)}`,
    );
    expect(combined.body.items.map((r: any) => r.id)).toContain(sample.id);
    expect((await workerA.json('GET', '/api/results?q=%25')).body.total).toBe(0);

    const nxtr = await workerA.json('GET', '/api/results?family=nxtr');
    expect(nxtr.body.items.map((r: any) => r.machineFamily)).toEqual(['nxtr']);
    const january = await workerA.json('GET', '/api/results?from=2026-01-01&to=2026-01-31');
    expect(january.body.items.map((r: any) => r.testDate)).toEqual(['2026-01-10 10:00:00']);
    const rated = await workerA.json('GET', `/api/results?rating=${sample.rating}`);
    expect(rated.body.items.every((r: any) => r.rating === sample.rating)).toBe(true);
    const page = await workerA.json('GET', '/api/results?pageSize=2&page=2&sort=testDate');
    expect(page.body).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(page.body.items).toHaveLength(2);
  });

  it('liefert die vollständige Auswertung und die Originaldatei', async () => {
    const { workerA } = await seeded();
    const item = (await workerA.json('GET', '/api/results?family=aimex')).body.items[0];
    const detail = await workerA.json('GET', `/api/results/${item.id}`);
    expect(detail.body.analysis.head.cpkXY).toBe(item.cpkXY);
    expect(detail.body.measurements.length).toBe(item.measured);
    expect(detail.body.header.headSerial).toBe(item.headSerial);
    const file = await workerA.req('GET', `/api/results/${item.id}/file`);
    expect(await file.text()).toBe(new TextDecoder().decode(fixture('aimex', 0).bytes));
  });

  it('die Kopf-Historie enthält alle Ergebnisse desselben Kopfes der Firma', async () => {
    const t = await setup();
    const a = await t.createCompany('Customer A');
    await t.createUser(a, 'worker@a.test');
    const worker = await t.login('worker@a.test', PASSWORD);
    // Gleicher Kopf, zwei Läufe (P1/P2 im Fixture-Namen).
    const runs = [fixture('aimex', 2), fixture('aimex', 10)];
    expect(runs[0]?.name.replace(/^P\d_/, '')).toBe(runs[1]?.name.replace(/^P\d_/, ''));
    const up = await worker.upload(runs.map((r, i) => ({ ...r!, lastModified: Date.UTC(2026, i, 1) })));
    const history = await worker.json('GET', `/api/results/${up.body.results[1].resultId}/history`);
    expect(history.body.items.map((r: any) => r.testDate)).toEqual(['2026-01-01 01:00:00', '2026-02-01 01:00:00']);
  });

  it('nur Firmen-Admins und Administratoren löschen Ergebnisse', async () => {
    const { workerA, bossA } = await seeded();
    const id = (await workerA.json('GET', '/api/results')).body.items[0].id;
    expect((await workerA.req('DELETE', `/api/results/${id}`)).status).toBe(403);
    expect((await bossA.req('DELETE', `/api/results/${id}`)).status).toBe(204);
    expect((await workerA.json('GET', `/api/results/${id}`)).status).toBe(404);
    expect((await workerA.json('GET', '/api/results')).body.total).toBe(3);
  });

  it('die Übersicht zählt Ergebnisse, Bewertungen und zeigt die neuesten', async () => {
    const { workerA, admin } = await seeded();
    const dash = await workerA.json('GET', '/api/dashboard?days=7');
    expect(dash.body.totals.results).toBe(4);
    expect(dash.body.perDay).toHaveLength(7);
    expect(dash.body.latest).toHaveLength(4);
    expect(dash.body.totals.companies).toBeUndefined();
    const service = await admin.json('GET', '/api/dashboard');
    expect(service.body.totals).toMatchObject({ results: 5, companies: 3 });
  });
});

describe('Einstellungen', () => {
  it('neue Koeffizienten gelten für neue Uploads, alte Ergebnisse behalten ihre Version', async () => {
    const { admin, workerA } = await world();
    const before = await workerA.upload([fixture('nxt', 0)]);
    const current = (await admin.json('GET', '/api/settings/coefficients')).body;
    const headType = before.body.results[0].headType as string;
    const config = { ...current.config, cpkCoefficients: { ...current.config.cpkCoefficients, [headType]: 10 } };
    expect((await workerA.json('PUT', '/api/settings/coefficients', config)).status).toBe(403);
    expect((await admin.json('PUT', '/api/settings/coefficients', config)).status).toBe(200);

    const after = await workerA.upload([fixture('nxt', 1)]);
    const oldDetail = await workerA.json('GET', `/api/results/${before.body.results[0].resultId}`);
    const newDetail = await workerA.json('GET', `/api/results/${after.body.results[0].resultId}`);
    expect(oldDetail.body.analysis.coefficient).not.toBe(10);
    expect(newDetail.body.analysis.coefficient).toBe(10);
  });
});
