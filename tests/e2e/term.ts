import { expect, type Page } from '@playwright/test';

export const status = (over: Record<string, unknown> = {}) => ({
  music: {
    state: 'playing',
    track: 'Track',
    artist: 'Artist',
    album: 'Album',
    image: 'https://img.test/cover.svg',
    url: 'https://www.last.fm/music/Artist/_/Track',
    played_at: null,
  },
  server: { load1: 0.42, cpu_pct: 7.5, mem_pct: 38.1, uptime_s: 13_651_200, cpu_history: [6.1, 7.0, 7.5, 30, 12] },
  weather: { temp_c: 4.2, code: 3, is_day: true, wind_kmh: 11.0 },
  generated_at: '2026-10-27T09:00:00Z',
  ...over,
});

export async function mockStatus(page: Page, body: unknown = status()) {
  await page.route('https://img.test/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' })
  );
  await page.route('**/api/status', (route) => route.fulfill({ json: body }));
}

export async function prepare(page: Page) {
  await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

export async function enterDesktop(page: Page) {
  await page.goto('/');
  await page.keyboard.press('d');
  await expect(page.locator('html')).toHaveClass(/desktop-on/);
}

export async function openTerminal(page: Page) {
  await enterDesktop(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.term input')).toBeFocused();
}

export async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}
