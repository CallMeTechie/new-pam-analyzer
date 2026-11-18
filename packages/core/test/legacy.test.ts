/**
 * Abnahmetest: Der neue Rechenkern muss für alle Testdateien dieselben Ergebnisse liefern wie der
 * alte PAM Analyzer (Referenz aus tools/legacy-reference/generate.php). Bewusste Abweichungen sind
 * in KNOWN_DEVIATIONS dokumentiert und werden dort separat geprüft.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AnalysisResult, StatisticsSummary } from '../src/index.js';
import { analyzePamFile, parsePamFile } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');
const legacyDir = join(here, 'legacy');

type LegacyCpk = number | 'N/A';
interface LegacyReference {
  source: string;
  file_header_info: {
    machine_no: string;
    head_type: string;
    head_serial: string;
    tool_type: string;
    tool_serial: string;
    h08m_variant: string | null;
    date_source: string;
    test_date: string | null;
  };
  shaft_count: number;
  point_count: number;
  expected_components: number | null;
  detected_coefficient: number;
  used_coefficient: number;
  head_stats_summary: {
    avg_x: number;
    avg_y: number;
    avg_q: number;
    sigma3_x: number;
    sigma3_y: number;
    sigma3_q: number;
    cp_x: LegacyCpk;
    cpk_x: LegacyCpk;
    cp_y: LegacyCpk;
    cpk_y: LegacyCpk;
  };
  cpk_results_table: Record<
    string,
    { cp_x: LegacyCpk; cpk_x: LegacyCpk; cp_y: LegacyCpk; cpk_y: LegacyCpk; xy: LegacyCpk }
  >;
  min_max: Record<'min_x' | 'max_x' | 'min_y' | 'max_y' | 'min_q' | 'max_q', number | null>;
  x_axis_limits: { min: number; max: number };
  y_axis_limits: { min: number; max: number };
}

/**
 * Bewusste Abweichungen vom Alt-System.
 *
 * AIMEX-DX: Das Alt-System trennte die Kopfzeile an beliebigem Leerraum und verlor dadurch leere
 * Felder. Bei AIMEX-Dateien (ohne Leerfelder) las es an Position 12/13 die falschen Werte als
 * Werkzeugtyp/-seriennummer und rechnete mit dem Standardkoeffizienten 50 statt mit dem
 * Werkzeugkoeffizienten. Die Datei ohne Werkzeugangabe wird über die Messdaten als S1 erkannt.
 */
const KNOWN_DEVIATIONS: Record<
  string,
  { toolType: string; toolSerial: string | null; coefficient: number; expectedComponents: number; shaftCount: number }
> = {
  'aimex/P2_AIMEX2s-SA-XNo900013_DX-R12_900032-900041_S1S_HC_DU.dat': {
    toolType: 'R12',
    toolSerial: '900041',
    coefficient: 38,
    expectedComponents: 384,
    shaftCount: 12,
  },
  'aimex/P4_AIMEX2s-SA-XNo900013_DX-R4_900032-900042_S1S_HG_DU.dat': {
    toolType: 'R4',
    toolSerial: '900042',
    coefficient: 40,
    expectedComponents: 128,
    shaftCount: 4,
  },
  'aimex/P1_AIMEX2s-SA-XNo900013_DX_900032_S1S_HG.dat': {
    toolType: 'S1',
    toolSerial: null,
    coefficient: 30,
    expectedComponents: 32,
    shaftCount: 1,
  },
};

function listFixtures(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFixtures(full);
    return entry.name.toLowerCase().endsWith('.dat') ? [full] : [];
  });
}

const fixtures = listFixtures(fixturesDir)
  .map((file) => relative(fixturesDir, file).split('\\').join('/'))
  .sort();

const cpk = (v: LegacyCpk): number | null => (v === 'N/A' ? null : v);

/** Vergleich mit enger relativer Toleranz; Abweichungen entstehen höchstens durch Rundung. */
function expectNumber(actual: number | null, expected: number | null, label: string) {
  if (expected === null || actual === null) {
    expect(actual, label).toBe(expected);
    return;
  }
  const tolerance = 1e-12 * Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

function expectSummary(
  actual: StatisticsSummary,
  expected: { cp_x: LegacyCpk; cpk_x: LegacyCpk; cp_y: LegacyCpk; cpk_y: LegacyCpk },
  label: string,
) {
  expectNumber(actual.x.cp, cpk(expected.cp_x), `${label} cp_x`);
  expectNumber(actual.x.cpk, cpk(expected.cpk_x), `${label} cpk_x`);
  expectNumber(actual.y.cp, cpk(expected.cp_y), `${label} cp_y`);
  expectNumber(actual.y.cpk, cpk(expected.cpk_y), `${label} cpk_y`);
}

function expectStatistics(result: AnalysisResult, ref: LegacyReference) {
  const h = result.head;
  const s = ref.head_stats_summary;
  expectNumber(h.x.mean, s.avg_x, 'avg_x');
  expectNumber(h.y.mean, s.avg_y, 'avg_y');
  expectNumber(h.q.mean, s.avg_q, 'avg_q');
  expectNumber(h.x.sigma3, s.sigma3_x, 'sigma3_x');
  expectNumber(h.y.sigma3, s.sigma3_y, 'sigma3_y');
  expectNumber(h.q.sigma3, s.sigma3_q, 'sigma3_q');
  expectSummary(h, s, 'head');

  const { Total: total, ...shaftTable } = ref.cpk_results_table;
  expect(total).toBeDefined();
  if (total) {
    expectSummary(h, total, 'Total');
    expectNumber(h.cpkXY, cpk(total.xy), 'Total xy');
  }
  expect(result.shafts.map((s) => s.label)).toEqual(Object.keys(shaftTable));
  for (const shaft of result.shafts) {
    const expected = shaftTable[shaft.label];
    if (!expected) throw new Error(`Holder ${shaft.label} fehlt in der Referenz`);
    expectSummary(shaft, expected, `Holder ${shaft.label}`);
    expectNumber(shaft.cpkXY, cpk(expected.xy), `Holder ${shaft.label} xy`);
  }

  expect(h.x.min).toBe(ref.min_max.min_x);
  expect(h.x.max).toBe(ref.min_max.max_x);
  expect(h.y.min).toBe(ref.min_max.min_y);
  expect(h.y.max).toBe(ref.min_max.max_y);
  expect(h.q.min).toBe(ref.min_max.min_q);
  expect(h.q.max).toBe(ref.min_max.max_q);
  expect(result.axisLimits.x).toEqual(ref.x_axis_limits);
  expect(result.axisLimits.y).toEqual(ref.y_axis_limits);
}

describe('Abgleich mit dem Alt-System', () => {
  it('findet Testdateien', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(89);
  });

  describe.each(fixtures)('%s', (fixture) => {
    const content = readFileSync(join(fixturesDir, fixture), 'utf-8');
    const ref: LegacyReference = JSON.parse(
      readFileSync(join(legacyDir, fixture.replace(/\.dat$/i, '.json')), 'utf-8'),
    );
    const fileName = fixture.split('/').at(-1) as string;
    const parsed = parsePamFile(content, fileName, { now: new Date('2026-11-18T12:00:00Z') });
    const deviation = KNOWN_DEVIATIONS[fixture];

    it('liest die Kopfzeile wie das Alt-System', () => {
      const h = parsed.header;
      const legacy = ref.file_header_info;
      expect(h.machineNo).toBe(legacy.machine_no);
      expect(h.headType).toBe(legacy.head_type);
      expect(h.headSerial).toBe(legacy.head_serial);
      expect(h.h08mVariant).toBe(legacy.h08m_variant);
      if (deviation) {
        expect(h.toolType).toBe(deviation.toolType);
        expect(h.toolSerial).toBe(deviation.toolSerial);
        expect(parsed.shaftCount).toBe(deviation.shaftCount);
      } else {
        expect(h.toolType).toBe(legacy.tool_type || null);
        expect(h.toolSerial).toBe(legacy.tool_serial || null);
        expect(parsed.shaftCount).toBe(ref.shaft_count);
      }
      if (legacy.date_source === 'header') {
        expect(h.dateSource).toBe('header');
        expect(h.testDate).toBe(legacy.test_date);
      } else {
        // Alt-System nahm hier faktisch den Upload-Zeitpunkt; ohne Quelle bleibt das Datum leer.
        expect(h.dateSource).toBe('unknown');
        expect(h.testDate).toBeNull();
      }
    });

    it('übernimmt dieselben Messpunkte', () => {
      expect(parsed.measurements.length).toBe(ref.point_count);
      const dataLines = content.split('\n').filter((l) => l.trim() !== '').length - 1;
      expect(parsed.measurements.length + parsed.invalidLines.length).toBe(dataLines);
    });

    if (deviation) {
      it('rechnet mit dem korrigierten Werkzeugkoeffizienten', () => {
        const result = analyzePamFile(parsed);
        expect(result.coefficient).toBe(deviation.coefficient);
        expect(result.coefficientSource).toBe('config');
        expect(result.expectedComponents).toBe(deviation.expectedComponents);
      });

      it('liefert mit dem Alt-Koeffizienten identische Kennzahlen', () => {
        const result = analyzePamFile(parsed, { coefficient: ref.used_coefficient });
        expectStatistics(result, ref);
      });
    } else {
      it('erkennt Koeffizient und Bauteilanzahl wie das Alt-System', () => {
        const result = analyzePamFile(parsed);
        expect(result.coefficient).toBe(ref.used_coefficient);
        expect(result.detectedCoefficient).toBe(ref.detected_coefficient);
        expect(result.expectedComponents).toBe(ref.expected_components);
      });

      it('liefert identische Kennzahlen', () => {
        expectStatistics(analyzePamFile(parsed), ref);
      });
    }
  });
});
