import { about } from '../../data/about';
import { contacts, emailParts } from '../../data/contact';
import { projects } from '../../data/projects';
import { cats, pax } from '../../data/sidefacts';
import { nixLogo, tools } from '../../data/tools';
import type { Status } from '../live/status';

export type TermOutput = { text: string; tone?: 'err' | 'ok' }[];

export interface TerminalContext {
  go(ws: number): void;
  close(): void;
  clear(): void;
  live(): Status | null;
  open(url: string): void;
  photo(cat: string): void;
}

const HOST = 'paul@paul.wtf';
const PROMPT = `${HOST} ~>`;
const WORKSPACES = 6;
const FILES = ['über-mich', 'kontakt', 'projekte', 'pax', 'pubkey'];
const SITE = 'https://paul.wtf';
const CAT_DIR = 'katzen';
const CAT_NAMES = cats.map((c) => c.name.toLowerCase());
const UNAVAILABLE = 'nicht verfügbar';
const LINKHOP = 'https://linkhop.paul.wtf/api/v1/convert';
const LINKHOP_TIMEOUT = 10_000;
const SERVICES: Record<string, string> = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  tidal: 'Tidal',
  youtube_music: 'YouTube Music',
  apple_music: 'Apple Music',
};
const BAR_WIDTH = 24;
const SPARK = '▁▂▃▄▅▆▇█';

const lines = (...texts: string[]): TermOutput => texts.map((text) => ({ text }));
const err = (text: string): TermOutput => [{ text, tone: 'err' }];

const COMMANDS: [string, string][] = [
  ['help', 'diese Liste'],
  ['whoami', 'wer hier sitzt'],
  ['ls', 'Dateien anzeigen'],
  ['cat <datei>', 'Datei ausgeben'],
  ['fastfetch', 'System-Überblick (auch neofetch)'],
  ['open <projekt>', 'Projekt in neuem Tab öffnen'],
  ['man paul', 'Handbuch'],
  ['ws <1-6>', 'Workspace wechseln'],
  ['nowplaying', 'was gerade läuft'],
  ['uptime', 'Laufzeit des Servers'],
  ['htop', 'Auslastung des Servers'],
  ['weather', 'Wetter in Bierwang'],
  ['linkhop <url>', 'Musik-Link für andere Dienste umwandeln'],
  ['clear', 'Ausgabe leeren'],
  ['exit', 'Fenster schließen']
];

const COMMAND_NAMES = [...COMMANDS.map(([c]) => c.split(' ')[0]), 'neofetch'];
const ARGUMENTS: Record<string, () => string[]> = {
  cat: () => [...FILES, ...CAT_NAMES, ...CAT_NAMES.map((n) => `${CAT_DIR}/${n}`)],
  ls: () => [`${CAT_DIR}/`],
  open: () => projects.map((p) => p.name),
  man: () => ['paul'],
};

function email(): string {
  return `${emailParts.user}@${emailParts.domain}`;
}

function ls(dir: string | undefined): TermOutput {
  const name = dir?.replace(/^(\.\/|~\/)/, '').replace(/\/$/, '');
  if (!name) return lines([...FILES, `${CAT_DIR}/`].join('  '));
  if (name === CAT_DIR) return lines(CAT_NAMES.join('  '));
  if (FILES.includes(name)) return lines(name);
  return err(`ls: cannot access '${dir}': No such file or directory`);
}

function cat(file: string | undefined, ctx: TerminalContext): TermOutput {
  if (!file) return err('cat: Datei fehlt');
  const name = file.replace(/^(\.\/|~\/)/, '').replace(/\/$/, '');
  if (name === CAT_DIR) return err(`cat: ${file}: Is a directory`);
  const pet = name.toLowerCase().replace(`${CAT_DIR}/`, '');
  const found = cats.find((c) => c.name.toLowerCase() === pet);
  if (found) {
    ctx.photo(pet);
    return lines(`${found.name}: ${found.personality}`);
  }
  switch (name) {
    case 'über-mich':
      return [
        ...lines(about.name, about.tagline, ''),
        ...about.paragraphs.flatMap((p) => lines(p, ''))
      ].slice(0, -1);
    case 'kontakt': {
      const width = Math.max(...contacts.map((c) => c.label.length));
      return lines(
        ...contacts.map((c) => {
          const value = c.kind === 'email' ? email() : c.value;
          return `${c.label.padEnd(width)}  ${value}${c.href ? `  ${new URL(c.href, SITE).href}` : ''}`;
        })
      );
    }
    case 'projekte':
      return projects.flatMap((p, i) => [
        ...(i ? lines('') : []),
        ...lines(
          p.name,
          p.description,
          `Stack: ${p.stack.join(', ')}`,
          p.repoUrl,
          ...(p.liveUrl ? [p.liveUrl] : [])
        )
      ]);
    case 'pax':
      return lines(
        `${pax.species}, ${pax.pronouns}, ${pax.age}`,
        pax.description,
        '',
        `Mag: ${pax.likes.join('; ')}`,
        `Mag nicht: ${pax.dislikes.join('; ')}`
      );
    case 'pubkey': {
      const key = contacts.find((c) => c.kind === 'gpg');
      if (!key?.href) return err('cat: pubkey: No such file or directory');
      return lines(`Fingerprint  ${key.value}`, `Schlüssel    ${new URL(key.href, SITE).href}`);
    }
    default:
      return err(`cat: ${file}: No such file or directory`);
  }
}

function fastfetch(): TermOutput {
  const info = [
    HOST,
    '─'.repeat(HOST.length),
    ...tools.map((t) => `${t.label.padEnd(9)} ${t.value}`)
  ];
  const width = Math.max(...nixLogo.map((l) => l.length)) + 3;
  const rows = Math.max(info.length, nixLogo.length);
  return lines(
    ...Array.from({ length: rows }, (_, i) => `${(nixLogo[i] ?? '').padEnd(width)}${info[i] ?? ''}`)
  );
}

function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d} Tage, ${h} Std.` : h > 0 ? `${h} Std., ${m} Min.` : `${m} Min.`;
}

function live(cmd: string, status: Status | null): TermOutput {
  const unavailable = lines(`${cmd}: ${UNAVAILABLE}`);
  if (cmd === 'nowplaying') {
    const m = status?.music;
    if (!m) return unavailable;
    return lines(`${m.state === 'playing' ? 'läuft gerade' : 'zuletzt gehört'}: ${m.artist} – ${m.track}`);
  }
  if (cmd === 'uptime') {
    const s = status?.server;
    return s ? lines(`up ${duration(s.uptime_s)}`) : unavailable;
  }
  const w = status?.weather;
  return w ? lines(`${w.temp_c.toFixed(1)} °C, Wind ${Math.round(w.wind_kmh)} km/h`) : unavailable;
}

function openProject(name: string | undefined, ctx: TerminalContext): TermOutput {
  if (!name) return [...err('open: Projekt fehlt'), ...lines(projects.map((p) => p.name).join('  '))];
  const project = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!project) return err(`open: ${name}: Projekt nicht gefunden`);
  const url = project.liveUrl ?? project.repoUrl;
  ctx.open(url);
  return [{ text: `öffne ${url}`, tone: 'ok' }];
}

function man(topic: string | undefined): TermOutput {
  if (!topic) return err('What manual page do you want?');
  if (topic !== 'paul') return err(`No manual entry for ${topic}`);
  const github = contacts.find((c) => c.kind === 'github')?.href;
  const indent = (text: string) => `    ${text}`;
  return lines(
    'PAUL(1)                    paul.wtf                    PAUL(1)',
    '',
    'NAME',
    indent(`paul - ${about.tagline}`),
    '',
    'SYNOPSIS',
    indent('paul [cat über-mich] [cat projekte] [open <projekt>] [cat kontakt]'),
    '',
    'BESCHREIBUNG',
    indent(about.paragraphs[0]),
    '',
    'UMGEBUNG',
    ...tools.map((t) => indent(`${t.label.toUpperCase().replace(/\W+/g, '_')}=${t.value}`)),
    '',
    'DATEIEN',
    indent([...FILES, `${CAT_DIR}/`].map((f) => `~/${f}`).join('  ')),
    '',
    'SIEHE AUCH',
    indent(['help(1)', 'fastfetch(1)', 'htop(1)', ...(github ? [github] : [])].join(', ')),
    '',
    'BUGS',
    indent('Keine bekannt. Meldungen nimmt „cat kontakt“ entgegen.')
  );
}

function meter(label: string, pct: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((pct / 100) * BAR_WIDTH)));
  return `${label.padEnd(4)} [${'|'.repeat(filled).padEnd(BAR_WIDTH)}] ${`${pct.toFixed(1)}%`.padStart(6)}`;
}

function sparkline(values: number[]): string {
  const top = Math.max(10, ...values);
  return values.map((v) => SPARK[Math.max(0, Math.min(7, Math.round((v / top) * 7)))]).join('');
}

function htop(status: Status | null): TermOutput {
  const s = status?.server;
  if (!s) return lines(`htop: ${UNAVAILABLE}`);
  return lines(
    meter('CPU', s.cpu_pct),
    meter('Mem', s.mem_pct),
    `Load ${s.load1.toFixed(2)} · up ${duration(s.uptime_s)}`,
    ...(s.cpu_history.length > 1 ? [`Verlauf  ${sparkline(s.cpu_history)}`] : [])
  );
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const https = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null);

async function linkhop(url: string | undefined): Promise<TermOutput> {
  if (!url) return err('linkhop: URL fehlt');
  let res: Response;
  try {
    res = await fetch(`${LINKHOP}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(LINKHOP_TIMEOUT),
    });
  } catch {
    return err('linkhop: nicht erreichbar');
  }
  if (res.status === 400 || res.status === 422) return err('linkhop: Link nicht erkannt');
  if (res.status === 404) return err('linkhop: nichts gefunden');
  if (res.status === 429) return err('linkhop: zu viele Anfragen, gleich nochmal versuchen');
  if (!res.ok) return err(`linkhop: Fehler ${res.status}`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!isObj(data) || !isObj(data.source) || !isObj(data.targets)) return err('linkhop: unerwartete Antwort');

  const { source, targets } = data;
  const rows: [string, string | null][] = [];
  if (typeof source.service === 'string') rows.push([source.service, https(source.url)]);
  for (const [service, target] of Object.entries(targets)) {
    rows.push([service, isObj(target) && target.status === 'ok' ? https(target.url) : null]);
  }
  const label = (service: string) => SERVICES[service] ?? service;
  const width = Math.max(...rows.map(([service]) => label(service).length));
  const artists = Array.isArray(source.artists) ? source.artists.filter((a) => typeof a === 'string') : [];
  const title = typeof source.title === 'string' ? [source.title, artists.join(', ')].filter(Boolean).join(' · ') : '';
  return lines(
    ...(title ? [title] : []),
    ...rows.map(([service, link]) => `${label(service).padEnd(width)}  ${link ?? 'nicht gefunden'}`)
  );
}

export function complete(line: string): { line: string; options: string[] } {
  const words = line.replace(/^\s+/, '').split(/\s+/);
  const last = words[words.length - 1].toLowerCase();
  const pool = words.length === 1 ? COMMAND_NAMES : words.length === 2 ? (ARGUMENTS[words[0]]?.() ?? []) : [];
  const hits = pool.filter((c) => c.toLowerCase().startsWith(last)).sort((a, b) => a.localeCompare(b, 'de'));
  if (hits.length === 0) return { line, options: [] };
  const head = words.slice(0, -1);
  if (hits.length === 1) return { line: `${[...head, hits[0]].join(' ')} `, options: [] };
  let shared = hits[0];
  for (const hit of hits) {
    while (!hit.toLowerCase().startsWith(shared.toLowerCase())) shared = shared.slice(0, -1);
  }
  if (shared.length > last.length) return { line: [...head, shared].join(' '), options: [] };
  return { line, options: hits };
}

export function run(line: string, ctx: TerminalContext): TermOutput | Promise<TermOutput> {
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return [];
  switch (cmd) {
    case 'help': {
      const width = Math.max(...COMMANDS.map(([c]) => c.length));
      return lines(
        ...COMMANDS.map(([c, d]) => `${c.padEnd(width)}  ${d}`),
        '',
        'Tab vervollständigt Befehle und Dateinamen.'
      );
    }
    case 'whoami':
      return lines(about.name, about.tagline);
    case 'ls':
      return ls(args[0]);
    case 'cat':
      return cat(args[0], ctx);
    case 'fastfetch':
    case 'neofetch':
      return fastfetch();
    case 'ws': {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1 || n > WORKSPACES) return err(`ws: Workspace 1 bis ${WORKSPACES} erwartet`);
      ctx.go(n);
      return [{ text: `Workspace ${n}`, tone: 'ok' }];
    }
    case 'open':
      return openProject(args[0], ctx);
    case 'man':
      return man(args[0]);
    case 'nowplaying':
    case 'uptime':
    case 'weather':
      return live(cmd, ctx.live());
    case 'htop':
      return htop(ctx.live());
    case 'linkhop':
      return linkhop(args[0]);
    case 'clear':
      ctx.clear();
      return [];
    case 'exit':
      ctx.close();
      return [];
    case 'sudo':
      return err('paul is not in the sudoers file. This incident will be reported.');
    default:
      return err(`fish: Unknown command: ${cmd}`);
  }
}

export function createTerminal(ctx: Omit<TerminalContext, 'clear'>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'term';
  root.dataset.label = 'Terminal';

  const out = document.createElement('div');
  out.className = 'term-out';
  out.setAttribute('role', 'log');

  const row = document.createElement('div');
  row.className = 'term-line';
  const prompt = document.createElement('span');
  prompt.className = 'term-prompt';
  prompt.textContent = PROMPT;
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', 'Befehl');
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  row.append(prompt, input);
  root.append(out, row);

  const history: string[] = [];
  let cursor = 0;

  const print = (text: string, tone?: string) => {
    const el = document.createElement('div');
    el.className = tone ? `term-row is-${tone}` : 'term-row';
    el.textContent = text;
    out.append(el);
    return el;
  };
  const show = (rows: TermOutput) => {
    for (const o of rows) print(o.text, o.tone);
    toBottom();
  };
  const toBottom = () => {
    root.scrollTop = root.scrollHeight;
  };

  const full: TerminalContext = {
    ...ctx,
    clear: () => out.replaceChildren()
  };

  print('Willkommen. „help“ zeigt alle Befehle.');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      input.blur();
      input.closest<HTMLElement>('.wm-window')?.focus({ preventScroll: true });
    } else if (e.key === 'Enter') {
      if (e.isComposing) return;
      e.preventDefault();
      const line = input.value;
      input.value = '';
      const echo = document.createElement('div');
      echo.className = 'term-row';
      const p = document.createElement('span');
      p.className = 'term-prompt';
      p.textContent = PROMPT;
      echo.append(p, ` ${line}`);
      out.append(echo);
      if (line.trim()) {
        history.push(line);
        cursor = history.length;
      }
      const result = run(line, full);
      if (result instanceof Promise) {
        const pending = print('…');
        toBottom();
        void result.then((rows) => {
          pending.remove();
          show(rows);
        });
      } else {
        show(result);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const done = complete(input.value);
      input.value = done.line;
      if (done.options.length) {
        print(done.options.join('  '));
        toBottom();
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(history.length, Math.max(0, cursor + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[cursor] ?? '';
    }
  });

  root.addEventListener('click', () => {
    if (!getSelection()?.toString()) input.focus();
  });

  return root;
}
