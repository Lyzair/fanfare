import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 20_000 });
test('after one online visit the app reloads and announces offline', async ({ page, context, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const failed: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('blob:') && !u.startsWith('data:') && new URL(u).origin !== origin) foreign.push(u);
  });
  page.on('dialog', (d) => void d.accept());

  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByLabel('Language').selectOption('en');
  await page.getByLabel('Paste or type a list of players').fill('7 Lea Müller\nTom');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel(/^Name: /)).toHaveCount(2);

  await expect(page.getByText(/Not ready for offline use|The voice is missing/)).toBeVisible();
  await page.getByRole('button', { name: /Prepare voices/ }).click();
  await expect(page.getByText('All voices ready ✓')).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 120_000 });
  await expect(page.getByText('Offline ready ✓')).toBeVisible({ timeout: 30_000 });

  // The voice model must come from OPFS, not from a second (Cache Storage) copy.
  const cachedVoices = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(r.url);
    return urls.filter((u) => u.includes('/voices/'));
  });
  expect(cachedVoices).toEqual([]);

  // View the manual once online so its media are cached at runtime.
  await page.getByRole('link', { name: /Manual|manual/ }).first().click();
  await expect(page).toHaveURL(/manual\/en\.html$/);
  await expect(page.locator('img').first()).toBeVisible();
  await page.waitForFunction(() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0));
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Fanfare' })).toBeVisible();

  // RemotePanel's mount probes /remote/health once; let it settle so it is not recorded as failed offline
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Fanfare' })).toBeVisible();
  await expect(page.getByLabel(/^Name: /)).toHaveCount(2);
  await expect(page.getByText('Offline ready ✓')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /Announce lineup/ }).click();
  const stop = page.getByRole('button', { name: 'Stop', exact: true }).first();
  await expect(stop).toBeVisible({ timeout: 30_000 });
  const ended = await stop.waitFor({ state: 'hidden', timeout: 60_000 }).then(() => true, () => false);
  if (!ended) {
    await stop.click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  }

  // The manual page (precached) and its media (cached after the online view) work offline.
  await page.getByRole('link', { name: /Manual|manual/ }).first().click();
  await expect(page).toHaveURL(/manual\/en\.html$/);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('img').first()).toBeVisible();

  // The licence notice (step 5) opens offline as readable text, and so does the GPL text it names.
  await page.goBack();
  const [licencePage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Licences of voices and software' }).click(),
  ]);
  await expect(licencePage).toHaveURL(/licenses\/VOICE-LICENSES\.txt$/);
  await expect(licencePage.locator('body')).toContainText('eSpeak NG (GPL-3.0-or-later)');
  await licencePage.goto(new URL('GPL-3.0.txt', licencePage.url()).href);
  await expect(licencePage.locator('body')).toContainText('GNU GENERAL PUBLIC LICENSE');
  await licencePage.goto(new URL('THIRD-PARTY-NOTICES.txt', licencePage.url()).href);
  await expect(licencePage.locator('body')).toContainText('END OF TERMS AND CONDITIONS');
  await licencePage.close();

  expect(foreign).toEqual([]);
  expect(failed).toEqual([]);
});
