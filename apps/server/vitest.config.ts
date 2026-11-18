import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@pam/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) },
  },
  test: { testTimeout: 20000 },
});
