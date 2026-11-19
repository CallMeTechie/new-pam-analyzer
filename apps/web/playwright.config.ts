import { defineConfig, devices } from '@playwright/test';

const PORT = 3210;

/** End-to-end tests against the built server and web UI with a fresh database. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'en-US', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'rm -rf .e2e-data && node ../server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: '.e2e-data',
      WEB_DIR: 'dist',
      ADMIN_EMAIL: 'admin@e2e.test',
      ADMIN_PASSWORD: 'initial-admin-pass',
    },
  },
});
