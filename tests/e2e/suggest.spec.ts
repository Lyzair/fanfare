import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 20_000 });

test('✨ Suggest for a Polish name on a German voice works offline from same-origin assets', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const requests: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    requests.push(u);
    if (!u.startsWith('blob:') && !u.startsWith('data:') && new URL(u).origin !== origin) foreign.push(u);
  });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByLabel('Language').selectOption('de');
  await page.getByLabel('Spielerliste einfügen oder eintippen').fill('Wojciech');
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await page.getByRole('button', { name: 'Aussprache' }).last().click();
  await page.getByRole('button', { name: '✨ Vorschlagen' }).click();
  await page.getByLabel('Sprache des Namens').selectOption('pl');
  await page.getByRole('button', { name: 'Vorschläge suchen' }).click();

  const use = page.getByRole('button', { name: /^Übernehmen: / });
  await expect(use.first()).toBeVisible({ timeout: 60_000 });
  expect(await use.count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Wojtschech anhören' })).toBeVisible();

  // ask again: the cached phonemizer module is reused (or re-created) without trouble
  await page.getByRole('button', { name: 'Vorschläge suchen' }).click();
  await expect(use.first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);

  await use.first().click();
  const sayAs = page.getByLabel('Sag es so…');
  await expect(sayAs).not.toHaveValue('');
  expect(requests.some((u) => u.includes('/piper/piper_phonemize.wasm'))).toBe(true);
  expect(foreign).toEqual([]);
  expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
});
