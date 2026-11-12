import { test, expect, type Page } from '@playwright/test';
import { mockStatus, openTerminal, prepare, run, status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const term = (page: Page) => page.locator('.term');
const input = (page: Page) => page.locator('.term input');

const CONVERT = 'https://linkhop.paul.wtf/api/v1/convert**';
const SONG = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const cors = { 'access-control-allow-origin': '*' };

const converted = {
  source: {
    service: 'spotify',
    type: 'track',
    url: SONG,
    title: 'Never Gonna Give You Up',
    artists: ['Rick Astley'],
  },
  targets: {
    deezer: { status: 'ok', url: 'https://www.deezer.com/track/15646529' },
    tidal: { status: 'not_found', url: null },
    youtube_music: { status: 'ok', url: 'https://music.youtube.com/watch?v=lYBUbBu4W08' },
    apple_music: { status: 'ok', url: 'javascript:alert(1)' },
  },
};

test.describe('terminal commands', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('help lists the new commands', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'help');
    for (const cmd of ['open <projekt>', 'man paul', 'htop', 'linkhop <url>', 'homelab', 'changelog']) {
      await expect(term(page)).toContainText(cmd);
    }
  });

  test.describe('tab completion', () => {
    test('completes a command', async ({ page }) => {
      await openTerminal(page);
      await page.keyboard.type('fastf');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('fastfetch ');
      await expect(input(page)).toBeFocused();
    });

    test('completes a file name', async ({ page }) => {
      await openTerminal(page);
      await page.keyboard.type('cat ko');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('cat kontakt ');
    });

    test('completes a project for open, whatever the case', async ({ page }) => {
      await openTerminal(page);
      await page.keyboard.type('open sys');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('open System-Setup ');
    });

    test('extends to the common prefix and lists the candidates', async ({ page }) => {
      await openTerminal(page);
      await page.keyboard.type('cat p');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('cat p');
      await expect(term(page).locator('.term-row').last()).toHaveText('pax  projekte  pubkey');
      await page.keyboard.type('r');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('cat projekte ');

      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('open l');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('open l');
      await expect(term(page).locator('.term-row').last()).toHaveText('linkhop  luna-plugins');
    });

    test('does nothing without a match and keeps the focus', async ({ page }) => {
      await openTerminal(page);
      const rows = await term(page).locator('.term-row').count();
      await page.keyboard.type('xyz');
      await page.keyboard.press('Tab');
      await expect(input(page)).toHaveValue('xyz');
      await expect(input(page)).toBeFocused();
      await expect(term(page).locator('.term-row')).toHaveCount(rows);
    });
  });

  test.describe('open', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { opened: unknown[][] };
        w.opened = [];
        window.open = (...args: unknown[]) => {
          w.opened.push(args);
          return null;
        };
      });
    });
    const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: unknown[][] }).opened);

    test('opens the live url of a project in a new tab', async ({ page }) => {
      await openTerminal(page);
      await run(page, 'open linkhop');
      expect(await opened(page)).toEqual([['https://linkhop.paul.wtf', '_blank', 'noopener,noreferrer']]);
      await expect(term(page)).toContainText('https://linkhop.paul.wtf');
    });

    test('falls back to the repo', async ({ page }) => {
      await openTerminal(page);
      await run(page, 'open LUNA-plugins');
      expect((await opened(page))[0][0]).toBe('https://github.com/paul-wtf/luna-plugins');
    });

    test('unknown and missing project', async ({ page }) => {
      await openTerminal(page);
      await run(page, 'open nix');
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('open: nix: Projekt nicht gefunden');
      await run(page, 'open');
      await expect(term(page).locator('.term-row.is-err').last()).toContainText('open: Projekt fehlt');
      expect(await opened(page)).toEqual([]);
    });
  });

  test('man paul prints a manual page', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'man paul');
    await expect(term(page)).toContainText('PAUL(1)');
    await expect(term(page)).toContainText('NAME');
    await expect(term(page)).toContainText('Elektrotechniker am Erdgasspeicher Bierwang');
    await expect(term(page)).toContainText('SIEHE AUCH');
    await run(page, 'man');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText('What manual page do you want?');
    await run(page, 'man hyprland');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText('No manual entry for hyprland');
  });

  test('blank rows keep their line', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'man paul');
    const heights = await term(page)
      .locator('.term-row')
      .evaluateAll((rows) => rows.filter((r) => r.textContent === '').map((r) => r.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(3);
    for (const h of heights) expect(h).toBeGreaterThan(10);
  });

  test.describe('htop', () => {
    test('shows cpu, memory and the cpu history', async ({ page }) => {
      await mockStatus(page);
      await page.goto('/');
      await expect(page.locator('[data-live="server"]')).toBeVisible();
      await page.keyboard.press('d');
      await page.keyboard.press('Enter');
      await expect(input(page)).toBeFocused();
      await run(page, 'htop');
      await expect(term(page)).toContainText(/CPU\s+\[\|+ +\]\s+7\.5%/);
      await expect(term(page)).toContainText(/Mem\s+\[\|+ +\]\s+38\.1%/);
      await expect(term(page)).toContainText('Load 0.42');
      await expect(term(page)).toContainText('Verlauf  ▂▃▃█▄');
    });

    test('says so when the api is down', async ({ page }) => {
      await page.route('**/api/status', (route) => route.abort());
      await openTerminal(page);
      await run(page, 'htop');
      await expect(term(page)).toContainText('htop: nicht verfügbar');
    });

    test('leaves the history out when there is none', async ({ page }) => {
      await mockStatus(page, status({ server: { ...status().server, cpu_history: [] } }));
      await page.goto('/');
      await expect(page.locator('[data-live="server"]')).toBeVisible();
      await page.keyboard.press('d');
      await page.keyboard.press('Enter');
      await run(page, 'htop');
      await expect(term(page)).toContainText('7.5%');
      await expect(term(page)).not.toContainText('Verlauf');
    });
  });

  test.describe('linkhop', () => {
    test('prints one line per service', async ({ page }) => {
      let asked = '';
      await page.route(CONVERT, (route) => {
        asked = route.request().url();
        return route.fulfill({ json: converted, headers: cors });
      });
      await openTerminal(page);
      await run(page, `linkhop ${SONG}`);
      await expect(term(page)).toContainText('Never Gonna Give You Up · Rick Astley');
      await expect(term(page)).toContainText(/Deezer\s+https:\/\/www\.deezer\.com\/track\/15646529/);
      await expect(term(page)).toContainText(/YouTube Music\s+https:\/\/music\.youtube\.com\/watch\?v=lYBUbBu4W08/);
      await expect(term(page)).toContainText(/Tidal\s+nicht gefunden/);
      await expect(term(page)).toContainText(/Apple Music\s+nicht gefunden/);
      await expect(term(page)).not.toContainText('javascript:');
      expect(new URL(asked).searchParams.get('url')).toBe(SONG);
      await expect(input(page)).toBeFocused();
    });

    test('a link linkhop does not know is a terminal error', async ({ page }) => {
      await page.route(CONVERT, (route) =>
        route.fulfill({ status: 400, contentType: 'text/html', body: '<html>Error</html>', headers: cors })
      );
      await openTerminal(page);
      await run(page, 'linkhop https://example.com/x');
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: Link nicht erkannt');
    });

    test('nothing found, rate limit and other answers', async ({ page }) => {
      let code = 404;
      await page.route(CONVERT, (route) => route.fulfill({ status: code, body: '', headers: cors }));
      await openTerminal(page);
      await run(page, `linkhop ${SONG}`);
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: nichts gefunden');
      code = 429;
      await run(page, `linkhop ${SONG}`);
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: zu viele Anfragen, gleich nochmal versuchen');
      code = 502;
      await run(page, `linkhop ${SONG}`);
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: Fehler 502');
    });

    test('an unreachable service and a broken answer are terminal errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let broken = false;
      await page.route(CONVERT, (route) =>
        broken ? route.fulfill({ body: '<html>', contentType: 'text/html', headers: cors }) : route.abort()
      );
      await openTerminal(page);
      await run(page, `linkhop ${SONG}`);
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: nicht erreichbar');
      broken = true;
      await run(page, `linkhop ${SONG}`);
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: unerwartete Antwort');
      expect(errors).toEqual([]);
    });

    test('needs a url', async ({ page }) => {
      let hits = 0;
      await page.route(CONVERT, (route) => {
        hits++;
        return route.abort();
      });
      await openTerminal(page);
      await run(page, 'linkhop');
      await expect(term(page).locator('.term-row.is-err').last()).toHaveText('linkhop: URL fehlt');
      expect(hits).toBe(0);
    });
  });
});
