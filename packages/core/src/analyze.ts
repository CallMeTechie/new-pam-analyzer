import { DEFAULT_CONFIG } from './config.js';
import { dynaheadToolKey } from './parse.js';
import type {
  AnalysisResult,
  AnalyzeOptions,
  AxisLimits,
  AxisStatistics,
  CapabilityAxisStatistics,
  CoefficientConfig,
  CoefficientSource,
  ComponentStatus,
  CpkRating,
  Measurement,
  ParsedPamFile,
  ShaftResult,
  StatisticsSummary,
} from './types.js';

/** Version der Berechnung. Wird mit jedem Ergebnis gespeichert, um Neuberechnungen nachvollziehen zu können. */
export const ALGORITHM_VERSION = '1.0.0';

/** Holder-Bezeichnungen für Schaft 1 … 30. */
export const SHAFT_LABELS: readonly string[] = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  'AA',
  'AB',
  'AC',
  'AD',
];

export function shaftLabel(shaft: number): string {
  return SHAFT_LABELS[shaft - 1] ?? String(shaft);
}

function axisStatistics(values: number[]): AxisStatistics {
  const n = values.length;
  if (n === 0) return { mean: 0, sigma3: 0, min: null, max: null };
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let sumSq = 0;
  if (n >= 2) {
    for (const v of values) sumSq += (v - mean) ** 2;
  }
  const std = n >= 2 ? Math.sqrt(sumSq / (n - 1)) : 0;
  return { mean, sigma3: 3 * std, min, max };
}

/**
 * Prozessfähigkeit bei symmetrischer Toleranz ±k:
 * Cp = (USL − LSL) / (2 · 3σ), Cpk = min(USL − µ, µ − LSL) / 3σ.
 */
export function capability(
  mean: number,
  sigma3: number,
  coefficient: number,
): { cp: number | null; cpk: number | null } {
  if (sigma3 === 0 || coefficient === 0) return { cp: null, cpk: null };
  const usl = coefficient;
  const lsl = -coefficient;
  return {
    cp: (usl - lsl) / (2 * sigma3),
    cpk: Math.min((usl - mean) / sigma3, (mean - lsl) / sigma3),
  };
}

function minOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** Grenzen der Cpk-Bewertung (einheitlich für Tabellen, Holder und Kopf). */
export const CPK_THRESHOLDS = { warning: 1.0, good: 1.33, excellent: 1.67 } as const;

export function rateCpk(value: number | null): CpkRating | null {
  if (value === null || Number.isNaN(value)) return null;
  if (value < CPK_THRESHOLDS.warning) return 'critical';
  if (value < CPK_THRESHOLDS.good) return 'warning';
  if (value < CPK_THRESHOLDS.excellent) return 'good';
  return 'excellent';
}

/** Vollständigkeit wie im Alt-System; als Toleranz gilt die Schaftanzahl (mindestens 1). */
export function componentStatus(measured: number, expected: number | null, shaftCount: number): ComponentStatus {
  if (expected === null || expected <= 0) return 'unknown';
  if (expected - measured <= Math.max(shaftCount, 1)) return 'complete';
  return measured / expected >= 0.95 ? 'warning' : 'incomplete';
}

function summarize(points: Measurement[], coefficient: number): StatisticsSummary {
  const withCapability = (stats: AxisStatistics): CapabilityAxisStatistics => {
    const values = capability(stats.mean, stats.sigma3, coefficient);
    return { ...stats, ...values, rating: rateCpk(values.cpk) };
  };
  const x = withCapability(axisStatistics(points.map((p) => p.x)));
  const y = withCapability(axisStatistics(points.map((p) => p.y)));
  const q = axisStatistics(points.map((p) => p.q));
  const cpkXY = minOrNull(x.cpk, y.cpk);
  return { count: points.length, x, y, q, cpkXY, rating: rateCpk(cpkXY) };
}

function lookup(table: Record<string, number>, key: string | null): number | undefined {
  return key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Ermittelt den Cpk-Koeffizienten (Toleranz ±µm) aus Kopf- bzw. Werkzeugtyp. */
export function detectCoefficient(
  headType: string,
  toolType: string | null,
  config: CoefficientConfig = DEFAULT_CONFIG,
): { coefficient: number; source: Exclude<CoefficientSource, 'manual'> } {
  const exact = lookup(config.cpkCoefficients, headType);
  if (exact !== undefined) return { coefficient: exact, source: 'config' };
  if (headType === 'DX') {
    const tool = lookup(config.dynaheadTools, dynaheadToolKey(toolType));
    if (tool !== undefined) return { coefficient: tool, source: 'config' };
  }
  const number = headType.match(/\d+/)?.[0];
  const generic = number ? lookup(config.cpkCoefficients, `${number}-HEAD`) : undefined;
  if (generic !== undefined) return { coefficient: generic, source: 'config' };
  return { coefficient: config.defaultCoefficient, source: 'default' };
}

/** Erwartete Anzahl Bauteile eines PAM-Laufs, `null` wenn unbekannt. */
export function expectedComponents(
  headType: string,
  toolType: string | null,
  h08mVariant: ParsedPamFile['header']['h08mVariant'],
  config: CoefficientConfig = DEFAULT_CONFIG,
): number | null {
  if ((headType === 'H08M' || headType === 'H08MQ') && h08mVariant) {
    return h08mVariant === 'ceramic' ? 256 : 128;
  }
  if (headType === 'DX') {
    const tool = lookup(config.dynaheadToolPlacements, dynaheadToolKey(toolType));
    if (tool !== undefined) return tool;
  }
  const direct = Object.hasOwn(config.placementCounts, headType) ? config.placementCounts[headType] : undefined;
  if (typeof direct === 'number') return direct;
  const number = headType.match(/\d+/)?.[0];
  const generic = number ? config.placementCounts[`${number}-HEAD`] : undefined;
  return typeof generic === 'number' ? generic : null;
}

/** Symmetrische Achsgrenzen für Streudiagramme: mindestens ±50 µm, sonst 15 % Rand. */
export function axisLimits(min: number | null, max: number | null): AxisLimits {
  if (min === null || max === null) return { min: -50, max: 50 };
  const limit = Math.ceil(Math.max(50, Math.max(Math.abs(min), Math.abs(max)) * 1.15));
  return { min: -limit, max: limit };
}

/** Wertet eine gelesene PAM-Datei aus: Kennzahlen für den ganzen Kopf und je Schaft. */
export function analyzePamFile(parsed: ParsedPamFile, options: AnalyzeOptions = {}): AnalysisResult {
  const config = options.config ?? DEFAULT_CONFIG;
  const { header } = parsed;
  const detected = detectCoefficient(header.headType, header.toolType, config);

  let coefficient = detected.coefficient;
  let coefficientSource: CoefficientSource = detected.source;
  if (options.coefficient !== undefined) {
    if (!Number.isFinite(options.coefficient) || options.coefficient < 1 || options.coefficient > 1000) {
      throw new RangeError('Coefficient must be between 1 and 1000 µm.');
    }
    coefficient = options.coefficient;
    coefficientSource = 'manual';
  }

  // Punkte je Schaft in der Reihenfolge Winkel-Erstauftreten → Dateireihenfolge (wie im Alt-System),
  // damit Summen bitgenau übereinstimmen.
  const byShaft = new Map<number, Map<number, Measurement[]>>();
  for (const m of parsed.measurements) {
    let angles = byShaft.get(m.shaft);
    if (!angles) {
      angles = new Map();
      byShaft.set(m.shaft, angles);
    }
    let list = angles.get(m.angle);
    if (!list) {
      list = [];
      angles.set(m.angle, list);
    }
    list.push(m);
  }

  const shafts: ShaftResult[] = [...byShaft.keys()]
    .sort((a, b) => a - b)
    .map((shaft) => {
      const points = [...(byShaft.get(shaft)?.values() ?? [])].flat();
      return { shaft, label: shaftLabel(shaft), ...summarize(points, coefficient) };
    });

  const head = summarize(parsed.measurements, coefficient);
  const rated = shafts.filter((s) => s.cpkXY !== null);
  const pick = (better: (a: number, b: number) => boolean) =>
    rated.length < 2
      ? null
      : rated.reduce((best, s) => (better(s.cpkXY as number, best.cpkXY as number) ? s : best)).shaft;
  const expected = expectedComponents(header.headType, header.toolType, header.h08mVariant, config);

  return {
    algorithmVersion: ALGORITHM_VERSION,
    coefficient,
    detectedCoefficient: detected.coefficient,
    coefficientSource,
    expectedComponents: expected,
    measuredComponents: parsed.measurements.length,
    failedMeasurements: parsed.invalidLines.filter((l) => l.reason !== 'placeholder').length,
    componentStatus: componentStatus(parsed.measurements.length, expected, parsed.shaftCount),
    head,
    shafts,
    bestShaft: pick((a, b) => a > b),
    worstShaft: pick((a, b) => a < b),
    axisLimits: {
      x: axisLimits(head.x.min, head.x.max),
      y: axisLimits(head.y.min, head.y.max),
    },
  };
}
