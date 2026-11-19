import { describe, expect, it } from 'vitest';
import { uploadBody } from '../src/lib/multipart';

describe('uploadBody', () => {
  it('is read back as files and lastModified', async () => {
    const enc = new TextEncoder();
    const { body, contentType } = uploadBody([
      { name: 'a.dat', bytes: enc.encode('one'), lastModified: 1000 },
      { name: 'b "x".dat', bytes: enc.encode('two'), lastModified: null },
    ]);
    const form = await new Response(body as BodyInit, { headers: { 'content-type': contentType } }).formData();
    const files = form.getAll('files') as File[];
    expect(files.map((f) => f.name)).toEqual(['a.dat', 'b _x_.dat']);
    expect(await files[0]?.text()).toBe('one');
    expect(form.getAll('lastModified')).toEqual(['1000', '']);
  });
});
