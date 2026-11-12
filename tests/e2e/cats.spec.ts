import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, openTerminal, prepare, run } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const term = (page: Page) => page.locator('.term');
const input = (page: Page) => page.locator('.term input');

test.describe('cat <katze>', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('ls lists the cats in katzen/', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'ls');
    await expect(term(page).locator('.term-row').last()).toContainText('katzen/');
    await run(page, 'ls katzen');
    await expect(term(page).locator('.term-row').last()).toHaveText('eddy  lily  lucky  jessy');
    await run(page, 'ls keller');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText(
      "ls: cannot access 'keller': No such file or directory"
    );
  });

  test('cat eddy prints his line and opens his photo', async ({ page }) => {
    await openTerminal(page);
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(4);
    await run(page, 'cat eddy');
    await expect(term(page)).toContainText('Eddy: Liebenswert, aber stur. Bekommt immer was er will.');
    const win = page.locator('.wm-layer[data-ws="1"] .wm-window[aria-label="Eddy"]');
    await expect(win).toHaveCount(1);
    await expect(win.locator('.path')).toHaveText('~/sidefacts/katzen/eddy');
    const img = win.locator('img');
    await expect(img).toHaveAttribute('alt', 'Katze Eddy');
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window')).toHaveCount(5);
    await expect(input(page)).toBeFocused();
  });

  test('path, upper case and a second call', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'cat katzen/lily');
    await expect(term(page)).toContainText('Lily: Eine kleine Kuschelprinzessin.');
    await run(page, 'cat Jessy');
    await expect(term(page)).toContainText('Jessy: Schläft mehr als sie wach ist.');
    await run(page, 'cat lily');
    await expect(page.locator('.wm-window[aria-label="Lily"]')).toHaveCount(1);
    await expect(page.locator('.wm-window[aria-label="Jessy"]')).toHaveCount(1);
    await run(page, 'cat katzen');
    await expect(term(page).locator('.term-row.is-err').last()).toHaveText('cat: katzen: Is a directory');
  });

  test('the photo opens on the workspace the terminal is on', async ({ page }) => {
    await enterDesktop(page);
    await page.keyboard.press('3');
    await page.keyboard.press('Enter');
    await expect(input(page)).toBeFocused();
    await run(page, 'cat lucky');
    await expect(page.locator('.wm-layer[data-ws="3"] .wm-window[aria-label="Lucky"]')).toHaveCount(1);
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window[aria-label="Lucky"]')).toHaveCount(0);
  });

  test('tab completes cats', async ({ page }) => {
    await openTerminal(page);
    await page.keyboard.type('cat e');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('cat eddy ');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('cat ka');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('cat katzen/');
    await page.keyboard.type('je');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('cat katzen/jessy ');
  });

  test('every cat photo is on the scroll page too', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Eddy', 'Lily', 'Lucky', 'Jessy']) {
      await expect(page.locator(`#sidefacts img[alt="Katze ${name}"]`)).toHaveCount(1);
      await expect(page.locator(`template[data-cat="${name.toLowerCase()}"]`)).toHaveCount(1);
    }
  });
});
