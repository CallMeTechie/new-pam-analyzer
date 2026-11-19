/** Maschinenfamilie, abgeleitet aus dem ersten Feld der Kopfzeile. */
export type MachineFamily = 'nxt' | 'nxtr' | 'aimex' | 'unknown';

/** Bestückwinkel, die in PAM-Dateien vorkommen. */
export type Angle = 0 | 90 | 180 | 270;

/**
 * Herkunft des Prüfdatums. Reihenfolge: Zeitstempel in der Kopfzeile, Änderungsdatum der Datei,
 * Upload-Zeitpunkt; ohne alle drei `unknown`.
 */
export type DateSource = 'header' | 'file_modified' | 'upload' | 'unknown';

export type H08mVariant = 'ceramic' | 'glass';

export interface PamHeader {
  machineFamily: MachineFamily;
  /** Erstes Feld der Kopfzeile, z. B. `M6`, `AIMEX`, `NXTR`. */
  machineModel: string;
  /** Maschinenkennung, z. B. `M6IIIXNo9001`. */
  machineNo: string;
  /** Kopftyp, z. B. `V12`, `H08M`, `RH28`, `DX`. */
  headType: string;
  headSerial: string;
  /** Werkzeugtyp bei DynaHead (DX), z. B. `R12`, `R4`, `S1`. */
  toolType: string | null;
  toolSerial: string | null;
  h08mVariant: H08mVariant | null;
  /** Woher die H08M-Variante stammt: Dateiname (HBCC/HBCG) oder Anzahl der Datenzeilen. */
  h08mVariantSource: 'filename' | 'data' | null;
  /** Prüfdatum als lokale Maschinenzeit `YYYY-MM-DD HH:mm:ss`. */
  testDate: string | null;
  dateSource: DateSource;
}

export interface Measurement {
  /** 1-basierte Schaft-/Holder-Nummer. */
  shaft: number;
  angle: Angle;
  /** Versatz X in µm. */
  x: number;
  /** Versatz Y in µm. */
  y: number;
  /** Winkelversatz in Grad. */
  q: number;
  /** Zeilennummer in der Originaldatei (1-basiert). */
  lineNumber: number;
}

/**
 * Grund, warum eine Datenzeile nicht ausgewertet wurde:
 * - `missing_measurement`: Zeile ohne X/Y/Q-Werte (keine Messung möglich)
 * - `malformed`: Zeile nicht lesbar
 * - `shaft_out_of_range`: Schaftnummer außerhalb 1 … 30
 * - `invalid_angle`: Winkel nicht 0/90/180/270
 * - `invalid_value`: Messwert nicht numerisch oder außerhalb des plausiblen Bereichs
 * - `placeholder`: Leere Platzhalterzeile ohne Bauteil (H08M Glas, Nr. 65–72); keine Fehlmessung
 */
export type InvalidLineReason =
  | 'missing_measurement'
  | 'malformed'
  | 'shaft_out_of_range'
  | 'invalid_angle'
  | 'invalid_value'
  | 'placeholder';

export interface InvalidLine {
  lineNumber: number;
  reason: InvalidLineReason;
  content: string;
}

export type ParseWarningCode =
  | 'header_not_tab_separated'
  | 'tool_inferred'
  | 'tool_missing'
  | 'continuation_line'
  | 'h08m_variant_mismatch';

/**
 * Hinweis zur Datei. Die Oberfläche übersetzt anhand von `code` (und `params`);
 * `message` ist englisch und nur für Protokolle und Entwickler gedacht.
 */
export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
  params?: Record<string, string | number>;
}

export interface ParsedPamFile {
  fileName: string;
  header: PamHeader;
  /** Anzahl Schäfte laut Kopf-/Werkzeugtyp; 0, wenn unbekannt. */
  shaftCount: number;
  measurements: Measurement[];
  invalidLines: InvalidLine[];
  warnings: ParseWarning[];
}

export interface ParseOptions {
  /** Änderungsdatum der Originaldatei (z. B. `File.lastModified` im Browser). */
  lastModified?: Date;
  /** Upload-Zeitpunkt; letzte Quelle für das Prüfdatum (nur auf dem Server bekannt). */
  uploadedAt?: Date;
  /** Zeitzone für die Umrechnung von `lastModified`/`uploadedAt` in lokale Zeit. Standard: Europe/Berlin. */
  timeZone?: string;
  /** Referenzzeitpunkt für Plausibilitätsprüfungen (Tests). Standard: jetzt. */
  now?: Date;
}

export interface CoefficientConfig {
  /** Cpk-Koeffizient (Toleranz ±µm) je Kopftyp. */
  cpkCoefficients: Record<string, number>;
  /** Cpk-Koeffizient je DynaHead-Werkzeug. */
  dynaheadTools: Record<string, number>;
  /** Erwartete Anzahl Bauteile je Kopftyp. */
  placementCounts: Record<string, number | 'tool_dependent' | null>;
  /** Erwartete Anzahl Bauteile je DynaHead-Werkzeug. */
  dynaheadToolPlacements: Record<string, number>;
  defaultCoefficient: number;
}

export interface AxisStatistics {
  mean: number;
  /** Dreifache Stichproben-Standardabweichung (n−1). */
  sigma3: number;
  min: number | null;
  max: number | null;
}

/**
 * Einheitliche Bewertung eines Cpk-Werts:
 * `critical` < 1,00 ≤ `warning` < 1,33 ≤ `good` < 1,67 ≤ `excellent`.
 */
export type CpkRating = 'critical' | 'warning' | 'good' | 'excellent';

/**
 * Vollständigkeit eines PAM-Laufs:
 * `complete`: höchstens so viele Bauteile fehlen, wie der Kopf Schäfte hat;
 * `warning`: mindestens 95 % vorhanden; `incomplete`: weniger; `unknown`: Sollwert unbekannt.
 */
export type ComponentStatus = 'complete' | 'warning' | 'incomplete' | 'unknown';

export interface CapabilityAxisStatistics extends AxisStatistics {
  /** `null`, wenn 3σ = 0 oder Koeffizient = 0. */
  cp: number | null;
  cpk: number | null;
  rating: CpkRating | null;
}

export interface StatisticsSummary {
  count: number;
  x: CapabilityAxisStatistics;
  y: CapabilityAxisStatistics;
  q: AxisStatistics;
  /** Kleinerer Wert aus Cpk X und Cpk Y. */
  cpkXY: number | null;
  /** Bewertung von Cpk XY. */
  rating: CpkRating | null;
}

export interface ShaftResult extends StatisticsSummary {
  shaft: number;
  /** Holder-Bezeichnung A … Z, AA … AD. */
  label: string;
}

export type CoefficientSource = 'config' | 'default' | 'manual';

export interface AxisLimits {
  min: number;
  max: number;
}

export interface AnalysisResult {
  algorithmVersion: string;
  coefficient: number;
  detectedCoefficient: number;
  coefficientSource: CoefficientSource;
  expectedComponents: number | null;
  measuredComponents: number;
  /** Nicht auswertbare Datenzeilen ohne Platzhalter, also echte Fehlmessungen bzw. Datenfehler. */
  failedMeasurements: number;
  componentStatus: ComponentStatus;
  head: StatisticsSummary;
  shafts: ShaftResult[];
  /** Schaft mit dem höchsten bzw. niedrigsten Cpk XY; `null` bei weniger als zwei bewerteten Schäften. */
  bestShaft: number | null;
  worstShaft: number | null;
  axisLimits: { x: AxisLimits; y: AxisLimits };
}

/** Untergrenzen der Bewertungsstufen „Warnung“, „gut“ und „sehr gut“; darunter „kritisch“. */
export interface CpkThresholds {
  warning: number;
  good: number;
  excellent: number;
}

export interface AnalyzeOptions {
  /** Bewertungsgrenzen; Standard {@link CPK_THRESHOLDS}. */
  thresholds?: CpkThresholds;
  /** Manuell gesetzter Koeffizient (1–1000 µm); überschreibt die automatische Erkennung. */
  coefficient?: number;
  config?: CoefficientConfig;
}
