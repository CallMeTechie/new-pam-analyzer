import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/**
 * The app reuses the pages and components of the web interface (`@web`) and the calculation core.
 * Tauri loads the built files from `dist`.
 */
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(process.env.PAM_APP_VERSION ?? version) },
  resolve: {
    alias: {
      '@pam/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@web': fileURLToPath(new URL('../web/src', import.meta.url)),
    },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: 'dist', target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
