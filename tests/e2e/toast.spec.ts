import { test, expect, type Page, type Request } from '@playwright/test';
import { status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const toast = (page: Page) => page.locator('.toast');
const track = (name: string, over: Record<string, unknown> = {}) =>
  status({ music: { ...status().music, track: name, artist: `${name} Artist`, ...over } });

async function serve(page: Page, first: unknown) {
  let body = first;
  await page.route('https://img.test/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' })
  );
  await page.route('**/api/status', (route) => (body === 'down' ? route.abort() : route.fulfill({ json: body })));
  await page.clock.install();
  await page.goto('/');
  return async (next: unknown, advance = 30_000) => {
    body = next;
    const isStatus = (r: Request) => r.url().endsWith('/api/status');
    const handled =
      next === 'down' ? page.waitForEvent('requestfailed', isStatus) : page.waitForEvent('requestfinished', isStatus);
    await page.clock.runFor(advance);
    await handled;
    await page.waitForTimeout(100);
  };
}

test.describe('track toast', () => {
  test('nothing on first load', async ({ page }) => {
    await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await page.waitForTimeout(200);
    await expect(toast(page)).toHaveCount(0);
    await expect(page.locator('[data-toasts]')).toHaveAttribute('aria-live', 'polite');
  });

  test('a new track slides in below the bar and leaves after a few seconds', async ({ page }) => {
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await next(track('Two'));
    await expect(toast(page)).toHaveCount(1);
    await expect(page.locator('[data-toasts][aria-live="polite"] .toast')).toHaveCount(1);
    await expect(toast(page).locator('.toast-title')).toHaveText('Two');
    await expect(toast(page).locator('.toast-body')).toHaveText('Two Artist');
    await expect(toast(page)).toContainText('läuft jetzt');
    await expect(toast(page).locator('img')).toHaveAttribute('src', 'https://img.test/cover.svg');
    await expect(toast(page).locator('img')).toHaveAttribute('alt', '');
    await expect(toast(page)).toHaveClass(/is-in/);
    await expect
      .poll(async () => {
        const box = (await toast(page).boundingBox())!;
        return box.x + box.width;
      })
      .toBeLessThanOrEqual(1400);
    const box = (await toast(page).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(44);
    expect(await toast(page).evaluate((e) => getComputedStyle(e).transitionDuration)).not.toBe('0s');

    await page.clock.runFor(4_000);
    await expect(toast(page)).toHaveCount(1);
    await page.clock.runFor(2_000);
    await expect(toast(page)).toHaveCount(0);
  });

  test('the same track again and the change from playing to recent stay silent', async ({ page }) => {
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await next(track('One'));
    await next(track('One', { state: 'recent', played_at: '2026-10-27T08:48:00Z' }));
    await expect(page.locator('[data-live="music"]')).toHaveAttribute('data-state', 'recent');
    await expect(toast(page)).toHaveCount(0);
  });

  test('an outage in between does not announce the old track again', async ({ page }) => {
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await next('down');
    for (let i = 0; i < 3; i++) await next('down', 120_000);
    await expect(page.locator('[data-live="music"]')).toBeHidden();
    await next(track('One'), 120_000);
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await expect(toast(page)).toHaveCount(0);
  });

  test('music starting while the page is open is announced', async ({ page }) => {
    const next = await serve(page, status({ music: null }));
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await next(track('First'));
    await expect(toast(page).locator('.toast-title')).toHaveText('First');
  });

  test('a second change replaces the toast, and it can be closed', async ({ page }) => {
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await next(track('Two'));
    await expect(toast(page)).toHaveCount(1);
    await page.clock.runFor(1_000);
    await next(track('<b>Three</b>', { image: null }));
    await expect(toast(page)).toHaveCount(1);
    await expect(toast(page).locator('.toast-title')).toHaveText('<b>Three</b>');
    await expect(toast(page).locator('img')).toHaveCount(0);
    await expect(toast(page).locator('b')).toHaveCount(0);
    await toast(page).getByRole('button', { name: 'Benachrichtigung schließen' }).click();
    await page.clock.runFor(500);
    await expect(toast(page)).toHaveCount(0);
  });

  test('no motion under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await next(track('Two'));
    await expect(toast(page)).toHaveCount(1);
    expect(await toast(page).evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
    expect(await toast(page).evaluate((e) => getComputedStyle(e).transform)).toBe('none');
    await page.clock.runFor(5_100);
    await expect(toast(page)).toHaveCount(0);
  });

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toBeVisible();
    await next(track('A very long track title that would not fit on one line of a phone'));
    await expect(toast(page)).toHaveClass(/is-in/);
    await page.clock.runFor(500);
    const box = (await toast(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('works in desktop mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
    const next = await serve(page, track('One'));
    await expect(page.locator('[data-live="music"]')).toContainText('One');
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await next(track('Two'));
    await expect(toast(page)).toBeVisible();
    const top = await toast(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(top).toBe(true);
  });
});
