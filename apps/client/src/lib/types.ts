import type { CoefficientConfig, CpkThresholds } from '@pam/core';
import type { Family, Rating, ResultRow } from '@web/lib/api';

/** Where the original file of a local result stands with respect to the server. */
export type UploadState = 'local' | 'queued' | 'uploaded' | 'rejected';

/** One evaluated PAM file on this PC; the original file is stored next to it. */
export interface LocalResult {
  id: number;
  sha256: string;
  fileName: string;
  /** Path the file was opened from; used for "Show in Explorer". */
  filePath: string | null;
  fileSize: number;
  /** Modification date of the original file (ms), so the file can be evaluated again identically. */
  fileModifiedAt: number | null;
  importedAt: number;

  machineNo: string;
  machineFamily: Family;
  headType: string;
  headSerial: string;
  toolType: string | null;
  toolSerial: string | null;
  h08mVariant: string | null;
  testDate: string;
  dateSource: ResultRow['dateSource'];
  cpkX: number | null;
  cpkY: number | null;
  cpkXY: number | null;
  rating: Rating | null;
  measured: number;
  expected: number | null;
  failed: number;
  componentStatus: string;
  warnings: number;

  /** Customer where the head was measured (entered after the import). */
  customer?: string | null;
  /** Customer or test date changed after the upload; sent to the server with the next sync. */
  metaDirty?: boolean;

  upload: UploadState;
  /** Language-neutral reason when the server rejected the file. */
  uploadError: string | null;
  uploadedAt: number | null;
  serverResultId: number | null;
}

/** Evaluation settings: from the server when connected, otherwise the defaults of the core. */
export interface EvalConfig {
  coefficients: CoefficientConfig;
  /** Version of the coefficients on the server (`default` or the time of the change). */
  version: string;
  thresholds: CpkThresholds;
  /** Time zone of the machines (from the server); `null` uses the zone of this PC. */
  timeZone: string | null;
  source: 'default' | 'server';
  fetchedAt: number | null;
}

export interface Connection {
  server: string;
  deviceName: string;
  userName: string;
  companyName: string;
  connectedAt: number;
  lastSyncAt: number | null;
}

export type Channel = 'stable' | 'beta';
export type Theme = 'system' | 'light' | 'dark';

/** How the test date of imported files is set (dialog after the import). */
export type DateChoice = { kind: 'file' } | { kind: 'today' } | { kind: 'date'; date: string };
