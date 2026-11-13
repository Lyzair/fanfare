import { test, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ actionTimeout: 20_000 });
test('game day flow stays on-origin', async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const posts: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('blob:') && !u.startsWith('data:') && new URL(u).origin !== origin) foreign.push(u);
    if (r.method() !== 'GET') posts.push(`${r.method()} ${u}`);
  });
  page.on('dialog', (d) => void d.accept());

  await page.goto('/');
  await page.getByLabel('Language').selectOption('en');
  await page.getByLabel('Sport').selectOption('football');

  // Step 1: match + players
  await page.getByRole('textbox', { name: 'Opponent', exact: true }).fill('SV Musterstadt');
  await expect(page.getByRole('textbox', { name: 'Opponent', exact: true })).toHaveValue('SV Musterstadt');
  await page.getByLabel('Paste or type a list of players').fill('7 Lea Müller\nTom\nZoë');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(3);

  const fieldList = page.getByRole('region', { name: 'On the field' });
  const benchList = page.getByRole('region', { name: 'Bench' });
  await page.getByRole('listitem').filter({ has: page.locator('input[value="Zoë"]') }).getByRole('button', { name: 'Move to bench' }).click();
  await expect(benchList.locator('input[value="Zoë"]')).toHaveCount(1);
  await expect(fieldList.locator('input[value="Zoë"]')).toHaveCount(0);
  await page.getByLabel('Use positions').check();
  const leaPos = fieldList.getByRole('listitem').filter({ has: page.locator('input[value="Lea Müller"]') }).getByLabel('Position');
  await leaPos.fill('Goalkeeper');
  await expect(leaPos).toHaveValue('Goalkeeper');

  // Step 2: texts mention the opponent; prepare voices
  await expect(page.locator('.intro-text')).toContainText('SV Musterstadt');
  await expect(page.getByLabel('Announcement text for Lea Müller')).toHaveValue(/Goalkeeper.*7.*Lea Müller/);
  await expect(page.getByLabel('Announcement text for Zoë')).toHaveValue(/bench.*Zoë/);
  const t0 = Date.now();
  await page.getByRole('button', { name: /Prepare voices/ }).click();
  await expect(page.getByText('All voices ready ✓')).toBeVisible({ timeout: 120_000 });
  console.log(`PREPARE_VOICES_MS=${Date.now() - t0}`);

  // Announce lineup
  await page.getByRole('button', { name: /Announce lineup/ }).click();
  const stop = page.getByRole('button', { name: 'Stop', exact: true }).first();
  await expect(stop).toBeVisible({ timeout: 30_000 });
  const ended = await stop.waitFor({ state: 'hidden', timeout: 60_000 }).then(() => true, () => false);
  if (!ended) {
    console.log('ANNOUNCE_ENDED=clicked-stop');
    await stop.click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  } else {
    console.log('ANNOUNCE_ENDED=naturally');
  }

  // Score with scorer Lea
  const leaChip = page.getByRole('button', { name: '7 Lea Müller' });
  await leaChip.click();
  await expect(leaChip).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Goal!/ }).click();
  const scoreStop = page.getByRole('button', { name: 'Stop', exact: true }).first();
  await expect(scoreStop).toBeVisible({ timeout: 30_000 });
  const scoreEnded = await scoreStop.waitFor({ state: 'hidden', timeout: 60_000 }).then(() => true, () => false);
  console.log(`SCORE_ENDED=${scoreEnded ? 'naturally' : 'clicked-stop'}`);
  if (!scoreEnded) await scoreStop.click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export (zip)' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fanfare-\d{4}-\d{2}-\d{2}\.zip$/);
  const file = join(mkdtempSync(join(tmpdir(), 'fanfare-')), download.suggestedFilename());
  await download.saveAs(file);

  // Delete all, then import
  await page.reload();
  await page.getByRole('button', { name: 'Delete all data on this device' }).click();
  await expect(page.getByRole('textbox', { name: 'Opponent', exact: true })).toHaveValue('');
  await expect(page.locator('input[value="Lea Müller"]')).toHaveCount(0);
  await page.getByLabel('Import (zip)').setInputFiles(file);
  await expect(page.getByRole('textbox', { name: 'Opponent', exact: true })).toHaveValue('SV Musterstadt');
  await expect(page.locator('input[value="Lea Müller"]')).toHaveCount(1);
  await expect(page.locator('input.num[value="7"]')).toHaveCount(1);
  await expect(benchList.locator('input[value="Zoë"]')).toHaveCount(1);
  await expect(fieldList.locator('input[value="Zoë"]')).toHaveCount(0);
  await expect(fieldList.getByLabel('Position', { exact: true }).first()).toHaveValue('Goalkeeper');

  // Volleyball
  await page.getByLabel('Sport').selectOption('volleyball');
  await expect(page.locator('.score-button')).toContainText('Point');

  expect(foreign).toEqual([]);
  expect(posts).toEqual([]);
});

test('mobile viewport has no horizontal scroll with real content', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByLabel('Language').selectOption('en');
  await page.getByRole('textbox', { name: 'Home team', exact: true }).fill('FC Beispielhausen-Neustadt');
  await page.getByRole('textbox', { name: 'Opponent', exact: true }).fill('SV Musterstadt');
  await page.getByLabel('Paste or type a list of players').fill('7 Lea Müller\n10 Maximilian Mustermann-Schneider\nTom');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Paste or type a list of players').fill('Zoë');
  await page.getByRole('button', { name: 'Add to bench' }).click();
  await page.getByLabel('Use positions').check();
  await page.getByRole('region', { name: 'On the field' }).getByLabel('Position').first().fill('Goalkeeper');
  await expect(page.getByRole('region', { name: 'Bench' }).locator('input[value="Zoë"]')).toHaveCount(1);
  for (const [lang, dir] of [['en', 'ltr'], ['ar', 'rtl']]) {
    await page.getByLabel(/language|sprache|اللغة/i).selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  }
});
