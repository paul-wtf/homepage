import { test, expect, type Page } from '@playwright/test';
import { mockStatus, status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const wall = (page: Page) => page.locator('[data-wallpaper]');
const weather = (code: number, is_day = true) => status({ weather: { temp_c: 1.5, code, is_day, wind_kmh: 9 } });

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

const snap = (page: Page) =>
  page.locator('[data-particles]').evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let hash = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) hash = (hash * 31 + i) | 0;
    return hash;
  });

const inked = (page: Page) =>
  page.locator('[data-particles]').evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
    return n;
  });

async function show(page: Page, body: unknown) {
  await mockStatus(page, body);
  await page.goto('/');
  await expect(page.locator('[data-live="weather"]')).toBeVisible();
}

test.describe('wallpaper', () => {
  test('without data it is the moon over four ridges', async ({ page }) => {
    await page.route('**/api/status', (route) => route.abort());
    await page.goto('/');
    await page.waitForTimeout(300);
    await expect(wall(page)).toHaveAttribute('aria-hidden', 'true');
    await expect(wall(page)).not.toHaveAttribute('data-sky');
    await expect(wall(page)).not.toHaveAttribute('data-weather');
    await expect(wall(page).locator('[data-moon]')).toBeVisible();
    await expect(wall(page).locator('[data-sun]')).toBeHidden();
    await expect(wall(page).locator('path.hill')).toHaveCount(4);
    await expect(wall(page).locator('path.hill').first()).toHaveCSS('fill', 'rgb(28, 32, 48)');
    await expect(page.locator('[data-particles]')).toBeHidden();
    const box = (await wall(page).boundingBox())!;
    expect([box.x, box.y, box.height]).toEqual([0, 0, 900]);
    expect(box.width).toBeGreaterThan(1380);
  });

  test('the 404 page has the same wallpaper', async ({ page }) => {
    await page.goto('/nope');
    await expect(wall(page).locator('[data-moon]')).toBeVisible();
    await expect(wall(page).locator('path.hill')).toHaveCount(4);
  });

  test('the sun is out by day', async ({ page }) => {
    await show(page, weather(0, true));
    await expect(wall(page)).toHaveAttribute('data-sky', 'day');
    await expect(wall(page)).toHaveAttribute('data-weather', 'clear');
    await expect(wall(page).locator('[data-sun]')).toBeVisible();
    await expect(wall(page).locator('[data-moon]')).toBeHidden();
    await expect(wall(page).locator('[data-sun]')).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-particles]')).toBeHidden();
  });

  test('the moon is out at night', async ({ page }) => {
    await show(page, weather(0, false));
    await expect(wall(page)).toHaveAttribute('data-sky', 'night');
    await expect(wall(page).locator('[data-moon]')).toBeVisible();
    await expect(wall(page).locator('[data-sun]')).toBeHidden();
  });

  test('an overcast sky dims the sun', async ({ page }) => {
    await show(page, weather(3, true));
    await expect(wall(page).locator('[data-sun]')).toBeVisible();
    await expect(wall(page).locator('[data-sun]')).toHaveCSS('opacity', '0.5');
  });

  test('fog lightens the ridges', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await show(page, weather(45, false));
    await expect(wall(page)).toHaveAttribute('data-weather', 'fog');
    await expect(page.locator('[data-particles]')).toBeHidden();
    const light = () =>
      wall(page)
        .locator('path.hill')
        .evaluateAll((els) =>
          els.map((e) => {
            const fill = getComputedStyle(e).fill;
            const parts = (fill.match(/[\d.]+/g) ?? []).slice(-3).map(Number);
            return parts.reduce((sum, v) => sum + v, 0) / (fill.startsWith('rgb') ? 255 : 1);
          })
        );
    const foggy = await light();
    expect(foggy.length).toBe(4);
    await page.evaluate(() => document.querySelector('[data-wallpaper]')!.removeAttribute('data-weather'));
    const plain = await light();
    foggy.forEach((value, i) => expect(value, `ridge ${i}`).toBeGreaterThan(plain[i] + 0.02));
  });

  test('snow falls as sparse particles', async ({ page }) => {
    await show(page, weather(73, false));
    await expect(wall(page)).toHaveAttribute('data-weather', 'snow');
    const canvas = page.locator('[data-particles]');
    await expect(canvas).toBeVisible();
    await expect.poll(() => inked(page)).toBeGreaterThan(0);
    const share = (await inked(page)) / (await canvas.evaluate((c: HTMLCanvasElement) => c.width * c.height));
    expect(share).toBeLessThan(0.01);
    expect(await canvas.evaluate((c) => getComputedStyle(c).pointerEvents)).toBe('none');
  });

  test('rain falls, and heavy rain has more drops than drizzle', async ({ page }) => {
    await show(page, weather(51));
    await expect(wall(page)).toHaveAttribute('data-weather', 'rain');
    await expect(page.locator('[data-particles]')).toBeVisible();
    const drizzle = await inked(page);
    expect(drizzle).toBeGreaterThan(0);
    await page.unroute('**/api/status');
    await show(page, weather(65));
    await expect(page.locator('[data-particles]')).toBeVisible();
    expect(await inked(page)).toBeGreaterThan(drizzle * 1.5);
  });

  test('the particles move, and stop while the tab is hidden', async ({ page }) => {
    await show(page, weather(73));
    await expect(page.locator('[data-particles]')).toBeVisible();
    const first = await snap(page);
    await expect.poll(() => snap(page)).not.toBe(first);
    await setVisibility(page, 'hidden');
    await page.waitForTimeout(100);
    const paused = await snap(page);
    await page.waitForTimeout(300);
    expect(await snap(page)).toBe(paused);
    await setVisibility(page, 'visible');
    await expect.poll(() => snap(page)).not.toBe(paused);
  });

  test('under reduced motion the particles are drawn once and stand still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await show(page, weather(73));
    await expect(page.locator('[data-particles]')).toBeVisible();
    expect(await inked(page)).toBeGreaterThan(0);
    const still = await snap(page);
    await page.waitForTimeout(300);
    expect(await snap(page)).toBe(still);
  });

  test('when the weather clears the particles go away', async ({ page }) => {
    await page.clock.install();
    let body = weather(73);
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await page.goto('/');
    await expect(wall(page)).toHaveAttribute('data-weather', 'snow');
    await expect(page.locator('[data-particles]')).toBeVisible();
    body = status({ weather: null });
    await page.clock.runFor(30_000);
    await expect(wall(page)).not.toHaveAttribute('data-weather');
    await expect(wall(page)).not.toHaveAttribute('data-sky');
    await expect(page.locator('[data-particles]')).toBeHidden();
    await expect(wall(page).locator('[data-moon]')).toBeVisible();
  });

  test('the canvas follows the window size', async ({ page }) => {
    await show(page, weather(73));
    const canvas = page.locator('[data-particles]');
    await expect(canvas).toBeVisible();
    await page.setViewportSize({ width: 900, height: 700 });
    const size = () => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.clientWidth, c.height, c.clientHeight]);
    await expect.poll(async () => (await size())[2]).toBe(700);
    const [width, clientWidth] = await size();
    expect(width).toBe(clientWidth);
    expect(clientWidth).toBeGreaterThan(880);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
  });

  test.describe('moon phase', () => {
    const lit = (page: Page, dx: number) =>
      page.locator('[data-moon-lit]').evaluate((path: SVGPathElement, offset) => {
        const point = path.ownerSVGElement!.createSVGPoint();
        point.x = 1190 + offset;
        point.y = 300;
        return path.isPointInFill(point);
      }, dx);

    async function nightAt(page: Page, iso: string) {
      await page.clock.install({ time: new Date(iso) });
      await show(page, weather(0, false));
      await expect(wall(page)).toHaveAttribute('data-sky', 'night');
    }

    test('first quarter lights the right half', async ({ page }) => {
      await nightAt(page, '2024-04-15T19:13:00Z');
      expect(await lit(page, 36)).toBe(true);
      expect(await lit(page, -36)).toBe(false);
    });

    test('last quarter lights the left half', async ({ page }) => {
      await nightAt(page, '2024-05-01T11:27:00Z');
      expect(await lit(page, -36)).toBe(true);
      expect(await lit(page, 36)).toBe(false);
    });

    test('full moon lights the whole disc', async ({ page }) => {
      await nightAt(page, '2025-09-07T18:09:00Z');
      for (const dx of [-60, 0, 60]) expect(await lit(page, dx), String(dx)).toBe(true);
    });

    test('new moon leaves the disc dark but still there', async ({ page }) => {
      await nightAt(page, '2024-04-08T18:21:00Z');
      for (const dx of [-36, 0, 36]) expect(await lit(page, dx), String(dx)).toBe(false);
      await expect(wall(page).locator('[data-moon-disc]')).toBeVisible();
    });

    test('without data the moon stays the full disc', async ({ page }) => {
      await page.route('**/api/status', (route) => route.abort());
      await page.goto('/');
      await page.waitForTimeout(300);
      await expect(wall(page).locator('[data-moon-lit]')).toBeHidden();
      await expect(wall(page).locator('[data-moon-disc]')).toHaveCSS('opacity', '0.24');
    });
  });
});
