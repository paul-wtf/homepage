import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, openTerminal, prepare, run } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const win = (page: Page) => page.locator('.wm-layer[data-ws="3"] .wm-window:has(.changelog)');

test.describe('changelog window', () => {
  test.beforeEach(async ({ page }) => prepare(page));

  test('sits next to the system info and lists the releases', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('3');
    const wins = page.locator('.wm-layer[data-ws="3"] .wm-window');
    await expect(wins).toHaveCount(2);
    await expect(wins.nth(0)).toHaveAttribute('aria-label', 'Systeminfo');
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Changelog');
    await expect(w.locator('.path')).toHaveText('~/tools/changelog');
    await expect(w.locator('h3')).toHaveText('Änderungen an paul.wtf');
    const releases = w.locator('.release');
    await expect(releases.locator('.tag')).toHaveText(['v9.3.0', 'v9.2.1', 'v9.2.0']);
    await expect(releases.locator('time')).toHaveText(['10.11.2026', '28.10.2026', '20.10.2026']);
    await expect(releases.nth(0).locator('.tag')).toHaveAttribute(
      'href',
      'https://github.com/paul-wtf/homepage/compare/v9.2.1...v9.3.0'
    );
    const first = releases.nth(0).locator('.changes li');
    await expect(first.locator('.kind')).toHaveText(['neu', 'neu', 'fix']);
    await expect(first.locator('.subject')).toHaveText([
      'fixture window with a launcher entry',
      'fixture feature without a scope',
      'fixture fix for the bar',
    ]);
    await expect(first.nth(0).locator('.scope')).toHaveText('desktop');
    await expect(first.nth(1).locator('.scope')).toHaveCount(0);
    await expect(releases.nth(1).locator('.changes')).toHaveCount(0);
    await expect(releases.nth(1).locator('.maintenance')).toHaveText('nur Wartung');
    await expect(releases.nth(2).locator('.kind')).toHaveText('perf');
  });

  test('the launcher opens it', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('3');
    await win(page).hover();
    await page.keyboard.press('q');
    await expect(win(page)).toHaveCount(0);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('changelog');
    await expect(page.locator('[data-launcher] [role="option"]', { hasText: '~/tools/changelog' })).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(win(page)).toHaveClass(/is-focus/);
  });

  test('the terminal prints it with changelog', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'changelog');
    const rows = page.locator('.term .term-row');
    await expect(rows.filter({ hasText: /^v9\.3\.0 {2}10\.11\.2026$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^ {2}neu {3}desktop: fixture window with a launcher entry$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^ {2}neu {3}fixture feature without a scope$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^ {2}nur Wartung$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^ {2}perf {2}api: fixture speedup$/ })).toHaveCount(1);
  });

  test('english keeps the entries as written', async ({ page }) => {
    await page.goto('/en');
    await page.keyboard.press('d');
    await page.keyboard.press('3');
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Changelog');
    await expect(w.locator('h3')).toHaveText('Changes to paul.wtf');
    await expect(w.locator('.release time')).toHaveText(['2026-11-10', '2026-10-28', '2026-10-20']);
    await expect(w.locator('.release').nth(0).locator('.kind')).toHaveText(['new', 'new', 'fix']);
    await expect(w.locator('.release').nth(0).locator('.subject').first()).toHaveText('fixture window with a launcher entry');
    await expect(w.locator('.maintenance')).toHaveText('maintenance only');
    await expect(w.locator('.changelog > .repo')).toHaveText('all tags on GitHub');
  });
});
