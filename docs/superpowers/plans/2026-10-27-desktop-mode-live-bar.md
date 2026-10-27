# Desktop Mode and Live Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give paul.wtf the round-1 scroll page refinements, a desktop mode that tiles the sections as Hyprland windows, and a bar with live music, server and weather widgets fed by a small API.

**Architecture:** The Astro site stays static. Desktop mode is vanilla TypeScript that instantiates build-time `<template>` windows and lays them out with a dwindle function. A FastAPI service in `api/` aggregates Last.fm, the in-cluster Prometheus and Open-Meteo behind `GET /api/status`, served on the same host through a second Ingress path.

**Tech Stack:** Astro 7, TypeScript, Playwright (`@playwright/test`) for browser tests; Python 3.12, FastAPI, httpx, pydantic-settings, pytest + respx, uv; Kubernetes manifests, FluxCD, External Secrets.

**Spec:** `docs/superpowers/specs/2026-10-27-desktop-mode-live-bar-design.md`. Read it before starting any task. Prototype markup and code for desktop mode: private artifact "paul.wtf Desktop-Modus"; round-1 visuals: private artifact "paul.wtf Feinschliff". Where a prototype differs from the spec, the spec wins.

## Global Constraints

- No new runtime dependency in the Astro site. Dev dependencies for tests are fine (`@playwright/test`, same major as the existing `playwright` devDependency).
- Frontend code is vanilla TypeScript in Astro `<script>` blocks or modules they import. No framework.
- Every animation and transition is off under `prefers-reduced-motion: reduce`.
- Every `localStorage` access is wrapped in try/catch. Mode key: `paulwtf:mode`, values `scroll` or `desktop`. Keybinds-seen key: `paulwtf:keybinds-seen`.
- Desktop mode is offered only when `(min-width: 900px) and (pointer: fine)` matches.
- Keys are ignored while Ctrl, Alt or Meta is held or an `input` has focus. Shift is allowed.
- Colors only from the tokens in `src/styles/tokens.css`. Teal is reserved for: surname, buttons, active workspace, focus border, cursor, icons, the bar's music note.
- UI copy is German. Code, identifiers, comments, commit messages are English.
- Comments: default is none. A comment stays only if a careful reader cannot derive it from the code next to it (foreign-system behavior, a deliberate absence, an arbitrary-looking number). No history, no "fixed X" notes.
- API: Python ≥ 3.12, `fastapi==0.136.*`, `httpx==0.28.*`, `pydantic-settings==2.13.*`, `uvicorn[standard]==0.44.*`; dev: `pytest==9.0.*`, `pytest-asyncio==1.3.*`, `respx==0.23.*`, `ruff==0.15.*`. Layout, ruff config and Dockerfile follow `~/git/linkhop/backend`.
- API env: `LASTFM_API_KEY` (no prefix, from the spec), `LASTFM_USER` default `SpotifyNutzeer`, `PROMETHEUS_URL` default `http://monitoring-kube-prometheus-prometheus.monitoring:9090`, `WEATHER_LAT` / `WEATHER_LON` (coordinates of Bierwang, looked up once and written as defaults).
- Cache times: music 20 s, server 15 s, weather 600 s. Upstream timeout 3 s. Stale value served up to 2× its TTL after a failed fetch, then `null`. Music `recent` cutoff 6 h.
- Commits: Conventional Commits (`feat(desktop): …`, `feat(api): …`, `test(…)`, `chore(…)`), English, body wrapped at 72. No `Co-Authored-By`, no "Generated with", no tool attribution. Commits are gpg-signed; never disable signing. This machine is `dev`: before the first commit run `echo probe | gpg --clearsign --pinentry-mode error -u "$(git config user.signingkey)" > /dev/null`; if it fails, stop and ask Paul to unlock, do not retry.
- Tools on `dev` are not installed globally. Node: `nix --extra-experimental-features 'nix-command flakes' shell nixpkgs#nodejs_24 nixpkgs#pnpm -c <cmd>`. Python: `nix … shell nixpkgs#uv nixpkgs#python312 -c <cmd>`. Browser for Playwright: `BROWSER_BIN=$(nix … shell nixpkgs#chromium -c which chromium)`. `dev` has little RAM; run Playwright with `--workers=1`.
- If `~/git/homepage/.codegraph/` exists, use `codegraph explore "<symbols or question>"` before grep/read to understand code.

## Review Focus

- A Last.fm track without album or image (empty `#text`, missing `image` array) must yield `null` fields, not a 500 or a dropped music widget. Test in Task 7.
- Prometheus answering 200 with an empty result vector (exporter down) must give `server: null`, not a crash or zeros. Test in Task 8.
- A slow `/api/status` (longer than the poll interval) must not stack requests or freeze the page; only one request is in flight. Test in Task 9.
- Terminal input with HTML (`<img src=x onerror=…>`) is printed as text and never interpreted. Test in Task 6.
- A very long track title must not push the bar wider than the viewport at 1180, 960 and 780 px. Test in Task 9.

---

### Task 1: Playwright test harness

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (devDependency `@playwright/test`, script `"test:e2e": "playwright test"`), `.github/workflows/ci.yml`, `.gitignore` (`test-results/`, `playwright-report/`)

**Interfaces:**
- Produces: `pnpm test:e2e` runs against `pnpm build && pnpm preview --port 4322` via Playwright `webServer`; `use.baseURL = 'http://localhost:4322'`; `launchOptions.executablePath = process.env.BROWSER_BIN` when set. Later tasks add spec files under `tests/e2e/`.

- [ ] **Step 1: Write `tests/e2e/smoke.spec.ts`**

```ts
test('home renders name and six nav workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Reitmayer');
  await expect(page.locator('#top-nav a[data-section]')).toHaveCount(6);
});
```

- [ ] **Step 2: Add the config and dependency, run it**

Run: `BROWSER_BIN=… pnpm install && pnpm test:e2e --workers=1`
Expected: 1 passed.

- [ ] **Step 3: CI**: add a job step after `pnpm build`: `pnpm exec playwright install --with-deps chromium` then `pnpm test:e2e`.

- [ ] **Step 4: Commit** `test(e2e): add playwright harness`

---

### Task 2: Scroll page refinements (hero, title chips, less teal, fastfetch logo)

**Files:**
- Modify: `src/components/Hero.astro`, `src/styles/tokens.css` (`.section-title`, wallpaper moon opacities), `src/components/{About,Projects,Tools,Hardware,Sidefacts,Contact}.astro` (title markup, label colors), `src/components/Tools.astro` (logo)
- Test: `tests/e2e/refinements.spec.ts`

**Interfaces:**
- Produces: section titles render as `<h2 class="section-title"><span class="ws" aria-hidden="true">N</span>Title</h2>` with N = nav position (about 1 … contact 6). Sections get `data-ws="N"`. A section with class `is-current` shows its chip teal (class is set in Task 3).

- [ ] **Step 1: Write the failing tests**

```ts
test('hero prompt and two-line name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero .prompt')).toContainText('paul@paul.wtf:~$ whoami');
  const em = page.locator('.hero h1 em');
  expect(await em.evaluate((e) => getComputedStyle(e).display)).toBe('block');
});
test('section titles carry workspace numbers 1-6', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('section .section-title .ws')).toHaveText(['1','2','3','4','5','6']);
});
test('labels are not teal', async ({ page }) => {
  await page.goto('/');
  const teal = 'rgb(148, 226, 213)';
  for (const sel of ['.hero .prompt', '#tools dt', '#hardware .cat-label']) {
    expect(await page.locator(sel).first().evaluate((e) => getComputedStyle(e).color)).not.toBe(teal);
  }
});
test('fastfetch shows the NixOS logo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tools pre.logo')).toBeVisible();
});
```

- [ ] **Step 2: Run, expect 4 failures**

Run: `pnpm test:e2e refinements --workers=1`

- [ ] **Step 3: Implement** following the spec section "Scroll page refinements" and the round-1 artifact (moves A, C, D, E). Values from the artifact: name `clamp(2.6rem, 8.6vw, 6.6rem)`, `letter-spacing: -0.055em`, `line-height: 0.98`; moon radial alphas `.24` / `.09`; chip `1.75em` square, `--r-nest`. Cursor blink `1.1s steps(1)`, static under reduced motion. Logo text is the neofetch `nixos_small` art, alternating teal and sky as in the artifact; the logo stacks above the list below 600px.

- [ ] **Step 4: Run tests, expect 5 passed (incl. smoke)**; `pnpm astro check` clean.

- [ ] **Step 5: Commit** `feat(design): bigger hero, workspace chips, less teal, fastfetch logo`

---

### Task 3: Focus follows scroll

**Files:**
- Create: `src/scripts/scroll-focus.ts`
- Modify: `src/layouts/Layout.astro` (import script), `src/components/Hero.astro` (portrait becomes a `.window`, drop its permanent ring), `src/components/Nav.astro` (scrollspy also toggles `is-current` on sections), `src/styles/tokens.css` (`.window.is-focus`)
- Test: `tests/e2e/scroll-focus.spec.ts`

**Interfaces:**
- Produces: `initScrollFocus(): () => void` (returns a teardown, used by Task 5 to pause it in desktop mode). Exactly one `.window` on the page carries `is-focus` at any time.

- [ ] **Step 1: Write the failing tests**

```ts
test('portrait is focused at the top', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.window.is-focus')).toHaveCount(1);
  await expect(page.locator('.hero .window.is-focus')).toHaveCount(1);
});
test('focus moves to a project window when scrolled there', async ({ page }) => {
  await page.goto('/');
  await page.locator('#projects').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 300);
  await expect(page.locator('#projects .window.is-focus')).toHaveCount(1);
  await expect(page.locator('#projects.is-current .ws')).toHaveCSS('background-color', 'rgb(148, 226, 213)');
});
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement**: probe point: horizontal center, 40% of viewport height; pick the `.window` with the smallest distance from the probe point to its rect (0 inside); at `scrollY < 40` pick the portrait. rAF-throttled passive scroll listener. Ring: `box-shadow: 0 0 0 2px var(--teal), var(--card-shadow)` with `transition: box-shadow var(--dur) var(--ease-jelly)`.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(design): focus border follows scroll`

---

### Task 4: Shared content data and window templates

**Files:**
- Create: `src/data/about.ts`, `src/data/contact.ts`, `src/components/desktop/WindowTemplates.astro`
- Modify: `src/components/About.astro`, `src/components/Contact.astro`, `src/components/Email.astro`, `src/pages/index.astro`
- Test: `tests/e2e/templates.spec.ts`

**Interfaces:**
- Produces:
  - `about.ts`: `export const about: { name: string; tagline: string; paragraphs: string[] }`
  - `contact.ts`: `export interface ContactEntry { kind: 'github' | 'discord' | 'youtube' | 'email'; label: string; value: string; href?: string }` and `export const contacts: ContactEntry[]`; email keeps `user`/`domain` split.
  - Templates: `<template data-window data-ws="N" data-path="~/…" data-label="…">` in document order per workspace. Window sets per spec table: ws1 `about` (starts with name + tagline), `portrait`; ws2 one per featured project (with preview) + `~/projekte` list of the others; ws3 `fastfetch`; ws4 `workstation`, `laptop`, `server`; ws5 `pax`, `bmw`, `katzen`; ws6 `github`, `discord`, `youtube`, `email`. Each template starts with `<span class="path">` and reuses the scroll page's markup classes.
  - Discord copy and email reveal handlers switch to event delegation on `document` (`[data-discord]`, `[data-email-user]`), so they work in instantiated windows.

- [ ] **Step 1: Write the failing test**

```ts
test('window templates per workspace', async ({ page }) => {
  await page.goto('/');
  const counts = await page.$$eval('template[data-window]', (ts) =>
    [1,2,3,4,5,6].map((n) => ts.filter((t) => t.dataset.ws === String(n)).length));
  expect(counts).toEqual([2, 3, 1, 3, 3, 4]);
});
test('scroll page text unchanged', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#about')).toContainText('Erdgasspeicher von Uniper Energy Storage');
  await expect(page.locator('#contact')).toContainText('SpotifyNutzeer');
});
```
(ws2 count is `featured.length + 1`; with today's data that is 3.)

- [ ] **Step 2: Run, expect the first to fail.**
- [ ] **Step 3: Implement.** Move texts verbatim into the data files; components render from them.
- [ ] **Step 4: Run all e2e, expect pass.** Click the Discord tile on the scroll page still shows „Kopiert!“.
- [ ] **Step 5: Commit** `refactor(content): move about and contact into data, add window templates`

---

### Task 5: Desktop mode (layout, workspaces, focus, keys)

**Files:**
- Create: `src/scripts/desktop/layout.ts`, `src/scripts/desktop/wm.ts`, `src/components/desktop/DesktopMode.astro` (WM container, toggle styles, keybinds window template, `<script>` that calls `initDesktop()`)
- Modify: `src/components/Nav.astro` (toggle button `⊞ desktop`, hidden by default; workspace links switch workspaces while desktop mode is on), `src/pages/index.astro`, `src/styles/tokens.css` (window/pop-in/slide tokens if missing)
- Test: `tests/e2e/desktop.spec.ts`

**Interfaces:**
- Consumes: templates from Task 4; `initScrollFocus` teardown from Task 3.
- Produces:
  - `layout.ts`: `export interface Rect { x: number; y: number; w: number; h: number }`; `export function dwindle(area: Rect, n: number, gapIn: number): Rect[]` (split along the longer side, 50/50, first window gets the first half, recurse into the second).
  - `wm.ts`: `export function initDesktop(): DesktopApi` with `interface DesktopApi { enter(ws?: number): void; leave(): void; isOn(): boolean; current(): number; go(ws: number): void; openWindow(el: HTMLElement): void; closeFocused(): void; }`: Task 6 uses `openWindow` and `go`.
  - DOM contract for tests: `html.desktop-on` while active; windows are `.wm-window` inside `.wm-layer[data-ws="N"]`; focused window has `.is-focus`; fullscreen window `.is-full`; the toggle is `#desktop-toggle` with `aria-pressed`.

- [ ] **Step 1: Write the failing tests** (viewport 1400×900 unless stated)

```ts
test('D enters, Esc leaves, focus returns to toggle', …)        // html.desktop-on toggles; main is inert while on
test('workspace 1 tiles two windows without overlap', …)          // rects pairwise disjoint, inside .wm bounds
test('number keys switch workspaces', …)                          // press 4 → .wm-layer[data-ws="4"] visible, 3 windows
test('Q closes the focused window and the rest re-tile', …)       // ws2: 3 → 2 windows, remaining fill the area
test('F toggles fullscreen', …)                                   // focused rect equals the outer area, then back
test('hjkl moves focus', …)                                       // ws4: l from workstation focuses laptop or server
test('keys ignored with Ctrl and on the scroll page', …)          // Ctrl+D does nothing; on scroll page "2" does nothing
test('mode is remembered across reload', …)
test('toggle hidden below 900px and on coarse pointers', …)       // viewport 800 → #desktop-toggle hidden
test('shrinking below 900px returns to the scroll page', …)       // setViewportSize(800, 900) while on
test('keybinds window opens once, ? reopens it', …)
```

- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement `dwindle`**: algorithm as in the prototype's `dwindle()`.
- [ ] **Step 4: Implement `wm.ts` and `DesktopMode.astro`**: behavior per spec "A: desktop mode". Values: outer gaps from `hyprland.nix` (`12/22/22/22`) and `gapIn = 2 × gaps_in = 10`, scaled with `min(1, innerWidth / 1600)`; border 2px; window radius 12px. Pop-in: `scale(0.8)` + opacity, stagger 55 ms. Workspace slide 420 ms ease-out. Re-tile and fullscreen use `--dur` and `--ease-jelly`. Focus follows `mouseenter`; focused window gets DOM focus (`tabindex="-1"`). While on: `main` gets `inert`, `initScrollFocus` teardown runs; on leave it restarts. Closed windows come back on re-enter (rebuild from templates on each `enter`). Each window is `role="region"` with `aria-label` from `data-label`. Workspace links in the bar: on the scroll page they scroll as today; in desktop mode they call `go()`, and workspaces without windows get class `empty` (dimmed).
- [ ] **Step 5: Run desktop + all e2e, expect pass;** `pnpm astro check`.
- [ ] **Step 6: Commit** `feat(desktop): tiling desktop mode with workspaces and keybinds`

---

### Task 6: Terminal

**Files:**
- Create: `src/scripts/desktop/terminal.ts`
- Modify: `src/scripts/desktop/wm.ts` (Enter opens a terminal via `openWindow`), `src/components/desktop/DesktopMode.astro` (terminal styles)
- Test: `tests/e2e/terminal.spec.ts`

**Interfaces:**
- Consumes: `DesktopApi.openWindow`, `DesktopApi.go`, `DesktopApi.closeFocused`; data modules `about`, `contacts`, `projects`, `tools`, `pax`; Task 9's `latest(): Status | null` from `src/scripts/live/status.ts` (until Task 9 lands, `nowplaying`/`uptime`/`weather` print „nicht verfügbar“).
- Produces: `export function run(line: string, ctx: TerminalContext): TermOutput` with `interface TerminalContext { go(ws: number): void; close(): void; clear(): void; live(): Status | null }` and `type TermOutput = { text: string; tone?: 'err' | 'ok' }[]`. Output is rendered with `textContent` only.

- [ ] **Step 1: Write the failing tests** (enter desktop, press Enter, type into `.term input`)

```ts
test('help lists commands', …)            // contains 'whoami' and 'fastfetch'
test('cat kontakt prints contacts', …)    // contains 'SpotifyNutzeer' and 'paul.wtf'
test('unknown command', …)                // 'fish: Unknown command: foo'
test('sudo', …)                           // 'paul is not in the sudoers file. This incident will be reported.'
test('ws 3 switches workspace', …)        // .wm-layer[data-ws="3"] visible
test('exit closes the terminal', …)
test('html input stays text', …)          // type '<img src=x onerror=window.pwned=1>' → no img in .term, window.pwned undefined
test('Esc leaves the input, then Esc leaves desktop', …)
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** the command table from the spec. Prompt `paul@paul.wtf ~>`. `ls` prints `über-mich  kontakt  projekte  pax`. `cat` text is generated from the data modules.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(desktop): kitty terminal with a small fish shell`

---

### Task 7: API service with cache, status route and Last.fm

**Files:**
- Create: `api/pyproject.toml`, `api/uv.lock`, `api/.python-version`, `api/src/homepage_api/{__init__,main,settings,cache,models}.py`, `api/src/homepage_api/sources/{__init__,lastfm}.py`, `api/tests/{conftest,test_cache,test_lastfm,test_status}.py`
- Test: `api/tests/`

**Interfaces:**
- Produces:
  - `settings.py`: `class Settings(BaseSettings)` with `lastfm_api_key: str | None` (`LASTFM_API_KEY`), `lastfm_user: str = "SpotifyNutzeer"`, `prometheus_url`, `weather_lat`, `weather_lon` (Task 8 fills the last three's use).
  - `cache.py`: `class CachedSource[T]: __init__(self, fetch: Callable[[], Awaitable[T | None]], ttl: float, clock: Callable[[], float] = time.monotonic)`, `async def get(self) -> T | None`. Concurrent `get` calls share one in-flight fetch.
  - `models.py`: pydantic `Music`, `Server`, `Weather`, `Status` exactly matching the spec JSON (`Status.music: Music | None`, etc., `generated_at: datetime`).
  - `sources/lastfm.py`: `async def fetch_music(client: httpx.AsyncClient, settings: Settings, now: datetime) -> Music | None`.
  - `main.py`: `app` with `GET /api/status` (header `Cache-Control: public, max-age=15`) and `GET /api/healthz` → `{"ok": true}`. Sources are created at startup with one shared `httpx.AsyncClient(timeout=3.0)`.

- [ ] **Step 1: Write the failing tests**

```python
async def test_cache_serves_fresh_value_without_refetch(): ...      # 2 gets within ttl → fetch called once
async def test_cache_serves_stale_until_twice_ttl_then_none(): ...  # fetch fails at t=ttl+1 → old value; at t=2*ttl+1 → None
async def test_cache_single_flight(): ...                           # 5 concurrent gets → fetch called once
async def test_lastfm_now_playing(respx_mock): ...                  # @attr.nowplaying "true" → state "playing", played_at None
async def test_lastfm_recent_within_6h(respx_mock): ...             # date.uts 2h ago → state "recent", played_at set
async def test_lastfm_older_than_6h_is_none(respx_mock): ...
async def test_lastfm_missing_album_and_image(respx_mock): ...      # album "#text" "" and no image → album None, image None
async def test_lastfm_without_key_is_none(): ...
async def test_status_never_500_when_sources_fail(client, respx_mock): ...  # all upstreams 500 → 200, music null
async def test_status_cache_header(client): ...
```
Fixture JSON mirrors `user.getRecentTracks` with `limit=1`: when a track is playing Last.fm returns two entries (now playing first); `track` may also be a bare object (see `~/git/tidalwave/backend/src/tidalwave/lastfm/client.py:_parse_recent_tracks`). `image` is the `extralarge` entry's `#text`, `None` if empty. `url` from the track's `url`.

- [ ] **Step 2: Run** `cd api && uv run pytest -q` → failures.
- [ ] **Step 3: Implement** to the interfaces above; pyproject and ruff config copied from linkhop with the dependency set from Global Constraints.
- [ ] **Step 4: Run** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .` → all pass.
- [ ] **Step 5: Commit** `feat(api): status endpoint with cached last.fm source`

---

### Task 8: Prometheus and weather sources

**Files:**
- Create: `api/src/homepage_api/sources/{prometheus,weather}.py`, `api/tests/{test_prometheus,test_weather}.py`
- Modify: `api/src/homepage_api/main.py` (wire both into `/api/status`), `api/src/homepage_api/settings.py` (Bierwang coordinates as defaults)

**Interfaces:**
- Produces: `async def fetch_server(client, settings, now: datetime) -> Server | None` and `async def fetch_weather(client, settings) -> Weather | None`.

- [ ] **Step 1: Write the failing tests**

```python
async def test_server_values(respx_mock): ...            # four instant queries + one range query → load1, cpu_pct, mem_pct, uptime_s, 30-point cpu_history
async def test_server_queries_filter_on_job(respx_mock): ...  # every query string sent contains 'job="host-monitoring"'
async def test_server_empty_vector_is_none(respx_mock): ...   # {"status":"success","data":{"result":[]}} → None
async def test_server_error_is_none(respx_mock): ...
async def test_weather_current(respx_mock): ...          # temperature_2m, weather_code, is_day, wind_speed_10m → Weather
async def test_weather_error_is_none(respx_mock): ...
```
Queries exactly as in the spec "Sources" list; percentages rounded to one decimal; `cpu_history` from `/api/v1/query_range` over the last 30 min, `step=60`.

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement.** Look up Bierwang's coordinates once (OpenStreetMap / Wikipedia) and put them as defaults with the source in the commit message.
- [ ] **Step 4: Verify queries against the live Prometheus**: `kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 19090:9090` and run each query via `curl`; every query returns exactly one series (or 30 points for the range). If `kubectl` access is not available here, say so in the report and list the queries for Paul.
- [ ] **Step 5: Run tests and ruff, expect pass.**
- [ ] **Step 6: Commit** `feat(api): server load from prometheus and weather from open-meteo`

---

### Task 9: Live bar widgets

**Files:**
- Create: `src/scripts/live/status.ts`, `src/components/live/LiveWidgets.astro` (widgets + popouts + styles)
- Modify: `src/components/Nav.astro` (widgets between workspaces and clock; label-hiding breakpoint moves from 780px to 1180px), `src/scripts/desktop/terminal.ts` (use `latest()`)
- Test: `tests/e2e/live.spec.ts`

**Interfaces:**
- Produces: in `status.ts`: `export type Status` (mirrors the API JSON), `export function startPolling(): void`, `export function subscribe(cb: (s: Status | null) => void): () => void`, `export function latest(): Status | null`. Poll every 30 s while `document.visibilityState === 'visible'`, back off to 120 s after an error, never more than one request in flight. DOM: widgets `[data-live="music|server|weather"]`, popout `[data-live-popout]`.

- [ ] **Step 1: Write the failing tests** (mock with `page.route('**/api/status', …)`)

```ts
test('widgets render from status', …)                   // music text "Track · Artist", server "7.5%", weather "4°"
test('no widgets when the request fails', …)            // route.abort() → no [data-live] visible, no console errors
test('null field hides only that widget', …)            // server null → music and weather visible
test('popout opens on click and closes on Esc', …)      // music popout shows album art and a last.fm link
test('only one request in flight', …)                   // route delays 40s; fast-forward clock 90s; route hit count == 1
test('bar never overflows', …)                          // 300-char title; at 1180, 960, 780 px: nav.scrollWidth <= nav.clientWidth
test('breakpoints', …)                                  // 1100px: labels hidden; 900px: server+weather hidden; 700px: only music icon
test('terminal nowplaying uses live data', …)           // in desktop mode, `nowplaying` prints the mocked track
```
Use `page.clock.install()` for the polling tests.

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** per spec "Bar widgets". Weather glyphs: plain text glyphs mapped from WMO codes (clear, partly cloudy, cloudy, fog, drizzle, rain, snow, thunder). `recent` music shows „zuletzt · vor N min“. Sparkline: inline SVG polyline from `cpu_history`, stroke `--subtext0`.
- [ ] **Step 4: Run all e2e, expect pass;** `pnpm astro check`.
- [ ] **Step 5: Commit** `feat(bar): live music, server and weather widgets`

---

### Task 10: Packaging and manifests in the homepage repo

**Files:**
- Create: `api/Dockerfile`, `api/.dockerignore`, `k8s/api-deployment.yaml`, `k8s/api-service.yaml`
- Modify: `k8s/ingress.yaml` (second path `/api`, `Prefix`, → service `homepage-api` port `http`, listed before `/`), `k8s/kustomization.yaml`, `.dockerignore` (add `api`, `tests`), `.github/workflows/release.yml` (second build for `ghcr.io/paul-wtf/homepage-api` from `./api`, same tag), `.github/workflows/ci.yml` (job `api`: uv sync, pytest, ruff), `README.md` (API section: run locally, env vars)

**Interfaces:**
- Produces: Deployment `homepage-api` in namespace `homepage`, 1 replica, label `app.kubernetes.io/name: homepage-api`, image `ghcr.io/paul-wtf/homepage-api:<tag>`, port `http` 8080, probes on `/api/healthz`, env `LASTFM_API_KEY` from secret `homepage-api-credentials` key `LASTFM_API_KEY` with `optional: true`; security context as the site's Deployment but `runAsUser: 10001`; requests `cpu: 20m, memory: 64Mi`, limits `cpu: 200m, memory: 128Mi`.

- [ ] **Step 1: Dockerfile** following `~/git/linkhop/backend/Dockerfile` (uv build stage, slim runtime, non-root 10001, `uvicorn homepage_api.main:app --host 0.0.0.0 --port 8080 --proxy-headers`).
- [ ] **Step 2: Verify the image**: `podman build -t homepage-api:dev api && podman run --rm -p 18080:8080 homepage-api:dev` then `curl -s localhost:18080/api/status` returns 200 with `"music":null` (no key) and `curl localhost:18080/api/healthz` → `{"ok":true}`. If podman is unavailable on `dev`, say so; CI builds it.
- [ ] **Step 3: Verify manifests**: `nix … shell nixpkgs#kustomize -c kustomize build k8s` renders Deployment, Service and the two Ingress paths without error.
- [ ] **Step 4: Commit** `chore(deploy): package and deploy the status api`

---

### Task 11: FluxCD changes (separate repo `~/git/fluxcd`)

**Files:**
- Create: `apps/homepage/secrets.yaml`
- Modify: `apps/homepage/kustomization.yaml`

**Interfaces:**
- Consumes: secret name `homepage-api-credentials`, key `LASTFM_API_KEY` from Task 10.
- Produces: `ExternalSecret` `homepage-api-credentials` with `namespace: homepage`, `secretStoreRef: {name: vault-store, kind: ClusterSecretStore}`, mapping Vault property `lastfm_api_key` at path `homepage-api` (match how `apps/linkhop/secrets.yaml` names its `remoteRef.key`).

- [ ] **Step 1:** `git fetch && git switch -c feat/homepage-api origin/main` in `~/git/fluxcd`.
- [ ] **Step 2:** Write the ExternalSecret after the linkhop pattern; add it to `resources`.
- [ ] **Step 3: Verify** `kustomize build apps/homepage` renders it with `namespace: homepage`.
- [ ] **Step 4: Commit** `feat(homepage): external secret for the status api` (fluxcd is not a Cyperia repo; no card scope needed).
- [ ] **Step 5: Report** the exact Vault path and property Paul must create.

---

### Task 12: Pull requests and real-system verification

- [ ] **Step 1:** Push both branches (`git push -u origin <branch>`) and open one PR per repo. PR bodies in plain English, no tool attribution. Do not merge.
- [ ] **Step 2:** Hand Paul the checklist: create the Last.fm API key and store it in Vault at the reported path; after the release tag, make the GHCR package `homepage-api` public; merge order fluxcd PR (secret) → homepage PR → tag `v0.2.0` → bump the image tags in `k8s/`.
- [ ] **Step 3 (after Paul deploys):** verify on the real system: `curl -s https://paul.wtf/api/status | jq` shows non-null `server` and `weather` (and `music` while something plays); `kubectl -n homepage get pods` all Ready; open https://paul.wtf in a browser, widgets show, `D` enters desktop mode. Report what was checked and what Paul still needs to check by eye.
