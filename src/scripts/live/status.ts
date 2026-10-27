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

export interface Status {
  music: Music | null;
  server: Server | null;
  weather: Weather | null;
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

function parse(v: unknown): Status {
  if (!isObj(v)) throw new TypeError('status is not an object');
  return {
    music: music(v.music),
    server: server(v.server),
    weather: weather(v.weather),
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
