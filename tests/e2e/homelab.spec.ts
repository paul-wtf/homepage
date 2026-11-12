import { test, expect, type Page } from '@playwright/test';
import { enterDesktop, mockStatus, prepare, run, status } from './term';

test.use({ viewport: { width: 1400, height: 900 } });

const node = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  ready: true,
  uptime_s: 286_980,
  storage_used: 153_792_188_416,
  storage_total: 528_343_535_616,
  ...over,
});

export const cluster = (over: Record<string, unknown> = {}) => ({
  nodes_total: 3,
  nodes_ready: 3,
  pods: 168,
  workloads: 75,
  services: 15,
  kubernetes: { version: '1.36', distribution: 'RKE2' },
  nodes: [
    node('server01'),
    node('server02', { uptime_s: 283_616, storage_used: 177_507_315_712, storage_total: 316_967_923_712 }),
    node('server03', { uptime_s: 199_955, storage_used: 154_977_693_696, storage_total: 211_181_367_296 }),
  ],
  storage_used: 486_277_197_824,
  storage_total: 1_056_492_826_624,
  cpu_temp_c: 75.2,
  nvme_temp_c: 72.9,
  ...over,
});

const layer = (page: Page) => page.locator('.wm-layer[data-ws="4"]');
const win = (page: Page) => layer(page).locator('.wm-window:has([data-cluster])');
const labels = (page: Page) =>
  layer(page).locator('.wm-window').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

async function openWorkspace(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('[data-live="server"]')).toBeVisible();
  await page.keyboard.press('d');
  await page.keyboard.press('4');
}

test.describe('homelab window', () => {
  test.beforeEach(async ({ page }) => prepare(page));

  test('is absent without a cluster', async ({ page }) => {
    await mockStatus(page, status());
    await openWorkspace(page);
    await expect(layer(page).locator('.wm-window')).toHaveCount(3);
    await expect(win(page)).toHaveCount(0);
  });

  test('shows the summary, the nodes, the storage and the temperatures', async ({ page }) => {
    await mockStatus(page, status({ cluster: cluster() }));
    await openWorkspace(page);
    await expect(layer(page).locator('.wm-window')).toHaveCount(4);
    await expect.poll(() => labels(page)).toEqual(['Workstation', 'Homelab', 'Laptop', 'Server']);
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Homelab');
    await expect(w.locator('.path')).toHaveText('~/hardware/homelab');
    const stats = w.locator('[data-cluster-stats] > div');
    await expect(stats.locator('dt')).toHaveText(['nodes', 'pods', 'workloads', 'dienste', 'kubernetes']);
    await expect(stats.locator('dd')).toHaveText(['3/3', '168', '75', '15', '1.36 · RKE2']);
    const rows = w.locator('[data-cluster-nodes] li');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('.name')).toHaveText('server01');
    await expect(rows.nth(0).locator('.up')).toHaveText('up 3 Tage');
    await expect(rows.nth(2).locator('.up')).toHaveText('up 2 Tage');
    await expect(rows.nth(0).locator('.amount')).toHaveText('154 GB / 528 GB');
    await expect(rows.nth(0).locator('.dot')).toHaveAttribute('data-ready', 'true');
    await expect(rows.nth(0).locator('.track')).toHaveAttribute('aria-label', 'Speicher von server01: 154 GB von 528 GB belegt');
    const bars = await rows.locator('.bar').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.width));
    expect(bars).toEqual(['29%', '56%', '73%']);
    await expect(w.locator('[data-cluster-total] .amount')).toHaveText('486 GB / 1,06 TB');
    await expect(w.locator('[data-cluster-temps] dt')).toHaveText(['cpu', 'nvme']);
    await expect(w.locator('[data-cluster-temps] dd')).toHaveText(['75 °C', '73 °C']);
  });

  test('marks a node that is not ready and counts it', async ({ page }) => {
    await mockStatus(
      page,
      status({ cluster: cluster({ nodes_ready: 2, nodes: [node('server01'), node('server02', { ready: false })] }) })
    );
    await openWorkspace(page);
    const w = win(page);
    await expect(w.locator('[data-cluster-stats] dd').first()).toHaveText('2/3');
    const dot = w.locator('[data-cluster-nodes] li').nth(1).locator('.dot');
    await expect(dot).toHaveAttribute('data-ready', 'false');
    await expect(dot).toHaveAttribute('aria-label', 'nicht bereit');
  });

  test('leaves out what the cluster did not report', async ({ page }) => {
    await mockStatus(
      page,
      status({
        cluster: {
          pods: 12,
          nodes: [{ name: 'server01', ready: null, uptime_s: null, storage_used: null, storage_total: null }],
        },
      })
    );
    await openWorkspace(page);
    const w = win(page);
    await expect(w.locator('[data-cluster-stats] dt')).toHaveText(['pods']);
    await expect(w.locator('[data-cluster-stats] dd')).toHaveText(['12']);
    const row = w.locator('[data-cluster-nodes] li');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.name')).toHaveText('server01');
    await expect(row.locator('.up')).toHaveCount(0);
    await expect(row.locator('.track')).toHaveCount(0);
    await expect(w.locator('[data-cluster-total]')).toBeHidden();
    await expect(w.locator('[data-cluster-temps]')).toBeHidden();
  });

  test('appears when the cluster arrives after the desktop was entered', async ({ page }) => {
    await page.clock.install();
    let body: unknown = status();
    await page.route('https://img.test/**', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' })
    );
    await page.route('**/api/status', (route) => route.fulfill({ json: body }));
    await enterDesktop(page);
    await page.keyboard.press('4');
    await expect(layer(page).locator('.wm-window')).toHaveCount(3);
    body = status({ cluster: cluster() });
    await page.clock.runFor(30_000);
    await expect(win(page)).toHaveCount(1);
    await expect(layer(page).locator('.wm-window')).toHaveCount(4);
    await expect.poll(() => labels(page)).toEqual(['Workstation', 'Homelab', 'Laptop', 'Server']);
    await expect(win(page)).not.toHaveClass(/is-focus/);
    await expect(win(page).locator('[data-cluster-stats] dd').first()).toHaveText('3/3');
  });

  test('stays closed after Q and follows the next answer', async ({ page }) => {
    await page.clock.install();
    let body: unknown = status({ cluster: cluster() });
    let hits = 0;
    await page.route('**/api/status', (route) => {
      hits++;
      return route.fulfill({ json: body });
    });
    await enterDesktop(page);
    await page.keyboard.press('4');
    body = status({ cluster: cluster({ pods: 200 }) });
    await page.clock.runFor(30_000);
    await expect(win(page).locator('[data-cluster-stats] dd').nth(1)).toHaveText('200');
    await win(page).hover();
    await expect(win(page)).toHaveClass(/is-focus/);
    await page.keyboard.press('q');
    await expect(win(page)).toHaveCount(0);
    const before = hits;
    await page.clock.runFor(30_000);
    await expect.poll(() => hits).toBeGreaterThan(before);
    await page.waitForTimeout(300);
    await expect(layer(page).locator('.wm-window')).toHaveCount(3);
  });

  test('ignores a malformed cluster', async ({ page }) => {
    await mockStatus(page, status({ cluster: { nodes: 'three', pods: 'many' } }));
    await openWorkspace(page);
    await expect(win(page)).toHaveCount(0);
  });

  test('the launcher lists it only with a cluster', async ({ page }) => {
    const option = page.locator('[data-launcher] [role="option"]', { hasText: '~/hardware/homelab' });
    await mockStatus(page, status());
    await enterDesktop(page);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('homelab');
    await expect(page.locator('[data-launcher] [role="option"]').first()).toBeVisible();
    await expect(option).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.unroute('**/api/status');
    await mockStatus(page, status({ cluster: cluster() }));
    await page.reload();
    await expect(page.locator('[data-live="server"]')).toBeVisible();
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('homelab');
    await expect(option).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(win(page)).toHaveClass(/is-focus/);
  });

  test('the terminal prints it with homelab', async ({ page }) => {
    await mockStatus(page, status({ cluster: cluster() }));
    await openWorkspace(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('.term input')).toBeFocused();
    await run(page, 'homelab');
    const rows = page.locator('.term .term-row');
    await expect(rows.filter({ hasText: 'nodes 3/3 · pods 168 · workloads 75 · dienste 15' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'kubernetes 1.36 · RKE2' })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^server01 +up 3 Tage +\[\|+ +\] +154 GB \/ 528 GB$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^gesamt +\[\|+ +\] +486 GB \/ 1,06 TB$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'cpu 75 °C · nvme 73 °C' })).toHaveCount(1);
  });

  test('the terminal says when there is no cluster', async ({ page }) => {
    await mockStatus(page, status());
    await openWorkspace(page);
    await page.keyboard.press('Enter');
    await run(page, 'homelab');
    await expect(page.locator('.term .term-row').last()).toHaveText('homelab: nicht verfügbar');
  });

  test('english', async ({ page }) => {
    await mockStatus(page, status({ cluster: cluster() }));
    await openWorkspace(page, '/en');
    const w = win(page);
    await expect(w).toHaveAttribute('aria-label', 'Homelab');
    await expect(w.locator('.path')).toHaveText('~/hardware/homelab');
    await expect(w.locator('[data-cluster-stats] dt')).toHaveText(['nodes', 'pods', 'workloads', 'services', 'kubernetes']);
    await expect(w.locator('[data-cluster-nodes] li').nth(0).locator('.up')).toHaveText('up 3 days');
    await expect(w.locator('[data-cluster-total] .amount')).toHaveText('486 GB / 1.06 TB');
    await expect(w.locator('[data-cluster-total] .label')).toHaveText('total');
  });
});
