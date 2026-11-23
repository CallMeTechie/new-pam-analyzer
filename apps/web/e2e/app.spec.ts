import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const FIXTURES = fileURLToPath(new URL('../../../packages/core/test/fixtures/', import.meta.url));
const fixture = (family: string, index: number) =>
  FIXTURES +
  family +
  '/' +
  readdirSync(FIXTURES + family)
    .filter((f) => f.endsWith('.dat'))
    .sort()[index];

/** Default credentials of a new installation, and what the administrator changes them to. */
const DEFAULT = { email: 'admin@example.com', password: 'admin1234' };
const ADMIN = { email: 'it@plant.test', password: 'admin-password-e2e' };
let memberPassword = '';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function changePassword(page: Page, current: string, next: string, newEmail?: string) {
  await expect(page.getByText('Please choose your own password')).toBeVisible();
  if (newEmail) await page.getByLabel('Your e-mail address').fill(newEmail);
  await page.getByLabel('Current password').fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Repeat new password').fill(next);
  await page.getByRole('button', { name: 'Change password' }).click();
}

test.describe.configure({ mode: 'serial' });

test('administrator: first sign-in with default credentials, company, team and API key', async ({ page }) => {
  await signIn(page, DEFAULT.email, DEFAULT.password);
  await changePassword(page, DEFAULT.password, ADMIN.password, ADMIN.email);
  await expect(page.getByText('No results yet')).toBeVisible();
  await expect(page.locator('.footer')).toContainText('Made with');
  await expect(page.locator('.footer')).toContainText('CallMeTechie');

  await page.getByRole('link', { name: 'Companies' }).click();
  await page.getByRole('button', { name: 'Add company' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Customer A');
  await page.getByLabel('Location').fill('Plant 1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Customer A' })).toBeVisible();

  await page.getByRole('link', { name: 'Open company view' }).click();
  await expect(page.getByText('You are viewing Customer A exactly as its members see it.')).toBeVisible();
  await page.getByRole('link', { name: 'Team & API keys' }).click();
  await page.getByRole('button', { name: 'Invite member' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Line Operator');
  await page.getByLabel('E-mail address').fill('operator@customer-a.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Invite member' }).click();
  await expect(page.getByRole('dialog', { name: 'Member invited' })).toBeVisible();
  memberPassword = (await page.locator('.secret code').textContent()) ?? '';
  expect(memberPassword).toHaveLength(16);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('operator@customer-a.test')).toBeVisible();

  await page.getByRole('tab', { name: 'API keys' }).click();
  await page.getByLabel('Name of the new key').fill('Line 1 tablets');
  await page.getByLabel('Max. devices').fill('2');
  await page.getByRole('button', { name: 'Create API key' }).click();
  await expect(page.getByRole('dialog', { name: 'API key created' })).toBeVisible();
  await expect(page.locator('.secret code')).toHaveText(/^pam_[\w-]{43}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.key-card')).toContainText('0 / 2');

  await page.getByRole('link', { name: 'Back to admin view' }).click();
  await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible();
});

test('default credentials no longer work after the first sign-in', async ({ page }) => {
  await signIn(page, DEFAULT.email, DEFAULT.password);
  await expect(page.getByText('E-mail address or password is wrong.')).toBeVisible();
});

test('upload, results, search, detail and head history', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.getByRole('link', { name: 'Upload' }).first().click();
  await page.getByLabel('Company').selectOption({ label: 'Customer A' });
  // P1/P2 of the same AIMEX head plus one NXT file.
  await page
    .locator('input[type=file][accept=".dat,.zip"]')
    .setInputFiles([fixture('aimex', 2), fixture('aimex', 10), fixture('nxt', 0)]);
  await expect(page.getByText('3 files ready')).toBeVisible();
  await page.getByRole('button', { name: 'Upload and evaluate' }).click();
  await expect(page.getByText('3 new results')).toBeVisible();

  // Dashboard: the three latest uploads as cards, below them this and last calendar week.
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByTestId('latest-cards').locator('a')).toHaveCount(3);
  await expect(page.getByTestId('week-days').locator('span')).toHaveCount(7);
  await expect(page.getByTestId('week-this')).toContainText('This week');
  await expect(page.getByTestId('week-last')).toContainText('Last week');

  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page.locator('.pager').first()).toContainText(/^3 results\b/);
  // Grouped by test day by default; by customer and as a plain list on request.
  await expect(page.getByTestId('groups-date')).toBeVisible();
  await page.getByRole('radio', { name: 'By customer' }).click();
  await expect(page.getByTestId('groups-customer').locator('.group-h')).toContainText(['No customer']);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('.groups')).toHaveCount(0);
  await expect(page.locator('a.result-row')).toHaveCount(3);
  await page.getByRole('tab', { name: 'NXT', exact: true }).click();
  await expect(page.locator('.pager').first()).toContainText(/^1 result\b/);
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('searchbox').fill('V12 900018');
  await expect(page.locator('.pager').first()).toContainText(/^2 results\b/);

  await page.locator('a.result-row').first().click();
  await expect(page.getByText('Head Cpk XY')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Head', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Total', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increase coefficient' }).click();
  await expect(page.locator('#coef-sub')).toContainText('manual');

  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  // Printout: module type and serial number from the machine number, coefficient and components in the
  // result header, no notice or coefficient box, holders from page 2 with at most 12 per page.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hero h2')).toHaveText(/^\S+ · S\/N \d+$/);
  await expect(page.locator('.hero .fact', { hasText: 'Coefficient' })).toBeVisible();
  await expect(page.locator('.box-coef')).toBeHidden();
  const pages = page.locator('.print-holders');
  const holders = await page.locator('.print-holders .hcard').count();
  expect(holders).toBeGreaterThan(0);
  await expect(pages).toHaveCount(Math.ceil(holders / 12));
  await expect(pages.first().locator('.hcard')).toHaveCount(Math.min(holders, 12));
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Head history' }).click();
  await expect(page.getByText('2 tests')).toBeVisible();
  await expect(page.locator('.history-chart g.pt')).toHaveCount(2);
});

test('company member sees only the own company and can switch to German', async ({ page }) => {
  await signIn(page, 'operator@customer-a.test', memberPassword);
  await changePassword(page, memberPassword, 'operator-password-1');
  await expect(
    page.getByRole('heading', { name: 'Customer A' }).or(page.getByText('Latest PAM results of Customer A')),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Companies' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Team & API keys' })).toHaveCount(0);
  // Dashboard: the three latest uploads as cards, below them this and last calendar week.
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByTestId('latest-cards').locator('a')).toHaveCount(3);
  await expect(page.getByTestId('week-days').locator('span')).toHaveCount(7);
  await expect(page.getByTestId('week-this')).toContainText('This week');
  await expect(page.getByTestId('week-last')).toContainText('Last week');

  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page.locator('.pager').first()).toContainText(/^3 results\b/);
  // Grouped by test day by default; by customer and as a plain list on request.
  await expect(page.getByTestId('groups-date')).toBeVisible();
  await page.getByRole('radio', { name: 'By customer' }).click();
  await expect(page.getByTestId('groups-customer').locator('.group-h')).toContainText(['No customer']);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('.groups')).toHaveCount(0);
  await expect(page.locator('a.result-row')).toHaveCount(3);

  await page.getByLabel('Language').selectOption('de');
  await expect(page.getByRole('link', { name: 'Ergebnisse' })).toBeVisible();
  await expect(page.getByText('3 Ergebnisse')).toBeVisible();
  // The choice is stored in the profile.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ergebnisse' })).toBeVisible();
});

test('settings: rating thresholds, language import and manual', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await page.goto('/settings#rating');
  const warning = page.getByLabel(/warning\s*from/i);
  // Far above every real Cpk: all results become critical.
  await warning.fill('50');
  await page.getByLabel(/good\s*from/i).fill('60');
  await page.getByLabel(/excellent\s*from/i).fill('70');
  await page.getByRole('button', { name: 'Save and rate again' }).click();
  await expect(page.getByText('All results were rated again.')).toBeVisible();
  await page.goto('/results?rating=critical');
  await expect(page.locator('.pager').first()).toContainText(/^3 results\b/);

  await page.goto('/settings#languages');
  const file = {
    name: 'fr.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ code: 'fr', name: 'Français', messages: { 'nav.results': 'Résultats' } })),
  };
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText('Language file "Français" (fr)')).toBeVisible();
  await page.getByRole('button', { name: 'Add language' }).click();
  await expect(page.getByText('"Français" was imported.')).toBeVisible();
  await page.locator('.footer .lang-switch select').selectOption('fr');
  await expect(page.getByRole('link', { name: 'Résultats' })).toBeVisible();
  await page.locator('.footer .lang-switch select').selectOption('en');

  await page.goto('/settings#manual');
  await expect(page.getByRole('heading', { name: 'Manual' })).toBeVisible();
  await page.goto('/settings#version');
  await expect(page.getByText('0.2.0').first()).toBeVisible();
});
