export interface Music {
  state: 'playing' | 'recent';
  track: string;
  artist: string;
  album: string | null;
  image: string | null;
  url: string | null;
  played_at: string | null;
}

export interface Server {
  load1: number;
  cpu_pct: number;
  mem_pct: number;
  uptime_s: number;
  cpu_history: number[];
}

export interface Weather {
  temp_c: number;
  code: number;
  is_day: boolean;
  wind_kmh: number;
}

export type ProjectState = 'up' | 'down';

export interface WeekArtist {
  name: string;
  count: number;
  image: string | null;
}

export interface WeekTrack {
  track: string;
  artist: string;
  count: number;
}

export interface Week {
  listens: number;
  seconds: number;
  artists: WeekArtist[];
  tracks: WeekTrack[];
  grid: number[][];
  url: string;
}

export interface ClusterNode {
  name: string;
  ready: boolean | null;
  uptime_s: number | null;
  storage_used: number | null;
  storage_total: number | null;
}

export interface Cluster {
  nodes_total: number | null;
  nodes_ready: number | null;
  pods: number | null;
  workloads: number | null;
  services: number | null;
  kubernetes: { version: string; distribution: string | null } | null;
  nodes: ClusterNode[];
  storage_used: number | null;
  storage_total: number | null;
  cpu_temp_c: number | null;
  nvme_temp_c: number | null;
}

export interface Status {
  music: Music | null;
  server: Server | null;
  weather: Weather | null;
  projects: Record<string, ProjectState> | null;
  week: Week | null;
  cluster: Cluster | null;
  generated_at: string;
}

type Listener = (s: Status | null) => void;

const ENDPOINT = '/api/status';
const INTERVAL = 30_000;
const BACKOFF = 120_000;
const TIMEOUT = 10_000;
const STALE = 300_000;

let current: Status | null = null;
let started = false;
let inFlight = false;
let failed = false;
let lastPoll = 0;
let lastSuccess = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strOrNull = (v: unknown): string | null => (isStr(v) && v ? v : null);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const httpsOrNull = (v: unknown): string | null => (isStr(v) && v.startsWith('https://') ? v : null);

function music(v: unknown): Music | null {
  if (!isObj(v) || (v.state !== 'playing' && v.state !== 'recent')) return null;
  if (!isStr(v.track) || !isStr(v.artist)) return null;
  return {
    state: v.state,
    track: v.track,
    artist: v.artist,
    album: strOrNull(v.album),
    image: httpsOrNull(v.image),
    url: httpsOrNull(v.url),
    played_at: strOrNull(v.played_at),
  };
}

function server(v: unknown): Server | null {
  if (!isObj(v) || !isNum(v.load1) || !isNum(v.cpu_pct) || !isNum(v.mem_pct) || !isNum(v.uptime_s)) {
    return null;
  }
  const history = Array.isArray(v.cpu_history) ? v.cpu_history.filter(isNum) : [];
  return { load1: v.load1, cpu_pct: v.cpu_pct, mem_pct: v.mem_pct, uptime_s: v.uptime_s, cpu_history: history };
}

function weather(v: unknown): Weather | null {
  if (!isObj(v) || !isNum(v.temp_c) || !isNum(v.code) || !isNum(v.wind_kmh)) return null;
  return { temp_c: v.temp_c, code: v.code, is_day: v.is_day !== false, wind_kmh: v.wind_kmh };
}

function projects(v: unknown): Record<string, ProjectState> | null {
  if (!isObj(v)) return null;
  const known = Object.entries(v).filter((e): e is [string, ProjectState] => e[1] === 'up' || e[1] === 'down');
  return known.length ? Object.fromEntries(known) : null;
}

function weekArtist(v: unknown): WeekArtist | null {
  if (!isObj(v) || !isStr(v.name) || !isNum(v.count)) return null;
  return { name: v.name, count: v.count, image: httpsOrNull(v.image) };
}

function weekTrack(v: unknown): WeekTrack | null {
  if (!isObj(v) || !isStr(v.track) || !isStr(v.artist) || !isNum(v.count)) return null;
  return { track: v.track, artist: v.artist, count: v.count };
}

function week(v: unknown): Week | null {
  if (!isObj(v) || !isNum(v.listens) || !isNum(v.seconds)) return null;
  const url = httpsOrNull(v.url);
  const grid = v.grid;
  if (!url || !Array.isArray(grid) || grid.length !== 7) return null;
  if (!grid.every((row) => Array.isArray(row) && row.length === 24 && row.every(isNum))) return null;
  const list = <T>(items: unknown, one: (x: unknown) => T | null): T[] =>
    Array.isArray(items) ? items.map(one).filter((x): x is T => x !== null) : [];
  return {
    listens: v.listens,
    seconds: v.seconds,
    artists: list(v.artists, weekArtist),
    tracks: list(v.tracks, weekTrack),
    grid: grid as number[][],
    url,
  };
}

function clusterNode(v: unknown): ClusterNode | null {
  if (!isObj(v) || !isStr(v.name) || !v.name) return null;
  return {
    name: v.name,
    ready: typeof v.ready === 'boolean' ? v.ready : null,
    uptime_s: numOrNull(v.uptime_s),
    storage_used: numOrNull(v.storage_used),
    storage_total: numOrNull(v.storage_total),
  };
}

function cluster(v: unknown): Cluster | null {
  if (!isObj(v)) return null;
  const k = v.kubernetes;
  const c: Cluster = {
    nodes_total: numOrNull(v.nodes_total),
    nodes_ready: numOrNull(v.nodes_ready),
    pods: numOrNull(v.pods),
    workloads: numOrNull(v.workloads),
    services: numOrNull(v.services),
    kubernetes: isObj(k) && isStr(k.version) && k.version ? { version: k.version, distribution: strOrNull(k.distribution) } : null,
    nodes: Array.isArray(v.nodes) ? v.nodes.map(clusterNode).filter((n): n is ClusterNode => n !== null) : [],
    storage_used: numOrNull(v.storage_used),
    storage_total: numOrNull(v.storage_total),
    cpu_temp_c: numOrNull(v.cpu_temp_c),
    nvme_temp_c: numOrNull(v.nvme_temp_c),
  };
  const known = Object.values(c).some((x) => (Array.isArray(x) ? x.length > 0 : x !== null));
  return known ? c : null;
}

function parse(v: unknown): Status {
  if (!isObj(v)) throw new TypeError('status is not an object');
  return {
    music: music(v.music),
    server: server(v.server),
    weather: weather(v.weather),
    projects: projects(v.projects),
    week: week(v.week),
    cluster: cluster(v.cluster),
    generated_at: isStr(v.generated_at) ? v.generated_at : '',
  };
}

function emit(): void {
  for (const cb of listeners) cb(current);
}

function schedule(delay: number): void {
  clearTimeout(timer);
  timer = document.visibilityState === 'visible' ? setTimeout(poll, delay) : undefined;
}

async function poll(): Promise<void> {
  if (inFlight) return;
  clearTimeout(timer);
  inFlight = true;
  lastPoll = Date.now();
  const ctrl = new AbortController();
  const abort = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    current = parse(await res.json());
    failed = false;
    lastSuccess = Date.now();
    emit();
  } catch (e) {
    failed = true;
    console.debug('live status unavailable', e);
    if (current && Date.now() - lastSuccess > STALE) {
      current = null;
      emit();
    }
  } finally {
    clearTimeout(abort);
    inFlight = false;
    schedule(failed ? BACKOFF : INTERVAL);
  }
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible') {
    clearTimeout(timer);
    timer = undefined;
    return;
  }
  if (inFlight) return;
  const wait = failed ? BACKOFF : INTERVAL;
  const elapsed = Date.now() - lastPoll;
  if (elapsed >= wait) void poll();
  else schedule(wait - elapsed);
}

export function startPolling(): void {
  if (started) return;
  started = true;
  document.addEventListener('visibilitychange', onVisibility);
  if (document.visibilityState === 'visible') void poll();
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function latest(): Status | null {
  return current;
}
