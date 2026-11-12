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

test.describe('project meta from the build', () => {
  test('release tag and last commit show on the card', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('#projects .pcard', { hasText: 'linkhop' }).first().locator('.meta');
    await expect(meta).toContainText('v9.9.9');
    await expect(meta).toContainText('letzter Commit 17.09.2026');
    await expect(meta.locator('time')).toHaveAttribute('datetime', '2026-09-17T17:20:54Z');
  });

  test('a project without a release only shows the commit date, in Berlin time', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('#projects .pcard', { hasText: 'tidalwave' }).first().locator('.meta');
    await expect(meta).toHaveText('letzter Commit 07.11.2026');
  });

  test('a project without data renders no meta element', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#projects .pcard')).toHaveCount(6);
    await expect(page.locator('#projects .pcard .meta')).toHaveCount(2);
    await expect(page.locator('#projects .pcard', { hasText: 'System-Setup' }).locator('.meta')).toHaveCount(0);
  });

  test('desktop windows carry the same meta', async ({ page }) => {
    await page.goto('/');
    const text = await page.$eval(
      'template[data-window][data-label="linkhop"]',
      (t) => (t as HTMLTemplateElement).content.querySelector('.meta')?.textContent ?? ''
    );
    expect(text).toContain('v9.9.9');
    expect(text).toContain('letzter Commit 17.09.2026');
  });
});
