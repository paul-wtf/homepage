import { about } from '../../data/about';
import { contacts, emailParts } from '../../data/contact';
import { projects } from '../../data/projects';
import { pax } from '../../data/sidefacts';
import { nixLogo, tools } from '../../data/tools';
import type { Status } from '../live/status';

export type TermOutput = { text: string; tone?: 'err' | 'ok' }[];

export interface TerminalContext {
  go(ws: number): void;
  close(): void;
  clear(): void;
  live(): Status | null;
}

const HOST = 'paul@paul.wtf';
const PROMPT = `${HOST} ~>`;
const WORKSPACES = 6;
const FILES = ['über-mich', 'kontakt', 'projekte', 'pax'];
const UNAVAILABLE = 'nicht verfügbar';

const lines = (...texts: string[]): TermOutput => texts.map((text) => ({ text }));
const err = (text: string): TermOutput => [{ text, tone: 'err' }];

const COMMANDS: [string, string][] = [
  ['help', 'diese Liste'],
  ['whoami', 'wer hier sitzt'],
  ['ls', 'Dateien anzeigen'],
  ['cat <datei>', 'Datei ausgeben'],
  ['fastfetch', 'System-Überblick (auch neofetch)'],
  ['ws <1-6>', 'Workspace wechseln'],
  ['nowplaying', 'was gerade läuft'],
  ['uptime', 'Laufzeit des Servers'],
  ['weather', 'Wetter in Bierwang'],
  ['clear', 'Ausgabe leeren'],
  ['exit', 'Fenster schließen']
];

function email(): string {
  return `${emailParts.user}@${emailParts.domain}`;
}

function cat(file: string | undefined): TermOutput {
  if (!file) return err('cat: Datei fehlt');
  switch (file.replace(/^(\.\/|~\/)/, '').replace(/\/$/, '')) {
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
          return `${c.label.padEnd(width)}  ${value}${c.href ? `  ${c.href}` : ''}`;
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

export function run(line: string, ctx: TerminalContext): TermOutput {
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return [];
  switch (cmd) {
    case 'help': {
      const width = Math.max(...COMMANDS.map(([c]) => c.length));
      return lines(...COMMANDS.map(([c, d]) => `${c.padEnd(width)}  ${d}`));
    }
    case 'whoami':
      return lines(about.name, about.tagline);
    case 'ls':
      return lines(FILES.join('  '));
    case 'cat':
      return cat(args[0]);
    case 'fastfetch':
    case 'neofetch':
      return fastfetch();
    case 'ws': {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1 || n > WORKSPACES) return err(`ws: Workspace 1 bis ${WORKSPACES} erwartet`);
      ctx.go(n);
      return [{ text: `Workspace ${n}`, tone: 'ok' }];
    }
    case 'nowplaying':
    case 'uptime':
    case 'weather':
      return live(cmd, ctx.live());
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
      for (const o of run(line, full)) print(o.text, o.tone);
      toBottom();
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
