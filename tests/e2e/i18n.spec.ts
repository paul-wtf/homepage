import { test, expect, type Page } from '@playwright/test';
import { mockStatus, prepare, status } from './term';
import { LANGS, localizedPath } from '../../src/data/i18n';
import * as about from '../../src/data/about';
import * as contact from '../../src/data/contact';
import * as hardware from '../../src/data/hardware';
import * as projects from '../../src/data/projects';
import * as sidefacts from '../../src/data/sidefacts';
import * as tools from '../../src/data/tools';
import * as ui from '../../src/data/ui';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shape);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]));
  return typeof v === 'function' ? `function/${v.length}` : typeof v;
}

function localized(v: unknown, path: string, found: { path: string; value: Record<string, unknown> }[] = []) {
  if (Array.isArray(v)) v.forEach((item, i) => localized(item, `${path}[${i}]`, found));
  else if (isObj(v)) {
    if (Object.keys(v).some((k) => (LANGS as readonly string[]).includes(k))) found.push({ path, value: v });
    for (const [k, child] of Object.entries(v)) localized(child, `${path}.${k}`, found);
  }
  return found;
}

function blanks(v: unknown, path: string, found: string[] = []): string[] {
  if (typeof v === 'string' && !v.trim()) found.push(path);
  else if (Array.isArray(v)) v.forEach((item, i) => blanks(item, `${path}[${i}]`, found));
  else if (isObj(v)) for (const [k, child] of Object.entries(v)) blanks(child, `${path}.${k}`, found);
  return found;
}

test.describe('languages in the data', () => {
  const modules = { about, contact, hardware, projects, sidefacts, tools, ui };

  test('every text exists in both languages with the same keys', () => {
    const entries = localized(modules, 'data');
    expect(entries.length).toBeGreaterThan(10);
    for (const { path, value } of entries) {
      expect(Object.keys(value).sort(), path).toEqual([...LANGS].sort());
      for (const lang of LANGS) expect(shape(value[lang]), `${path}.${lang}`).toEqual(shape(value[LANGS[0]]));
    }
    expect(blanks(modules, 'data')).toEqual([]);
  });

  test('the check sees a missing key, a missing language and an uneven list', () => {
    const broken = {
      a: { de: { title: 'Titel', hint: 'Hinweis' }, en: { title: 'Title' } },
      b: { de: 'nur deutsch' },
      c: { de: ['eins', 'zwei'], en: ['one'] },
    };
    const [a, b, c] = localized(broken, 'x');
    expect(shape(a.value.en)).not.toEqual(shape(a.value.de));
    expect(Object.keys(b.value).sort()).not.toEqual([...LANGS].sort());
    expect(shape(c.value.en)).not.toEqual(shape(c.value.de));
  });

  test('paths move between the languages', () => {
    expect(localizedPath('/', 'en')).toBe('/en');
    expect(localizedPath('/', 'de')).toBe('/');
    expect(localizedPath('/en', 'de')).toBe('/');
    expect(localizedPath('/en', 'en')).toBe('/en');
    expect(localizedPath('/404', 'en')).toBe('/en/404');
    expect(localizedPath('/en/404', 'de')).toBe('/404');
    expect(localizedPath('/energie', 'en')).toBe('/en/energie');
  });
});

const head = (page: Page, selector: string, attr: string) => page.locator(`head ${selector}`).getAttribute(attr);

test.describe('language routing', () => {
  test('german stays at the root, english lives under /en', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    expect(await head(page, 'link[rel="canonical"]', 'href')).toBe('https://paul.wtf/');
    expect(await head(page, 'meta[property="og:locale"]', 'content')).toBe('de_DE');
    expect(await head(page, 'meta[property="og:locale:alternate"]', 'content')).toBe('en_US');
    expect(await head(page, 'meta[property="og:image"]', 'content')).toBe('https://paul.wtf/og-image.png');

    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await head(page, 'link[rel="canonical"]', 'href')).toBe('https://paul.wtf/en');
    expect(await head(page, 'meta[property="og:locale"]', 'content')).toBe('en_US');
    expect(await head(page, 'meta[property="og:locale:alternate"]', 'content')).toBe('de_DE');
    expect(await head(page, 'meta[property="og:url"]', 'content')).toBe('https://paul.wtf/en');
    expect(await head(page, 'meta[property="og:image"]', 'content')).toBe('https://paul.wtf/og-image-en.png');
    expect(await head(page, 'meta[name="twitter:image"]', 'content')).toBe('https://paul.wtf/og-image-en.png');
    const image = await page.request.get('/og-image-en.png');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    await expect(page).toHaveTitle('Paul Reitmayer');
    expect(await head(page, 'meta[name="description"]', 'content')).toContain('Personal homepage of Paul Reitmayer');
  });

  test('both pages name each other as alternates', async ({ page }) => {
    for (const path of ['/', '/en']) {
      await page.goto(path);
      expect(await head(page, 'link[rel="alternate"][hreflang="de"]', 'href')).toBe('https://paul.wtf/');
      expect(await head(page, 'link[rel="alternate"][hreflang="en"]', 'href')).toBe('https://paul.wtf/en');
      expect(await head(page, 'link[rel="alternate"][hreflang="x-default"]', 'href')).toBe('https://paul.wtf/');
    }
  });

  test('the sitemap lists both languages and no 404 page', async ({ request }) => {
    const index = await (await request.get('/sitemap-index.xml')).text();
    expect(index).toContain('https://paul.wtf/sitemap-0.xml');
    const map = await (await request.get('/sitemap-0.xml')).text();
    const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    expect(locs).toEqual(['https://paul.wtf', 'https://paul.wtf/en']);
    expect(map).toContain('hreflang="de" href="https://paul.wtf/"');
    expect(map).toContain('hreflang="en" href="https://paul.wtf/en"');
  });

  test('no redirect by browser language', async ({ browser }) => {
    for (const [locale, path, lang] of [
      ['en-US', '/', 'de'],
      ['de-DE', '/en', 'en'],
    ]) {
      const context = await browser.newContext({ locale });
      try {
        const page = await context.newPage();
        const res = await page.goto(path);
        expect(res?.request().redirectedFrom()).toBeNull();
        await page.waitForTimeout(300);
        expect(new URL(page.url()).pathname).toBe(path);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
      } finally {
        await context.close();
      }
    }
  });
});

test.describe('language switch', () => {
  test('the bar links to the other language and marks the current one', async ({ page }) => {
    await page.goto('/');
    const langs = page.locator('#top-nav .langs');
    await expect(langs).toHaveAttribute('role', 'group');
    await expect(langs).toHaveAttribute('aria-label', 'Sprache');
    await expect(langs.locator('.here')).toHaveText('de');
    await expect(langs.locator('a')).toHaveCount(1);
    await expect(langs.locator('a')).toHaveText('en');
    await expect(langs.locator('a')).toHaveAttribute('href', '/en');
    await expect(langs.locator('a')).toHaveAttribute('hreflang', 'en');
    await expect(langs.locator('a')).toHaveAttribute('lang', 'en');

    await langs.locator('a').click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(langs).toHaveAttribute('aria-label', 'Language');
    await expect(langs.locator('.here')).toHaveText('en');
    await expect(langs.locator('a')).toHaveText('de');
    await expect(langs.locator('a')).toHaveAttribute('href', '/');
    await langs.locator('a').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('the bar still fits in both languages', async ({ page }) => {
    await mockStatus(page, status({ music: { ...status().music, track: 'x'.repeat(300) } }));
    for (const path of ['/', '/en']) {
      for (const width of [1400, 1181, 1180, 960, 780, 390, 360]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.locator('[data-live="music"]')).toBeVisible();
        await expect(page.locator('#top-nav .langs a')).toBeVisible();
        const { scroll, client } = await page
          .locator('#top-nav')
          .evaluate((n) => ({ scroll: n.scrollWidth, client: n.clientWidth }));
        expect(scroll, `nav of ${path} at ${width}px`).toBeLessThanOrEqual(client);
        const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(docWidth, `${path} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
  });

  test('mode and theme are shared between the languages', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await prepare(page);
    await page.goto('/');
    await page.keyboard.press('d');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await page.keyboard.press('Enter');
    await page.keyboard.type('theme latte');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');

    await page.locator('#top-nav .langs a').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveClass(/desktop-on/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');
    await expect(page.locator('.wm-layer[data-ws="1"] .wm-window').first()).toHaveAttribute('aria-label', 'About');

    await page.keyboard.press('Escape');
    await page.locator('#top-nav .langs a').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('html')).not.toHaveClass(/desktop-on/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');
  });
});
