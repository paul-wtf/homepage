import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, prepare, run } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

type Box = { x: number; y: number; w: number; h: number };

const html = (page: Page) => page.locator('html');
const scratch = (page: Page) => page.locator('.wm-scratch');
const layer = (page: Page, n: number) => page.locator(`.wm-layer[data-ws="${n}"]`);
const input = (page: Page) => page.locator('.wm-scratch .term input');

const box = (page: Page, selector: string): Promise<Box> =>
  page.locator(selector).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

async function show(page: Page) {
  await enterDesktop(page);
  await page.keyboard.press('s');
  await expect(html(page)).toHaveClass(/scratch-on/);
}

async function leaveInput(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('.wm-scratch .wm-window.is-focus')).toBeFocused();
}

test.describe('scratchpad', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('S slides it in above the workspace with a terminal', async ({ page }) => {
    await show(page);
    await expect(scratch(page)).toBeVisible();
    await expect(scratch(page).locator('.wm-window')).toHaveCount(1);
    await expect(scratch(page).locator('.wm-window')).toHaveAttribute('aria-label', 'Terminal');
    await expect(scratch(page).locator('.wm-window')).toHaveClass(/is-focus/);
    await expect(input(page)).toBeFocused();

    const area = await box(page, '.wm');
    const win = await box(page, '.wm-scratch .wm-window');
    expect(win.w).toBeLessThan(area.w * 0.85);
    expect(win.w).toBeGreaterThan(area.w * 0.7);
    expect(win.h).toBeLessThan(area.h * 0.85);
    expect(win.x + win.w / 2).toBeCloseTo(area.x + area.w / 2, 0);
    const top = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('.wm-scratch .wm-window'),
      [win.x + win.w / 2, win.y + win.h / 2]
    );
    expect(top).toBe(true);
  });

  test('the workspace below stays visible, dimmed and out of reach', async ({ page }) => {
    await show(page);
    await expect(layer(page, 1)).toBeVisible();
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(2);
    await expect(layer(page, 1)).toHaveCSS('filter', 'brightness(0.55)');
    await expect(page.locator('.wallpaper')).toHaveCSS('filter', 'brightness(0.55)');
    await expect(layer(page, 1)).toHaveAttribute('inert', '');
    await expect(layer(page, 1).locator('.wm-window.is-focus')).toHaveCount(0);
    await expect(page.locator('#top-nav a[data-section="about"]')).toHaveAttribute('aria-current', 'true');
  });

  test('S again and Esc hide it and give the focus back', async ({ page }) => {
    await show(page);
    await leaveInput(page);
    await page.keyboard.press('s');
    await expect(html(page)).not.toHaveClass(/scratch-on/);
    await expect(scratch(page)).toBeHidden();
    await expect(layer(page, 1)).not.toHaveAttribute('inert');
    await expect(layer(page, 1)).toHaveCSS('filter', 'none');
    await expect(layer(page, 1).locator('.wm-window.is-focus')).toBeFocused();

    await page.keyboard.press('s');
    await expect(scratch(page)).toBeVisible();
    await leaveInput(page);
    await page.keyboard.press('Escape');
    await expect(scratch(page)).toBeHidden();
    await expect(html(page)).toHaveClass(/desktop-on/);
    await page.keyboard.press('Escape');
    await expect(html(page)).not.toHaveClass(/desktop-on/);
  });

  test('the terminal keeps output and history while hidden, on every workspace', async ({ page }) => {
    await show(page);
    await run(page, 'whoami');
    await expect(scratch(page).locator('.term')).toContainText('Elektrotechniker am Erdgasspeicher Bierwang');
    await leaveInput(page);
    await page.keyboard.press('s');
    await expect(scratch(page)).toBeHidden();
    await page.keyboard.press('4');
    await expect(layer(page, 4)).toBeVisible();

    await page.keyboard.press('s');
    await expect(scratch(page)).toBeVisible();
    await expect(layer(page, 4)).toBeVisible();
    await expect(scratch(page).locator('.term')).toHaveCount(1);
    await expect(scratch(page).locator('.term')).toContainText('paul@paul.wtf ~> whoami');
    await expect(scratch(page).locator('.term')).toContainText('Elektrotechniker am Erdgasspeicher Bierwang');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(input(page)).toHaveValue('whoami');
  });

  test('a terminal that is open on a workspace moves in', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('Enter');
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(3);
    await run(page, 'whoami');
    await page.keyboard.press('Escape');
    await page.keyboard.press('2');
    await page.keyboard.press('s');
    await expect(scratch(page)).toBeVisible();
    await expect(page.locator('.term')).toHaveCount(1);
    await expect(scratch(page).locator('.term')).toContainText('Elektrotechniker am Erdgasspeicher Bierwang');
    await expect(input(page)).toBeFocused();
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(2);

    await run(page, 'exit');
    await expect(scratch(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/scratch-on/);
    await expect(page.locator('.term')).toHaveCount(0);
    await page.keyboard.press('1');
    const tiles = await page.$$eval('.wm-layer[data-ws="1"] .wm-window', (els) =>
      els.map((e) => e.getBoundingClientRect().width)
    );
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toBeCloseTo(tiles[1], 0);
  });

  test('a number key and ws hide it and switch', async ({ page }) => {
    await show(page);
    await leaveInput(page);
    await page.keyboard.press('3');
    await expect(scratch(page)).toBeHidden();
    await expect(layer(page, 3)).toBeVisible();
    await expect(layer(page, 3).locator('.wm-window.is-focus')).toBeFocused();

    await page.keyboard.press('s');
    await run(page, 'ws 5');
    await expect(scratch(page)).toBeHidden();
    await expect(layer(page, 5)).toBeVisible();
    await expect(layer(page, 5)).not.toHaveAttribute('inert');

    await page.keyboard.press('s');
    await leaveInput(page);
    await page.keyboard.press('5');
    await expect(scratch(page)).toBeHidden();
    await expect(layer(page, 5)).toBeVisible();
  });

  test('new windows open inside it and Q closes them', async ({ page }) => {
    await show(page);
    await leaveInput(page);
    await page.keyboard.press('Enter');
    const wins = scratch(page).locator('.wm-window');
    await expect(wins).toHaveCount(2);
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(2);
    const [a, b] = await page.$$eval('.wm-scratch .wm-window', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })
    );
    expect(a.x + a.w).toBeLessThanOrEqual(b.x);
    await page.keyboard.press('Escape');
    await page.keyboard.press('q');
    await expect(wins).toHaveCount(1);
    await expect(scratch(page)).toBeVisible();
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('q');
    await expect(wins).toHaveCount(0);
    await expect(scratch(page)).toBeHidden();
    await expect(html(page)).not.toHaveClass(/scratch-on/);
    await expect(layer(page, 1).locator('.wm-window.is-focus')).toBeFocused();

    await page.keyboard.press('s');
    await expect(wins).toHaveCount(1);
    await expect(scratch(page).locator('.term-row')).toHaveCount(1);
  });

  test('a click on the dimmed desktop hides it', async ({ page }) => {
    await show(page);
    const area = await box(page, '.wm');
    await page.mouse.click(area.x + 30, area.y + area.h / 2);
    await expect(scratch(page)).toBeHidden();
    await expect(html(page)).toHaveClass(/desktop-on/);
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(2);
  });

  test('the overview and leaving the desktop put it away', async ({ page }) => {
    await show(page);
    await leaveInput(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.wm')).toHaveClass(/is-overview/);
    await expect(html(page)).not.toHaveClass(/scratch-on/);
    await expect(scratch(page)).toBeHidden();
    await page.keyboard.press('s');
    await expect(scratch(page)).toBeHidden();
    await page.keyboard.press('Escape');

    await page.keyboard.press('s');
    await run(page, 'whoami');
    await leaveInput(page);
    await page.keyboard.press('d');
    await expect(html(page)).not.toHaveClass(/desktop-on|scratch-on/);
    await expect(page.locator('.wallpaper')).toHaveCSS('filter', 'none');
    await page.keyboard.press('d');
    await expect(scratch(page)).toBeHidden();
    await page.keyboard.press('s');
    await expect(scratch(page).locator('.term-row')).toHaveCount(1);
  });

  test('slides with the workspace transition, at once under reduced motion', async ({ page }) => {
    await show(page);
    await expect(scratch(page)).toHaveCSS('transition-duration', '0s');
    await expect(scratch(page)).toHaveCSS('transform', 'none');
    await leaveInput(page);
    await page.keyboard.press('s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('s');
    await expect(scratch(page)).toHaveCSS('transition-property', /transform/);
    await expect(scratch(page)).toHaveCSS('transition-duration', /0\.42s/);
    const area = await box(page, '.wm');
    await expect.poll(async () => (await box(page, '.wm-scratch')).y).toBeCloseTo(area.y, 0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('s');
    await expect(scratch(page)).toBeHidden();
  });

  test('stays away on the scroll page', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('s');
    await page.waitForTimeout(200);
    await expect(html(page)).not.toHaveClass(/scratch-on|desktop-on/);
    await expect(page.locator('.term')).toHaveCount(0);
  });

  test('the keybinds window and help name the key', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('?');
    const row = page.locator('.wm-window[aria-label="Tastenkürzel"] .keys .row', { hasText: 'Scratchpad' });
    await expect(row.locator('kbd')).toHaveText(['S']);
    await page.keyboard.press('s');
    await run(page, 'help');
    await expect(scratch(page).locator('.term')).toContainText('S blendet das Scratchpad');
  });
});
