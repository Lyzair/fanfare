import { test, expect } from '@playwright/test';

test('Show me loads exactly one same-origin media file, only after the click', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const media: string[] = [];
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('blob:') || u.startsWith('data:')) return;
    if (new URL(u).origin !== origin) foreign.push(u);
    else if (new URL(u).pathname.includes('manual/media/')) media.push(u);
  });
  await page.goto('/');
  await page.getByLabel('Language').selectOption('en');
  await expect(page.getByRole('region', { name: 'Welcome to Fanfare!' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('region', { name: 'Welcome to Fanfare!' })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(media).toEqual([]);

  await page.getByRole('button', { name: '▶ Show me' }).first().click();
  const img = page.locator('figure img').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(media).toHaveLength(1);
  expect(media[0]).toContain('/manual/media/en/add-players.gif');
  expect(foreign).toEqual([]);
});

for (const lang of ['en', 'ar']) {
  test(`help controls meet 44 px touch targets (${lang})`, async ({ page }) => {
    await page.goto('/');
    await page.locator('header select').nth(1).selectOption(lang);
    const box = async (loc: ReturnType<typeof page.locator>) => (await loc.boundingBox())!;
    const ok = (b: { width: number; height: number }) => { expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44); };
    ok(await box(page.locator('.help-button')));
    ok(await box(page.locator('.welcome .btn').first()));
    ok(await box(page.locator('.welcome button.btn')));
    const toggle = page.locator('.show-me-toggle').first();
    ok(await box(toggle));
    await toggle.click();
    ok(await box(page.locator('.show-me-toggle').first())); // "Hide" state
  });
}
