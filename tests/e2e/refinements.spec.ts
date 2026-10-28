import { test, expect } from '@playwright/test';

test('hero prompt and two-line name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero .prompt')).toContainText('paul@paul.wtf:~$ whoami');
  const em = page.locator('.hero h1 em');
  expect(await em.evaluate((e) => getComputedStyle(e).display)).toBe('block');
});

test('section titles carry workspace numbers 1-6', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section .section-title .ws')).toHaveText(['1', '2', '3', '4', '5', '6']);
  await expect(page.locator('section[data-ws]')).toHaveCount(6);
});

test('labels are not teal', async ({ page }) => {
  await page.goto('/');
  const teal = 'rgb(148, 226, 213)';
  for (const sel of ['.hero .prompt', '#tools dt', '#hardware .cat-label']) {
    expect(await page.locator(sel).first().evaluate((e) => getComputedStyle(e).color)).not.toBe(teal);
  }
});

test('fastfetch shows the NixOS logo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tools pre.logo')).toBeVisible();
});
