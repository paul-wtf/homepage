import { test, expect } from '@playwright/test';

test('portrait is focused at the top', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.window.is-focus')).toHaveCount(1);
  await expect(page.locator('.hero .window.is-focus')).toHaveCount(1);
});

test('focus moves to a project window when scrolled there', async ({ page }) => {
  await page.goto('/');
  await page.locator('#projects').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 300);
  await expect(page.locator('#projects .window.is-focus')).toHaveCount(1);
  await expect(page.locator('.window.is-focus')).toHaveCount(1);
  await expect(page.locator('#projects.is-current .ws')).toHaveCSS('background-color', 'rgb(148, 226, 213)');
});

test('focus returns to the portrait at the top and is-current clears', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#hardware')!.getBoundingClientRect().top + window.scrollY));
  await expect(page.locator('#hardware .window.is-focus')).toHaveCount(1);
  await expect(page.locator('section.is-current')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.hero .window.is-focus')).toHaveCount(1);
  await expect(page.locator('.window.is-focus')).toHaveCount(1);
  await expect(page.locator('section.is-current')).toHaveCount(0);
});

test('focus ring has no transition under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const focused = page.locator('.window.is-focus');
  await expect(focused).toHaveCount(1);
  expect(await focused.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
});
