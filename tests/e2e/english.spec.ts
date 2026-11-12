import { test, expect, type Page } from '@playwright/test';
import { mockStatus, prepare, run, status } from './term';

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: 'Europe/Berlin' });

const GERMAN = /[äöüßÄÖÜ„]|\b(und|oder|nicht|eine|einen|mit|von|auch|wechseln|anzeigen|Fenster|Projekt|Projekte|Katze|Katzen|Datei|Befehl|Tage|Std)\b/;
const term = (page: Page) => page.locator('.term');
const layer = (page: Page, n: number) => page.locator(`.wm-layer[data-ws="${n}"]`);

async function desktop(page: Page) {
  await page.goto('/en');
  await page.keyboard.press('d');
  await expect(page.locator('html')).toHaveClass(/desktop-on/);
}

async function terminal(page: Page) {
  await desktop(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.term input')).toBeFocused();
}

test.describe('english scroll page', () => {
  test.beforeEach(async ({ page }) => {
    await mockStatus(page, status({ projects: { linkhop: 'up', tidalwave: 'down' } }));
  });

  test('no german is left in the page source', async ({ request }) => {
    const html = await (await request.get('/en')).text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+(?:lang|hreflang)="de"[^>]*>[^<]*/g, ' ')
      .replace(/content="de_DE"/g, ' ');
    const hit = GERMAN.exec(text);
    expect(hit && text.slice(Math.max(0, hit.index - 60), hit.index + 60)).toBeNull();
  });

  test('bar, hero and section titles', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('#top-nav')).toHaveAttribute('aria-label', 'Main navigation');
    await expect(page.locator('#top-nav a[data-section] .label')).toHaveText([
      'about',
      'projects',
      'tools',
      'hardware',
      'sidefacts',
      'contact',
    ]);
    await expect(page.locator('#desktop-toggle')).toHaveAttribute('title', 'Desktop mode (D)');
    await expect(page.locator('h1')).toHaveText(/Paul\s+Reitmayer/);
    await expect(page.locator('.hero .tagline')).toHaveText(
      'Electrical technician at the Bierwang gas storage facility. Software engineering as a hobby.'
    );
    await expect(page.locator('.hero .btn')).toHaveText('See the projects →');
    await expect(page.locator('.hero img')).toHaveAttribute('alt', 'Photo of Paul Reitmayer');
    await expect(page.locator('#about h2')).toHaveText('1About');
    await expect(page.locator('#projects h2')).toHaveText('2Projects');
    await expect(page.locator('#sidefacts h2 .t-long')).toHaveText('When I am away from the screen');
    await expect(page.locator('#contact h2')).toHaveText('6Contact');
    await expect(page.locator('#top-nav .clock')).toHaveText(/^\d\d:\d\d$/);
  });

  test('about, projects and hardware', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('#about')).toContainText('By day I am an electrical technician');
    await expect(page.locator('#about')).toContainText('black boxes that somebody else hosts');
    const linkhop = page.locator('#projects .pcard', { hasText: 'linkhop' }).first();
    await expect(linkhop).toContainText('Converts music links between streaming services.');
    await expect(linkhop.locator('img')).toHaveAttribute('alt', 'Preview of linkhop');
    await expect(linkhop.locator('.meta')).toHaveText('v9.9.9 · last commit 2026-09-17');
    await expect(linkhop.locator('.live')).toHaveText('live · linkhop.paul.wtf');
    const tidalwave = page.locator('#projects .pcard', { hasText: 'tidalwave' }).first();
    await expect(tidalwave).toContainText('"On this day"');
    await expect(tidalwave.locator('.meta')).toHaveText('last commit 2026-11-07');
    await expect(tidalwave.locator('.live')).toHaveText('down · tidalwave.paul.wtf');
    await expect(page.locator('#projects .pcard')).toHaveCount(6);
    await expect(page.locator('#hardware')).toContainText('Hosted at TubeHosting');
    await expect(page.locator('#hardware')).toContainText('2× 4 TB NVMe (RAID 1, VM storage)');
  });

  test('sidefacts and contact', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/en');
    const facts = page.locator('#sidefacts');
    await expect(facts).toContainText('My first electric car.');
    await expect(facts.locator('.pax .meta')).toHaveText('Arctic fox · he/him · 22');
    await expect(facts.locator('.pax .tag-label')).toHaveText(['likes', 'dislikes']);
    await expect(facts.locator('.pax .tags').first()).toContainText('poking at things labeled "do not touch"');
    await expect(facts.locator('.cat', { hasText: 'Jessy' })).toContainText('Asleep more often than awake.');
    await expect(facts.locator('.cat img').first()).toHaveAttribute('alt', 'Eddy the cat');

    const contact = page.locator('#contact');
    await expect(contact.locator('[data-email-text]')).toHaveText('paul.reitmayer@paul.wtf');
    await expect(contact.locator('.gpg .sr-only')).toHaveText(', download the public key');
    await contact.locator('[data-discord]').click();
    await expect(contact.locator('[data-discord-text]')).toHaveText('Copied!');
  });

  test('the address placeholder is english without javascript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/en');
      await expect(page.locator('#contact [data-email-text]')).toHaveText('(show email)');
      await expect(page.locator('#about')).toContainText('By day I am an electrical technician');
    } finally {
      await context.close();
    }
  });

  test('live bar popovers and the toast', async ({ page }) => {
    let body = status();
    await page.unroute('**/api/status');
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await page.clock.install({ time: new Date('2026-11-12T20:15:00+01:00') });
    await page.goto('/en');
    const pop = page.locator('[data-live-popout]');
    await expect(page.locator('[data-live="music"]')).toHaveAttribute('aria-label', 'Music: Track by Artist');
    await page.locator('[data-live="music"]').click();
    await expect(pop).toHaveAttribute('aria-label', 'Music');
    await expect(pop).toContainText('playing now');
    await expect(pop.locator('a')).toHaveText(['on last.fm ↗', 'open in your service ↗']);
    await expect(pop.locator('img')).toHaveAttribute('alt', 'Album cover: Album');
    await page.locator('[data-live="server"]').click();
    await expect(pop).toContainText('memory');
    await expect(pop).toContainText('158 days');
    await page.locator('[data-live="weather"]').click();
    await expect(page.locator('[data-live="weather"]')).toHaveAttribute('aria-label', 'Weather: 4°, overcast');
    await expect(pop).toContainText('overcast');
    await expect(pop).toContainText('place');
    await page.keyboard.press('Escape');

    body = status({ music: { ...status().music, track: 'Two', state: 'recent', played_at: '2026-11-12T19:00:00Z' } });
    await page.clock.runFor(30_000);
    await expect(page.locator('.toast')).toContainText('last played');
    await expect(page.locator('.toast .toast-close')).toHaveAttribute('aria-label', 'Close notification');
    await page.locator('[data-live="music"]').click();
    await expect(pop).toContainText(/last played · \d+ min ago/);
  });

  test('D is still the only key on the scroll page', async ({ page }) => {
    await page.goto('/en');
    for (const key of ['s', 'Shift+Enter', '2', 'q']) await page.keyboard.press(key);
    await page.waitForTimeout(200);
    await expect(page.locator('html')).not.toHaveClass(/desktop-on|scratch-on/);
    await expect(page.locator('[data-launcher]')).toBeHidden();
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
  });
});

test.describe('english desktop mode', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
    await mockStatus(page);
  });

  test('windows, paths and workspaces', async ({ page }) => {
    await desktop(page);
    await expect(layer(page, 1).locator('.wm-window')).toHaveCount(2);
    await expect(layer(page, 1).locator('.wm-window').first()).toHaveAttribute('aria-label', 'About');
    await expect(layer(page, 1).locator('.path')).toHaveText(['~/about', '~/about/portrait']);
    await page.keyboard.press('2');
    await expect(layer(page, 2).locator('.path')).toHaveText(['~/projects/linkhop', '~/projects/tidalwave', '~/projects']);
    await expect(layer(page, 2)).toContainText('Custom plugins for Tidal Luna.');
    await page.keyboard.press('5');
    await expect(layer(page, 5).locator('.path')).toHaveText(['~/sidefacts/pax', '~/sidefacts/car', '~/sidefacts/cats']);
    await expect(layer(page, 5).locator('.wm-window[aria-label="Cats"]')).toContainText('A little cuddle princess.');
    await page.keyboard.press('6');
    await expect(layer(page, 6).locator('.path')).toHaveText([
      '~/contact/github',
      '~/contact/discord',
      '~/contact/youtube',
      '~/contact/email',
      '~/contact/gpg',
    ]);
    await expect(layer(page, 6).locator('[data-email-text]')).toHaveText('paul.reitmayer@paul.wtf');
    await expect(page.locator('#top-nav a[data-section="contact"]')).toHaveAttribute('aria-current', 'true');
    for (let n = 1; n <= 6; n++) {
      await page.keyboard.press(String(n));
      expect(await layer(page, n).innerText(), `workspace ${n}`).not.toMatch(GERMAN);
    }
  });

  test('keybinds window, launcher and overview', async ({ page }) => {
    await desktop(page);
    await page.keyboard.press('?');
    const keys = page.locator('.wm-window[aria-label="Keybinds"]');
    await expect(keys.locator('h3')).toHaveText('Keybinds');
    await expect(keys.locator('dd')).toHaveText([
      'switch workspace',
      'overview of all workspaces',
      'move focus (arrow keys work too)',
      'open a terminal',
      'open the launcher',
      'toggle the scratchpad with the terminal',
      'close the window',
      'toggle fullscreen',
      'this list',
      'back to the page',
    ]);
    await expect(keys).toContainText('Focus follows the mouse.');

    await page.keyboard.press('Shift+Enter');
    const launcher = page.locator('[data-launcher]');
    const selected = launcher.locator('[role="option"][aria-selected="true"]');
    await expect(launcher.locator('input')).toHaveAttribute('placeholder', 'Search...');
    await expect(selected).toHaveText('1 aboutworkspace');
    expect(await launcher.locator('[role="listbox"]').innerText()).not.toMatch(GERMAN);
    await page.keyboard.type('zzzz');
    await expect(launcher.locator('.launcher-empty')).toHaveText('nothing found');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('cats');
    await expect(selected).toContainText('~/sidefacts/cats');
    await expect(selected.locator('.launcher-kind')).toHaveText('window');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('cat');
    await expect(selected).toContainText('cat <file>');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('leave');
    await expect(selected).toHaveText('leave desktopaction');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Tab');
    await expect(page.locator('.wm-overview')).toHaveAttribute('aria-label', 'Workspace overview');
    await expect(page.locator('.wm-cell')).toHaveText(['1 about', '2 projects', '3 tools', '4 hardware', '5 sidefacts', '6 contact']);
    await page.keyboard.press('3');
    await expect(layer(page, 3)).toBeVisible();
    await expect(layer(page, 3).locator('.wm-window')).toHaveAttribute('aria-label', 'System info');
  });

  test('the lock screen', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-12T20:15:00+01:00') });
    await desktop(page);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('lock');
    await page.keyboard.press('Enter');
    const lock = page.locator('[data-lock]');
    await expect(lock).toBeVisible();
    await expect(lock).toHaveAttribute('aria-label', 'Lock screen');
    await expect(lock.locator('[data-lock-time]')).toHaveText('20:15');
    await expect(lock.locator('[data-lock-date]')).toHaveText(/^Thursday,? 12 November$/);
    await expect(lock.locator('.lock-field')).toHaveText('Any key or click unlocks');
    await page.keyboard.press('a');
    await expect(lock).toBeHidden();
  });

  test('scratchpad and theme behave as in german', async ({ page }) => {
    await desktop(page);
    await page.keyboard.press('s');
    await expect(page.locator('html')).toHaveClass(/scratch-on/);
    await run(page, 'theme frappe');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'frappe');
    await expect(page.locator('.wm-scratch .term')).toContainText('Flavor: frappe');
    await run(page, 'theme neon');
    await expect(page.locator('.wm-scratch .term')).toContainText('theme: neon: unknown flavor (latte, frappe, macchiato, mocha)');
    await page.keyboard.press('Escape');
    await page.keyboard.press('s');
    await expect(page.locator('html')).not.toHaveClass(/scratch-on/);
  });
});

test.describe('english terminal', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
    await mockStatus(page);
  });

  test('help lists every command in english', async ({ page }) => {
    await terminal(page);
    await expect(term(page)).toContainText('Welcome. "help" lists all commands.');
    await expect(page.locator('.term input')).toHaveAttribute('aria-label', 'Command');
    await run(page, 'help');
    for (const row of [
      'help            this list',
      'cat <file>      print a file',
      'open <project>  open a project in a new tab',
      'man paul        the manual',
      'theme <flavor>  switch the Catppuccin flavor',
      'exit            close the window',
      'Tab completes commands and file names.',
      'S shows and hides the scratchpad with this terminal.',
    ]) {
      await expect(term(page)).toContainText(row);
    }
    expect(await term(page).innerText()).not.toMatch(GERMAN);
  });

  test('files carry english names and contents', async ({ page }) => {
    await terminal(page);
    await run(page, 'ls');
    await expect(term(page).locator('.term-row').last()).toHaveText('about  contact  projects  pax  pubkey  cats/');
    await run(page, 'ls cats');
    await expect(term(page).locator('.term-row').last()).toHaveText('eddy  lily  lucky  jessy');
    await run(page, 'whoami');
    await expect(term(page)).toContainText('Electrical technician at the Bierwang gas storage facility.');
    await run(page, 'cat about');
    await expect(term(page)).toContainText('I like it best when technology stops being magic.');
    await run(page, 'cat contact');
    await expect(term(page)).toContainText('Email    paul.reitmayer@paul.wtf');
    await run(page, 'cat projects');
    await expect(term(page)).toContainText('Self-hosted listening statistics for Tidal.');
    await run(page, 'cat pax');
    await expect(term(page)).toContainText('Arctic fox, he/him, 22');
    await expect(term(page)).toContainText('Likes: tinkering with tech; cold weather; snacks;');
    await expect(term(page)).toContainText('Dislikes: proprietary software; slow Wi-Fi');
    await run(page, 'cat pubkey');
    await expect(term(page)).toContainText('Fingerprint  01E8 E083 5EEF 6EB9 294C C853 A866 63FE 8C6B 0713');
    await expect(term(page)).toContainText('Key          https://paul.wtf/pubkey.asc');
    await run(page, 'cat cats/lily');
    await expect(term(page)).toContainText('Lily: A little cuddle princess.');
    await expect(page.locator('.wm-window[aria-label="Lily"] .path')).toHaveText('~/sidefacts/cats/lily');
    await run(page, 'cat über-mich');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText('cat: über-mich: No such file or directory');
    await run(page, 'cat');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText('cat: missing file');
    await run(page, 'clear');
    await page.keyboard.type('cat co');
    await page.keyboard.press('Tab');
    await expect(page.locator('.term input')).toHaveValue('cat contact ');
  });

  test('man paul', async ({ page }) => {
    await terminal(page);
    await run(page, 'man paul');
    for (const row of [
      'paul - Electrical technician at the Bierwang gas storage facility.',
      'paul [cat about] [cat projects] [open <project>] [cat contact]',
      'DESCRIPTION',
      'ENVIRONMENT',
      'FILES',
      '~/about  ~/contact  ~/projects  ~/pax  ~/pubkey  ~/cats/',
      'SEE ALSO',
      'None known. Reports go to "cat contact".',
    ]) {
      await expect(term(page)).toContainText(row);
    }
    expect(await term(page).innerText()).not.toMatch(GERMAN);
  });

  test('live commands, errors and the rest', async ({ page }) => {
    await terminal(page);
    await run(page, 'uptime');
    await expect(term(page).locator('.term-row').last()).toHaveText('up 158 days, 0 h');
    await run(page, 'nowplaying');
    await expect(term(page).locator('.term-row').last()).toHaveText('now playing: Artist – Track');
    await run(page, 'weather');
    await expect(term(page).locator('.term-row').last()).toHaveText('4.2 °C, wind 11 km/h');
    await run(page, 'htop');
    await expect(term(page)).toContainText('History  ');
    await run(page, 'fastfetch');
    await expect(term(page)).toContainText('WM        Hyprland');
    await run(page, 'ws 9');
    await expect(term(page).locator('.term-row').last()).toHaveText('ws: expected a workspace from 1 to 6');
    await run(page, 'open');
    await expect(term(page)).toContainText('open: missing project');
    await run(page, 'open nope');
    await expect(term(page).locator('.term-row').last()).toHaveText('open: nope: no such project');
    await run(page, 'linkhop');
    await expect(term(page).locator('.term-row').last()).toHaveText('linkhop: missing URL');
    await run(page, 'sudo rm -rf /');
    await expect(term(page).locator('.term-row').last()).toHaveText(
      'paul is not in the sudoers file. This incident will be reported.'
    );
    await run(page, 'hallo');
    await expect(term(page).locator('.term-row').last()).toHaveText('fish: Unknown command: hallo');
    expect((await term(page).innerText()).replace('hallo', '')).not.toMatch(GERMAN);
  });

  test('live commands without the api', async ({ page }) => {
    await page.unroute('**/api/status');
    await page.route('**/api/status', (route) => route.abort());
    await terminal(page);
    await run(page, 'uptime');
    await expect(term(page).locator('.term-row').last()).toHaveText('uptime: not available');
    await run(page, 'htop');
    await expect(term(page).locator('.term-row').last()).toHaveText('htop: not available');
  });
});

test.describe('english 404', () => {
  test('answers like the terminal, in english', async ({ page }) => {
    await page.goto('/en/404');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('404 — paul.wtf');
    const box = page.locator('main .window');
    await expect(box.locator('.line').first()).toHaveText('paul@paul.wtf ~> /en/404');
    await expect(box.locator('.err')).toHaveText('fish: Unknown command: /en/404');
    await expect(page.locator('h1')).toHaveText('404: this page does not exist');
    await expect(box.locator('a.btn')).toHaveText('To the start page →');
    await box.locator('a.btn').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#top-nav')).toBeVisible();
  });

  test('works without javascript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/en/404');
      await expect(page.locator('main .line').first()).toHaveText('paul@paul.wtf ~> ./this-page');
      await expect(page.locator('main .err')).toHaveText('fish: Unknown command: ./this-page');
      await expect(page.locator('main a.btn')).toHaveAttribute('href', '/en');
      expect(await page.locator('head meta[name="description"]').getAttribute('content')).toBe('This page does not exist.');
    } finally {
      await context.close();
    }
  });
});
