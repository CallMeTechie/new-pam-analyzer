import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Route, test } from '@playwright/test';

const FIXTURES = fileURLToPath(new URL('../../../packages/core/test/fixtures/', import.meta.url));
const fixture = (family: string, index: number) =>
  FIXTURES +
  family +
  '/' +
  readdirSync(FIXTURES + family)
    .filter((f) => f.endsWith('.dat'))
    .sort()[index];

async function open(page: Page, files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open files' }).click();
  await (await chooser).setFiles(files);
}

test('evaluates files offline: list, duplicates, result, holders, head history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No results on this PC yet')).toBeVisible();
  await expect(page.getByTestId('connection')).toContainText('Not connected');

  await open(page, [fixture('aimex', 2), fixture('aimex', 10), fixture('nxtr', 4)]);
  await expect(page.getByText('3 new results')).toBeVisible();
  await expect(page.locator('a.result-row')).toHaveCount(3);
  await expect(page.locator('.upchip')).toHaveCount(0);

  await open(page, [fixture('aimex', 2)]);
  await expect(page).toHaveURL(/#\/results\/\d+$/);
  await page.getByRole('link', { name: 'Results' }).click();
  await expect(page.getByText('1 file was already there')).toBeVisible();

  await page.getByRole('searchbox').fill('V12');
  await expect(page.locator('a.result-row')).toHaveCount(2);
  await page.locator('a.result-row').first().click();
  await expect(page.getByText('Head Cpk XY')).toBeVisible();
  await expect(page.locator('.hero h2')).toHaveText(/ · S\/N \d+$/);
  await expect(page.locator('.hcard').first()).toBeVisible();
  await expect(page.getByText(/evaluated /)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Original file' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Head history' }).click();
  await expect(page.getByText('2 tests')).toBeVisible();
});

test('settings: default values, update channel and German', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText('Updates are installed by the Windows app only.')).toBeVisible();
  await page.getByText('Beta', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /Beta/ })).toBeChecked();
  await page.getByRole('tab', { name: 'Rating' }).click();
  await expect(page.getByText(/Default values/)).toBeVisible();
  await expect(page.locator('.level')).toHaveCount(4);
  await page.getByRole('tab', { name: 'Version' }).click();
  await expect(page.getByRole('heading', { name: '0.1.0' })).toBeVisible();
  await page.locator('.footer .lang-switch select').selectOption('de');
  await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
});

/** Plays the server for the browser preview, including the CORS headers a browser needs. */
async function mockServer(page: Page, state: { online: boolean; uploads: number }) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, accept',
    'access-control-allow-methods': 'GET, POST, DELETE',
  };
  const config = {
    algorithmVersion: '1',
    timeZone: 'Europe/Berlin',
    cpkThresholds: { warning: 1, good: 1.33, excellent: 1.67 },
    coefficients: await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: test hook
      const engine = (window as any).__pamEngine;
      return { version: 'default', config: engine.snapshot.config.coefficients };
    }),
  };
  await page.route('https://pam.test/api/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (!state.online) return route.abort('connectionrefused');
    const path = new URL(req.url()).pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (path === '/api/app/connect') {
      const body = req.postDataJSON() as { password: string };
      if (body.password !== 'secret-password')
        return json(401, { error: { code: 'invalid_credentials', message: 'wrong' } });
      return json(201, {
        token: 'pamd_test',
        userName: 'Line Operator',
        companyName: 'Customer A',
        locale: 'en',
        ...config,
      });
    }
    if (path === '/api/app/config') return json(200, config);
    if (path === '/api/uploads') {
      const count = ((req.postData() ?? '').match(/name="files"/g) ?? []).length;
      state.uploads += count;
      return json(200, { results: Array.from({ length: count }, (_, i) => ({ status: 'created', resultId: i + 1 })) });
    }
    return json(404, { error: { code: 'not_found', message: 'nope' } });
  });
}

test('server: connect, upload the queue, collect files while offline', async ({ page }) => {
  await page.goto('/');
  await open(page, [fixture('nxt', 0)]);
  await page.getByRole('link', { name: 'Results' }).click();
  const state = { online: true, uploads: 0 };
  await mockServer(page, state);

  await page.getByRole('link', { name: 'Server' }).click();
  await page.getByLabel('Server address').fill('pam.test');
  await page.getByLabel('API key').fill('pam_abcdefghijklmnopqrstuvwxyz');
  await page.getByLabel('E-mail address').fill('operator@customer-a.test');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('E-mail address or password is wrong.')).toBeVisible();
  await page.getByLabel('Password').fill('secret-password');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Customer A').first()).toBeVisible();
  await expect(page.getByText('All files are uploaded.')).toBeVisible();
  expect(state.uploads).toBe(1);

  state.online = false;
  await page.getByRole('link', { name: 'Results' }).click();
  await open(page, [fixture('nxt', 1)]);
  await page.getByRole('link', { name: 'Results' }).click();
  await expect(page.locator('.upchip', { hasText: 'Waiting for upload' })).toHaveCount(1);
  await expect(page.getByTestId('connection')).toContainText('Offline · 1 waiting');

  state.online = true;
  await page.getByRole('link', { name: 'Server' }).click();
  await page.getByRole('button', { name: 'Upload now' }).click();
  await expect(page.getByText('All files are uploaded.')).toBeVisible();
  expect(state.uploads).toBe(2);

  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Really disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
});
