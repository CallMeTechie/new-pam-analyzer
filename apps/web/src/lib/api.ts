import type { AnalysisResult, CoefficientConfig, InvalidLine, Measurement, PamHeader, ParseWarning } from '@pam/core';

export type Role = 'admin' | 'companyAdmin' | 'user';
export type Rating = 'critical' | 'warning' | 'good' | 'excellent';
export type Family = 'nxt' | 'nxtr' | 'aimex' | 'unknown';

export interface Profile {
  id: number;
  email: string;
  name: string;
  role: Role;
  locale: string;
  mustChangePassword: boolean;
  company: { id: number; name: string; isService: boolean };
}

export interface ResultRow {
  id: number;
  companyId: number | null;
  companyName: string | null;
  machineNo: string;
  machineFamily: Family;
  line: string | null;
  headType: string;
  headSerial: string;
  toolType: string | null;
  toolSerial: string | null;
  h08mVariant: string | null;
  testDate: string;
  dateSource: 'header' | 'file_modified' | 'upload' | 'unknown';
  cpkX: number | null;
  cpkY: number | null;
  cpkXY: number | null;
  rating: Rating | null;
  measured: number;
  expected: number | null;
  failed: number;
  componentStatus: string;
  warnings: number;
  fileName: string;
  source: 'web' | 'app';
  createdAt: string;
}

export interface ResultDetail {
  result: {
    id: number;
    companyId: number | null;
    companyName: string | null;
    line: string | null;
    fileName: string;
    fileSize: number;
    testDate: string;
    dateSource: ResultRow['dateSource'];
    source: ResultRow['source'];
    createdAt: string;
    configVersion: string;
  };
  header: PamHeader;
  shaftCount: number;
  warnings: ParseWarning[];
  invalidLines: InvalidLine[];
  measurements: Measurement[];
  analysis: AnalysisResult;
  config: CoefficientConfig;
}

export interface Company {
  id: number;
  name: string;
  number: string | null;
  location: string | null;
  notes: string | null;
  isService: boolean;
  disabled: boolean;
  createdAt: string;
  users: number;
  apiKeys: number;
  machines: number;
  results: number;
  lastResultAt: string | null;
}

export interface Machine {
  id: number;
  machineNo: string;
  family: Family;
  model: string | null;
  line: string | null;
  results: number;
  lastResultAt: string | null;
  heads: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  locale: string;
  companyId: number;
  companyName: string;
  disabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  devices: number;
}

export interface Device {
  id: number;
  name: string;
  platform: string;
  appVersion: string | null;
  userId: number;
  userName: string;
  uploadCount: number;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: number;
  companyId: number;
  companyName: string;
  name: string;
  prefix: string;
  maxConnections: number;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  devices: Device[];
}

export interface Dashboard {
  period: { days: number; since: string };
  totals: { results: number; heads: number; machines: number; inPeriod: number; companies?: number };
  perDay: { day: string; results: number; critical: number }[];
  ratings: Partial<Record<Rating | 'none', number>>;
  latest: ResultRow[];
}

export interface IngestOutcome {
  fileName: string;
  status: 'created' | 'duplicate' | 'rejected';
  resultId?: number;
  reason?: string;
  machineNo?: string;
  headType?: string;
  headSerial?: string;
  cpkXY?: number | null;
  rating?: Rating | null;
  testDate?: string | null;
  dateSource?: string;
  failed?: number;
  warnings?: string[];
}

export interface UploadResponse {
  summary: { created: number; duplicate: number; rejected: number; skipped: number };
  results: IngestOutcome[];
  skipped: { name: string; reason: string }[];
}

/** Error with the server's language-neutral code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Called when a request answers 401, e.g. because the session expired. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'network_error', 'The server cannot be reached.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, 'internal_error', 'Unexpected response.');
  }
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && path !== '/auth/login') for (const l of unauthorizedListeners) l();
    throw new ApiError(res.status, error?.code ?? 'internal_error', error?.message ?? res.statusText, error?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

/** Query string from an object; empty values are left out. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Upload with progress (fetch has no upload progress). */
export function uploadFiles(form: FormData, onProgress: (fraction: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: (UploadResponse & { error?: { code?: string; message?: string } }) | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // handled below
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data as UploadResponse);
      else
        reject(
          new ApiError(xhr.status, data?.error?.code ?? 'internal_error', data?.error?.message ?? 'Upload failed.'),
        );
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'The server cannot be reached.'));
    xhr.send(form);
  });
}
