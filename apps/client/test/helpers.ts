import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { InputFile } from '../src/lib/evaluate';
import { memoryStore, type Store } from '../src/lib/store';
import type { HttpRequest, HttpResponse, Platform } from '../src/platform/types';

const FIXTURES = fileURLToPath(new URL('../../../packages/core/test/fixtures/', import.meta.url));

export function fixture(family: 'nxt' | 'nxtr' | 'aimex', index = 0): InputFile {
  const dir = `${FIXTURES}${family}/`;
  const name = readdirSync(dir)
    .filter((f) => f.endsWith('.dat'))
    .sort()[index];
  if (!name) throw new Error(`No fixture ${family}#${index}`);
  return { name, path: dir + name, bytes: new Uint8Array(readFileSync(dir + name)), lastModified: 1_763_000_000_000 };
}

/** Platform for tests; `handler` plays the server. */
export function testPlatform(
  handler: (url: string, init: HttpRequest) => Promise<HttpResponse> = async () => ({ status: 0, text: 'offline' }),
  store: Store = memoryStore(),
): Platform & { setHandler(h: typeof handler): void } {
  let secret: string | null = null;
  let current = handler;
  return {
    kind: 'browser',
    formFactor: 'desktop',
    os: 'windows',
    version: '0.1.0-test',
    store,
    pickFiles: async () => [],
    onFiles: () => () => {},
    request: (url, init) => current(url, init),
    secret: {
      get: async () => secret,
      set: async (v) => {
        secret = v;
      },
      clear: async () => {
        secret = null;
      },
    },
    reveal: async () => false,
    dataLocation: async () => '/tmp',
    openDataLocation: async () => {},
    defaultDeviceName: async () => 'TEST-PC',
    updates: null,
    setHandler(h) {
      current = h;
    },
  };
}
