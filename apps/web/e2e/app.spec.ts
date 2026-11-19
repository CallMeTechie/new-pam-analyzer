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

const ADMIN = { email: 'admin@e2e.test', initial: 'initial-admin-pass', password: 'admin-password-e2e' };
let memberPassword = '';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(page.getByText('Please choose your own password')).toBeVisible();
  await page.getByLabel('Current password').fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Repeat new password').fill(next);
  await page.getByRole('button', { name: 'Change password' }).click();
}

test.describe.configure({ mode: 'serial' });

test('administrator: first sign-in, company, team and API key', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.initial);
  await changePassword(page, ADMIN.initial, ADMIN.password);
  await expect(page.getByText('No results yet')).toBeVisible();

  await page.getByRole('link', { name: 'Companies' }).click();
  await page.getByRole('button', { name: 'Add company' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Customer A');
  await page.getByLabel('Location').fill('Plant 1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Customer A' })).toBeVisible();

  await page.getByRole('link', { name: 'Open company view' }).click();
  await expect(page.getByText('You are viewing Customer A as FUJI Service')).toBeVisible();
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

  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page.getByText('3 results')).toBeVisible();
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
  await expect(page.getByText('manual')).toBeVisible();

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
  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page.getByText('3 results')).toBeVisible();

  await page.getByLabel('Language').selectOption('de');
  await expect(page.getByRole('link', { name: 'Ergebnisse' })).toBeVisible();
  await expect(page.getByText('3 Ergebnisse')).toBeVisible();
  // The choice is stored in the profile.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ergebnisse' })).toBeVisible();
});
