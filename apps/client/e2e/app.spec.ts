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

test.describe('touch layout (Android)', () => {
  test('phone: bottom navigation, open button, result tabs, holder zoom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mobile');
    const nav = page.locator('.bottom-nav');
    await expect(nav).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.getByTestId('dropzone')).toHaveCount(0);

    const chooser = page.waitForEvent('filechooser');
    await page.locator('.btn.fab').click();
    await (await chooser).setFiles([fixture('nxtr', 4)]);
    await expect(page).toHaveURL(/#\/results\/\d+$/);

    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Head', exact: true })).toBeVisible();
    await expect(page.locator('.hcard').first()).toBeHidden();
    await page.getByRole('tab', { name: 'Holders' }).click();
    await expect(page.getByRole('heading', { name: 'Head', exact: true })).toBeHidden();
    const first = page.locator('.hcard').first();
    await expect(first).toBeVisible();
    // Two holders per row on a phone.
    const [a, b] = await page
      .locator('.holders .hcard')
      .evaluateAll((els) => els.slice(0, 2).map((e) => e.getBoundingClientRect().top));
    expect(a).toBe(b);
    await first.click();
    await expect(page.getByRole('dialog', { name: 'Holder A' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('tablet: list next to the result', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/?mobile');
    await expect(page.locator('.rail-nav')).toBeVisible();
    await expect(page.getByText('Choose a result from the list.')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open files' }).click();
    await (await chooser).setFiles([fixture('aimex', 2), fixture('nxt', 0)]);
    await page.locator('a.result-row').first().click();
    await expect(page.locator('.split-list a.result-row.selected')).toHaveCount(1);
    await expect(page.locator('.split-detail .hero')).toBeVisible();
    await expect(page.locator('.split-list a.result-row')).toHaveCount(2);
  });
});
