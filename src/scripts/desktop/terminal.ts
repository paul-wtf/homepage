import { about } from '../../data/about';
import { contacts, emailParts } from '../../data/contact';
import { projects } from '../../data/projects';
import { cats, pax, paxAge } from '../../data/sidefacts';
import { nixLogo, tools } from '../../data/tools';
import { ui } from '../../data/ui';
import { lang } from '../lang';
import type { Status } from '../live/status';
import { bytes, share, stats, storage, temps, uptime } from '../live/cluster';
import { FLAVORS, currentFlavor, isFlavor, setFlavor } from '../theme';

export type TermOutput = { text: string; tone?: 'err' | 'ok' }[];

export interface TerminalContext {
  go(ws: number): void;
  close(): void;
  clear(): void;
  live(): Status | null;
  open(url: string): void;
  photo(cat: string): void;
}

const t = ui[lang].terminal;
const paths = ui[lang].paths;
const me = about[lang];
const fox = pax[lang];

const HOST = 'paul@paul.wtf';
const PROMPT = `${HOST} ~>`;
const WORKSPACES = 6;
const FILES = [paths.about, paths.contact, paths.projects, 'pax', 'pubkey'];
const SITE = 'https://paul.wtf';
const CAT_DIR = paths.cats;
const CAT_NAMES = cats.map((c) => c.name.toLowerCase());
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
  ['help', t.commands.help],
  ['whoami', t.commands.whoami],
  ['ls', t.commands.ls],
  [`cat <${t.args.file}>`, t.commands.cat],
  ['fastfetch', t.commands.fastfetch],
  [`open <${t.args.project}>`, t.commands.open],
  ['man paul', t.commands.man],
  ['ws <1-6>', t.commands.ws],
  ['nowplaying', t.commands.nowplaying],
  ['uptime', t.commands.uptime],
  ['htop', t.commands.htop],
  ['homelab', t.commands.homelab],
  ['weather', t.commands.weather],
  ['linkhop <url>', t.commands.linkhop],
  ['theme <flavor>', t.commands.theme],
  ['clear', t.commands.clear],
  ['exit', t.commands.exit]
];

const COMMAND_NAMES = [...COMMANDS.map(([c]) => c.split(' ')[0]), 'neofetch'];
const SESSION_ONLY = ['clear', 'exit'];

export interface Launchable {
  usage: string;
  description: string;
  line: string;
  complete: boolean;
}

export const launchable: Launchable[] = COMMANDS.filter(([usage]) => !SESSION_ONLY.includes(usage)).map(
  ([usage, description]) => {
    const complete = !usage.includes('<');
    return { usage, description, line: complete ? usage : `${usage.split(' ')[0]} `, complete };
  }
);

export const isCommand = (name: string): boolean => COMMAND_NAMES.includes(name);

const ARGUMENTS: Record<string, () => string[]> = {
  cat: () => [...FILES, ...CAT_NAMES, ...CAT_NAMES.map((n) => `${CAT_DIR}/${n}`)],
  ls: () => [`${CAT_DIR}/`],
  open: () => projects.map((p) => p.name),
  man: () => ['paul'],
  theme: () => [...FLAVORS],
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
  if (!file) return err(t.missingFile);
  const name = file.replace(/^(\.\/|~\/)/, '').replace(/\/$/, '');
  if (name === CAT_DIR) return err(`cat: ${file}: Is a directory`);
  const pet = name.toLowerCase().replace(`${CAT_DIR}/`, '');
  const found = cats.find((c) => c.name.toLowerCase() === pet);
  if (found) {
    ctx.photo(pet);
    return lines(`${found.name}: ${found.personality[lang]}`);
  }
  if (name === paths.about) {
    return [...lines(me.name, me.tagline, ''), ...me.paragraphs.flatMap((p) => lines(p, ''))].slice(0, -1);
  }
  if (name === paths.contact) {
    const width = Math.max(...contacts.map((c) => c.label.length));
    return lines(
      ...contacts.map((c) => {
        const value = c.kind === 'email' ? email() : (c.value ?? '');
        return `${c.label.padEnd(width)}  ${value}${c.href ? `  ${new URL(c.href, SITE).href}` : ''}`;
      })
    );
  }
  if (name === paths.projects) {
    return projects.flatMap((p, i) => [
      ...(i ? lines('') : []),
      ...lines(
        p.name,
        p.description[lang],
        `Stack: ${p.stack.join(', ')}`,
        p.repoUrl,
        ...(p.liveUrl ? [p.liveUrl] : [])
      )
    ]);
  }
  if (name === 'pax') {
    return lines(
      `${fox.species}, ${fox.pronouns}, ${paxAge}`,
      fox.description,
      '',
      `${t.likes}: ${fox.likes.join('; ')}`,
      `${t.dislikes}: ${fox.dislikes.join('; ')}`
    );
  }
  if (name === 'pubkey') {
    const key = contacts.find((c) => c.kind === 'gpg');
    if (!key?.href) return err('cat: pubkey: No such file or directory');
    const width = Math.max('Fingerprint'.length, t.key.length) + 2;
    return lines(
      `${'Fingerprint'.padEnd(width)}${key.value ?? ''}`,
      `${t.key.padEnd(width)}${new URL(key.href, SITE).href}`
    );
  }
  return err(`cat: ${file}: No such file or directory`);
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
  return d > 0 ? t.daysHours(d, h) : h > 0 ? t.hoursMinutes(h, m) : t.minutes(m);
}

function live(cmd: string, status: Status | null): TermOutput {
  const unavailable = lines(`${cmd}: ${t.unavailable}`);
  if (cmd === 'nowplaying') {
    const m = status?.music;
    if (!m) return unavailable;
    return lines(`${m.state === 'playing' ? t.playing : t.recent}: ${m.artist} – ${m.track}`);
  }
  if (cmd === 'uptime') {
    const s = status?.server;
    return s ? lines(`up ${duration(s.uptime_s)}`) : unavailable;
  }
  const w = status?.weather;
  return w ? lines(`${w.temp_c.toFixed(1)} °C, ${t.wind} ${Math.round(w.wind_kmh)} km/h`) : unavailable;
}

function openProject(name: string | undefined, ctx: TerminalContext): TermOutput {
  if (!name) return [...err(t.missingProject), ...lines(projects.map((p) => p.name).join('  '))];
  const project = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!project) return err(t.noProject(name));
  const url = project.liveUrl ?? project.repoUrl;
  ctx.open(url);
  return [{ text: t.opening(url), tone: 'ok' }];
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
    indent(`paul - ${me.tagline}`),
    '',
    'SYNOPSIS',
    indent(`paul [cat ${paths.about}] [cat ${paths.projects}] [open <${t.args.project}>] [cat ${paths.contact}]`),
    '',
    t.manDescription,
    indent(me.paragraphs[0]),
    '',
    t.manEnvironment,
    ...tools.map((t) => indent(`${t.label.toUpperCase().replace(/\W+/g, '_')}=${t.value}`)),
    '',
    t.manFiles,
    indent([...FILES, `${CAT_DIR}/`].map((f) => `~/${f}`).join('  ')),
    '',
    t.manSeeAlso,
    indent(['help(1)', 'fastfetch(1)', 'htop(1)', ...(github ? [github] : [])].join(', ')),
    '',
    'BUGS',
    indent(t.manBugs(`cat ${paths.contact}`))
  );
}

function theme(name: string | undefined): TermOutput {
  if (!name) return lines(currentFlavor());
  if (!isFlavor(name)) return err(t.unknownFlavor(name, FLAVORS.join(', ')));
  setFlavor(name);
  return [{ text: `Flavor: ${name}`, tone: 'ok' }];
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
  if (!s) return lines(`htop: ${t.unavailable}`);
  return lines(
    meter('CPU', s.cpu_pct),
    meter('Mem', s.mem_pct),
    `Load ${s.load1.toFixed(2)} · up ${duration(s.uptime_s)}`,
    ...(s.cpu_history.length > 1 ? [`${t.history}  ${sparkline(s.cpu_history)}`] : [])
  );
}

function homelab(status: Status | null): TermOutput {
  const c = status?.cluster;
  if (!c) return lines(`homelab: ${t.unavailable}`);
  const cl = ui[lang].cluster;
  const summary = stats(c);
  const kube = summary.filter(([label]) => label === cl.kubernetes);
  const counts = summary.filter(([label]) => label !== cl.kubernetes);
  const pair = ([label, value]: [string, string]) => `${label} ${value}`;
  const name = Math.max(cl.total.length, ...c.nodes.map((n) => n.name.length));
  const up = Math.max(0, ...c.nodes.map((n) => (n.uptime_s === null ? 0 : cl.up(uptime(n.uptime_s)).length)));
  const meterOf = (s: [number, number] | null) => {
    if (!s) return '';
    const filled = Math.round((share(...s) / 100) * BAR_WIDTH);
    return `[${'|'.repeat(filled).padEnd(BAR_WIDTH)}]  ${bytes(s[0])} / ${bytes(s[1])}`;
  };
  const rows = c.nodes.map((n) =>
    [n.name.padEnd(name), (n.uptime_s === null ? '' : cl.up(uptime(n.uptime_s))).padEnd(up), meterOf(storage(n.storage_used, n.storage_total))]
      .join('  ')
      .trimEnd()
  );
  const total = storage(c.storage_used, c.storage_total);
  const heat = temps(c);
  return lines(
    ...(counts.length ? [counts.map(pair).join(' · ')] : []),
    ...kube.map(pair),
    ...rows,
    ...(total ? [[cl.total.padEnd(name), ''.padEnd(up), meterOf(total)].join('  ')] : []),
    ...(heat.length ? [heat.map(pair).join(' · ')] : [])
  );
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const https = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null);

async function linkhop(url: string | undefined): Promise<TermOutput> {
  if (!url) return err(t.linkhop.missing);
  let res: Response;
  try {
    res = await fetch(`${LINKHOP}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(LINKHOP_TIMEOUT),
    });
  } catch {
    return err(t.linkhop.unreachable);
  }
  if (res.status === 400 || res.status === 422) return err(t.linkhop.unrecognized);
  if (res.status === 404) return err(t.linkhop.nothing);
  if (res.status === 429) return err(t.linkhop.tooMany);
  if (!res.ok) return err(t.linkhop.error(res.status));
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!isObj(data) || !isObj(data.source) || !isObj(data.targets)) return err(t.linkhop.unexpected);

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
    ...rows.map(([service, link]) => `${label(service).padEnd(width)}  ${link ?? t.linkhop.notFound}`)
  );
}

export function complete(line: string): { line: string; options: string[] } {
  const words = line.replace(/^\s+/, '').split(/\s+/);
  const last = words[words.length - 1].toLowerCase();
  const pool = words.length === 1 ? COMMAND_NAMES : words.length === 2 ? (ARGUMENTS[words[0]]?.() ?? []) : [];
  const hits = pool.filter((c) => c.toLowerCase().startsWith(last)).sort((a, b) => a.localeCompare(b, lang));
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
        t.helpTab,
        t.helpScratchpad
      );
    }
    case 'whoami':
      return lines(me.name, me.tagline);
    case 'ls':
      return ls(args[0]);
    case 'cat':
      return cat(args[0], ctx);
    case 'fastfetch':
    case 'neofetch':
      return fastfetch();
    case 'ws': {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1 || n > WORKSPACES) return err(t.wsExpected(WORKSPACES));
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
    case 'homelab':
      return homelab(ctx.live());
    case 'linkhop':
      return linkhop(args[0]);
    case 'theme':
      return theme(args[0]);
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

export interface Terminal {
  el: HTMLElement;
  exec(line: string): void;
  fill(text: string): void;
  focus(): void;
}

export function createTerminal(ctx: Omit<TerminalContext, 'clear'>): Terminal {
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
  input.setAttribute('aria-label', t.inputLabel);
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

  print(t.welcome);

  const exec = (line: string) => {
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
  };

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
      exec(line);
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

  return {
    el: root,
    exec,
    fill(text) {
      input.value = text;
      input.focus({ preventScroll: true });
    },
    focus() {
      input.focus({ preventScroll: true });
      toBottom();
    },
  };
}
