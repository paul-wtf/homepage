import { test, expect } from '@playwright/test';

test('home renders name and six nav workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Reitmayer');
  await expect(page.locator('#top-nav a[data-section]')).toHaveCount(6);
});
