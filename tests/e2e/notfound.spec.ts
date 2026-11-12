import { test, expect } from '@playwright/test';

test.describe('404', () => {
  test('shows the requested path as an unknown command', async ({ page }) => {
    const res = await page.goto('/gibt/es-nicht');
    expect(res?.status()).toBe(404);
    const box = page.locator('main .window');
    await expect(box.locator('.line').first()).toHaveText('paul@paul.wtf ~> /gibt/es-nicht');
    await expect(box.locator('.err')).toHaveText('fish: Unknown command: /gibt/es-nicht');
    await expect(box.locator('.err')).toHaveCSS('color', 'rgb(243, 139, 168)');
    await expect(box).toContainText('404');
    await expect(page.locator('h1')).toContainText('404');
    await expect(box.locator('a[href="/"]')).toHaveText('Zur Startseite →');
  });

  test('the link leads home', async ({ page }) => {
    await page.goto('/nope');
    await page.locator('main a[href="/"]').click();
    await expect(page.locator('#top-nav')).toBeVisible();
  });

  test('works without javascript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/gibt/es-nicht');
      await expect(page.locator('main .line').first()).toHaveText('paul@paul.wtf ~> ./diese-seite');
      await expect(page.locator('main .err')).toHaveText('fish: Unknown command: ./diese-seite');
      await expect(page.locator('main a[href="/"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('a path with markup stays text and long paths do not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/%3Cimg%20src=x%20onerror=window.pwned=1%3E/${'lang'.repeat(60)}`);
    await expect(page.locator('main .err')).toContainText('fish: Unknown command: /<img src=x onerror=window.pwned=1>/lang');
    await expect(page.locator('main img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('a path that does not decode as utf-8 is shown as it is', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // astro preview answers 500 for such a path itself, nginx serves the 404 page.
    const body = await (await request.get('/nope')).text();
    await page.route('**/kaputt-%ff', (route) => route.fulfill({ status: 404, contentType: 'text/html', body }));
    await page.goto('/kaputt-%ff');
    await expect(page.locator('main .err')).toHaveText('fish: Unknown command: /kaputt-%ff');
    expect(errors).toEqual([]);
  });

  test('the cursor does not blink under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/nope');
    await expect(page.locator('main .cur')).toHaveCSS('animation-name', 'none');
  });
});
