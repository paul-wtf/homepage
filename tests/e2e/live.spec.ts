import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

const status = (over: Record<string, unknown> = {}) => ({
  music: {
    state: 'playing',
    track: 'Track',
    artist: 'Artist',
    album: 'Album',
    image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/%3E',
    url: 'https://www.last.fm/music/Artist/_/Track',
    played_at: null,
  },
  server: { load1: 0.42, cpu_pct: 7.5, mem_pct: 38.1, uptime_s: 13_651_200, cpu_history: [6.1, 7.0, 7.5] },
  weather: { temp_c: 4.2, code: 3, is_day: true, wind_kmh: 11.0 },
  generated_at: '2026-10-27T09:00:00Z',
  ...over,
});

async function mock(page: Page, body: unknown = status()) {
  await page.route('**/api/status', (route) => route.fulfill({ json: body }));
}

const widget = (page: Page, name: string) => page.locator(`[data-live="${name}"]`);
const popout = (page: Page) => page.locator('[data-live-popout]');

test.describe('live bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('widgets render from status', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await expect(widget(page, 'music')).toContainText('Track · Artist');
    await expect(widget(page, 'server')).toContainText('7.5%');
    await expect(widget(page, 'weather')).toContainText('4°');
  });

  test('no widgets when the request fails', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    let hits = 0;
    await page.route('**/api/status', (route) => {
      hits++;
      return route.abort();
    });
    await page.goto('/');
    await expect.poll(() => hits).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-live]:visible')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('null field hides only that widget', async ({ page }) => {
    await mock(page, status({ server: null }));
    await page.goto('/');
    await expect(widget(page, 'music')).toBeVisible();
    await expect(widget(page, 'weather')).toBeVisible();
    await expect(widget(page, 'server')).toBeHidden();
  });

  test('popout opens on click and closes on Esc', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    const music = widget(page, 'music');
    await expect(music).toHaveAttribute('aria-expanded', 'false');
    await music.click();
    await expect(music).toHaveAttribute('aria-expanded', 'true');
    await expect(popout(page)).toBeVisible();
    await expect(popout(page).locator('img')).toHaveAttribute('alt', /Album/);
    const link = popout(page).locator('a[href="https://www.last.fm/music/Artist/_/Track"]');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(popout(page)).toContainText('spielt gerade');
    await page.keyboard.press('Escape');
    await expect(popout(page)).toBeHidden();
    await expect(music).toHaveAttribute('aria-expanded', 'false');
    await expect(music).toBeFocused();
  });

  test('popout closes on a click outside and shows server details', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await widget(page, 'server').click();
    await expect(popout(page)).toContainText('158 Tage');
    await expect(popout(page).locator('svg polyline')).toHaveCount(1);
    await widget(page, 'weather').click();
    await expect(popout(page)).toContainText('bewölkt');
    await expect(widget(page, 'server')).toHaveAttribute('aria-expanded', 'false');
    await page.mouse.click(700, 600);
    await expect(popout(page)).toBeHidden();
  });

  test('recent music shows how long ago', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-27T09:00:00Z') });
    await mock(
      page,
      status({ music: { ...status().music, state: 'recent', played_at: '2026-10-27T08:48:00Z' } })
    );
    await page.goto('/');
    await widget(page, 'music').click();
    await expect(popout(page)).toContainText('zuletzt · vor 12 min');
  });

  test('only one request in flight', async ({ page }) => {
    await page.clock.install();
    let hits = 0;
    await page.route('**/api/status', (_route: Route) => {
      hits++;
      return new Promise<void>(() => {});
    });
    await page.goto('/');
    await expect.poll(() => hits).toBe(1);
    await page.clock.runFor(90_000);
    await page.waitForTimeout(200);
    expect(hits).toBe(1);
  });

  test('polls every 30 s and backs off to 120 s after an error', async ({ page }) => {
    await page.clock.install();
    let hits = 0;
    let fail = false;
    await page.route('**/api/status', (route) => {
      hits++;
      return fail ? route.fulfill({ status: 502, body: '' }) : route.fulfill({ json: status() });
    });
    await page.goto('/');
    await expect.poll(() => hits).toBe(1);
    await page.clock.runFor(30_000);
    await expect.poll(() => hits).toBe(2);
    fail = true;
    await page.clock.runFor(30_000);
    await expect.poll(() => hits).toBe(3);
    await page.clock.runFor(90_000);
    await page.waitForTimeout(200);
    expect(hits).toBe(3);
    await page.clock.runFor(30_000);
    await expect.poll(() => hits).toBe(4);
  });

  test('bar never overflows', async ({ page }) => {
    await mock(page, status({ music: { ...status().music, track: 'x'.repeat(300) } }));
    for (const width of [1181, 1180, 960, 780]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(widget(page, 'music')).toBeVisible();
      if (width >= 900) await expect(page.locator('#desktop-toggle')).toBeVisible();
      const { scroll, client } = await page
        .locator('#top-nav')
        .evaluate((n) => ({ scroll: n.scrollWidth, client: n.clientWidth }));
      expect(scroll, `nav at ${width}px`).toBeLessThanOrEqual(client);
      const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(docWidth, `page at ${width}px`).toBeLessThanOrEqual(width);
    }
  });

  test('breakpoints', async ({ page }) => {
    await mock(page);
    const labelWidth = () =>
      page.locator('#top-nav .label').first().evaluate((e) => e.getBoundingClientRect().width);

    await page.setViewportSize({ width: 1300, height: 900 });
    await page.goto('/');
    await expect(widget(page, 'music')).toBeVisible();
    expect(await labelWidth()).toBeGreaterThan(10);

    await page.setViewportSize({ width: 1100, height: 900 });
    expect(await labelWidth()).toBeLessThanOrEqual(1);
    await expect(widget(page, 'server')).toBeVisible();
    await expect(widget(page, 'weather')).toBeVisible();

    await page.setViewportSize({ width: 900, height: 900 });
    await expect(widget(page, 'music')).toBeVisible();
    await expect(widget(page, 'music').locator('.live-text')).toBeVisible();
    await expect(widget(page, 'server')).toBeHidden();
    await expect(widget(page, 'weather')).toBeHidden();

    await page.setViewportSize({ width: 700, height: 900 });
    await expect(widget(page, 'music')).toBeVisible();
    await expect(widget(page, 'music').locator('.live-text')).toBeHidden();
    await expect(widget(page, 'server')).toBeHidden();
    await expect(widget(page, 'weather')).toBeHidden();
    await widget(page, 'music').click();
    await expect(popout(page)).toBeVisible();
    const box = await popout(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(700);
  });

  test('terminal nowplaying uses live data', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await expect(widget(page, 'music')).toBeVisible();
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await page.keyboard.press('Enter');
    await expect(page.locator('.term input')).toBeFocused();
    await page.keyboard.type('nowplaying');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term')).toContainText('Artist – Track');
  });

  test('Esc in desktop mode closes the popout and stays in desktop mode', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await widget(page, 'weather').click();
    await expect(popout(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popout(page)).toBeHidden();
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });
});
