import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1400, height: 900 } });

async function openTerminal(page: Page) {
  await page.goto('/');
  await page.keyboard.press('d');
  await expect(page.locator('html')).toHaveClass(/desktop-on/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.term input')).toBeFocused();
}

async function run(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

test.describe('terminal', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('paulwtf:keybinds-seen', '1'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('help lists commands', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'help');
    await expect(page.locator('.term')).toContainText('whoami');
    await expect(page.locator('.term')).toContainText('fastfetch');
  });

  test('cat kontakt prints contacts', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'cat kontakt');
    await expect(page.locator('.term')).toContainText('SpotifyNutzeer');
    await expect(page.locator('.term')).toContainText('paul.wtf');
  });

  test('unknown command', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'foo');
    await expect(page.locator('.term')).toContainText('fish: Unknown command: foo');
  });

  test('sudo', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'sudo rm -rf /');
    await expect(page.locator('.term')).toContainText(
      'paul is not in the sudoers file. This incident will be reported.'
    );
  });

  test('ws 3 switches workspace', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'ws 3');
    await expect(page.locator('.wm-layer[data-ws="3"]')).toBeVisible();
    await expect(page.locator('.wm-layer[data-ws="1"]')).toBeHidden();
  });

  test('exit closes the terminal', async ({ page }) => {
    await openTerminal(page);
    await expect(page.locator('.term')).toHaveCount(1);
    await run(page, 'exit');
    await expect(page.locator('.term')).toHaveCount(0);
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
  });

  test('html input stays text', async ({ page }) => {
    await openTerminal(page);
    await run(page, '<img src=x onerror=window.pwned=1>');
    await expect(page.locator('.term')).toContainText('fish: Unknown command: <img');
    await expect(page.locator('.term img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  });

  test('Esc leaves the input, then Esc leaves desktop', async ({ page }) => {
    await openTerminal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await expect(page.locator('.term input')).not.toBeFocused();
    await expect(page.locator('.wm-window.is-focus')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
  });

  test('WM keys work after Esc leaves the input', async ({ page }) => {
    await openTerminal(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('q');
    await expect(page.locator('.term')).toHaveCount(0);
  });

  test('Enter on a link inside a window does not open a terminal', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await page.keyboard.press('2');
    const link = page.locator('.wm-layer[data-ws="2"] a[href]').first();
    await expect(link).toBeVisible();
    await link.evaluate((a) => {
      (window as unknown as { clicks: number }).clicks = 0;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        (window as unknown as { clicks: number }).clicks++;
      });
    });
    await link.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(1);
    await expect(page.locator('.term')).toHaveCount(0);
  });

  test('hovering a terminal window focuses its input', async ({ page }) => {
    await openTerminal(page);
    await page.locator('.wm-layer[data-ws="1"] .wm-window').first().hover();
    await expect(page.locator('.term input')).not.toBeFocused();
    await page.locator('.term').hover();
    await expect(page.locator('.term input')).toBeFocused();
  });

  test('live commands say so when no data is available', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'weather');
    await expect(page.locator('.term')).toContainText('nicht verfügbar');
  });

  test('fastfetch prints the tools data', async ({ page }) => {
    await openTerminal(page);
    await run(page, 'fastfetch');
    await expect(page.locator('.term')).toContainText('Hyprland');
    await expect(page.locator('.term')).toContainText('paul@paul.wtf');
  });
});
