import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, openTerminal, prepare, run } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const win = (page: Page) => page.locator('.wm-layer[data-ws="1"] .wm-window:has(.til)');

test.describe('TIL window', () => {
  test.beforeEach(async ({ page }) => prepare(page));

  test('sits next to the about window, newest first', async ({ page }) => {
    await enterDesktop(page);
    const wins = page.locator('.wm-layer[data-ws="1"] .wm-window');
    await expect(wins).toHaveCount(3);
    await expect(wins.nth(0)).toHaveAttribute('aria-label', 'Über mich');
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Heute gelernt');
    await expect(w.locator('.path')).toHaveText('~/til');
    const items = w.locator('.til > li');
    await expect(items.locator('time')).toHaveText(['11.11.2026', '03.11.2026', '01.10.2026']);
    await expect(items.nth(0).locator('p')).toHaveText('Fixture-Eintrag auf Deutsch mit fett und einem Link.');
    await expect(items.nth(0).locator('p strong')).toHaveText('fett');
    await expect(items.nth(0).locator('p a')).toHaveAttribute('href', 'https://example.org/de');
    await expect(items.nth(0).locator('a.source')).toHaveText('example.org ↗');
    await expect(items.nth(0).locator('a.source')).toHaveAttribute('href', 'https://www.example.org/source');
    await expect(items.nth(1).locator('p')).toHaveText('Fixture entry in English only, with inline code.');
    await expect(items.nth(1).locator('p code')).toHaveText('inline code');
    await expect(items.nth(1).locator('a.source')).toHaveCount(0);
    await expect(items.nth(2).locator('p')).toHaveText('Fixture entry with <b>markup</b> that stays text.');
    await expect(items.nth(2).locator('p b')).toHaveCount(0);
  });

  test('the launcher opens it', async ({ page }) => {
    await enterDesktop(page);
    await win(page).hover();
    await page.keyboard.press('q');
    await expect(win(page)).toHaveCount(0);
    await page.keyboard.press('2');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('heute gelernt');
    await expect(page.locator('[data-launcher] [role="option"][aria-selected="true"]')).toContainText('~/til');
    await page.keyboard.press('Enter');
    await expect(win(page)).toHaveClass(/is-focus/);
  });

  test('the terminal prints it with til', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'til');
    const rows = page.locator('.term .term-row');
    await expect(rows.filter({ hasText: /^11\.11\.2026 {2}Fixture-Eintrag auf Deutsch mit fett und einem Link\.$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^ {12}https:\/\/www\.example\.org\/source$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^03\.11\.2026 {2}Fixture entry in English only, with inline code\.$/ })).toHaveCount(1);
  });

  test('english', async ({ page }) => {
    await page.goto('/en');
    await page.keyboard.press('d');
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Today I learned');
    await expect(w.locator('.path')).toHaveText('~/til');
    await expect(w.locator('.til > li time')).toHaveText(['2026-11-11', '2026-11-03', '2026-10-01']);
    await expect(w.locator('.til > li').nth(0).locator('p')).toHaveText('Fixture entry in English with bold and a link.');
  });
});
