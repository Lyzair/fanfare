import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockVoiceServer } from './fixtures/mockVoiceServer';

// Chromium's fake microphone, for the club-voice test (the others never open the microphone).
test.use({
  actionTimeout: 20_000,
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

/** Opens the page, dismisses the welcome card and tracks every request URL. */
async function open(page: Page) {
  const urls: string[] = [];
  page.on('request', r => urls.push(r.url()));
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByLabel('Language').selectOption('en');
  return urls;
}

async function connect(page: Page, url: string) {
  await page.getByText('Local voice server (advanced)').click();
  await page.getByLabel('Server address').fill(url);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}

const isForeign = (u: string, origins: string[]) => !u.startsWith('blob:') && !u.startsWith('data:') && !origins.includes(new URL(u).origin);

test('prepare at home with a local voice, export, then announce after import without the server', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const mock = new MockVoiceServer();
  await mock.start();
  try {
    const pageOrigin = new URL(baseURL!).origin;
    const urls = await open(page);
    await page.getByLabel('Paste or type a list of players').fill('7 Lea\n9 Tom');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(2);

    await connect(page, mock.url);
    await expect(page.getByText('✓ 2 voices found')).toBeVisible();
    await page.getByRole('combobox', { name: 'Voice' }).selectOption('local:mock-en');

    await page.getByRole('button', { name: /Prepare voices/ }).click();
    await expect(page.getByText('All voices ready ✓')).toBeVisible({ timeout: 30_000 });
    expect(mock.synthesized).toHaveLength(3); // intro + 2 players
    // Regenerate makes one clip again through the server
    await page.getByRole('button', { name: 'Regenerate Lea' }).click();
    await expect.poll(() => mock.synthesized.length).toBe(4);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export (zip)' }).click();
    const file = join(mkdtempSync(join(tmpdir(), 'fanfare-local-')), 'export.zip');
    await (await downloadPromise).saveAs(file);

    expect(mock.requests.some(r => r.method === 'OPTIONS')).toBe(true); // the custom header forces a preflight
    // every browser request to the server carried the header and came from this page
    expect(mock.requests.length).toBeGreaterThan(0);
    for (const r of mock.requests.filter(x => x.method !== 'OPTIONS')) { expect(r.xFanfare).toBe('1'); expect(r.origin).toBe(pageOrigin); }

    await mock.stop(); // the server is gone for the rest of the test
    await page.reload();
    await page.getByRole('button', { name: 'Delete all data on this device' }).click();
    await expect(page.getByText('All data on this device was deleted.')).toBeVisible();
    await page.getByLabel('Import (zip)', { exact: true }).setInputFiles(file);
    await expect(page.getByText('Import complete.')).toBeVisible();

    const before = urls.length;
    await page.getByRole('button', { name: /Announce lineup/ }).click();
    const stop = page.getByRole('button', { name: 'Stop', exact: true }).first();
    await expect(stop).toBeVisible({ timeout: 30_000 });
    await expect(stop).toBeHidden({ timeout: 60_000 }); // the whole lineup played, clip by clip, from the cache
    expect(urls.slice(before).filter(u => u.startsWith(mock.url))).toEqual([]);
    // the page only ever talked to itself and to the voice server
    expect(urls.filter(u => isForeign(u, [pageOrigin, mock.origin]))).toEqual([]);
    expect(await page.getByRole('combobox', { name: 'Voice' }).inputValue()).toBe('local:mock-en');
  } finally {
    await mock.stop();
  }
});

test('a server that does not allow this website shows the origin and the exact command', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const mock = new MockVoiceServer({ allowDefaultLocal: false });
  await mock.start();
  try {
    const origin = new URL(baseURL!).origin;
    await open(page);
    await connect(page, mock.url);
    const alert = page.getByRole('alert').filter({ hasText: origin });
    await expect(alert).toBeVisible();
    await expect(alert.getByText(`fanfare-studio allow ${origin}`)).toBeVisible();
    await alert.getByRole('button', { name: 'Copy command' }).click();
    await expect(alert.getByText('Copied ✓')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`fanfare-studio allow ${origin}`);

    mock.allow(origin); // the user ran the command
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText('✓ 2 voices found')).toBeVisible();
  } finally {
    await mock.stop();
  }
});

test.describe('club voice', () => {
  test('record, save, appears in the voice list, and can be deleted', async ({ page, baseURL }) => {
    test.setTimeout(60_000);
    const mock = new MockVoiceServer();
    await mock.start();
    try {
      const pageOrigin = new URL(baseURL!).origin;
      const urls = await open(page);
      await connect(page, mock.url);
      await expect(page.getByText('✓ 2 voices found')).toBeVisible();
      await page.getByRole('button', { name: /Record club voice/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/Hello everyone and welcome!/)).toBeVisible();
      const save = dialog.getByRole('button', { name: 'Save voice' });
      await expect(save).toBeDisabled();
      await dialog.getByRole('button', { name: 'Record', exact: true }).click();
      await expect(dialog.getByRole('timer')).toBeVisible();
      await page.waitForTimeout(1500);
      await dialog.getByRole('button', { name: 'Stop recording' }).click();
      await expect(dialog.getByRole('button', { name: 'Play recording' })).toBeVisible();
      await expect(save).toBeDisabled(); // no consent yet
      // phone width: no horizontal scroll, 44 px targets
      await page.setViewportSize({ width: 360, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      for (const b of await dialog.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await dialog.getByLabel('Name of this voice').fill('Max');
      await dialog.getByRole('checkbox').check();
      await save.click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText('Club voice saved: Max')).toBeVisible();

      expect(mock.references).toHaveLength(1);
      expect(mock.references[0]).toMatchObject({ name: 'Max', lang: 'en', consent: 'true' });
      expect(mock.references[0].audioBytes).toBeGreaterThan(100);
      const select = page.getByRole('combobox', { name: 'Voice' });
      await expect(select).toHaveValue(/^local:club-/);
      await expect(select.locator('optgroup[label="On this computer"] option', { hasText: 'Max' })).toHaveCount(1);

      await page.getByRole('button', { name: /Delete club voice: Max/ }).click();
      await expect(select.locator('option', { hasText: 'Max' })).toHaveCount(0);
      expect(mock.requests.some(r => r.method === 'DELETE' && r.path.startsWith('/references/club-'))).toBe(true);
      expect(urls.filter(u => isForeign(u, [pageOrigin, mock.origin]))).toEqual([]);
    } finally {
      await mock.stop();
    }
  });
});
