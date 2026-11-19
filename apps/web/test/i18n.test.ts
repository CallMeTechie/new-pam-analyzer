import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { CATALOGS, makeI18n, translate } from '../src/i18n/index';

const placeholders = (m: unknown) => [...new Set(JSON.stringify(m).match(/\{\w+\}/g) ?? [])].sort();

describe('Sprachkataloge', () => {
  it('jede Sprache hat dieselben Schlüssel wie Englisch', () => {
    for (const [code, catalog] of Object.entries(CATALOGS)) {
      expect(Object.keys(catalog.messages).sort(), code).toEqual(Object.keys(en).sort());
    }
  });

  it('Übersetzungen verwenden dieselben Platzhalter', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('Mehrzahlformen sind in allen Sprachen gleich aufgebaut', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof de[key], key).toBe(typeof en[key]);
    }
  });
});

describe('translate', () => {
  it('wählt Einzahl und Mehrzahl nach der Sprache', () => {
    expect(translate('en', 'results.count', { n: 1, total: '1' })).toBe('1 result');
    expect(translate('de', 'results.count', { n: 3, total: '3' })).toBe('3 Ergebnisse');
  });

  it('fällt bei unbekannter Sprache auf Englisch zurück', () => {
    expect(translate('fr', 'nav.results')).toBe('Results');
  });

  it('formatiert Zahlen und Maschinenzeit je Sprache', () => {
    const de = makeI18n('de');
    const en = makeI18n('en');
    expect(de.num(1.2345, 2)).toBe('1,23');
    expect(en.num(1.2345, 2)).toBe('1.23');
    expect(de.num(null)).toBe('–');
    // Maschinenzeit wird nicht in die Zeitzone des Browsers umgerechnet.
    expect(de.dateTime('2026-07-14 13:26:00')).toBe('14.07.2026, 13:26');
  });
});
