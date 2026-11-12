import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, mockStatus, prepare, status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const grid = () => {
  const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  g[2][21] = 6;
  g[5][14] = 3;
  return g;
};

export const week = (over: Record<string, unknown> = {}) => ({
  listens: 312,
  seconds: 64_800,
  artists: [
    { name: 'Kraftklub', count: 40, image: 'https://img.test/k.svg' },
    { name: 'AnnenMayKantereit', count: 20, image: null },
  ],
  tracks: [{ track: 'Songs für Liam', artist: 'Kraftklub', count: 9 }],
  grid: grid(),
  url: 'https://tidalwave.test/s/tok',
  ...over,
});

const win = (page: Page) => page.locator('.wm-layer[data-ws="5"] .wm-window:has([data-week])');

test.describe('music window', () => {
  test.beforeEach(async ({ page }) => prepare(page));

  test('is absent without a week', async ({ page }) => {
    await mockStatus(page, status());
    await enterDesktop(page);
    await page.keyboard.press('5');
    await expect(page.locator('.wm-layer[data-ws="5"] .wm-window')).toHaveCount(3);
    await expect(win(page)).toHaveCount(0);
  });

  test('shows the top artists, the grid and the link', async ({ page }) => {
    await mockStatus(page, status({ week: week() }));
    await page.goto('/');
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await page.keyboard.press('d');
    await page.keyboard.press('5');
    await expect(page.locator('.wm-layer[data-ws="5"] .wm-window')).toHaveCount(4);
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Musik');
    await expect(w.locator('.path')).toHaveText('~/sidefacts/musik');
    await expect(w.locator('[data-week-total]')).toHaveText('312 Scrobbles · 18 Std.');
    const artists = w.locator('[data-week-artists] li');
    await expect(artists).toHaveCount(2);
    await expect(artists.nth(0)).toContainText('Kraftklub');
    await expect(artists.nth(0)).toContainText('40');
    await expect(artists.nth(0).locator('img')).toHaveAttribute('src', 'https://img.test/k.svg');
    await expect(artists.nth(1).locator('img')).toHaveCount(0);
    const bars = await artists.locator('.bar').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.width));
    expect(bars).toEqual(['100%', '50%']);
    const cells = w.locator('[data-week-grid] .cell');
    await expect(cells).toHaveCount(168);
    await expect(cells.nth(2 * 24 + 21)).toHaveAttribute('data-level', '4');
    await expect(cells.nth(5 * 24 + 14)).toHaveAttribute('data-level', '2');
    await expect(cells.nth(0)).toHaveAttribute('data-level', '0');
    const track = w.locator('[data-week-tracks] a');
    await expect(track).toHaveText(/Songs für Liam.*Kraftklub/);
    await expect(track).toHaveAttribute('href', 'https://linkhop.paul.wtf/?q=Kraftklub%20Songs%20f%C3%BCr%20Liam');
    await expect(w.locator('a[data-week-link]')).toHaveAttribute('href', 'https://tidalwave.test/s/tok');
  });

  test('appears when the week arrives after the desktop was entered', async ({ page }) => {
    await page.clock.install();
    let body: unknown = status();
    await page.route('https://img.test/**', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' })
    );
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await enterDesktop(page);
    await page.keyboard.press('5');
    await expect(page.locator('.wm-layer[data-ws="5"] .wm-window')).toHaveCount(3);
    body = status({ week: week() });
    await page.clock.runFor(30_000);
    await expect(win(page)).toHaveCount(1);
    await expect(page.locator('.wm-layer[data-ws="5"] .wm-window')).toHaveCount(4);
    await expect(win(page)).not.toHaveClass(/is-focus/);
  });

  test('stays closed after Q', async ({ page }) => {
    await page.clock.install();
    let hits = 0;
    await page.route('**/api/status', (route) => {
      hits++;
      return route.fulfill({ json: status({ week: week() }) });
    });
    await enterDesktop(page);
    await page.keyboard.press('5');
    await win(page).hover();
    await expect(win(page)).toHaveClass(/is-focus/);
    await page.keyboard.press('q');
    await expect(win(page)).toHaveCount(0);
    const before = hits;
    await page.clock.runFor(30_000);
    await expect.poll(() => hits).toBeGreaterThan(before);
    await page.waitForTimeout(300);
    await expect(page.locator('.wm-layer[data-ws="5"] .wm-window')).toHaveCount(3);
  });

  test('follows the next answer and keeps the last week when it goes away', async ({ page }) => {
    await page.clock.install();
    let body: unknown = status({ week: week() });
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await enterDesktop(page);
    await page.keyboard.press('5');
    await expect(win(page).locator('[data-week-total]')).toHaveText('312 Scrobbles · 18 Std.');
    body = status({ week: week({ listens: 400 }) });
    await page.clock.runFor(30_000);
    await expect(win(page).locator('[data-week-total]')).toHaveText('400 Scrobbles · 18 Std.');
    body = status({ week: null });
    await page.clock.runFor(30_000);
    await expect(win(page)).toHaveCount(1);
    await expect(win(page).locator('[data-week-total]')).toHaveText('400 Scrobbles · 18 Std.');
  });

  test('ignores a malformed week', async ({ page }) => {
    await mockStatus(page, status({ week: week({ grid: [[1, 2]] }) }));
    await page.goto('/');
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await page.keyboard.press('d');
    await page.keyboard.press('5');
    await expect(win(page)).toHaveCount(0);
  });

  test('the launcher lists it only with a week', async ({ page }) => {
    const option = page.locator('[data-launcher] [role="option"]', { hasText: '~/sidefacts/musik' });
    await mockStatus(page, status());
    await enterDesktop(page);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('musik');
    await expect(page.locator('[data-launcher] [role="option"]').first()).toBeVisible();
    await expect(option).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.unroute('**/api/status');
    await mockStatus(page, status({ week: week() }));
    await page.reload();
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('musik');
    await expect(option).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(win(page)).toHaveClass(/is-focus/);
  });

  test('english', async ({ page }) => {
    await mockStatus(page, status({ week: week() }));
    await page.goto('/en');
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await page.keyboard.press('d');
    await page.keyboard.press('5');
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Music');
    await expect(w.locator('.path')).toHaveText('~/sidefacts/music');
    await expect(w.locator('[data-week-total]')).toHaveText('312 scrobbles · 18 h');
    await expect(w.locator('a[data-week-link]')).toHaveText('More on tidalwave');
  });
});
