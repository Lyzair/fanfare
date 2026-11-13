import { test, expect } from '@playwright/test';

test('page loads with CSP and no foreign requests', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== new URL(baseURL!).origin) foreign.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sports Caller');
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);
  expect(foreign).toEqual([]);
});
