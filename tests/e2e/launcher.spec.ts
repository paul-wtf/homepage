import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, mockStatus, prepare } from './term';
import { rank, score } from '../../src/scripts/desktop/fuzzy';

test.use({ viewport: { width: 1400, height: 900 } });

const launcher = (page: Page) => page.locator('[data-launcher]');
const field = (page: Page) => page.locator('[data-launcher] input');
const options = (page: Page) => page.locator('[data-launcher] [role="option"]');
const selected = (page: Page) => page.locator('[data-launcher] [role="option"][aria-selected="true"]');

async function open(page: Page) {
  await enterDesktop(page);
  await page.keyboard.press('Shift+Enter');
  await expect(field(page)).toBeFocused();
}

test.describe('fuzzy search', () => {
  test('matches letters in order, whatever the case', () => {
    expect(score('lnkhp', 'linkhop')).not.toBeNull();
    expect(score('LINK', 'linkhop')).not.toBeNull();
    expect(score('hopl', 'linkhop')).toBeNull();
    expect(score('', 'linkhop')).toBe(0);
  });

  test('ignores diacritics and needs every word', () => {
    expect(score('uber', 'über mich')).not.toBeNull();
    expect(score('mich über', 'über mich')).not.toBeNull();
    expect(score('über dich', 'über mich')).toBeNull();
  });

  test('letters far apart do not count as a match', () => {
    expect(score('tid', 'uptime Laufzeit des Servers')).toBeNull();
    expect(score('tid', 'Katzen ~/sidefacts/katzen')).toBeNull();
    expect(score('acb', 'a nothing here acxb')).not.toBeNull();
    expect(score('prj', '2 projekte')).not.toBeNull();
  });

  test('ranks a prefix above a scattered match and keeps the order of ties', () => {
    const items = ['streamcontroller-tidal', 'tidalwave', 'fastfetch', 'tools'];
    expect(rank('ti', items, (s) => s)[0]).toBe('tidalwave');
    expect(rank('', items, (s) => s)).toEqual(items);
    expect(rank('xyz', items, (s) => s)).toEqual([]);
  });
});

test.describe('launcher', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
    await mockStatus(page);
  });

  test('Shift+Enter opens it centred with the rofi measures', async ({ page }) => {
    await open(page);
    await expect(launcher(page)).toHaveAttribute('role', 'dialog');
    const box = page.locator('[data-launcher] .launcher-box');
    const r = await box.evaluate((e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    expect(r.w).toBe(600);
    expect(r.x + r.w / 2).toBeCloseTo(700, 0);
    expect(r.y + r.h / 2).toBeCloseTo(450, 0);
    await expect(box).toHaveCSS('background-color', 'rgb(24, 24, 37)');
    await expect(box).toHaveCSS('border-radius', '20px');
    await expect(box).toHaveCSS('border-top-width', '0px');
    await expect(selected(page)).toHaveCount(1);
    await expect(selected(page)).toHaveCSS('background-color', 'rgb(148, 226, 213)');
    await expect(selected(page)).toHaveCSS('color', 'rgb(17, 17, 27)');
    await expect(launcher(page)).toHaveCSS('animation-name', 'none');
  });

  test('lists workspaces, windows, commands and actions', async ({ page }) => {
    await open(page);
    const list = page.locator('[data-launcher] [role="listbox"]');
    for (const text of ['1 über mich', '6 kontakt', 'linkhop', 'Workstation', 'Eddy', 'GitHub', 'fastfetch', 'desktop verlassen', 'sperren']) {
      await expect(list).toContainText(text);
    }
    await expect(options(page).filter({ hasText: 'exit' })).toHaveCount(0);
  });

  test('a fuzzy query finds a window, Enter focuses it', async ({ page }) => {
    await open(page);
    await page.keyboard.type('lnkhp');
    await expect(selected(page)).toContainText('linkhop');
    await expect(selected(page)).toContainText('~/projekte/linkhop');
    await page.keyboard.press('Enter');
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('.wm-layer[data-ws="2"]')).toBeVisible();
    const focused = page.locator('.wm-layer[data-ws="2"] .wm-window.is-focus');
    await expect(focused).toHaveAttribute('aria-label', 'linkhop');
    await expect(focused).toBeFocused();
  });

  test('a workspace entry switches to it', async ({ page }) => {
    await open(page);
    await page.keyboard.type('4 hard');
    await expect(selected(page)).toContainText('4 hardware');
    await page.keyboard.press('Enter');
    await expect(page.locator('.wm-layer[data-ws="4"]')).toBeVisible();
    await expect(page.locator('#top-nav a[data-section="hardware"]')).toHaveAttribute('aria-current', 'true');
  });

  test('a closed window comes back', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('l');
    await page.keyboard.press('q');
    const portrait = page.locator('.wm-layer[data-ws="1"] .wm-window[aria-label="Porträt"]');
    await expect(portrait).toHaveCount(0);
    await page.keyboard.press('2');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('portrat');
    await expect(selected(page)).toContainText('~/über-mich/portrait');
    await page.keyboard.press('Enter');
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveClass(/is-focus/);
  });

  test('a cat opens its photo on the sidefacts workspace', async ({ page }) => {
    await open(page);
    await page.keyboard.type('eddy');
    await page.keyboard.press('Enter');
    const photo = page.locator('.wm-layer[data-ws="5"] .wm-window[aria-label="Eddy"]');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveClass(/is-focus/);
  });

  test('a command without arguments runs in a terminal', async ({ page }) => {
    await open(page);
    await page.keyboard.type('whoami');
    await expect(selected(page)).toContainText('whoami');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term')).toHaveCount(1);
    await expect(page.locator('.term')).toContainText('paul@paul.wtf ~> whoami');
    await expect(page.locator('.term')).toContainText('Paul Reitmayer');
    await expect(page.locator('.term input')).toBeFocused();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('uptime');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term')).toHaveCount(1);
    await expect(page.locator('.term')).toContainText('up 158 Tage');
  });

  test('a command with an argument waits in the prompt, a typed line runs', async ({ page }) => {
    await open(page);
    await page.keyboard.type('cat');
    await expect(selected(page)).toContainText('cat <datei>');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term input')).toHaveValue('cat ');
    await expect(page.locator('.term input')).toBeFocused();
    await expect(page.locator('.term .term-row.is-err')).toHaveCount(0);

    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('cat pax');
    await expect(selected(page)).toContainText('cat pax');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term')).toContainText('Polarfuchs');
  });

  test('the actions leave the desktop and lock it', async ({ page }) => {
    await open(page);
    await page.keyboard.type('sperren');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveClass(/is-locked/);
    await expect(launcher(page)).toBeHidden();
    await page.keyboard.press('a');
    await expect(page.locator('html')).not.toHaveClass(/is-locked/);

    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('verlassen');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    await expect(launcher(page)).toBeHidden();
  });

  test('arrows and Tab move the selection, a click picks an entry', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toContainText('1 über mich');
    await page.keyboard.press('ArrowDown');
    await expect(selected(page)).toContainText('2 projekte');
    await page.keyboard.press('Tab');
    await expect(selected(page)).toContainText('3 tools');
    await page.keyboard.press('ArrowUp');
    await expect(selected(page)).toContainText('2 projekte');
    const id = await selected(page).getAttribute('id');
    await expect(field(page)).toHaveAttribute('aria-activedescendant', id!);
    await expect(field(page)).toBeFocused();

    await options(page).filter({ hasText: '5 sidefacts' }).click();
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('.wm-layer[data-ws="5"]')).toBeVisible();
  });

  test('Esc and a click outside close it and stay on the desktop', async ({ page }) => {
    await open(page);
    await page.keyboard.type('zzzz');
    await expect(options(page)).toHaveCount(0);
    await expect(page.locator('[data-launcher] .launcher-empty')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(launcher(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window.is-focus')).toBeFocused();

    await page.keyboard.press('Shift+Enter');
    await expect(field(page)).toHaveValue('');
    await page.mouse.click(40, 400);
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
  });

  test('stays closed on the scroll page', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(200);
    await expect(launcher(page)).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });

  test('the keybinds window lists the key', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('?');
    const row = page.locator('.wm-window[aria-label="Tastenkürzel"] .keys .row', { hasText: 'Launcher' });
    await expect(row.locator('kbd')).toHaveText(['Shift', 'Enter']);
  });
});
