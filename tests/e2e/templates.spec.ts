import { test, expect } from '@playwright/test';

test('window templates per workspace', async ({ page }) => {
  await page.goto('/');
  const counts = await page.$$eval('template[data-window]', (ts) =>
    [1, 2, 3, 4, 5, 6].map((n) => ts.filter((t) => (t as HTMLElement).dataset.ws === String(n)).length)
  );
  expect(counts).toEqual([2, 3, 1, 3, 3, 4]);
});

test('templates are in window order with a path line first', async ({ page }) => {
  await page.goto('/');
  const info = await page.$$eval('template[data-window]', (ts) =>
    ts.map((t) => {
      const el = t as HTMLTemplateElement;
      const first = el.content.firstElementChild;
      return {
        ws: el.dataset.ws,
        label: el.dataset.label,
        path: el.dataset.path,
        firstIsPath: first?.classList.contains('path') ?? false,
        pathText: first?.textContent,
      };
    })
  );
  expect(info.map((i) => `${i.ws}:${i.label}`)).toEqual([
    '1:about', '1:portrait',
    '2:linkhop', '2:tidalwave', '2:projekte',
    '3:fastfetch',
    '4:workstation', '4:laptop', '4:server',
    '5:pax', '5:bmw', '5:katzen',
    '6:github', '6:discord', '6:youtube', '6:email',
  ]);
  for (const i of info) {
    expect(i.firstIsPath, `${i.label} starts with .path`).toBe(true);
    expect(i.path, `${i.label} data-path`).toMatch(/^~\//);
    expect(i.pathText).toBe(i.path);
  }
});

test('about template starts with name and tagline', async ({ page }) => {
  await page.goto('/');
  const text = await page.$eval(
    'template[data-window][data-label="about"]',
    (t) => (t as HTMLTemplateElement).content.textContent ?? ''
  );
  expect(text).toContain('Paul Reitmayer');
  expect(text.indexOf('Paul Reitmayer')).toBeLessThan(text.indexOf('Elektrotechniker am Erdgasspeicher Bierwang'));
  expect(text.indexOf('Elektrotechniker am Erdgasspeicher Bierwang')).toBeLessThan(
    text.indexOf('Erdgasspeicher von Uniper Energy Storage')
  );
});

test('templates carry no ids and no .window class', async ({ page }) => {
  await page.goto('/');
  const bad = await page.$$eval('template[data-window]', (ts) =>
    ts.flatMap((t) => {
      const c = (t as HTMLTemplateElement).content;
      return [...c.querySelectorAll('[id], .window')].map((e) => e.outerHTML.slice(0, 60));
    })
  );
  expect(bad).toEqual([]);
});

test('email address is not in the served HTML', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).not.toContain('paul.reitmayer@paul.wtf');
  expect(html).not.toMatch(/paul\.reitmayer\s*(@|&#64;|&commat;)/);
});

test('scroll page text unchanged', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#about')).toContainText('Erdgasspeicher von Uniper Energy Storage');
  await expect(page.locator('#contact')).toContainText('SpotifyNutzeer');
  await expect(page.locator('#contact .tile.email [data-email-text]')).toHaveText('paul.reitmayer@paul.wtf');
});

test('discord tile copies and shows Kopiert!', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const tile = page.locator('#contact [data-discord]');
  await tile.click();
  await expect(tile.locator('[data-discord-text]')).toHaveText('Kopiert!');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('paul.wtf');
  await expect(tile.locator('[data-discord-text]')).toHaveText('paul.wtf');
});

test('a discord button inserted later still copies', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.evaluate(() => {
    const clone = document.querySelector('#contact [data-discord]')!.cloneNode(true) as HTMLElement;
    clone.id = 'late-discord';
    clone.dataset.discord = 'late.user';
    document.body.appendChild(clone);
  });
  await page.evaluate(() => navigator.clipboard.writeText('before'));
  await page.locator('#late-discord').dispatchEvent('click');
  await expect(page.locator('#late-discord [data-discord-text]')).toHaveText('Kopiert!');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('late.user');
});

test('an email button inserted later reveals the address', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'late-mail';
    b.dataset.emailUser = 'late';
    b.dataset.emailDomain = 'example.org';
    b.innerHTML = '<span data-email-text>(Email anzeigen)</span>';
    document.body.appendChild(b);
    window.addEventListener('beforeunload', (e) => e.preventDefault());
  });
  await page.locator('#late-mail').dispatchEvent('click');
  await expect(page.locator('#late-mail [data-email-text]')).toHaveText('late@example.org');
});
