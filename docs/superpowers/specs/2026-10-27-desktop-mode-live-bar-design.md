# Desktop mode and live bar

**Status:** draft, waiting for approval
**Date:** 2026-10-27
**Prototype:** private artifact "paul.wtf Desktop-Modus" (round 2 of the design review)

## Why

The homepage already looks like Paul's Hyprland desktop: Catppuccin surfaces,
the zen frame, the bar with numbered workspaces, a teal border on the focused
window. It reads well, but nothing on it makes a visitor stop. Paul wants one
thing most personal sites do not have.

Two features do that and both grow out of the existing design:

- **A, desktop mode.** A button in the bar turns the scroll page into a working
  tiling desktop. Sections become windows in a dwindle layout, number keys
  switch workspaces, focus follows the mouse, and Enter opens a small terminal.
  Sites that imitate an operating system are usually Windows 95 or macOS with
  floating windows. A tiling window manager is rare, and this one is visibly
  Paul's own setup.
- **B, live bar.** The bar shows what Paul is listening to right now, the load
  of his server and the weather in Bierwang, like the widgets in his Quickshell
  bar.

A third idea, Pax as a pixel pet walking along the bar, is postponed until
sprites exist.

## Goals

- Desktop mode works with mouse and keyboard on desktop-sized screens and feels
  like Hyprland: tiling, gaps, focus border, workspace slide, pop-in.
- The live bar updates while the page is open and never breaks the page when its
  data is missing.
- The scroll page stays the default and stays complete. Search engines, screen
  readers, phones and visitors without JavaScript get what they get today.

## Non-goals

- Desktop mode on phones or touch-only devices.
- Dragging, floating or resizing windows by hand.
- Saving a window arrangement across reloads. Only the last mode (scroll or
  desktop) is remembered.
- A real shell. The terminal knows a fixed set of commands.
- Changes to tidalwave.
- Pax (idea C).

## Anti-goals

These would count as failure even if the features work:

- Content that exists only in desktop mode, or only on the scroll page.
- Key handling that interferes with someone reading the normal page. On the
  scroll page the only shortcut is `D`.
- The API exposing hostnames, IPs, node names or anything beyond the few
  numbers listed below.
- The homepage failing, slowing down or showing errors because the API or one
  of its sources is down.
- A frontend framework or new runtime dependency in the Astro site.

## Scroll page refinements

Round 1 of the design review found that every surface on the scroll page
carries the same weight and that teal appears in too many places to stand
out. Paul chose all five fixes from that round. They are part of this work and
are shown in the private artifact "paul.wtf Feinschliff":

- **Hero.** The name is set on two lines at roughly twice today's size
  (`clamp` up to about 6.6rem, tighter letter spacing). The prompt line becomes
  `paul@paul.wtf:~$ whoami` with a blinking teal block cursor (static under
  reduced motion). The moon in the wallpaper SVG gets brighter.
- **Focus follows scroll.** On the scroll page, the window nearest a probe
  line at about 40% of the viewport height gets the teal focus border with the
  jelly transition; at the top of the page it is the portrait. The portrait
  loses its permanent border. Hover borders on links stay as they are.
- **Workspace numbers in section titles.** The `──` before each section title
  becomes a small chip with the section's workspace number from the bar. The
  chip of the current section (same scrollspy as the bar) is teal on crust,
  the others surface0.
- **Less teal.** Prompt, category labels, tool keys, the fastfetch host line
  and the title strokes turn grey (overlay or subtext tones). Teal stays for
  the surname, buttons, the active workspace, the focus border, the cursor,
  icons and the music note in the bar.
- **Fastfetch logo.** The tools window shows the NixOS ASCII logo next to the
  key/value list, as fastfetch prints it, and stacks below a narrow width.

The desktop-mode windows use the same styles, so these changes carry over.

## A: desktop mode

### Entry and exit

- A toggle `⊞ desktop` sits in the bar to the left of the clock. It is rendered
  hidden and shown by script only when the viewport is at least 900px wide and
  `(pointer: fine)` matches. Without JavaScript it never appears.
- `D` toggles desktop mode from both views. `Esc` leaves it.
- Entering: the scroll page fades and scales down slightly, then the windows of
  the active workspace pop in one after another. Leaving reverses this.
- The mode is stored in `localStorage` (wrapped in try/catch). A visitor who
  left the site in desktop mode gets desktop mode on the next visit, provided
  the screen still qualifies.
- The first time a browser enters desktop mode, a keybinds window opens on the
  current workspace. `?` opens it again.
- If the viewport shrinks below 900px while in desktop mode, the page returns to
  the scroll view.

### Workspaces and windows

The six workspaces match the six nav entries. The bar's workspace buttons
switch workspaces in desktop mode and scroll to the section on the scroll page,
as they do now. Empty workspaces are shown dimmed in the bar, the active one in
teal.

| # | Workspace | Windows |
|---|---|---|
| 1 | über mich | about text (starting with name and tagline from the hero), portrait |
| 2 | projekte | one window per featured project (with preview), one window listing the other projects |
| 3 | tools | fastfetch with the NixOS ASCII logo |
| 4 | hardware | workstation, laptop, server |
| 5 | sidefacts | Pax, BMW, cats |
| 6 | kontakt | GitHub, Discord, YouTube, email (one small window each) |

Each window starts with a short path line (`~/projekte/linkhop`) in a muted
color. There are no title bars, as on Paul's desktop.

Window content comes from the same data files and components as the scroll
page. The about and contact texts, which are written into their components
today, move into `src/data/` so the terminal can read them too (designer's
call). Astro renders the content at build time into `<template>` elements, one
per window, and the script instantiates them. The script does not move or clone
the live scroll-page DOM. Discord copy-to-clipboard and the email reveal must
work inside windows, so their handlers use event delegation or are reused.

### Layout

- Dwindle: each new window splits the remaining area along its longer side,
  50/50. The first window gets the first half.
- Gaps, border width and rounding follow Paul's real Hyprland config in
  `~/git/nixos/home/program-configs/linux/hyprland.nix` (`gaps_in = 5`,
  `gaps_out` 12/22/22/22, `border_size = 2`, `rounding = 12`), scaled down
  where the browser viewport makes them look too large. The builder decides the
  final values and states them in the commit message.
- Only the focused window has the teal border. Inactive windows have none, as
  in the zen theme.
- Window content scrolls inside the window when it does not fit.

### Keys and mouse

Active only in desktop mode, ignored when Ctrl, Alt or Meta is held or an
input has focus. Shift is allowed, since `?` needs it:

| Key | Action |
|---|---|
| `1` to `6` | switch workspace (slide left or right by direction) |
| `h j k l`, arrows | move focus to the nearest window in that direction |
| `Enter` | open a terminal window on the current workspace |
| `Q` | close the focused window; the rest re-tile with the jelly curve |
| `F` | toggle fullscreen for the focused window |
| `?` | open the keybinds window |
| `Esc`, `D` | back to the scroll page |

Focus follows the mouse (`follow_mouse = 1`). Clicking a window focuses it. The
focused window also receives DOM focus (`tabindex="-1"`) so screen readers and
keyboard users land in it.

Closed windows come back when the page reloads or when the visitor leaves and
re-enters desktop mode.

### Motion

- Pop-in: scale from 0.8 and fade, staggered per window.
- Re-tiling and fullscreen: position and size animate with the existing
  `--ease-jelly` curve.
- Workspace switch: horizontal slide with an ease-out curve.
- Animation curves and durations come from the existing tokens (`--dur`,
  `--ease-jelly`). If Paul's Hyprland or Quickshell config defines animation
  curves the tokens do not cover yet, the builder may add them as tokens.
- `prefers-reduced-motion: reduce` turns all of it off. Windows appear in
  place.

### Terminal

A kitty-style window with a fish-style prompt `paul@paul.wtf ~>`. Output is
always escaped text and nothing is evaluated.

| Command | Output |
|---|---|
| `help` | the list of commands |
| `whoami` | name and tagline |
| `ls` | the files below |
| `cat <file>` | `über-mich`, `kontakt`, `projekte`, `pax`, generated from the data files |
| `fastfetch`, `neofetch` | logo and the tools data |
| `ws <1-6>` | switch workspace |
| `nowplaying`, `uptime`, `weather` | the live data from B, or a short "nicht verfügbar" |
| `clear`, `exit` | clear the output, close the window |
| `sudo …` | `paul is not in the sudoers file. This incident will be reported.` |
| anything else | `fish: Unknown command: <cmd>` |

Terminal text is German like the rest of the site, except for the quoted
messages of real tools.

### Accessibility

- The toggle has an accessible name and `aria-pressed`.
- In desktop mode the scroll page is `inert`, and each window is a region with
  an `aria-label` taken from its path line.
- `Esc` always leads back. Focus returns to the toggle.

## B: live bar

### Service

A small service in the homepage repo under `api/`, built as its own image and
deployed next to the static site. FastAPI with httpx, following the
conventions of linkhop and tidalwave (layout, settings, tests, Dockerfile). The
builder reads those repos first.

`GET /api/status` returns:

```json
{
  "music": {
    "state": "playing",
    "track": "…",
    "artist": "…",
    "album": "…",
    "image": "https://…",
    "url": "https://www.last.fm/music/…",
    "played_at": null
  },
  "server": {
    "load1": 0.42,
    "cpu_pct": 7.5,
    "mem_pct": 38.1,
    "uptime_s": 1234567,
    "cpu_history": [6.1, 7.0, 7.5]
  },
  "weather": {
    "temp_c": 4.2,
    "code": 3,
    "is_day": true,
    "wind_kmh": 11.0
  },
  "generated_at": "2026-10-27T09:00:00Z"
}
```

- `music.state` is `playing` or `recent`. For `recent`, `played_at` is set.
  When the last scrobble is older than 6 hours, `music` is `null`.
- Any field whose source fails is `null`. The endpoint answers 200 as long as
  the process runs.
- Each source has its own in-memory cache: music 20 s, server 15 s, weather
  10 min. Upstream timeout 3 s. A failed fetch keeps serving the last good
  value until twice its cache time, then returns `null`.
- Response header `Cache-Control: public, max-age=15`. No CORS headers, since
  the site calls it on the same origin.
- `GET /api/healthz` for the probes.

### Sources

- **Music:** Last.fm `user.getRecentTracks`, user `SpotifyNutzeer`,
  `limit=1`. A track with `@attr.nowplaying == "true"` is `playing`. The API
  key is Paul's own new key (not tidalwave's), read from `LASTFM_API_KEY`.
- **Server:** the in-cluster Prometheus at
  `http://monitoring-kube-prometheus-prometheus.monitoring:9090`, using the
  host node_exporter that is already scraped as `job="host-monitoring"`. Its
  only target, `10.1.90.1:9100`, is the Proxmox host, which is the server shown
  in the hardware section. Every query filters on that job, or the cluster
  nodes' exporters get averaged in:
  - `node_load1{job="host-monitoring"}`
  - CPU: `1 - avg(rate(node_cpu_seconds_total{job="host-monitoring",mode="idle"}[1m]))`
  - memory: `1 - node_memory_MemAvailable_bytes{job="host-monitoring"} / node_memory_MemTotal_bytes{job="host-monitoring"}`
  - uptime: `time() - node_boot_time_seconds{job="host-monitoring"}`
  - `cpu_history`: the CPU expression over the last 30 minutes, 30 points
  
  The builder checks each query against the live Prometheus before relying
  on it.
- **Weather:** Open-Meteo `current` for Bierwang (temperature, weather code,
  is_day, wind). No key. The builder looks up the coordinates and keeps them
  in settings.

### Bar widgets

- Three widgets sit between the workspaces and the clock: `♪ track · artist`
  (truncated), CPU percentage, temperature with a weather glyph. Colors follow
  the existing discipline: text in subtext, the music note in teal.
- A widget whose data is `null` is not shown. Before the first response
  nothing is shown, so there is no placeholder flicker.
- The page polls every 30 s while the tab is visible (Page Visibility API) and
  backs off to 2 min after errors.
- Clicking a widget opens a popout under the bar in the style of the Quickshell
  panels: album art and a Last.fm link for music; load, CPU sparkline from
  `cpu_history`, memory and uptime for the server; conditions and wind for
  the weather. `Esc` or a click outside closes it.
- The bar must not overflow (designer's call on the order). Below 1180px the
  workspace labels hide and only the numbers stay. Below 960px the CPU and
  weather widgets hide. Below 780px only the music widget stays, as an icon
  that opens its popout.
- The widgets work the same in desktop mode, since it is the same bar.

## Deployment

In the homepage repo:

- `k8s/`: a second Deployment and Service for the API (1 replica, same
  security context as the site, small requests), and a second path `/api`
  (Prefix) on the existing Ingress pointing to it.
- `.github/workflows/release.yml` builds and pushes the API image on the same
  `v*` tag. The new image is named `ghcr.io/paul-wtf/homepage-api` from the
  start.
- CI runs the API tests next to `astro check`.

In `~/git/fluxcd`, `apps/homepage/`:

- An `ExternalSecret` from the `vault-store` ClusterSecretStore that provides
  `LASTFM_API_KEY`, following `apps/linkhop/secrets.yaml`. The homepage Flux
  Kustomization sets no namespace, so the resource carries
  `namespace: homepage` itself, like `apps/homepage/networkpolicy.yaml`. Paul
  creates the Last.fm key and stores it in Vault. The builder tells him the
  exact path.
- The Deployment references that secret with `optional: true`. A missing Vault
  entry then only leaves `music` empty and cannot block the homepage
  reconcile, which runs with `wait: true`.
- Network: `monitoring` has no NetworkPolicy today and `homepage` only
  restricts ingress, so the API should reach Prometheus, Last.fm and
  Open-Meteo without changes. The builder verifies this from inside the
  running pod and adds a policy only if something is blocked.
- A new GHCR package starts private, and the cluster pulls anonymously. Paul
  makes `ghcr.io/paul-wtf/homepage-api` public after the first release push,
  before the manifest that uses it is merged. Otherwise the pod ends in
  ImagePullBackOff.

## Testing and verification

- API: pytest with mocked upstreams for every source, including timeouts,
  error responses, a stale cache and the 6-hour cutoff for `recent`.
- Frontend: `astro check` and `pnpm build`. A Playwright test against
  `pnpm preview` covers entering desktop mode, switching workspaces, closing a
  window, opening the terminal with one command, and leaving with `Esc`. A
  second test checks that the bar renders without widgets when `/api/status`
  fails.
- Verification on the real system after deployment: `curl
  https://paul.wtf/api/status` returns all three fields, the widgets show in a
  browser, and desktop mode works on paul.wtf. Where the builder cannot do this
  themselves, they say exactly what Paul needs to check.

## The prototype

The artifact from the design review already contains working dwindle, focus,
workspace and terminal code and may be used as a starting point. Where it
differs from this document (an extra hero button, different windows on
workspace 2, a shorter command list), this document wins.

## Left to the builder

- Module layout of the script (one file or several), as long as it stays
  vanilla TypeScript in Astro `<script>` blocks.
- Exact gap values, durations and stagger timing within the rules above.
- How the API is structured internally, following linkhop and tidalwave.
- The weather glyph set (text glyphs, no icon font).

## Out of scope, noticed on the way

- The release workflow still pushes `ghcr.io/spotifynutzeer/homepage` and the
  k8s manifest still names it. Flux patches the name in `apps/homepage/sync.yaml`.
  The comment there says the fix belongs in this repo. It is a separate change.
