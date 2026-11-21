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

/** Clicks the drop area and chooses files; skips the customer question unless `keep` is set. */
async function open(page: Page, files: string[], keep = false) {
  // Earlier messages may still be shown; only the one of this import counts.
  for (const close of await page.locator('.toast-close').all()) await close.click();
  await expect(page.locator('.toast')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('dropzone').click();
  await (await chooser).setFiles(files);
  const toast = page.locator('.toast:not(.toast-progress)').last();
  await expect(toast).toBeVisible();
  if (keep || !/new result/.test((await toast.textContent()) ?? '')) return;
  await page.getByRole('dialog', { name: 'Customer and test date' }).getByRole('button', { name: 'Skip' }).click();
}

test('evaluates files offline: overview, toast, grouping, head history, result', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Nothing evaluated this week yet')).toBeVisible();
  await expect(page.getByTestId('connection')).toContainText('Not connected');
  await expect(page.locator('.sidebar .brand')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open files' })).toHaveCount(0);

  await open(page, [fixture('aimex', 2), fixture('aimex', 10), fixture('nxtr', 4)], true);
  const dialog = page.getByRole('dialog', { name: 'Customer and test date' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Applies to all 3 new results.')).toBeVisible();
  await dialog.getByLabel('Customer').fill('Sample Works');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast', { hasText: '3 new results' })).toBeVisible();
  // This week's results on the overview.
  await expect(page.locator('a.result-row')).toHaveCount(3);
  await expect(page.locator('a.result-row').first()).toContainText('Sample Works');
  await expect(page.locator('.upchip')).toHaveCount(0);

  // A duplicate: the toast says so; no new question.
  await open(page, [fixture('aimex', 2)]);
  await expect(page.locator('.toast', { hasText: '1 file was already there' })).toBeVisible();

  await page.getByRole('link', { name: 'Results', exact: false }).first().click();
  // Two measurements of the same head are shown once.
  await expect(page.locator('a.result-row')).toHaveCount(2);
  await expect(page.getByText('2 measurements')).toBeVisible();
  await page.getByRole('radio', { name: 'By customer' }).click();
  await expect(page.locator('.group-h').first()).toContainText('Sample Works');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('.group-h')).toHaveCount(0);
  await page.getByRole('searchbox').fill('sample');
  await expect(page.locator('a.result-row')).toHaveCount(2);
  await page.getByRole('searchbox').fill('');

  // Several measurements: the head history opens first, newest on top.
  await page.locator('a.result-row', { hasText: '2 measurements' }).click();
  await expect(page.getByText('2 tests')).toBeVisible();
  await page.locator('.rows a.result-row').first().click();
  await expect(page.getByText('Head Cpk XY')).toBeVisible();
  await expect(page.locator('.hero h2')).toHaveText(/ · S\/N \d+$/);
  await expect(page.locator('.hcard').first()).toBeVisible();
  await expect(page.getByText(/evaluated /)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('2 tests')).toBeVisible();
});

test('customer and date can be changed on the result, with suggestions', async ({ page }) => {
  await page.goto('/');
  await open(page, [fixture('nxt', 0)], true);
  const dialog = page.getByRole('dialog', { name: 'Customer and test date' });
  await dialog.getByLabel('Customer').fill('Example Automotive');
  await dialog.getByText('Today', { exact: false }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/#\/results\/\d+/);
  await expect(page.locator('.hero')).toContainText('Example Automotive');
  await expect(page.locator('.hero')).toContainText('set by hand');

  await page.getByRole('link', { name: 'Overview' }).click();
  await open(page, [fixture('nxt', 1)], true);
  await dialog.getByLabel('Customer').fill('exa');
  await expect(dialog.getByRole('option', { name: 'Example Automotive' })).toBeVisible();
  await dialog.getByRole('option', { name: 'Example Automotive' }).click();
  await expect(dialog.getByLabel('Customer')).toHaveValue('Example Automotive');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  await page.getByRole('button', { name: 'Customer & date' }).click();
  await expect(dialog.getByLabel('Customer')).toHaveValue('Example Automotive');
  await dialog.getByLabel('Customer').fill('Demo Boards');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.hero')).toContainText('Demo Boards');
});

test('wide window: the result slides in beside the list', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await open(page, [fixture('aimex', 2), fixture('nxt', 0)]);
  await page.getByRole('link', { name: 'Results', exact: false }).first().click();
  await page.locator('a.result-row').first().click();
  await expect(page.locator('.split.panel .split-detail .hero')).toBeVisible();
  await expect(page.locator('.split-list a.result-row.selected')).toHaveCount(1);
  const box = await page.locator('.split-detail').boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(800);
  // Three holders side by side.
  const tops = await page
    .locator('.split-detail .holders .hcard')
    .evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[2]);
  expect(tops[3]).toBeGreaterThan(tops[0] ?? 0);
  await page.getByRole('button', { name: 'Show as full page' }).click();
  await expect(page.locator('.split.panel')).toHaveCount(0);
  await expect(page.locator('.hero')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.page-close').click();
  await expect(page.locator('.split.panel')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/results$/);

  // Narrow window: a page of its own.
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.locator('a.result-row').first().click();
  await expect(page.locator('.split.panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
});

test('dark mode', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(16, 19, 24)');
  await page.getByText('Light', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE',
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
  const state = { online: true, uploads: 0 };
  await mockServer(page, state);

  await page.getByTestId('connection').click();
  await expect(page.getByRole('tab', { name: 'Server' })).toHaveAttribute('aria-selected', 'true');
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
  await page.getByRole('link', { name: 'Overview' }).click();
  await open(page, [fixture('nxt', 1)]);
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.locator('.upchip', { hasText: 'Waiting for upload' })).toHaveCount(1);
  await expect(page.getByTestId('connection')).toContainText('Offline · 1 waiting');

  state.online = true;
  await page.getByTestId('connection').click();
  await page.getByRole('button', { name: 'Upload now' }).click();
  await expect(page.getByText('All files are uploaded.')).toBeVisible();
  expect(state.uploads).toBe(2);

  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Really disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
});

test.describe('touch layout (Android)', () => {
  test('phone: bottom navigation, tap area, result tabs, holder zoom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mobile');
    const nav = page.locator('.bottom-nav');
    await expect(nav).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.getByTestId('dropzone')).toContainText('Tap to choose PAM files');

    await open(page, [fixture('nxtr', 4)]);
    await expect(page).toHaveURL(/#\/results\/\d+/);

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
    await open(page, [fixture('aimex', 2), fixture('nxt', 0)]);
    await page.locator('.rail-nav').getByRole('link', { name: 'Results' }).click();
    await expect(page.getByText('Choose a result from the list.')).toBeVisible();
    await page.locator('a.result-row').first().click();
    await expect(page.locator('.split-list a.result-row.selected')).toHaveCount(1);
    await expect(page.locator('.split-detail .hero')).toBeVisible();
    await expect(page.locator('.split-list a.result-row')).toHaveCount(2);
  });
});
