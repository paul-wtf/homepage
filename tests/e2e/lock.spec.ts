import { test, expect, type Page } from '@playwright/test';
import { mockStatus, status } from './term';

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: 'Europe/Berlin', locale: 'de-DE' });

const IDLE = 5 * 60_000;
const lock = (page: Page) => page.locator('[data-lock]');
const html = (page: Page) => page.locator('html');

async function desktop(page: Page, body: unknown = status()) {
  await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
  await page.clock.install({ time: new Date('2026-11-12T20:15:00+01:00') });
  await mockStatus(page, body);
  await page.goto('/');
  await page.keyboard.press('d');
  await expect(html(page)).toHaveClass(/desktop-on/);
}

test.describe('lock screen', () => {
  test('appears after five minutes without input', async ({ page }) => {
    await desktop(page);
    await expect(lock(page)).toBeHidden();
    await page.clock.runFor(IDLE - 1_000);
    await expect(lock(page)).toBeHidden();
    await page.clock.runFor(1_000);
    await expect(lock(page)).toBeVisible();
    await expect(html(page)).toHaveClass(/is-locked/);
    await expect(lock(page)).toHaveAttribute('role', 'dialog');
    await expect(lock(page)).toHaveAttribute('aria-label', 'Sperrbildschirm');
    await expect(lock(page).locator('[data-lock-time]')).toHaveText('20:20');
    await expect(lock(page).locator('[data-lock-date]')).toHaveText('Donnerstag, 12. November');
    await expect(lock(page).locator('[data-lock-track]')).toHaveText('♪ Track · Artist');
    await expect(lock(page).locator('[data-lock-time]')).toHaveCSS('color', 'rgb(148, 226, 213)');
    await expect(lock(page).locator('.note')).toHaveCSS('color', 'rgb(148, 226, 213)');
    await expect(lock(page)).toBeFocused();
    await expect(page.locator('#top-nav')).toBeHidden();
    await expect(page.locator('.wm')).toBeHidden();
    await page.clock.runFor(60_000);
    await expect(lock(page).locator('[data-lock-time]')).toHaveText('20:21');
  });

  test('input pushes the lock back', async ({ page }) => {
    await desktop(page);
    await page.clock.runFor(IDLE - 60_000);
    await page.mouse.move(300, 300);
    await page.clock.runFor(IDLE - 60_000);
    await expect(lock(page)).toBeHidden();
    await page.keyboard.press('2');
    await page.clock.runFor(IDLE - 60_000);
    await expect(lock(page)).toBeHidden();
    await page.clock.runFor(60_000);
    await expect(lock(page)).toBeVisible();
  });

  test('a key unlocks and does nothing else', async ({ page }) => {
    await desktop(page);
    const windows = page.locator('.wm-layer[data-ws="1"] .wm-window');
    await expect(windows).toHaveCount(2);
    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    await page.keyboard.press('q');
    await expect(lock(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/is-locked/);
    await expect(windows).toHaveCount(2);
    await expect(page.locator('#top-nav')).toBeVisible();

    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lock(page)).toBeHidden();
    await expect(html(page)).toHaveClass(/desktop-on/);
  });

  test('a click unlocks and gives the focus back', async ({ page }) => {
    await desktop(page);
    await page.keyboard.press('Enter');
    const input = page.locator('.term input');
    await expect(input).toBeFocused();
    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    await expect(input).not.toBeFocused();
    await page.mouse.click(700, 450);
    await expect(lock(page)).toBeHidden();
    await expect(input).toBeFocused();
    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    await page.keyboard.press('x');
    await expect(lock(page)).toBeHidden();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
  });

  test('never on the scroll page, and leaving desktop mode disarms it', async ({ page }) => {
    await page.clock.install();
    await mockStatus(page);
    await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
    await page.goto('/');
    await page.clock.runFor(2 * IDLE);
    await expect(lock(page)).toBeHidden();

    await page.keyboard.press('d');
    await expect(html(page)).toHaveClass(/desktop-on/);
    await page.clock.runFor(IDLE - 60_000);
    await page.keyboard.press('Escape');
    await expect(html(page)).not.toHaveClass(/desktop-on/);
    await page.clock.runFor(2 * IDLE);
    await expect(lock(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/is-locked/);
  });

  test('shrinking the window while locked returns to the scroll page unlocked', async ({ page }) => {
    await desktop(page);
    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(lock(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/is-locked/);
    await expect(html(page)).not.toHaveClass(/desktop-on/);
    await expect(page.locator('#top-nav')).toBeVisible();
  });

  test('no track line without music', async ({ page }) => {
    await desktop(page, status({ music: null }));
    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    await expect(lock(page).locator('[data-lock-track]')).toBeHidden();
  });

  test('covers the page and has no transition under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await desktop(page);
    await page.clock.runFor(IDLE);
    await expect(lock(page)).toBeVisible();
    const box = (await lock(page).boundingBox())!;
    expect([box.x, box.y, box.height]).toEqual([0, 0, 900]);
    expect(box.width).toBeGreaterThan(1380);
    expect(await lock(page).evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    expect(await page.locator('[data-wallpaper]').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
  });
});
