import { test, expect } from '@playwright/test';

test('repos and the github contact live under paul-wtf', async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  expect(html.includes('github.com/SpotifyNutzeer')).toBe(false);

  await page.goto('/');
  for (const repo of ['linkhop', 'tidalwave', 'luna-plugins', 'streamcontroller-tidal', 'nixos']) {
    await expect(page.locator('#projects')).toContainText(`github.com/paul-wtf/${repo}`);
  }
  await expect(page.locator('#contact a[href="https://github.com/paul-wtf"]')).toContainText('paul-wtf');
});

test('the rodecaster bridge carries its current name and targets', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#projects .pcard', { hasText: 'rodecaster-volume-bridge' });
  await expect(card).toHaveAttribute('href', 'https://github.com/paul-wtf/rodecaster-volume-bridge');
  await expect(card).toContainText('Spotify');
  await expect(card).toContainText('Tidal');
  await expect(page.locator('#projects')).not.toContainText('rodecaster-tidal-bridge');
});

test('tidalwave mentions the insights page', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#projects .pcard', { hasText: 'tidalwave' }).first();
  for (const word of ['Insights', 'Streaks', 'Rekorde', 'Heatmap', 'Entdeckungen', 'An diesem Tag']) {
    await expect(card).toContainText(word);
  }
});
