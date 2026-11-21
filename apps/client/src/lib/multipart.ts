/** `multipart/form-data` body for `POST /api/uploads`: `files` plus `lastModified` per file. */
export function uploadBody(
  files: {
    name: string;
    bytes: Uint8Array;
    lastModified: number | null;
    customer?: string | null;
    testDate?: string | null;
  }[],
  boundary = `----pam${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
): { body: Uint8Array; contentType: string } {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const safe = (name: string) => name.replace(/["\r\n\\]/g, '_');
  for (const f of files) {
    parts.push(
      enc.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${safe(f.name)}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      f.bytes,
      enc.encode('\r\n'),
    );
  }
  for (const f of files) {
    parts.push(
      enc.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="lastModified"\r\n\r\n${f.lastModified ?? ''}\r\n`,
      ),
    );
  }
  // Customer and test date per file, in the same order; empty values leave the server's default.
  for (const key of ['customer', 'testDate'] as const) {
    if (!files.some((f) => f[key])) continue;
    for (const f of files) {
      parts.push(
        enc.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${(f[key] ?? '').replace(/[\r\n]/g, ' ')}\r\n`,
        ),
      );
    }
  }
  parts.push(enc.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
