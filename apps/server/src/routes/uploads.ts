import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { countDeviceUploads } from '../auth/apiKeys.js';
import { readScope, requireAuth } from '../auth/middleware.js';
import { companies } from '../db/schema.js';
import { type AppEnv, HttpError, notFound } from '../http.js';
import { expandUpload, MAX_FILES, type SkippedFile, type UploadFile } from '../services/archive.js';
import { type IngestOutcome, ingestFile } from '../services/ingest.js';
import { getCoefficientConfig } from '../services/settings.js';

export const uploadRoutes = new Hono<AppEnv>();

/**
 * Upload of `.dat` files and ZIP archives as `multipart/form-data`:
 * - `files`: one or more files,
 * - `lastModified`: optional, per file in the same order, milliseconds since 1970 (`File.lastModified`),
 * - `companyId`: only for service staff; without it the result stays unassigned.
 */
uploadRoutes.post(
  '/',
  async (c, next) =>
    bodyLimit({
      maxSize: c.get('config').maxUploadBytes,
      onError: () => {
        throw new HttpError(413, 'upload_too_large', 'The upload is too large.');
      },
    })(c, next),
  async (c) => {
    const auth = requireAuth(c);
    const config = c.get('config');
    const db = c.get('db');
    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody({ all: true });
    } catch {
      throw new HttpError(400, 'invalid_request', 'Expected multipart/form-data.');
    }
    const list = <T>(value: T | T[] | undefined): T[] =>
      value === undefined ? [] : Array.isArray(value) ? value : [value];
    const files = list(form.files).filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new HttpError(400, 'no_files', 'No files were uploaded.');
    const modified = list(form.lastModified).map((v) => (typeof v === 'string' ? Number(v) : Number.NaN));

    const requested = typeof form.companyId === 'string' && form.companyId ? Number(form.companyId) : null;
    const companyId = readScope(auth, requested);
    if (
      companyId !== null &&
      !db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get()
    ) {
      throw notFound('Company');
    }

    const expanded: UploadFile[] = [];
    const skipped: SkippedFile[] = [];
    for (const [i, file] of files.entries()) {
      const ms = modified[i] ?? Number.NaN;
      const upload: UploadFile = {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        ...(Number.isFinite(ms) && ms > 0 ? { lastModified: new Date(ms) } : {}),
      };
      const result = expandUpload(upload, { maxFileBytes: config.maxFileBytes, timeZone: config.timeZone });
      expanded.push(...result.files);
      skipped.push(...result.skipped);
    }
    if (expanded.length > MAX_FILES) {
      skipped.push({ name: `${expanded.length - MAX_FILES} files`, reason: 'too_many_files' });
      expanded.length = MAX_FILES;
    }

    const ctx = {
      source: auth.kind === 'device' ? ('app' as const) : ('web' as const),
      config: getCoefficientConfig(db),
      maxFileBytes: config.maxFileBytes,
      timeZone: config.timeZone,
      companyId,
      userId: auth.user.id,
      deviceId: auth.kind === 'device' ? auth.device.id : null,
      uploadedAt: new Date(),
    };
    const results: IngestOutcome[] = expanded.map((file) => ingestFile(db, file, ctx));
    const created = results.filter((r) => r.status === 'created').length;
    if (auth.kind === 'device') countDeviceUploads(db, auth.device.id, created);

    return c.json({
      summary: {
        created,
        duplicate: results.filter((r) => r.status === 'duplicate').length,
        rejected: results.filter((r) => r.status === 'rejected').length,
        skipped: skipped.length,
      },
      results,
      skipped,
    });
  },
);
