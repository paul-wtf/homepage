import { test, expect, type Page } from '@playwright/test';
import { mockStatus, status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const bars = (page: Page) => page.locator('[data-live="music"] .eq i');
const animations = (page: Page) => bars(page).evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));

test.describe('equalizer', () => {
  test('three bars move while a track is playing', async ({ page }) => {
    await mockStatus(page);
    await page.goto('/');
    await expect(bars(page)).toHaveCount(3);
    await expect(page.locator('[data-live="music"] .eq')).toBeVisible();
    await expect(page.locator('[data-live="music"] .eq')).toHaveAttribute('aria-hidden', 'true');
    for (const name of await animations(page)) expect(name).not.toBe('none');
    const durations = await bars(page).evaluateAll((els) => els.map((e) => getComputedStyle(e).animationDuration));
    expect(new Set(durations).size).toBe(3);
  });

  test('the bars stand still for a recent track', async ({ page }) => {
    await mockStatus(page, status({ music: { ...status().music, state: 'recent', played_at: '2026-10-27T08:48:00Z' } }));
    await page.goto('/');
    await expect(page.locator('[data-live="music"] .eq')).toBeVisible();
    expect(await animations(page)).toEqual(['none', 'none', 'none']);
  });

  test('the bars stand still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockStatus(page);
    await page.goto('/');
    await expect(page.locator('[data-live="music"] .eq')).toBeVisible();
    expect(await animations(page)).toEqual(['none', 'none', 'none']);
  });

  test('no bars without music', async ({ page }) => {
    await mockStatus(page, status({ music: null }));
    await page.goto('/');
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await expect(page.locator('.eq')).toHaveCount(1);
    await expect(page.locator('.eq')).toBeHidden();
  });

  test('the bars stop when playback ends', async ({ page }) => {
    await page.clock.install();
    let body = status();
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await page.goto('/');
    await expect(page.locator('[data-live="music"]')).toHaveAttribute('data-state', 'playing');
    body = status({ music: { ...status().music, state: 'recent', played_at: '2026-10-27T08:48:00Z' } });
    await page.clock.runFor(30_000);
    await expect(page.locator('[data-live="music"]')).toHaveAttribute('data-state', 'recent');
    expect(await animations(page)).toEqual(['none', 'none', 'none']);
  });
});
