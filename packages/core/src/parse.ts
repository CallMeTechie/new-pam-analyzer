import type {
  Angle,
  DateSource,
  H08mVariant,
  InvalidLine,
  MachineFamily,
  Measurement,
  PamHeader,
  ParsedPamFile,
  ParseOptions,
  ParseWarning,
} from './types.js';

/**
 * Fehler beim Lesen einer Datei. `code` ist sprachneutral; die Oberfläche übersetzt ihn.
 * `message` ist englisch und nur für Protokolle gedacht.
 */
export class PamParseError extends Error {
  constructor(
    readonly code: 'empty_file',
    message: string,
  ) {
    super(message);
    this.name = 'PamParseError';
  }
}

/** Höchste unterstützte Schaftnummer (RH28 plus Reserve). */
export const MAX_SHAFT = 30;
const VALID_ANGLES = new Set(['0', '90', '180', '270']);
const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const MIN_DATE = Date.UTC(2000, 0, 1);

/** Erste Zahl in einer Typbezeichnung, z. B. `V12` → 12, `RH28` → 28, `OF` → 0. */
export function shaftCountFromType(type: string | null): number {
  const match = type?.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** DynaHead-Werkzeugkennung (R12, R4, S1 …) aus einem Werkzeugtyp. */
export function dynaheadToolKey(toolType: string | null): string | null {
  const match = toolType?.match(/[RS]\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function machineFamilyOf(model: string): MachineFamily {
  const upper = model.toUpperCase();
  if (upper === 'NXTR') return 'nxtr';
  if (upper === 'AIMEX') return 'aimex';
  if (/^M\d/.test(upper) || upper === 'NXT') return 'nxt';
  return 'unknown';
}

/** H08M mit Glas-Bauteilen: 136 Datenzeilen, davon 128 Bauteile und 8 leere Platzhalter (Nr. 65–72). */
export const H08M_GLASS_ROWS = 136;
/** H08M mit Keramik-Bauteilen: 256 Datenzeilen, alle mit Bauteil. */
export const H08M_CERAMIC_ROWS = 256;
const H08M_GLASS_PLACEHOLDERS = { first: 65, last: 72 };

function isH08m(headType: string): boolean {
  return headType === 'H08M' || headType === 'H08MQ';
}

function h08mVariantFromFileName(fileName: string): H08mVariant | null {
  const upper = fileName.toUpperCase();
  if (upper.includes('HBCC')) return 'ceramic';
  if (upper.includes('HBCG')) return 'glass';
  return null;
}

function h08mVariantFromRowCount(rows: number): H08mVariant | null {
  if (rows === H08M_CERAMIC_ROWS) return 'ceramic';
  if (rows === H08M_GLASS_ROWS || rows === 128) return 'glass';
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidCalendarDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): boolean {
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  );
}

/** NXT-R schreibt einen 14-stelligen Zeitstempel `YYYYMMDDhhmmss` ans Ende der Kopfzeile. */
function dateFromHeader(lastField: string | undefined, now: Date): string | null {
  const m = lastField?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (!isValidCalendarDate(y, mo, d, h, mi, s)) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const oneYearAhead = Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate());
  if (asUtc < MIN_DATE || asUtc > oneYearAhead) return null;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

function dateFromLastModified(lastModified: Date | undefined, timeZone: string, now: Date): string | null {
  if (!lastModified) return null;
  const t = lastModified.getTime();
  if (Number.isNaN(t) || t <= MIN_DATE || t > now.getTime()) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(lastModified);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function dateFromFileName(fileName: string): string | null {
  const m =
    fileName.match(/(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/) ??
    fileName.match(/(20\d{2})[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} 00:00:00`;
}

interface LogicalLine {
  lineNumber: number;
  text: string;
}

/**
 * Zerlegt den Dateiinhalt in logische Zeilen. Zeilen, die mit Leerraum beginnen, gelten wie im
 * alten System als Fortsetzung der vorherigen Zeile. Leere Zeilen werden übersprungen.
 */
function logicalLines(content: string, warnings: ParseWarning[]): LogicalLine[] {
  const physical = content.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const result: LogicalLine[] = [];
  let continuations = 0;
  physical.forEach((text, index) => {
    if (text.trim() === '') return;
    const previous = result.at(-1);
    if (/^\s/.test(text) && previous) {
      previous.text += ` ${text.trim()}`;
      continuations++;
      return;
    }
    result.push({ lineNumber: index + 1, text });
  });
  if (continuations > 0) {
    warnings.push({
      code: 'continuation_line',
      message: `${continuations} line(s) were read as a continuation of the previous line.`,
      params: { count: continuations },
    });
  }
  return result;
}

interface RawRow {
  lineNumber: number;
  content: string;
  shaftIndex: number;
  angle: string;
  x: string;
  y: string;
  q: string;
}

function parseHeader(
  line: string,
  warnings: ParseWarning[],
): Omit<PamHeader, 'testDate' | 'dateSource' | 'h08mVariant' | 'h08mVariantSource'> & {
  lastField: string | undefined;
} {
  const tabSeparated = line.includes('\t');
  // Tab-getrennt, leere Felder bleiben erhalten. NXT und AIMEX haben dadurch identische Positionen.
  const fields = tabSeparated ? line.split('\t').map((f) => f.trim()) : line.trim().split(/\s+/);
  if (!tabSeparated) {
    warnings.push({
      code: 'header_not_tab_separated',
      message: 'The header line is not tab-separated; field positions may differ.',
    });
  }
  const machineModel = fields[0] ?? '';
  const headType = fields[2] || 'Unknown';
  let toolType: string | null = null;
  let toolSerial: string | null = null;
  if (headType === 'DX') {
    // Alt-System (whitespace-getrennt) las Feld 12/13; mit erhaltenen Leerfeldern sind es 14/15.
    const toolIndex = tabSeparated ? 14 : 12;
    toolType = fields[toolIndex] || null;
    const serial = fields[toolIndex + 1] || null;
    toolSerial = serial && !/^0+$/.test(serial) ? serial : null;
  }
  const nonEmpty = fields.filter((f) => f !== '');
  return {
    machineFamily: machineFamilyOf(machineModel),
    machineModel,
    machineNo: fields[1] ?? '',
    headType,
    headSerial: fields[3] ?? '',
    toolType,
    toolSerial,
    lastField: nonEmpty.at(-1),
  };
}

/**
 * Liest eine PAM-Ergebnisdatei (`.dat`) von NXT, NXT-R oder AIMEX.
 *
 * Datenzeilen: `Nr  Schaft(0-basiert)  ?  Winkel  X  Y  Q  [weitere Spalten]`.
 */
export function parsePamFile(content: string, fileName: string, options: ParseOptions = {}): ParsedPamFile {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? 'Europe/Berlin';
  const warnings: ParseWarning[] = [];
  const invalidLines: InvalidLine[] = [];
  const lines = logicalLines(content, warnings);
  const headerLine = lines.shift();
  if (!headerLine) {
    throw new PamParseError('empty_file', 'The file is empty.');
  }

  const { lastField, ...headerBase } = parseHeader(headerLine.text, warnings);

  let testDate = dateFromHeader(lastField, now);
  let dateSource: DateSource = testDate ? 'header' : 'unknown';
  if (!testDate) {
    testDate = dateFromLastModified(options.lastModified, timeZone, now);
    if (testDate) dateSource = 'file_modified';
  }
  if (!testDate) {
    testDate = dateFromFileName(fileName);
    if (testDate) dateSource = 'filename';
  }

  // H08M: Variante bevorzugt aus dem Dateinamen (HBCC/HBCG), sonst aus der Anzahl Datenzeilen.
  let h08mVariant: H08mVariant | null = null;
  let h08mVariantSource: PamHeader['h08mVariantSource'] = null;
  const glassLayout = isH08m(headerBase.headType) && lines.length === H08M_GLASS_ROWS;
  if (isH08m(headerBase.headType)) {
    const fromName = h08mVariantFromFileName(fileName);
    const fromData = h08mVariantFromRowCount(lines.length);
    if (fromName) {
      h08mVariant = fromName;
      h08mVariantSource = 'filename';
      if (fromData && fromData !== fromName) {
        warnings.push({
          code: 'h08m_variant_mismatch',
          message: `File name indicates ${fromName}, but the number of data lines (${lines.length}) indicates ${fromData}.`,
          params: { fromFileName: fromName, fromData, dataLines: lines.length },
        });
      }
    } else if (fromData) {
      h08mVariant = fromData;
      h08mVariantSource = 'data';
    }
  }

  const rows: RawRow[] = [];
  for (const { lineNumber, text } of lines) {
    const columns = text.trim().replace(/\}+$/, '').trim().split(/\s+/);
    if (columns.length < 7) {
      const sequence = Number.parseInt(columns[0] as string, 10);
      const placeholder =
        glassLayout && sequence >= H08M_GLASS_PLACEHOLDERS.first && sequence <= H08M_GLASS_PLACEHOLDERS.last;
      invalidLines.push({
        lineNumber,
        reason: placeholder ? 'placeholder' : columns.length >= 4 ? 'missing_measurement' : 'malformed',
        content: text,
      });
      continue;
    }
    const shaftIndex = Number.parseInt(columns[1] as string, 10);
    if (Number.isNaN(shaftIndex)) {
      invalidLines.push({ lineNumber, reason: 'malformed', content: text });
      continue;
    }
    rows.push({
      lineNumber,
      content: text,
      shaftIndex,
      angle: columns[3] as string,
      x: columns[4] as string,
      y: columns[5] as string,
      q: columns[6] as string,
    });
  }

  const header: PamHeader = { ...headerBase, h08mVariant, h08mVariantSource, testDate, dateSource };

  // DX-Köpfe ohne Werkzeugangabe: Liegen alle Messungen auf einem Schaft, handelt es sich um ein S1-Werkzeug.
  if (header.headType === 'DX' && !header.toolType) {
    const shaftIndexes = new Set(rows.map((r) => r.shaftIndex));
    if (rows.length > 0 && shaftIndexes.size === 1) {
      header.toolType = 'S1';
      warnings.push({
        code: 'tool_inferred',
        message: 'No tool in the header line; S1 was derived from the data (single holder).',
        params: { tool: 'S1' },
      });
    } else {
      warnings.push({ code: 'tool_missing', message: 'DX head without tool information in the header line.' });
    }
  }

  const shaftCount = shaftCountFromType(header.headType === 'DX' ? header.toolType : header.headType);

  const measurements: Measurement[] = [];
  for (const row of rows) {
    const shaft = shaftCount === 1 ? 1 : row.shaftIndex + 1;
    if (shaft < 1 || shaft > MAX_SHAFT) {
      invalidLines.push({ lineNumber: row.lineNumber, reason: 'shaft_out_of_range', content: row.content });
      continue;
    }
    if (!VALID_ANGLES.has(row.angle)) {
      invalidLines.push({ lineNumber: row.lineNumber, reason: 'invalid_angle', content: row.content });
      continue;
    }
    const x = toNumber(row.x, 10000);
    const y = toNumber(row.y, 10000);
    const q = toNumber(row.q, 360);
    if (x === null || y === null || q === null) {
      invalidLines.push({ lineNumber: row.lineNumber, reason: 'invalid_value', content: row.content });
      continue;
    }
    measurements.push({ shaft, angle: Number(row.angle) as Angle, x, y, q, lineNumber: row.lineNumber });
  }

  invalidLines.sort((a, b) => a.lineNumber - b.lineNumber);
  return { fileName, header, shaftCount, measurements, invalidLines, warnings };
}

function toNumber(value: string, limit: number): number | null {
  if (!NUMERIC.test(value)) return null;
  const n = Number(value);
  return n < -limit || n > limit ? null : n;
}
