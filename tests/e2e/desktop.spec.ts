import { test, expect, type Page } from '@playwright/test';

type Box = { x: number; y: number; w: number; h: number };

test.use({ viewport: { width: 1400, height: 900 } });

const markKeybindsSeen = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));

async function enter(page: Page) {
  await page.keyboard.press('d');
  await expect(page.locator('html')).toHaveClass(/desktop-on/);
}

const boxes = (page: Page, ws: number): Promise<Box[]> =>
  page.$$eval(`.wm-layer[data-ws="${ws}"] .wm-window`, (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );

const focusedBox = (page: Page): Promise<Box> =>
  page.locator('.wm-layer:not(.is-parked) .wm-window.is-focus').evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

const union = (bs: Box[]): Box => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...bs.map((b) => b.x + b.w)) - x,
    h: Math.max(...bs.map((b) => b.y + b.h)) - y,
  };
};

function expectBoxClose(actual: Box, expected: Box) {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(actual[k]).toBeCloseTo(expected[k], 0);
}

test.describe('desktop mode', () => {
  test.beforeEach(async ({ page }) => {
    await markKeybindsSeen(page);
  });

  test('D enters, Esc leaves, focus returns to toggle', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#desktop-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await enter(page);
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.wm-window.is-focus')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toBeFocused();
  });

  test.describe('geometry', () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('workspace 1 tiles two windows without overlap', async ({ page }) => {
      await page.goto('/');
      await enter(page);
      await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(2);
      const wm = await page.locator('.wm').evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const bs = await boxes(page, 1);
      for (const b of bs) {
        expect(b.w).toBeGreaterThan(100);
        expect(b.h).toBeGreaterThan(100);
        expect(b.x).toBeGreaterThanOrEqual(wm.x);
        expect(b.y).toBeGreaterThanOrEqual(wm.y);
        expect(b.x + b.w).toBeLessThanOrEqual(wm.x + wm.w);
        expect(b.y + b.h).toBeLessThanOrEqual(wm.y + wm.h);
      }
      expect(overlaps(bs[0], bs[1])).toBe(false);
      await expect(page.locator('.wm-layer[data-ws="1"] .wm-window').first()).toHaveAttribute('role', 'region');
      await expect(page.locator('.wm-layer[data-ws="1"] .wm-window').first()).toHaveAttribute('aria-label', 'about');
    });

    test('number keys switch workspaces', async ({ page }) => {
      await page.goto('/');
      await enter(page);
      await page.keyboard.press('4');
      const layer = page.locator('.wm-layer[data-ws="4"]');
      await expect(layer).toBeVisible();
      await expect(layer.locator('.wm-window')).toHaveCount(3);
      await expect(page.locator('.wm-layer[data-ws="1"]')).toBeHidden();
      await expect(page.locator('#top-nav a[data-section="hardware"]')).toHaveAttribute('aria-current', 'true');
      await expect(page.locator('#top-nav a[aria-current]')).toHaveCount(1);

      await page.locator('#top-nav a[data-section="projects"]').click();
      await expect(page.locator('.wm-layer[data-ws="2"]')).toBeVisible();
      await expect(page.locator('.wm-layer[data-ws="4"]')).toBeHidden();
      expect(await page.evaluate(() => location.hash)).toBe('');
    });

    test('Q closes the focused window and the rest re-tile', async ({ page }) => {
      await page.goto('/');
      await enter(page);
      await page.keyboard.press('2');
      const wins = page.locator('.wm-layer[data-ws="2"] .wm-window');
      await expect(wins).toHaveCount(3);
      const area = union(await boxes(page, 2));

      await page.keyboard.press('q');
      await expect(wins).toHaveCount(2);
      const bs = await boxes(page, 2);
      expect(overlaps(bs[0], bs[1])).toBe(false);
      expectBoxClose(union(bs), area);
      await expect(page.locator('.wm-layer[data-ws="2"] .wm-window.is-focus')).toHaveCount(1);

      await page.keyboard.press('q');
      await page.keyboard.press('q');
      await expect(wins).toHaveCount(0);
      await expect(page.locator('#top-nav a[data-section="projects"]')).toHaveClass(/\bempty\b/);
      await expect(page.locator('#top-nav a[data-section="about"]')).not.toHaveClass(/\bempty\b/);

      await page.keyboard.press('Escape');
      await enter(page);
      await page.keyboard.press('2');
      await expect(wins).toHaveCount(3);
    });

    test('F toggles fullscreen', async ({ page }) => {
      await page.goto('/');
      await enter(page);
      const area = union(await boxes(page, 1));
      const before = await focusedBox(page);
      expect(before.w).toBeLessThan(area.w - 1);

      await page.keyboard.press('f');
      await expect(page.locator('.wm-window.is-full')).toHaveCount(1);
      expectBoxClose(await focusedBox(page), area);

      await page.keyboard.press('f');
      await expect(page.locator('.wm-window.is-full')).toHaveCount(0);
      expectBoxClose(await focusedBox(page), before);
    });

    test('hjkl moves focus', async ({ page }) => {
      await page.goto('/');
      await enter(page);
      await page.keyboard.press('4');
      const focused = page.locator('.wm-layer[data-ws="4"] .wm-window.is-focus');
      await expect(focused).toHaveAttribute('aria-label', 'workstation');
      await page.keyboard.press('l');
      await expect(focused).toHaveAttribute('aria-label', /^(laptop|server)$/);
      await expect(focused).toBeFocused();
      await page.keyboard.press('j');
      await expect(focused).toHaveAttribute('aria-label', 'server');
      await page.keyboard.press('k');
      await expect(focused).toHaveAttribute('aria-label', 'laptop');
      await page.keyboard.press('h');
      await expect(focused).toHaveAttribute('aria-label', 'workstation');
      await page.keyboard.press('ArrowRight');
      await expect(focused).toHaveAttribute('aria-label', /^(laptop|server)$/);
    });
  });

  test('keys ignored with Ctrl and on the scroll page', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+d');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);

    const y = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('2');
    await page.keyboard.press('q');
    await page.waitForTimeout(300);
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
    await expect(page.locator('.wm-window')).toHaveCount(0);

    await enter(page);
    await page.keyboard.press('Control+2');
    await page.keyboard.press('Alt+4');
    await page.keyboard.press('Meta+q');
    await page.waitForTimeout(300);
    await expect(page.locator('.wm-layer[data-ws="1"]')).toBeVisible();
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(2);
  });

  test('mode is remembered across reload', async ({ page }) => {
    await page.goto('/');
    await enter(page);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    await page.reload();
    await expect(page.locator('#desktop-toggle')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });

  test('toggle hidden below 900px and on coarse pointers', async ({ page, browser }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    await expect(page.locator('#desktop-toggle')).toBeHidden();
    await page.keyboard.press('d');
    await page.waitForTimeout(200);
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.locator('#desktop-toggle')).toBeVisible();

    const touch = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const tp = await touch.newPage();
      await tp.goto('/');
      expect(await tp.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(false);
      await expect(tp.locator('#desktop-toggle')).toBeHidden();
      await tp.keyboard.press('d');
      await tp.waitForTimeout(200);
      await expect(tp.locator('html')).not.toHaveClass(/desktop-on/);
    } finally {
      await touch.close();
    }
  });

  test('shrinking below 900px returns to the scroll page', async ({ page }) => {
    await page.goto('/');
    await enter(page);
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    await expect(page.locator('#desktop-toggle')).toBeHidden();
  });

  test('toggle button enters and leaves', async ({ page }) => {
    await page.goto('/');
    await page.locator('#desktop-toggle').click();
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await page.locator('#desktop-toggle').click();
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });

  test('window content is styled and contact actions work', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await enter(page);
    const path = page.locator('.wm-layer[data-ws="1"] .wm-window .path').first();
    await expect(path).toHaveCSS('color', 'rgb(147, 153, 178)');
    await page.keyboard.press('6');
    const email = page.locator('.wm-layer[data-ws="6"] [data-email-text]');
    await expect(email).toHaveText('paul.reitmayer@paul.wtf');
    const discord = page.locator('.wm-layer[data-ws="6"] [data-discord]');
    await discord.click();
    await expect(discord.locator('[data-discord-text]')).toHaveText('Kopiert!');
  });
});

test('keybinds window opens once, ? reopens it', async ({ page }) => {
  await page.goto('/');
  await enter(page);
  const kb = page.locator('.wm-layer[data-ws="1"] .wm-window[aria-label="keybinds"]');
  await expect(kb).toHaveCount(1);
  await expect(kb).toHaveClass(/is-focus/);
  await expect(kb).toContainText('Workspace');
  await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await enter(page);
  await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(2);
  await expect(page.locator('.wm-window[aria-label="keybinds"]')).toHaveCount(0);

  await page.keyboard.press('3');
  await page.keyboard.press('Shift+?');
  await expect(page.locator('.wm-layer[data-ws="3"] .wm-window[aria-label="keybinds"]')).toHaveCount(1);
  await page.keyboard.press('?');
  await expect(page.locator('.wm-window[aria-label="keybinds"]')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/desktop-on/);
  await expect(page.locator('.wm-window[aria-label="keybinds"]')).toHaveCount(0);
});
