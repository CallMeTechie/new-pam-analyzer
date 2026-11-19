import { describe, expect, it } from 'vitest';
import {
  analyzePamFile,
  capability,
  componentStatus,
  detectCoefficient,
  parsePamFile,
  rateCpk,
  shaftCountFromType,
} from '../src/index.js';

const NOW = new Date('2026-11-18T12:00:00Z');
const T = '\t';

const nxtHeader = (headType: string, extra: { tool?: string; toolSerial?: string } = {}) =>
  [
    'M6',
    'M6IIIXNo9001',
    headType,
    '900001',
    '0',
    '',
    '',
    '0',
    '0',
    '0',
    '1',
    '5',
    '0',
    '0',
    extra.tool ?? '',
    extra.toolSerial ?? '',
    '0',
    '',
  ].join(T);
const aimexHeader = (headType: string, tool = '', toolSerial = '000000') =>
  [
    'AIMEX',
    'AIMEX2s-SA-XNo900002',
    headType,
    '900003',
    '0',
    'SingleRobot',
    '1',
    '0',
    '0',
    '0',
    '1',
    '3',
    '0',
    '1',
    tool,
    toolSerial,
    '0',
  ].join(T);
const nxtrHeader = (headType: string, timestamp: string) =>
  ['NXTR', 'NXTR-1R-Xno9000003', headType, '900004', '', '', '', '1', '1', '', '', '0', timestamp].join(T);

const row = (n: number, shaft: number, angle: number, x: number, y: number, q = 0) =>
  [n, ` ${shaft}`, '0', `  ${angle}`, x.toFixed(6), y.toFixed(6), q.toFixed(6)].join(T);

describe('parsePamFile – Kopfzeile', () => {
  it('liest NXT-Kopfzeilen mit leeren Feldern', () => {
    const parsed = parsePamFile(`${nxtHeader('V12')}\n${row(1, 0, 0, 1, 2)}\n`, 'x.dat', { now: NOW });
    expect(parsed.header).toMatchObject({
      machineFamily: 'nxt',
      machineModel: 'M6',
      machineNo: 'M6IIIXNo9001',
      headType: 'V12',
      headSerial: '900001',
      toolType: null,
      toolSerial: null,
    });
    expect(parsed.shaftCount).toBe(12);
  });

  it('liest das DX-Werkzeug bei NXT und AIMEX an derselben Position', () => {
    const nxt = parsePamFile(`${nxtHeader('DX', { tool: 'R12', toolSerial: '900005' })}\n`, 'a.dat', { now: NOW });
    const aimex = parsePamFile(`${aimexHeader('DX', 'R12', '900005')}\n`, 'b.dat', { now: NOW });
    for (const parsed of [nxt, aimex]) {
      expect(parsed.header.toolType).toBe('R12');
      expect(parsed.header.toolSerial).toBe('900005');
      expect(parsed.shaftCount).toBe(12);
    }
    expect(aimex.header.machineFamily).toBe('aimex');
  });

  it('leitet bei DX ohne Werkzeug S1 ab, wenn nur ein Schaft vorkommt', () => {
    const content = [aimexHeader('DX'), row(1, 0, 0, 1, 1), row(2, 0, 90, 2, 2)].join('\n');
    const parsed = parsePamFile(content, 'c.dat', { now: NOW });
    expect(parsed.header.toolType).toBe('S1');
    expect(parsed.header.toolSerial).toBeNull();
    expect(parsed.warnings.map((w) => w.code)).toContain('tool_inferred');
    expect(analyzePamFile(parsed).coefficient).toBe(30);
  });

  it('warnt bei DX ohne Werkzeug und mehreren Schäften', () => {
    const content = [aimexHeader('DX'), row(1, 0, 0, 1, 1), row(2, 1, 0, 2, 2)].join('\n');
    const parsed = parsePamFile(content, 'd.dat', { now: NOW });
    expect(parsed.header.toolType).toBeNull();
    expect(parsed.warnings.map((w) => w.code)).toContain('tool_missing');
    expect(analyzePamFile(parsed).coefficientSource).toBe('default');
  });

  it('erkennt die H08M-Variante am Dateinamen', () => {
    const head = `${nxtHeader('H08M')}\n`;
    expect(parsePamFile(head, 'P1_H08M_HBCC.dat', { now: NOW }).header.h08mVariant).toBe('ceramic');
    expect(parsePamFile(head, 'P1_H08M_HBCG.dat', { now: NOW }).header.h08mVariant).toBe('glass');
    expect(parsePamFile(head, 'P1_H08M_DU.dat', { now: NOW }).header.h08mVariant).toBeNull();
  });

  it('weist eine leere Datei zurück', () => {
    expect(() => parsePamFile('', 'leer.dat')).toThrow(expect.objectContaining({ code: 'empty_file' }));
  });
});

describe('parsePamFile – Prüfdatum', () => {
  it('nimmt den NXT-R-Zeitstempel aus der Kopfzeile', () => {
    const parsed = parsePamFile(`${nxtrHeader('RH28', '20260805062241')}\n`, 'x.dat', { now: NOW });
    expect(parsed.header).toMatchObject({ testDate: '2026-08-05 06:22:41', dateSource: 'header' });
  });

  it('verwirft ungültige Zeitstempel', () => {
    const parsed = parsePamFile(`${nxtrHeader('RH28', '20261345062241')}\n`, 'x.dat', { now: NOW });
    expect(parsed.header).toMatchObject({ testDate: null, dateSource: 'unknown' });
  });

  it('nutzt danach das Änderungsdatum der Datei in lokaler Zeit', () => {
    const parsed = parsePamFile(`${nxtHeader('V12')}\n`, 'x.dat', {
      now: NOW,
      lastModified: new Date('2026-07-14T11:26:00Z'),
    });
    expect(parsed.header).toMatchObject({ testDate: '2026-07-14 13:26:00', dateSource: 'file_modified' });
  });

  it('ignoriert Änderungsdaten in der Zukunft', () => {
    const parsed = parsePamFile(`${nxtHeader('V12')}\n`, 'x.dat', {
      now: NOW,
      lastModified: new Date('2027-01-01T00:00:00Z'),
    });
    expect(parsed.header.dateSource).toBe('unknown');
  });

  it('nutzt zuletzt ein Datum im Dateinamen', () => {
    const parsed = parsePamFile(`${nxtHeader('V12')}\n`, 'PAM_2026-07-14_V12.dat', { now: NOW });
    expect(parsed.header).toMatchObject({ testDate: '2026-07-14 00:00:00', dateSource: 'filename' });
  });
});

describe('parsePamFile – Datenzeilen', () => {
  it('meldet Zeilen ohne Messwerte statt sie stillschweigend zu verwerfen', () => {
    const content = [nxtHeader('V12'), row(1, 0, 0, 1, 2), ['2', ' 1', '0', ' 90'].join(T)].join('\n');
    const parsed = parsePamFile(content, 'x.dat', { now: NOW });
    expect(parsed.measurements).toHaveLength(1);
    expect(parsed.invalidLines).toEqual([expect.objectContaining({ lineNumber: 3, reason: 'missing_measurement' })]);
  });

  it('meldet ungültige Winkel, Schäfte und Werte', () => {
    const content = [
      nxtHeader('V12'),
      row(1, 0, 45, 1, 2),
      row(2, 40, 0, 1, 2),
      row(3, 0, 0, 20000, 2),
      ['4', ' 0', '0', '0', 'abc', '1', '1'].join(T),
    ].join('\n');
    const parsed = parsePamFile(content, 'x.dat', { now: NOW });
    expect(parsed.measurements).toHaveLength(0);
    expect(parsed.invalidLines.map((l) => l.reason)).toEqual([
      'invalid_angle',
      'shaft_out_of_range',
      'invalid_value',
      'invalid_value',
    ]);
  });

  it('ordnet bei Ein-Schaft-Köpfen alle Messungen Schaft 1 zu', () => {
    const content = [nxtHeader('H01'), row(1, 3, 0, 1, 2), row(2, 5, 90, 1, 2)].join('\n');
    const parsed = parsePamFile(content, 'x.dat', { now: NOW });
    expect(parsed.measurements.map((m) => m.shaft)).toEqual([1, 1]);
  });

  it('verarbeitet CRLF, Leerzeilen, Fortsetzungszeilen und schließende Klammern', () => {
    const content = [
      nxtHeader('V12'),
      row(1, 0, 0, 1, 2),
      '',
      ['2', ' 1', '0', ' 90'].join(T),
      `${T}3.000000${T}4.000000${T}0.100000}`,
      '',
    ].join('\r\n');
    const parsed = parsePamFile(content, 'x.dat', { now: NOW });
    expect(parsed.invalidLines).toEqual([]);
    expect(parsed.measurements).toEqual([
      { shaft: 1, angle: 0, x: 1, y: 2, q: 0, lineNumber: 2 },
      { shaft: 2, angle: 90, x: 3, y: 4, q: 0.1, lineNumber: 4 },
    ]);
    expect(parsed.warnings.map((w) => w.code)).toContain('continuation_line');
  });
});

describe('parsePamFile – H08M Glas/Keramik', () => {
  /** H08M-Datei mit `rows` Datenzeilen; Zeilen in `empty` ohne Messwerte. */
  const h08m = (rows: number, empty: number[] = []) =>
    [
      nxtHeader('H08M'),
      ...Array.from({ length: rows }, (_, i) => {
        const n = i + 1;
        return empty.includes(n) ? [n, ` ${i % 8}`, '0', '  0'].join(T) : row(n, i % 8, 0, 1 + (i % 5), 2 - (i % 3));
      }),
    ].join('\n');
  const glassPlaceholders = [65, 66, 67, 68, 69, 70, 71, 72];

  it('erkennt Glas an 136 Datenzeilen und führt Nr. 65–72 als Platzhalter', () => {
    const parsed = parsePamFile(h08m(136, [...glassPlaceholders, 3]), 'P1_H08M_DU.dat', { now: NOW });
    expect(parsed.header).toMatchObject({ h08mVariant: 'glass', h08mVariantSource: 'data' });
    expect(parsed.invalidLines.filter((l) => l.reason === 'placeholder')).toHaveLength(8);
    const result = analyzePamFile(parsed);
    expect(result).toMatchObject({ expectedComponents: 128, measuredComponents: 127, failedMeasurements: 1 });
  });

  it('erkennt Keramik an 256 Datenzeilen; leere Zeilen sind dort Fehlmessungen', () => {
    const parsed = parsePamFile(h08m(256, [65]), 'P1_H08M_DU.dat', { now: NOW });
    expect(parsed.header).toMatchObject({ h08mVariant: 'ceramic', h08mVariantSource: 'data' });
    expect(parsed.invalidLines).toEqual([expect.objectContaining({ reason: 'missing_measurement' })]);
    expect(analyzePamFile(parsed)).toMatchObject({ expectedComponents: 256, failedMeasurements: 1 });
  });

  it('bevorzugt den Dateinamen und warnt bei Widerspruch zu den Daten', () => {
    const parsed = parsePamFile(h08m(136, glassPlaceholders), 'P1_H08M_HBCC.dat', { now: NOW });
    expect(parsed.header).toMatchObject({ h08mVariant: 'ceramic', h08mVariantSource: 'filename' });
    expect(parsed.warnings.map((w) => w.code)).toContain('h08m_variant_mismatch');
  });

  it('kennt keine Platzhalter bei anderen Köpfen', () => {
    const content = [nxtHeader('V12'), ['1', ' 0', '0', '  0'].join(T)].join('\n');
    const parsed = parsePamFile(content, 'x.dat', { now: NOW });
    expect(parsed.header.h08mVariant).toBeNull();
    expect(parsed.invalidLines[0]?.reason).toBe('missing_measurement');
  });
});

describe('Berechnung', () => {
  it('berechnet Cp und Cpk bei symmetrischer Toleranz', () => {
    const { cp, cpk } = capability(5, 10, 25);
    expect(cp).toBeCloseTo(2.5, 12);
    expect(cpk).toBeCloseTo(2.0, 12);
  });

  it('liefert null statt eines Textes bei 3σ = 0', () => {
    expect(capability(1, 0, 25)).toEqual({ cp: null, cpk: null });
    const content = [nxtHeader('V12'), row(1, 0, 0, 1, 2)].join('\n');
    const result = analyzePamFile(parsePamFile(content, 'x.dat', { now: NOW }));
    expect(result.head.x.cpk).toBeNull();
    expect(result.head.cpkXY).toBeNull();
  });

  it('übernimmt einen manuellen Koeffizienten und prüft dessen Bereich', () => {
    const parsed = parsePamFile([nxtHeader('V12'), row(1, 0, 0, 1, 2), row(2, 0, 0, 3, 4)].join('\n'), 'x.dat', {
      now: NOW,
    });
    expect(analyzePamFile(parsed, { coefficient: 30 })).toMatchObject({
      coefficient: 30,
      detectedCoefficient: 38,
      coefficientSource: 'manual',
    });
    expect(() => analyzePamFile(parsed, { coefficient: 0 })).toThrow(RangeError);
  });

  it('erkennt Koeffizienten über Kopftyp, Werkzeug und generische Einträge', () => {
    expect(detectCoefficient('V12', null).coefficient).toBe(38);
    expect(detectCoefficient('DX', 'R4').coefficient).toBe(40);
    expect(detectCoefficient('H12', null)).toEqual({ coefficient: 38, source: 'config' });
    expect(detectCoefficient('XYZ', null)).toEqual({ coefficient: 50, source: 'default' });
  });

  it('leitet die Schaftanzahl aus der Typbezeichnung ab', () => {
    expect(shaftCountFromType('RH28')).toBe(28);
    expect(shaftCountFromType('OF')).toBe(0);
    expect(shaftCountFromType(null)).toBe(0);
  });
});

describe('Bewertung', () => {
  it('bewertet Cpk in vier einheitlichen Stufen', () => {
    expect(rateCpk(0.99)).toBe('critical');
    expect(rateCpk(1.0)).toBe('warning');
    expect(rateCpk(1.329)).toBe('warning');
    expect(rateCpk(1.33)).toBe('good');
    expect(rateCpk(1.67)).toBe('excellent');
    expect(rateCpk(null)).toBeNull();
  });

  it('bewertet die Vollständigkeit wie das Alt-System', () => {
    expect(componentStatus(384, 384, 12)).toBe('complete');
    expect(componentStatus(372, 384, 12)).toBe('complete');
    expect(componentStatus(371, 384, 12)).toBe('warning');
    expect(componentStatus(364, 384, 12)).toBe('incomplete');
    expect(componentStatus(31, 32, 1)).toBe('complete');
    expect(componentStatus(10, null, 12)).toBe('unknown');
  });

  it('markiert besten und schlechtesten Holder', () => {
    const content = [
      nxtHeader('H02F'),
      row(1, 0, 0, 1, 1),
      row(2, 0, 0, 2, -1),
      row(3, 0, 0, 0, 0),
      row(4, 1, 0, 10, 10),
      row(5, 1, 0, -10, -10),
      row(6, 1, 0, 0, 5),
    ].join('\n');
    const result = analyzePamFile(parsePamFile(content, 'x.dat', { now: NOW }));
    expect(result.bestShaft).toBe(1);
    expect(result.worstShaft).toBe(2);
    expect(result.shafts[0]?.rating).toBe('excellent');
    expect(result.head.x.rating).not.toBeNull();
  });
});
