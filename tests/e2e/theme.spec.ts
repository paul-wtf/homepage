import { test, expect, type Page } from '@playwright/test';
import { openTerminal, prepare, run } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const term = (page: Page) => page.locator('.term');
const html = (page: Page) => page.locator('html');
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('paulwtf:theme'));

test.describe('theme', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('mocha is the default and theme alone prints it', async ({ page }) => {
    await openTerminal(page);
    await expect(html(page)).not.toHaveAttribute('data-theme');
    expect(await token(page, '--base')).toBe('#1e1e2e');
    await run(page, 'theme');
    await expect(term(page).locator('.term-row').last()).toHaveText('mocha');
  });

  test('theme latte restyles the whole page and is stored', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'theme latte');
    await expect(html(page)).toHaveAttribute('data-theme', 'latte');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(220, 224, 232)');
    await expect(page.locator('.wm-window').first()).toHaveCSS('background-color', 'rgb(239, 241, 245)');
    await expect(page.locator('#top-nav')).toHaveCSS('background-color', 'rgb(230, 233, 239)');
    await expect(term(page).locator('.term-row').last()).toHaveCSS('color', 'rgb(64, 160, 43)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#e6e9ef');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
    await expect(page.locator('[data-wallpaper] .hill-1')).not.toHaveCSS('fill', 'rgb(28, 32, 48)');
    expect(await stored(page)).toBe('latte');
    await run(page, 'theme');
    await expect(term(page).locator('.term-row').last()).toHaveText('latte');
  });

  test('frappe and macchiato carry their palettes', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'theme frappe');
    expect([await token(page, '--base'), await token(page, '--teal'), await token(page, '--text')]).toEqual([
      '#303446',
      '#81c8be',
      '#c6d0f5',
    ]);
    await run(page, 'theme macchiato');
    expect([await token(page, '--base'), await token(page, '--teal'), await token(page, '--text')]).toEqual([
      '#24273a',
      '#8bd5ca',
      '#cad3f5',
    ]);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
  });

  test('the flavour survives a reload, on the scroll page and on the 404 page', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'theme macchiato');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(html(page)).not.toHaveClass(/desktop-on/);
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'macchiato');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 25, 38)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e2030');
    await page.goto('/nope');
    await expect(html(page)).toHaveAttribute('data-theme', 'macchiato');
    await expect(page.locator('main .window')).toHaveCSS('background-color', 'rgb(36, 39, 58)');
  });

  test('theme mocha goes back to the default', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'theme latte');
    await expect(html(page)).toHaveAttribute('data-theme', 'latte');
    await run(page, 'theme mocha');
    await expect(html(page)).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 17, 27)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#181825');
    expect(await stored(page)).toBe('mocha');
    await page.reload();
    await expect(html(page)).not.toHaveAttribute('data-theme');
  });

  test('an unknown flavour is an error and changes nothing', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'theme neon');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText(
      'theme: neon: unbekannter Flavor (latte, frappe, macchiato, mocha)'
    );
    await expect(html(page)).not.toHaveAttribute('data-theme');
    expect(await stored(page)).toBeNull();
  });

  test('a stored value that is no flavour is ignored', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paulwtf:theme', '"><script>'));
    await openTerminal(page);
    await expect(html(page)).not.toHaveAttribute('data-theme');
    await run(page, 'theme');
    await expect(term(page).locator('.term-row').last()).toHaveText('mocha');
  });

  test('works when localStorage throws', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fail = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Storage.prototype.getItem = fail;
      Storage.prototype.setItem = fail;
    });
    await openTerminal(page);
    await run(page, 'theme frappe');
    await expect(html(page)).toHaveAttribute('data-theme', 'frappe');
    expect(errors).toEqual([]);
  });

  test('help and tab know the command', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'help');
    await expect(term(page)).toContainText('theme <flavor>');
    await page.keyboard.type('theme la');
    await page.keyboard.press('Tab');
    await expect(page.locator('.term input')).toHaveValue('theme latte ');
  });
});
