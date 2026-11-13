import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ actionTimeout: 20_000 });

async function openApp(browser: Browser, baseURL: string, foreign: string[]): Promise<Page> {
  const context = await browser.newContext({ baseURL, acceptDownloads: true });
  const page = await context.newPage();
  const origin = new URL(baseURL).origin;
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith('blob:') && !u.startsWith('data:') && new URL(u).origin !== origin) foreign.push(u);
    if (r.method() !== 'GET') foreign.push(`${r.method()} ${u}`);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByLabel('Language').selectOption('en');
  await page.getByLabel('Sport').selectOption('football');
  return page;
}

test('guest coach shares the team file, the home side imports it and announces guests first', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const foreign: string[] = [];

  // Context A: the guest coach
  const guestCoach = await openApp(browser, baseURL!, foreign);
  await guestCoach.getByRole('textbox', { name: 'Home team', exact: true }).fill('SV Sample');
  await guestCoach.getByLabel('Paste or type a list of players').fill('3 Pat Gast\n8 Mika Besuch');
  await guestCoach.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(guestCoach.getByRole('tab', { name: 'Our team (2)' })).toBeVisible();
  const [download] = await Promise.all([
    guestCoach.waitForEvent('download'),
    guestCoach.getByRole('button', { name: 'Share our team' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fanfare-team-sv-sample-\d{4}-\d{2}-\d{2}\.json$/);
  const file = join(mkdtempSync(join(tmpdir(), 'fanfare-team-')), download.suggestedFilename());
  await download.saveAs(file);
  const shared = JSON.parse(readFileSync(file, 'utf8'));
  expect(shared).toMatchObject({ fanfareTeam: 1, sport: 'football', teamName: 'SV Sample' });
  expect(Object.keys(shared).sort()).toEqual(['fanfareTeam', 'players', 'sport', 'teamName', 'teamSayAs']);

  // Context B: the home side, a fresh browser profile
  const home = await openApp(browser, baseURL!, foreign);
  await home.getByRole('textbox', { name: 'Home team', exact: true }).fill('FC Example');
  await home.getByLabel('Paste or type a list of players').fill('1 Alex Demo\n4 Sam Test');
  await home.getByRole('button', { name: 'Add', exact: true }).click();
  await home.getByRole('tab', { name: /^Guests/ }).click();
  await home.getByLabel('Import team file').setInputFiles(file);
  await expect(home.getByText('Guest team imported: 2 players.')).toBeVisible();
  await expect(home.getByRole('textbox', { name: 'Opponent', exact: true })).toHaveValue('SV Sample');
  await expect(home.getByRole('tab', { name: 'Guests (2)' })).toBeVisible();
  await expect(home.locator('input[value="Pat Gast"]')).toHaveCount(1);
  await expect(home.locator('input[value="Alex Demo"]')).toHaveCount(0);

  // 360 px: no horizontal scroll, touch targets of the new controls are at least 44 px
  await home.setViewportSize({ width: 360, height: 740 });
  expect(await home.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const loc of [home.getByRole('tab', { name: /^Guests/ }), home.getByRole('button', { name: 'Clear guests' }), home.locator('label.file-button').filter({ hasText: 'Import team file' }), home.getByRole('button', { name: 'Share our team' })]) {
    expect((await loc.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  // Step 2: guests are listed first, under their own heading
  const step2 = home.locator('section.card[aria-labelledby="step2-title"]');
  await expect(step2.getByRole('heading', { level: 3 })).toHaveText(['Guests: SV Sample', 'Our team: FC Example']);
  const order = await step2.locator('.intro-text, textarea[aria-label^="Announcement text for"]').evaluateAll(
    els => els.map(el => (el instanceof HTMLTextAreaElement ? el.value : el.textContent) ?? ''));
  expect(order[0]).toContain('A warm welcome to our guests from SV Sample');
  expect(order[1]).toContain('Pat Gast');
  expect(order[2]).toContain('Mika Besuch');
  expect(order[3]).toContain('welcome');
  expect(order[4]).toContain('Alex Demo');

  // Announce (guests first) starts and can be stopped
  await home.getByRole('button', { name: /Announce lineup/ }).click();
  const stop = home.getByRole('button', { name: 'Stop', exact: true }).first();
  await expect(stop).toBeVisible({ timeout: 60_000 });
  await stop.click();
  await expect(home.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);

  // Step 3: guest goal button
  await expect(home.getByRole('button', { name: /Goal for SV Sample/ })).toBeVisible();
  await expect(home.getByRole('alert')).toHaveCount(0);

  expect(foreign).toEqual([]);
  await guestCoach.context().close();
  await home.context().close();
});

test('a team file for another sport is refused with a hint', async ({ page, baseURL }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByLabel('Language').selectOption('en');
  await page.getByLabel('Sport').selectOption('football');
  await page.getByRole('tab', { name: /^Guests/ }).click();
  await page.getByLabel('Import team file').setInputFiles({
    name: 'team.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ fanfareTeam: 1, sport: 'handball', teamName: 'X', teamSayAs: '', players: [] })),
  });
  await expect(page.getByRole('alert')).toContainText('Switch the sport at the top to Handball');
  await expect(page.getByRole('tab', { name: 'Guests (0)' })).toBeVisible();
  void baseURL;
});
