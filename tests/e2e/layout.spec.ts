import { test, expect, type Page } from '@playwright/test';

const box = async (page: Page, step: number) => (await page.locator(`section[data-step="${step}"]`).boundingBox())!;

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click(); // also waits until the saved state is loaded
  await page.getByLabel('Language').selectOption('en');
  // the saved state loads first (as in gameday.spec): wait for a typed value to stick
  await page.getByRole('textbox', { name: 'Opponent', exact: true }).fill('SV Musterstadt');
  await expect(page.getByRole('textbox', { name: 'Opponent', exact: true })).toHaveValue('SV Musterstadt');
  // enough players that the page scrolls
  await page.getByLabel('Paste or type a list of players').fill(['Lea', 'Tom', 'Zoë', 'Max', 'Mia', 'Ben', 'Ida', 'Jan', 'Eva', 'Kai', 'Ole', 'Pia', 'Raul', 'Sina'].map((n, i) => `${i + 1} ${n}`).join('\n'));
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel(/^Name: /)).toHaveCount(14);
}

test('16:9 monitor, default "game on the side": the game stays in view while the lineup scrolls', async ({ page }) => {
  await open(page, 1920, 1080);
  const [one, three] = [await box(page, 1), await box(page, 3)];
  expect(three.x).toBeGreaterThan(one.x + one.width - 1); // side by side
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const after = await box(page, 3);
  expect(after.y).toBeGreaterThanOrEqual(0);
  expect(after.y).toBeLessThan(1080);
  // steps 4 and 5 are reachable: the game column scrolls by itself
  await page.locator('section[data-step="5"]').scrollIntoViewIfNeeded();
  await expect(page.locator('section[data-step="5"]')).toBeInViewport();
});

test('16:9 monitor, "Columns": three columns, and right-to-left does not overflow', async ({ page }) => {
  await open(page, 1920, 1080);
  await page.getByRole('button', { name: 'Columns' }).click();
  const xs = await Promise.all([1, 2, 3, 4, 5].map(async n => Math.round((await box(page, n)).x)));
  expect(new Set(xs).size).toBe(3);
  expect(xs).toEqual([...xs].sort((a, b) => a - b)); // step order runs down and across the columns
  await page.getByLabel('Language').selectOption('ar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
});

test('tablet landscape (1024×768): two columns in both layouts', async ({ page }) => {
  await open(page, 1024, 768);
  expect(Math.round((await box(page, 3)).x)).not.toBe(Math.round((await box(page, 1)).x));
  await page.getByRole('button', { name: 'Columns' }).click();
  const xs = new Set([1, 2, 3, 4, 5].map(async n => Math.round((await box(page, n)).x)));
  expect(new Set(await Promise.all(xs)).size).toBe(2);
});

test('phone (390×844): one column and no layout switch', async ({ page }) => {
  await open(page, 390, 844);
  await expect(page.getByRole('group', { name: 'Layout' })).toBeHidden();
  const xs = await Promise.all([1, 2, 3, 4, 5].map(async n => Math.round((await box(page, n)).x)));
  expect(new Set(xs).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('a two-line header (French at 920 px) never covers the game column', async ({ page }) => {
  await open(page, 920, 800);
  await page.getByLabel('Language').selectOption('fr');
  await page.evaluate(() => window.scrollTo(0, 1500));
  const header = (await page.locator('header.topbar').boundingBox())!;
  const column = (await page.locator('.layout-col-game').boundingBox())!;
  expect(column.y).toBeGreaterThanOrEqual(header.y + header.height);
});
