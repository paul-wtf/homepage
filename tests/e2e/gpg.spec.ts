import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const FINGERPRINT = '01E8 E083 5EEF 6EB9 294C C853 A866 63FE 8C6B 0713';

function primaryFingerprint(armored: string): string {
  const body = armored
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('-----') && !l.startsWith('=') && !l.includes(':'))
    .join('');
  const bin = Buffer.from(body, 'base64');
  const first = bin[0];
  let tag: number;
  let start: number;
  let length: number;
  if (first & 0x40) {
    tag = first & 0x3f;
    if (bin[1] < 192) [start, length] = [2, bin[1]];
    else if (bin[1] < 224) [start, length] = [3, ((bin[1] - 192) << 8) + bin[2] + 192];
    else [start, length] = [6, bin.readUInt32BE(2)];
  } else {
    tag = (first & 0x3c) >> 2;
    const type = first & 3;
    if (type === 0) [start, length] = [2, bin[1]];
    else if (type === 1) [start, length] = [3, bin.readUInt16BE(1)];
    else [start, length] = [5, bin.readUInt32BE(1)];
  }
  expect(tag, 'first packet is a public key').toBe(6);
  const packet = bin.subarray(start, start + length);
  expect(packet[0], 'v4 key').toBe(4);
  const head = Buffer.from([0x99, length >> 8, length & 0xff]);
  return createHash('sha1').update(head).update(packet).digest('hex').toUpperCase();
}

test('the published key has the fingerprint the page shows', async ({ request }) => {
  const res = await request.get('/pubkey.asc');
  expect(res.status()).toBe(200);
  const armored = await res.text();
  expect(armored.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----')).toBe(true);
  expect(armored.includes('PRIVATE KEY')).toBe(false);
  expect(primaryFingerprint(armored)).toBe(FINGERPRINT.replaceAll(' ', ''));
});

test('contact section shows the fingerprint and links the key', async ({ page }) => {
  await page.goto('/');
  const tile = page.locator('#contact a.tile[href="/pubkey.asc"]');
  await expect(tile.locator('.label')).toHaveText('GPG');
  await expect(tile.locator('.value')).toHaveText(FINGERPRINT);
  const box = await tile.locator('.value').evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
  expect(box.scroll, 'fingerprint is not cut off').toBeLessThanOrEqual(box.client);
});

test('the fingerprint fits on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  const value = page.locator('#contact a.tile[href="/pubkey.asc"] .value');
  await expect(value).toHaveText(FINGERPRINT);
  const box = await value.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
  expect(box.scroll).toBeLessThanOrEqual(box.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
  });

  test('workspace 6 has a gpg window', async ({ page }) => {
    await page.keyboard.press('6');
    const win = page.locator('.wm-layer[data-ws="6"] .wm-window[aria-label="GPG"]');
    await expect(win.locator('.path')).toHaveText('~/kontakt/gpg');
    await expect(win.locator('a.tile')).toHaveAttribute('href', '/pubkey.asc');
    await expect(win.locator('.value')).toHaveText(FINGERPRINT);
  });

  test('cat pubkey prints fingerprint and url', async ({ page }) => {
    await page.keyboard.press('Enter');
    await expect(page.locator('.term input')).toBeFocused();
    await page.keyboard.type('ls');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term')).toContainText('pubkey');
    await page.keyboard.type('cat pubkey');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term')).toContainText(FINGERPRINT);
    await expect(page.locator('.term')).toContainText('https://paul.wtf/pubkey.asc');
  });
});
