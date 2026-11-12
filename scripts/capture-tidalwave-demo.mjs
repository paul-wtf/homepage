// Regenerates src/assets/tidalwave-preview.webp — the dashboard shot used by the
// featured tidalwave card.
//
// tidalwave's public page (tidalwave.paul.wtf) is a "Connect with Last.fm" gate,
// so a live capture would only show the login. Instead we run the tidalwave
// frontend locally and mock its stats API (exactly how the app is exercised
// "without a backend"), which renders a fully populated dashboard with the
// representative sample data below.
//
// Prerequisites:
//   1. tidalwave frontend checked out and its dev server running, e.g.:
//        cd ../tidalwave/frontend && pnpm install && pnpm dev --port 4319
//   2. A Chromium-family browser for Playwright. On NixOS the bundled Chromium
//      won't run — point BROWSER_BIN at one, e.g. `BROWSER_BIN=$(which brave)`.
//
//   TW_URL=http://localhost:4319 BROWSER_BIN=$(which brave) \
//     node scripts/capture-tidalwave-demo.mjs
//
// The sample data mirrors tidalwave's stats API shape; if that API changes,
// update the fixtures here.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writePreview } from './lib/write-preview.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '..', 'src', 'assets', 'tidalwave-preview.webp');

const URL = process.env.TW_URL || 'http://localhost:4319';
const BRAVE = process.env.BROWSER_BIN;

const json = (body) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

// ---- representative sample data (synthwave taste, matches backend fixtures) ----
const summary = {
  total_listens: 1237,
  distinct_artists: 214,
  distinct_tracks: 689,
  distinct_albums: 176,
  total_seconds: 273600, // -> "3d 4h"
  previous: {
    total_listens: 1102,
    distinct_artists: 198,
    distinct_tracks: 640,
    distinct_albums: 181,
    total_seconds: 251300
  }
};

const topArtists = [
  { artist: 'The Midnight', count: 96 },
  { artist: 'Kavinsky', count: 84 },
  { artist: 'Daft Punk', count: 79 },
  { artist: 'GUNSHIP', count: 63 },
  { artist: 'FM-84', count: 58 }
];

const topTracks = [
  { track: 'Nightcall', artist: 'Kavinsky', count: 41 },
  { track: 'Sunset', artist: 'The Midnight', count: 37 },
  { track: 'Dark All Day', artist: 'GUNSHIP', count: 33 },
  { track: 'Digital Love', artist: 'Daft Punk', count: 29 },
  { track: 'Running in the Night', artist: 'FM-84', count: 27 }
];

const topAlbums = [
  { album: 'Endless Summer', artist: 'The Midnight', count: 74 },
  { album: 'OutRun', artist: 'Kavinsky', count: 61 },
  { album: 'Discovery', artist: 'Daft Punk', count: 58 },
  { album: 'Dark All Day', artist: 'GUNSHIP', count: 49 },
  { album: 'Atlas', artist: 'FM-84', count: 44 }
];

// hourly listening curve (0..23), evening peak
const clock = [4, 2, 1, 0, 0, 0, 1, 3, 8, 14, 19, 22, 18, 16, 15, 17, 24, 31, 45, 58, 66, 52, 38, 21];
// weekday Mon..Sun, weekend-leaning
const weekday = [142, 128, 155, 149, 210, 188, 165];

// ~30 daily metric points
const DAY = 86_400_000;
// A fixed clock keeps the shot identical from run to run, so the refresh
// workflow only sees a change when tidalwave itself changed.
const NOW = new Date('2026-06-12T19:42:00Z');
const now = NOW.getTime();
const metrics = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(now - (29 - i) * DAY);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const weekendBoost = dow === 5 || dow === 6 || dow === 0 ? 1.5 : 1;
  const base = 22 + ((i * 7 + dow * 5) % 26);
  const listens = Math.round(base * weekendBoost);
  return {
    period: d.toISOString().slice(0, 10),
    listens,
    artists: Math.max(6, Math.round(listens * 0.45)),
    albums: Math.max(5, Math.round(listens * 0.35)),
    seconds: listens * 218
  };
});

const recentSongs = [
  ['Nightcall', 'Kavinsky', 'OutRun'],
  ['Sunset', 'The Midnight', 'Endless Summer'],
  ['Aerodynamic', 'Daft Punk', 'Discovery'],
  ['Dark All Day', 'GUNSHIP', 'Dark All Day'],
  ['Running in the Night', 'FM-84', 'Atlas'],
  ['She Move Like a Knife', 'Perturbator', 'The Uncanny Valley'],
  ['Propagation', 'Com Truise', 'Galactic Melt'],
  ['Turbo Killer', 'Carpenter Brut', 'Trilogy'],
  ['Vampires', 'The Midnight', 'Nocturnal'],
  ['Digital Love', 'Daft Punk', 'Discovery'],
  ['ProtoVision', 'Kavinsky', 'OutRun'],
  ['Tech Noir', 'GUNSHIP', 'GUNSHIP']
];
const recent = recentSongs.map(([track, artist, album], i) => ({
  track,
  artist,
  album,
  played_at: new Date(now - (i * 5 + 5) * 60_000).toISOString()
}));

let browser;
try {
  browser = await chromium.launch({ executablePath: BRAVE });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);

  // Mock the stats API so the frontend renders without a backend.
  const missing = { status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' };
  await page.route('**/stats/**', (r) => r.fulfill(missing));
  await page.route('**/shares*', (r) => r.fulfill(json([])));
  await page.route('**/auth/me', (r) =>
    r.fulfill(
      json({
        username: 'paul',
        is_admin: true,
        timezone: 'Europe/Berlin',
        disconnected: false,
        last_synced_at: NOW.toISOString(),
        last_played_at: recent[0].played_at
      })
    )
  );
  await page.route('**/stats/summary*', (r) => r.fulfill(json(summary)));
  await page.route('**/stats/metrics-over-time*', (r) => r.fulfill(json(metrics)));
  await page.route('**/stats/top-artists*', (r) => r.fulfill(json(topArtists)));
  await page.route('**/stats/top-tracks*', (r) => r.fulfill(json(topTracks)));
  await page.route('**/stats/top-albums*', (r) => r.fulfill(json(topAlbums)));
  await page.route('**/stats/clock*', (r) => r.fulfill(json(clock)));
  await page.route('**/stats/weekday*', (r) => r.fulfill(json(weekday)));
  await page.route('**/stats/recent*', (r) => r.fulfill(json(recent)));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.innerText.includes('The Midnight'),
    { timeout: 20_000 }
  );
  await page.waitForTimeout(1600); // let charts settle

  const png = await page.screenshot({ type: 'png', fullPage: false });
  console.log((await writePreview(png, out)) ? 'Wrote' : 'Unchanged', out);
} finally {
  await browser?.close();
}
