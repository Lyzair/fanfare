import { test, expect } from '@playwright/test';

// The speaker is the laptop's browser on 127.0.0.1 (a loopback client). The phone opens the
// address the speaker page shows: the laptop's own LAN address, which the server sees as a
// non-loopback client. No test hook in the server is involved. Needs a LAN address; skipped without one.
test.use({ actionTimeout: 20_000 });

test('phone pairs, presses Goal, the speaker plays; wrong code; End remote; stays on-origin', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const speakerCtx = await browser.newContext();
  const speaker = await speakerCtx.newPage();
  const foreign: string[] = [];
  const watch = (page: typeof speaker, origin: () => string) => page.on('request', r => {
    const u = r.url();
    if (!u.startsWith('blob:') && !u.startsWith('data:') && new URL(u).origin !== origin()) foreign.push(u);
  });
  watch(speaker, () => new URL(baseURL!).origin);
  await speaker.addInitScript(() => { try { localStorage.setItem('fanfare.welcomeDismissed', '1'); } catch { /* ignore */ } });
  await speaker.goto('/');
  await speaker.getByLabel('Language').selectOption('en');
  await speaker.getByLabel('Paste or type a list of players').fill('7 Lea Müller\n9 Tom');
  await speaker.getByRole('button', { name: 'Add', exact: true }).click();
  const hasLan = await speaker.getByRole('button', { name: 'Activate speaker' }).isVisible({ timeout: 10_000 }).catch(() => false);
  test.skip(!hasLan, 'no LAN address on this machine');
  await speaker.getByRole('button', { name: 'Activate speaker' }).click();
  const qr = speaker.getByRole('img', { name: /QR code/ });
  await expect(qr).toBeVisible();
  const address = (await speaker.locator('.remote-url code').textContent())!;
  expect(address).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:4176\/#remote$/);
  expect(address).not.toMatch(/127\.0\.0\.1|localhost/);
  const code = (await speaker.locator('.remote-code').textContent())!;
  expect(code).toMatch(/^\d{6}$/);
  await expect(speaker.getByText('Connection not encrypted')).toBeVisible();

  const phoneCtx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  watch(phone, () => new URL(address).origin);
  await phone.goto(address);
  await expect(phone.getByText('Connection not encrypted')).toBeVisible();

  // wrong code is rejected
  const wrong = code === '000000' ? '000001' : '000000';
  await phone.getByLabel('Enter the 6-digit code from the laptop').fill(wrong);
  await phone.getByRole('button', { name: 'Connect' }).click();
  await expect(phone.getByRole('alert')).toHaveText('Wrong code. Try again.');
  await expect(phone.getByRole('button', { name: /Goal!/ })).toHaveCount(0);

  // right code: soundboard, buttons at least 64 px
  await phone.getByLabel('Enter the 6-digit code from the laptop').fill(code);
  await phone.getByRole('button', { name: 'Connect' }).click();
  const goal = phone.getByRole('button', { name: /Goal!/ });
  await expect(goal).toBeVisible();
  await expect(speaker.getByText('1 phone connected')).toBeVisible();
  for (const b of await phone.locator('.remote-app button').all()) {
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(63.5);
  }
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Goal with a scorer: the speaker's queue starts playing (its Stop button appears), the phone shows Playing…
  await phone.getByRole('button', { name: 'Lea Müller', exact: true }).click();
  await goal.click();
  await expect(speaker.getByRole('button', { name: 'Stop', exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(phone.getByText('Playing…')).toBeVisible();
  await phone.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(speaker.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);

  // End remote: the phone shows it is disconnected
  await speaker.getByRole('button', { name: 'End remote' }).click();
  await expect(phone.getByText('The remote was ended on the laptop.')).toBeVisible();
  await expect(phone.getByRole('button', { name: /Goal!/ })).toHaveCount(0);
  expect(foreign).toEqual([]);
  await speakerCtx.close();
  await phoneCtx.close();
});

test('a page from another host never sees the relay: health is the speaker origin only', async ({ request }) => {
  const res = await request.get('/remote/health');
  expect(res.status()).toBe(200);
  expect((await res.json()).fanfare).toBe('local');
  expect((await request.post('/remote/session', { data: {}, headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
});
