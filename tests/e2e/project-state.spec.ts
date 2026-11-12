import { test, expect, type Page } from '@playwright/test';
import { mockStatus, status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const badge = (page: Page, name: string) => page.locator(`#projects .live[data-project="${name}"]`);
const GREEN = 'rgb(166, 227, 161)';
const RED = 'rgb(243, 139, 168)';

test.describe('live badge', () => {
  test('shows up and down from the status api', async ({ page }) => {
    await mockStatus(page, status({ projects: { linkhop: 'up', tidalwave: 'down' } }));
    await page.goto('/');
    await expect(badge(page, 'linkhop')).toHaveAttribute('data-state', 'up');
    await expect(badge(page, 'linkhop')).toHaveText('live · linkhop.paul.wtf');
    await expect(badge(page, 'linkhop')).toHaveCSS('color', GREEN);
    await expect(badge(page, 'tidalwave')).toHaveAttribute('data-state', 'down');
    await expect(badge(page, 'tidalwave')).toHaveText('down · tidalwave.paul.wtf');
    await expect(badge(page, 'tidalwave')).toHaveCSS('color', RED);
    const dot = (name: string) => badge(page, name).evaluate((e) => getComputedStyle(e, '::before').backgroundColor);
    expect(await dot('linkhop')).toBe(GREEN);
    expect(await dot('tidalwave')).toBe(RED);
  });

  test('stays as it is when the api is down', async ({ page }) => {
    let hits = 0;
    await page.route('**/api/status', (route) => {
      hits++;
      return route.abort();
    });
    await page.goto('/');
    await expect.poll(() => hits).toBeGreaterThan(0);
    await page.waitForTimeout(200);
    for (const name of ['linkhop', 'tidalwave']) {
      await expect(badge(page, name)).not.toHaveAttribute('data-state');
      await expect(badge(page, name)).toHaveText(`live · ${name}.paul.wtf`);
      await expect(badge(page, name)).toHaveCSS('color', GREEN);
      expect(await badge(page, name).evaluate((e) => getComputedStyle(e, '::before').content)).toBe('none');
    }
  });

  test('stays as it is without the field or with values it does not know', async ({ page }) => {
    await mockStatus(page, status({ projects: { linkhop: 'maybe', tidalwave: 1 } }));
    await page.goto('/');
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await expect(badge(page, 'linkhop')).not.toHaveAttribute('data-state');
    await expect(badge(page, 'tidalwave')).toHaveText('live · tidalwave.paul.wtf');
    await page.unroute('**/api/status');
    await mockStatus(page, status());
    await page.reload();
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await expect(badge(page, 'linkhop')).not.toHaveAttribute('data-state');
  });

  test('follows the next answer', async ({ page }) => {
    await page.clock.install();
    let body = status({ projects: { linkhop: 'down', tidalwave: 'up' } });
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await page.goto('/');
    await expect(badge(page, 'linkhop')).toHaveText('down · linkhop.paul.wtf');
    body = status({ projects: { linkhop: 'up', tidalwave: 'up' } });
    await page.clock.runFor(30_000);
    await expect(badge(page, 'linkhop')).toHaveText('live · linkhop.paul.wtf');
    await expect(badge(page, 'linkhop')).toHaveAttribute('data-state', 'up');
    body = status({ projects: null });
    await page.clock.runFor(30_000);
    await expect(badge(page, 'linkhop')).not.toHaveAttribute('data-state');
  });

  test('desktop windows show the same state', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockStatus(page, status({ projects: { linkhop: 'up', tidalwave: 'down' } }));
    await page.goto('/');
    await expect(badge(page, 'tidalwave')).toHaveAttribute('data-state', 'down');
    await page.keyboard.press('d');
    await page.keyboard.press('2');
    const win = page.locator('.wm-layer[data-ws="2"] .live[data-project="tidalwave"]');
    await expect(win).toHaveText('down · tidalwave.paul.wtf');
    await expect(win).toHaveCSS('color', RED);
    await expect(page.locator('.wm-layer[data-ws="2"] .live[data-project="linkhop"]')).toHaveAttribute('data-state', 'up');
  });
});
