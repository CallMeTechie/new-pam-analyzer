import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { zipSync } from 'fflate';

const FIXTURES = fileURLToPath(new URL('../../../packages/core/test/fixtures/', import.meta.url));
const fixture = (family: string, index: number) =>
  FIXTURES +
  family +
  '/' +
  readdirSync(FIXTURES + family)
    .filter((f) => f.endsWith('.dat'))
    .sort()[index];

const asUpload = (path: string) => ({
  name: basename(path),
  mimeType: 'application/octet-stream',
  buffer: readFileSync(path),
});

/** Default credentials of a new installation, and what the administrator changes them to. */
const DEFAULT = { email: 'admin@example.com', password: 'admin1234' };
const ADMIN = { email: 'it@plant.test', password: 'admin-password-e2e' };
let inviteUrl = '';

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

test('administrator: first sign-in with default credentials, company, team and invitation', async ({ page }) => {
  await signIn(page, DEFAULT.email, DEFAULT.password);
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await changePassword(page, DEFAULT.password, ADMIN.password, ADMIN.email);
  // Step 2: name the service company (suggestion from SERVICE_COMPANY_NAME).
  await expect(page.getByRole('heading', { name: 'Name your service company' })).toBeVisible();
  const serviceName = page.getByLabel('Name of the service company');
  await expect(serviceName).toHaveValue('FUJI Service');
  await serviceName.fill('Sample Service');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('No results yet')).toBeVisible();
  await expect(page.locator('.footer')).toContainText('Made with');
  await expect(page.locator('.footer')).toContainText('CallMeTechie');

  await page.getByRole('link', { name: 'Companies' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Sample Service' })).toContainText('Service');
  await page.getByRole('button', { name: 'Add company' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Customer A');
  await page.getByLabel('Location').fill('Plant 1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Customer A' })).toBeVisible();

  await page.getByRole('link', { name: 'Open company view' }).click();
  await expect(page.getByText('You are viewing Customer A exactly as its members see it.')).toBeVisible();
  await page.getByRole('link', { name: 'Team' }).click();
  await page.getByRole('button', { name: 'Invite member' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Line Operator');
  await page.getByLabel('E-mail address').fill('operator@customer-a.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Invite member' }).click();
  // An invitation (QR code, link, code) instead of an initial password or an API key.
  const invite = page.getByRole('dialog', { name: 'Invitation for Line Operator' });
  await expect(invite).toBeVisible();
  await expect(invite.getByRole('img', { name: 'QR code of the invitation for Line Operator' })).toBeVisible();
  inviteUrl = (await invite.locator('.secret code').textContent()) ?? '';
  expect(inviteUrl).toMatch(/\/connect\/[A-Z2-9]{8}$/);
  await expect(invite.locator('.code-big')).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('operator@customer-a.test')).toBeVisible();
  await expect(page.getByText(/Invitation open until/)).toBeVisible();

  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByText('No apps connected yet')).toBeVisible();
  await page.getByLabel('Devices per member').fill('2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  await page.getByRole('link', { name: 'Back to admin view' }).click();
  await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible();
});

test('default credentials no longer work after the first sign-in', async ({ page }) => {
  await signIn(page, DEFAULT.email, DEFAULT.password);
  await expect(page.getByText('E-mail address or password is wrong.')).toBeVisible();
});

test('upload, results, search, detail and head history', async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  // No upload page: the drop zone of the dashboard uploads, service staff choose the company there.
  await expect(page.getByRole('link', { name: 'Upload' })).toHaveCount(0);
  await page.getByTestId('dropzone').scrollIntoViewIfNeeded();
  await page.getByLabel('Company').selectOption({ label: 'Customer A' });
  // P1/P2 of the same AIMEX head plus one NXT file inside a ZIP archive (unpacked in the browser).
  const nxt = fixture('nxt', 0);
  const zip = zipSync({ [`M1/${basename(nxt)}`]: new Uint8Array(readFileSync(nxt)), 'notes.txt': new Uint8Array(3) });
  await page
    .locator('input[type=file][accept=".dat,.zip"]')
    .setInputFiles([
      asUpload(fixture('aimex', 2)),
      asUpload(fixture('aimex', 10)),
      { name: 'line1.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) },
    ]);
  await expect(page.getByText('3 files ready')).toBeVisible();
  await page.getByRole('button', { name: 'Upload and evaluate' }).click();
  // The upload runs in the background; a toast reports it on every page.
  const toast = page.getByTestId('upload-toast');
  await expect(toast).toContainText('Upload finished');
  await expect(toast).toContainText('3 new results · 1 skipped');
  await toast.getByRole('button', { name: 'Details' }).click();
  const done = page.getByRole('dialog', { name: 'Upload finished' });
  await expect(done.getByText('3 new results')).toBeVisible();
  await expect(done.getByText('notes.txt')).toBeVisible();
  await done.getByRole('button', { name: 'Close' }).click();
  await expect(toast).toHaveCount(0);

  // Dashboard: the three latest uploads as cards, below them this and last calendar week.
  await expect(page.getByTestId('latest-cards').locator('a')).toHaveCount(3);
  await expect(page.getByTestId('week-days').locator('span')).toHaveCount(7);
  await expect(page.getByTestId('week-this')).toContainText('This week');
  await expect(page.getByTestId('week-last')).toContainText('Last week');

  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page.locator('.pager > span').first()).toContainText(/^3 results\b/);
  // Grouped by test day by default; by customer and as a plain list on request.
  await expect(page.getByTestId('groups-date')).toBeVisible();
  await page.getByRole('radio', { name: 'By customer' }).click();
  await expect(page.getByTestId('groups-customer').locator('.group-h')).toContainText(['No customer']);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('.groups')).toHaveCount(0);
  await expect(page.locator('a.result-row')).toHaveCount(3);
  await page.getByRole('tab', { name: 'NXT', exact: true }).click();
  await expect(page.locator('.pager > span').first()).toContainText(/^1 result\b/);
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('searchbox').fill('V12 900018');
  await expect(page.locator('.pager > span').first()).toContainText(/^2 results\b/);

  await page.locator('a.result-row').first().click();
  await expect(page.getByText('Head Cpk XY')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Head', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Total', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increase coefficient' }).click();
  await expect(page.locator('#coef-sub')).toContainText('manual');

  // Customer and test date can be corrected on the web, as in the apps.
  await page.getByRole('button', { name: 'Customer & date' }).click();
  const edit = page.getByRole('dialog', { name: 'Customer and test date' });
  await edit.getByLabel('Customer').fill('Sample Works');
  await edit.getByRole('radio', { name: 'Another date' }).check();
  await edit.locator('input[type=date]').fill('2026-03-14');
  await edit.getByRole('button', { name: 'Apply' }).click();
  await expect(edit).toBeHidden();
  await expect(page.locator('.hero')).toContainText('Sample Works');
  await expect(page.locator('.hero')).toContainText('Mar 14, 2026');

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
  // The invitation link: choose the password, then sign in.
  await page.goto(inviteUrl);
  await expect(page.getByRole('heading', { name: 'Welcome, Line Operator' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('operator-password-1');
  await page.getByLabel('Repeat password').fill('operator-password-1');
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.getByRole('link', { name: 'Go to sign-in' }).click();
  await expect(page.getByLabel('E-mail address')).toHaveValue('operator@customer-a.test');
  await page.getByLabel('Password', { exact: true }).fill('operator-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Customer A' }).or(page.getByText('Latest PAM results of Customer A')),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Companies' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0);
  // My account: connect another device with a short-lived code.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Show code' }).click();
  await expect(page.getByRole('img', { name: 'QR code to connect a device' })).toBeVisible();
  await expect(page.getByText(/Valid for \d+:\d\d more minutes/)).toBeVisible();
  // Dashboard: the three latest uploads as cards, below them this and last calendar week.
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByTestId('latest-cards').locator('a')).toHaveCount(3);
  await expect(page.getByTestId('week-days').locator('span')).toHaveCount(7);
  await expect(page.getByTestId('week-this')).toContainText('This week');
  await expect(page.getByTestId('week-last')).toContainText('Last week');

  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page.locator('.pager > span').first()).toContainText(/^3 results\b/);
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
  await expect(page.locator('.pager > span').first()).toContainText(/^3 results\b/);

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

test('drag and drop: the drop zone is marked, takes folders and ZIP archives with subfolders', async ({ page }) => {
  // A folder with subfolders and a ZIP archive with subfolders, as the operating system drags them.
  const dir = mkdtempSync(join(tmpdir(), 'pam-drop-'));
  const folder = join(dir, 'Plant');
  mkdirSync(join(folder, 'Line1', 'M3', 'old'), { recursive: true });
  copyFileSync(fixture('nxt', 3), join(folder, 'Line1', basename(fixture('nxt', 3))));
  copyFileSync(fixture('nxt', 4), join(folder, 'Line1', 'M3', basename(fixture('nxt', 4))));
  copyFileSync(fixture('aimex', 20), join(folder, 'Line1', 'M3', 'old', basename(fixture('aimex', 20))));
  writeFileSync(join(folder, 'Line1', 'notes.txt'), 'not a PAM file');
  const zipPath = join(dir, 'archive.zip');
  writeFileSync(
    zipPath,
    zipSync({
      [`A/${basename(fixture('aimex', 21))}`]: new Uint8Array(readFileSync(fixture('aimex', 21))),
      [`A/B/C/${basename(fixture('aimex', 22))}`]: new Uint8Array(readFileSync(fixture('aimex', 22))),
    }),
  );

  await signIn(page, ADMIN.email, ADMIN.password);
  await page.getByLabel('Company').selectOption({ label: 'Customer A' });
  const cdp = await page.context().newCDPSession(page);
  const zone = page.getByTestId('dropzone');
  const drag = async (type: 'dragEnter' | 'dragOver' | 'drop', x: number, y: number, files: string[]) =>
    cdp.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files, dragOperationsMask: 1 } });
  // Files dragged into the window mark the existing drop zone.
  await drag('dragEnter', 300, 450, [zipPath]);
  await drag('dragOver', 300, 450, [zipPath]);
  await expect(zone).toHaveClass(/armed/);
  await expect(zone).toContainText('Drop the files here');
  // Dropped next to the zone: nothing is taken, and the browser does not open the file.
  const url = page.url();
  await drag('drop', 300, 450, [zipPath]);
  await expect(zone).not.toHaveClass(/armed/);
  await expect(page.getByTestId('upload-ready')).toHaveCount(0);
  expect(page.url()).toBe(url);
  // Dropped on the zone: folder and archive with all subfolders.
  const box = await zone.boundingBox();
  if (!box) throw new Error('The drop zone is not visible.');
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const)
    await drag(type, box.x + box.width / 2, box.y + 40, [folder, zipPath]);
  const ready = page.getByTestId('upload-ready');
  await expect(ready).toContainText('4 files ready');
  await expect(ready).toContainText('5 PAM files in total');
  await expect(ready).toContainText('1 other file ignored');
  await expect(ready).toContainText(`Plant/Line1/M3/old/${basename(fixture('aimex', 20))}`);
  await expect(ready).toContainText('archive.zip · 2 PAM files');
  await page.getByRole('button', { name: 'Upload and evaluate' }).click();
  await expect(page.getByTestId('upload-toast')).toContainText('5 new results');
});
