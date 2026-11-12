import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, prepare } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

type Box = { x: number; y: number; w: number; h: number };

const TEAL = 'rgb(148, 226, 213)';
const wm = (page: Page) => page.locator('.wm');
const cells = (page: Page) => page.locator('.wm-overview .wm-cell');
const cell = (page: Page, n: number) => page.locator(`.wm-overview .wm-cell[data-ws="${n}"]`);
const layer = (page: Page, n: number) => page.locator(`.wm-layer[data-ws="${n}"]`);

const box = (page: Page, selector: string): Promise<Box> =>
  page.locator(selector).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

async function open(page: Page) {
  await enterDesktop(page);
  await page.keyboard.press('Tab');
  await expect(wm(page)).toHaveClass(/is-overview/);
}

test.describe('workspace overview', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('Tab shows the six workspaces as a grid with numbers and names', async ({ page }) => {
    await open(page);
    await expect(cells(page)).toHaveCount(6);
    await expect(cells(page)).toHaveText(['1 über mich', '2 projekte', '3 tools', '4 hardware', '5 sidefacts', '6 kontakt']);
    await expect(page.locator('.wm-overview')).toHaveAttribute('role', 'group');
    await expect(page.locator('.wm-overview')).toHaveAttribute('aria-label', 'Workspace-Übersicht');

    const area = await box(page, '.wm');
    const tiles: Box[] = [];
    for (let n = 1; n <= 6; n++) {
      await expect(layer(page, n)).toBeVisible();
      tiles.push(await box(page, `.wm-layer[data-ws="${n}"]`));
    }
    for (const t of tiles) {
      expect(t.w).toBeLessThan(area.w / 3);
      expect(t.w).toBeGreaterThan(area.w / 4);
      expect(t.w / t.h).toBeCloseTo(area.w / area.h, 1);
      expect(t.x).toBeGreaterThanOrEqual(area.x);
      expect(t.y).toBeGreaterThanOrEqual(area.y);
      expect(t.x + t.w).toBeLessThanOrEqual(area.x + area.w);
      expect(t.y + t.h).toBeLessThanOrEqual(area.y + area.h);
    }
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) expect(overlaps(tiles[a], tiles[b])).toBe(false);
    expect(tiles[1].y).toBeCloseTo(tiles[0].y, 0);
    expect(tiles[2].x).toBeGreaterThan(tiles[1].x);
    expect(tiles[3].x).toBeCloseTo(tiles[0].x, 0);
    expect(tiles[3].y).toBeGreaterThan(tiles[0].y + tiles[0].h);
  });

  test('the active workspace is marked and focused', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('4');
    await page.keyboard.press('Tab');
    await expect(page.locator('.wm-cell[aria-current="true"]')).toHaveCount(1);
    await expect(cell(page, 4)).toHaveAttribute('aria-current', 'true');
    await expect(cell(page, 4)).toBeFocused();
    await expect(cell(page, 4).locator('.wm-cell-label')).toHaveCSS('background-color', TEAL);
    await expect(cell(page, 4).locator('.wm-cell-label')).toHaveCSS('color', 'rgb(17, 17, 27)');
    await expect(cell(page, 1).locator('.wm-cell-label')).not.toHaveCSS('background-color', TEAL);
  });

  test('the miniatures are the real windows, scaled down and out of reach', async ({ page }) => {
    await open(page);
    const wins = layer(page, 4).locator('.wm-window');
    await expect(wins).toHaveCount(3);
    await expect(wins.first()).toBeVisible();
    await expect(wins.first()).toContainText('AMD Ryzen 9 9950X3D');
    const w = await box(page, '.wm-layer[data-ws="4"] .wm-window[aria-label="Workstation"]');
    const tile = await box(page, '.wm-layer[data-ws="4"]');
    expect(w.w).toBeLessThan(tile.w / 2);
    expect(w.w).toBeGreaterThan(tile.w / 3);
    await expect(layer(page, 4)).toHaveAttribute('inert', '');
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('.wm-cell')?.getAttribute('data-ws'),
      [w.x + w.w / 2, w.y + w.h / 2]
    );
    expect(hit).toBe('4');
  });

  test('a number key switches to the workspace', async ({ page }) => {
    await open(page);
    await page.keyboard.press('4');
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(page.locator('.wm-overview')).toBeHidden();
    await expect(layer(page, 4)).toBeVisible();
    await expect(layer(page, 1)).toBeHidden();
    await expect(layer(page, 4)).not.toHaveAttribute('inert');
    const area = await box(page, '.wm');
    const full = await box(page, '.wm-layer[data-ws="4"]');
    expect(full.w).toBeCloseTo(area.w, 0);
    expect(full.x).toBeCloseTo(area.x, 0);
    await expect(page.locator('#top-nav a[data-section="hardware"]')).toHaveAttribute('aria-current', 'true');
    await expect(layer(page, 4).locator('.wm-window.is-focus')).toBeFocused();
  });

  test('a click switches to the workspace', async ({ page }) => {
    await open(page);
    await cell(page, 6).click();
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(layer(page, 6)).toBeVisible();
    await expect(layer(page, 1)).toBeHidden();
    await expect(page.locator('#top-nav a[data-section="contact"]')).toHaveAttribute('aria-current', 'true');
  });

  test('Tab again and Esc return to where it was opened', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('2');
    await page.keyboard.press('Tab');
    await expect(wm(page)).toHaveClass(/is-overview/);
    await page.keyboard.press('Tab');
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(layer(page, 2)).toBeVisible();
    await expect(layer(page, 3)).toBeHidden();

    await page.keyboard.press('Tab');
    await expect(wm(page)).toHaveClass(/is-overview/);
    await page.keyboard.press('Escape');
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await expect(layer(page, 2).locator('.wm-window.is-focus')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });

  test('arrow keys walk the grid and Enter picks', async ({ page }) => {
    await open(page);
    await expect(cell(page, 1)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 2)).toBeFocused();
    await page.keyboard.press('j');
    await expect(cell(page, 5)).toBeFocused();
    await page.keyboard.press('h');
    await expect(cell(page, 4)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(cell(page, 4)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, 1)).toBeFocused();
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('Enter');
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(layer(page, 3)).toBeVisible();
    await expect(page.locator('.term')).toHaveCount(0);
  });

  test('an empty workspace stays dimmed', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('3');
    await page.keyboard.press('q');
    await expect(layer(page, 3).locator('.wm-window')).toHaveCount(0);
    await page.keyboard.press('1');
    await page.keyboard.press('Tab');
    await expect(cell(page, 3)).toHaveClass(/\bis-empty\b/);
    await expect(cell(page, 2)).not.toHaveClass(/\bis-empty\b/);
    await expect(cell(page, 3).locator('.wm-cell-label')).toHaveCSS('color', 'rgb(108, 112, 134)');
    const dim = await layer(page, 3).evaluate((e) => getComputedStyle(e).backgroundColor);
    const lit = await layer(page, 2).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(dim).not.toBe(lit);
  });

  test('the other keys rest while it is open', async ({ page }) => {
    await open(page);
    await page.keyboard.press('q');
    await page.keyboard.press('f');
    await page.keyboard.press('?');
    await page.keyboard.press('Shift+Enter');
    await expect(wm(page)).toHaveClass(/is-overview/);
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(2);
    await expect(page.locator('.wm-window.is-full')).toHaveCount(0);
    await expect(page.locator('[data-launcher]')).toBeHidden();
    await page.keyboard.press('d');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    await page.keyboard.press('d');
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(layer(page, 1)).toBeVisible();
    await expect(layer(page, 2)).toBeHidden();
  });

  test('the bar switches workspaces from the overview', async ({ page }) => {
    await open(page);
    await page.locator('#top-nav a[data-section="tools"]').click();
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(layer(page, 3)).toBeVisible();
    await expect(layer(page, 1)).toBeHidden();
  });

  test('Tab keeps walking the links when one has focus', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('6');
    await layer(page, 6).locator('a.tile').first().focus();
    await page.keyboard.press('Tab');
    await expect(wm(page)).not.toHaveClass(/is-overview/);
  });

  test('stays closed on the scroll page, where Tab moves the focus', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('#top-nav .brand')).toBeFocused();
    await expect(wm(page)).not.toHaveClass(/is-overview/);
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });

  test('zooms with the workspace transition, at once under reduced motion', async ({ page }) => {
    await open(page);
    await expect(layer(page, 2)).toHaveCSS('transition-duration', '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(layer(page, 2)).toHaveCSS('transition-property', /transform/);
    await expect(layer(page, 2)).toHaveCSS('transition-duration', /0\.42s/);
    await page.keyboard.press('5');
    await expect(layer(page, 5)).toBeVisible();
    await expect(layer(page, 1)).toBeHidden();
    const area = await box(page, '.wm');
    await expect.poll(async () => (await box(page, '.wm-layer[data-ws="5"]')).w).toBeCloseTo(area.w, 0);
  });

  test('the keybinds window lists the key', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('?');
    const row = page.locator('.wm-window[aria-label="Tastenkürzel"] .keys .row', { hasText: 'Übersicht aller Workspaces' });
    await expect(row.locator('kbd')).toHaveText(['Tab']);
  });
});
