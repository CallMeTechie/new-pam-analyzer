import { describe, expect, it } from 'vitest';
import { cleanTestDate } from '../src/services/ingest.js';
import { fixture, PASSWORD, setup } from './helpers.js';

async function world() {
  const t = await setup();
  const a = await t.createCompany('Customer A');
  await t.createUser(a, 'tech@a.test');
  const tech = await t.login('tech@a.test', PASSWORD);
  return { t, tech };
}

describe('Kunde und Prüfdatum', () => {
  it('übernimmt Kunde und Prüfdatum aus dem Upload', async () => {
    const { tech } = await world();
    const f = fixture('nxt', 0);
    const res = await tech.upload([f], { customer: '  Musterwerk   Elektronik ', testDate: '2026-11-19 08:30' });
    expect(res.body.results[0]).toMatchObject({
      status: 'created',
      testDate: '2026-11-19 08:30:00',
      dateSource: 'manual',
    });
    const list = await tech.json('GET', '/api/results');
    expect(list.body.items[0]).toMatchObject({
      customer: 'Musterwerk Elektronik',
      testDate: '2026-11-19 08:30:00',
      dateSource: 'manual',
    });
    const detail = await tech.json('GET', `/api/results/${list.body.items[0].id}`);
    expect(detail.body.result.customer).toBe('Musterwerk Elektronik');
  });

  it('liefert bisherige Kunden für die Autovervollständigung und findet nach Kunde', async () => {
    const { tech } = await world();
    await tech.upload([fixture('nxt', 0)], { customer: 'Musterwerk Elektronik' });
    await tech.upload([fixture('nxt', 1)], { customer: 'Beispiel Automotive' });
    await tech.upload([fixture('nxt', 2)], { customer: 'Beispiel Automotive' });
    const all = await tech.json('GET', '/api/results/customers');
    expect(all.body.items.map((c: { name: string }) => c.name).sort()).toEqual([
      'Beispiel Automotive',
      'Musterwerk Elektronik',
    ]);
    const some = await tech.json('GET', '/api/results/customers?q=auto');
    expect(some.body.items).toEqual([expect.objectContaining({ name: 'Beispiel Automotive', results: 2 })]);
    const found = await tech.json('GET', '/api/results?q=musterwerk');
    expect(found.body.total).toBe(1);
  });

  it('ändert Kunde und Prüfdatum nachträglich und setzt das Datum zurück', async () => {
    const { tech } = await world();
    await tech.upload([{ ...fixture('nxt', 0), lastModified: Date.UTC(2026, 0, 2, 10) }]);
    const id = (await tech.json('GET', '/api/results')).body.items[0].id;
    const before = (await tech.json('GET', `/api/results/${id}`)).body.result;
    let res = await tech.json('PATCH', `/api/results/${id}`, { customer: 'Demo', testDate: '2026-03-04 05:06:07' });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ customer: 'Demo', testDate: '2026-03-04 05:06:07', dateSource: 'manual' });
    res = await tech.json('PATCH', `/api/results/${id}`, { customer: null, testDate: null });
    expect(res.body.result).toMatchObject({ customer: null, testDate: before.testDate, dateSource: before.dateSource });
    expect((await tech.json('PATCH', `/api/results/${id}`, { testDate: 'gestern' })).status).toBe(400);
  });

  it('übernimmt Kunde und nur den Prüftag beim Upload, die Uhrzeit bleibt die aus der Datei', async () => {
    const nxtr = fixture('nxtr');
    // Time of day from the file: the same file on a second server without a test day.
    const plain = await (await world()).tech.upload([nxtr]);
    const fileTime = plain.body.results[0].testDate.slice(11);
    expect(plain.body.results[0].dateSource).toBe('header');
    const { tech } = await world();
    const res = await tech.upload([nxtr], { customer: 'Muster Metall', testDay: '2026-03-14' });
    expect(res.body.results[0]).toMatchObject({ testDate: `2026-03-14 ${fileTime}`, dateSource: 'manual' });
    expect((await tech.upload([fixture('nxt', 3)], { testDay: '14.03.2026' })).body.results[0].dateSource).not.toBe(
      'manual',
    );
  });

  it('prüft das Datumsformat', () => {
    expect(cleanTestDate('2026-02-30 10:00')).toBeUndefined();
    expect(cleanTestDate('2026-02-28T23:59:59')).toBe('2026-02-28 23:59:59');
    expect(cleanTestDate('28.02.2026')).toBeUndefined();
  });
});
