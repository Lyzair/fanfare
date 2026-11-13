import { test, expect } from '@playwright/test';

test('synthesizes German speech from same-origin assets only', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto('/?test');
  await page.waitForFunction(() => typeof window.__tts?.synthesize === 'function');
  expect(await page.evaluate(() => Object.keys(window.__tts!))).toEqual(['synthesize']);

  const result = await page.evaluate(async () => {
    const b = await window.__tts!.synthesize('Hallo Lea', 'de_DE-thorsten-medium');
    return { size: b.size, type: b.type };
  });

  expect(result.type).toBe('audio/wav');
  expect(result.size).toBeGreaterThan(10_000);

  const foreign = requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:') && new URL(u).origin !== origin);
  expect(foreign).toEqual([]);
  const models = requests.filter((u) => /\.onnx(\?|$)/.test(u));
  expect(models).toHaveLength(1);
  expect(models[0]).toContain('/voices/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx');
  expect(requests.some((u) => u.includes('/voices/') && !u.includes('de_DE-thorsten-medium'))).toBe(false);
  expect(consoleErrors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
});

test('without ?test the TTS hook is not exposed in production builds', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => window.__tts === undefined)).toBe(true);
});
