import { dwindle, type Rect } from './layout';
import { initScrollFocus } from '../scroll-focus';
import { revealEmails } from '../contact-actions';
import { createTerminal, isCommand, launchable, type Terminal } from './terminal';
import { createLock } from './lock';
import { createLauncher, type LauncherEntry } from './launcher';
import { latest } from '../live/status';
import { markProjects } from '../live/projects';

export interface DesktopApi {
  enter(ws?: number): void;
  leave(): void;
  isOn(): boolean;
  current(): number;
  go(ws: number): void;
  openWindow(el: HTMLElement): void;
  closeFocused(): void;
}

interface Workspace {
  layer: HTMLElement;
  wins: HTMLElement[];
  focus: HTMLElement | null;
  full: HTMLElement | null;
}

const WORKSPACES = 6;
const GAPS_OUT = { top: 12, right: 22, bottom: 22, left: 22 };
// Hyprland puts gaps_in (5) on both neighbours, so two windows sit 2 × 5 apart.
const GAP_IN = 10;
const GAP_REFERENCE_WIDTH = 1600;
const STAGGER = 55;
const POP_DELAY = 140;
const SLIDE_MS = 420;
const CLOSE_MS = 180;
const MODE_KEY = 'paulwtf:mode';
const SEEN_KEY = 'paulwtf:keybinds-seen';
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable]';
const QUALIFIES = '(min-width: 900px) and (pointer: fine)';

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function isTyping(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

let instance: DesktopApi | null = null;

export function initDesktop(): DesktopApi {
  if (instance) return instance;

  const html = document.documentElement;
  const wm = document.querySelector<HTMLElement>('[data-wm]')!;
  const main = document.querySelector<HTMLElement>('main');
  const toggle = document.querySelector<HTMLButtonElement>('#desktop-toggle');
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#top-nav a[data-section]'));
  const launcherRoot = document.querySelector<HTMLElement>('[data-launcher]');
  const media = matchMedia(QUALIFIES);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ms = (n: number) => (reduced.matches ? 0 : n);

  let on = false;
  let cur = 1;
  let spaces: Workspace[] = [];
  let keybindsShown = false;
  let clearTimer = 0;
  let stopScrollFocus: (() => void) | null = initScrollFocus();
  const lock = createLock();
  const terminals = new Map<HTMLElement, Terminal>();
  const launcher = createLauncher(launcherEntries, typedLine);

  const ws = (n: number): Workspace | undefined => spaces[n - 1];

  function makeWindow(content: Node, label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'wm-window is-pre';
    el.tabIndex = -1;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', label);
    el.append(content);
    revealEmails(el);
    markProjects(el);
    el.addEventListener('mouseenter', () => setFocus(el));
    el.addEventListener('focusin', () => setFocus(el, false));
    return el;
  }

  function keybindsWindow(): HTMLElement | null {
    const t = document.querySelector<HTMLTemplateElement>('template[data-keybinds]');
    if (!t) return null;
    const el = makeWindow(t.content.cloneNode(true), t.dataset.label ?? '');
    el.dataset.keybinds = '';
    return el;
  }

  function fromTemplate(t: HTMLTemplateElement): HTMLElement {
    const el = makeWindow(t.content.cloneNode(true), t.dataset.label ?? '');
    el.dataset.path = t.dataset.path ?? '';
    return el;
  }

  function build(): void {
    spaces = [];
    terminals.clear();
    const layers: HTMLElement[] = [];
    for (let n = 1; n <= WORKSPACES; n++) {
      const layer = document.createElement('div');
      layer.className = 'wm-layer is-parked';
      layer.dataset.ws = String(n);
      layers.push(layer);
      spaces.push({ layer, wins: [], focus: null, full: null });
    }
    for (const t of document.querySelectorAll<HTMLTemplateElement>('template[data-window]')) {
      const space = ws(Number(t.dataset.ws));
      if (!space) continue;
      const el = fromTemplate(t);
      space.wins.push(el);
      space.layer.append(el);
    }
    wm.replaceChildren(...layers);
  }

  function outerArea(): { outer: Rect; gapIn: number } {
    const s = Math.min(1, window.innerWidth / GAP_REFERENCE_WIDTH);
    const g = { top: GAPS_OUT.top * s, right: GAPS_OUT.right * s, bottom: GAPS_OUT.bottom * s, left: GAPS_OUT.left * s };
    return {
      outer: {
        x: g.left,
        y: g.top,
        w: wm.clientWidth - g.left - g.right,
        h: wm.clientHeight - g.top - g.bottom,
      },
      gapIn: GAP_IN * s,
    };
  }

  function layout(n: number): void {
    const space = ws(n);
    if (!space) return;
    const { outer, gapIn } = outerArea();
    const rects = dwindle(outer, space.wins.length, gapIn);
    space.wins.forEach((el, i) => {
      const full = space.full === el;
      const r = full ? outer : rects[i];
      el.classList.toggle('is-full', full);
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
    });
  }

  function setFocus(el: HTMLElement | null | undefined, moveDom = true): void {
    const space = ws(cur);
    if (!on || !el || !space?.wins.includes(el)) return;
    space.focus = el;
    for (const w of space.wins) w.classList.toggle('is-focus', w === el);
    if (moveDom && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>('.term input') ?? el).focus({ preventScroll: true });
    }
  }

  function refreshBar(): void {
    links.forEach((a, i) => {
      const n = i + 1;
      a.classList.toggle('empty', on && ws(n)?.wins.length === 0);
      if (!on) return;
      if (n === cur) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    toggle?.setAttribute('aria-pressed', String(on));
  }

  function popIn(wins: HTMLElement[], delay: number): void {
    wins.forEach((el, i) => {
      const d = ms(delay + i * STAGGER);
      if (d === 0) el.classList.remove('is-pre');
      else setTimeout(() => el.classList.remove('is-pre'), d);
    });
  }

  function scrollSection(): number {
    const i = links.findIndex((a) => a.hasAttribute('aria-current'));
    return i < 0 ? 1 : i + 1;
  }

  function enter(n?: number): void {
    if (!media.matches) return;
    if (on) {
      if (n) go(n);
      return;
    }
    clearTimeout(clearTimer);
    cur = n && n >= 1 && n <= WORKSPACES ? n : scrollSection();
    build();
    for (const space of spaces) {
      if (space !== ws(cur)) for (const el of space.wins) el.classList.remove('is-pre');
    }
    on = true;
    writeStore(MODE_KEY, 'desktop');
    stopScrollFocus?.();
    stopScrollFocus = null;

    if (main) {
      main.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2 - main.offsetTop}px`;
      main.inert = true;
    }
    const scrollbar = window.innerWidth - html.clientWidth;
    html.style.paddingRight = scrollbar > 0 ? `${scrollbar}px` : '';
    wm.classList.remove('is-leaving');
    html.classList.add('desktop-on');

    const space = ws(cur)!;
    space.layer.classList.remove('is-parked');
    if (!keybindsShown && readStore(SEEN_KEY) === null) {
      const kb = keybindsWindow();
      if (kb) {
        space.wins.push(kb);
        space.layer.append(kb);
        space.focus = kb;
      }
    }
    keybindsShown = true;
    writeStore(SEEN_KEY, '1');

    layout(cur);
    popIn(space.wins, POP_DELAY);
    setFocus(space.focus ?? space.wins[0]);
    refreshBar();
    lock.arm();
  }

  function leave(remember = true): void {
    if (!on) return;
    on = false;
    launcher.close();
    lock.disarm();
    if (remember) writeStore(MODE_KEY, 'scroll');
    for (const el of ws(cur)?.wins ?? []) el.classList.add('is-pre');
    wm.classList.add('is-leaving');
    html.classList.remove('desktop-on');
    html.style.paddingRight = '';
    if (main) main.inert = false;
    clearTimer = window.setTimeout(() => {
      wm.classList.remove('is-leaving');
      wm.replaceChildren();
      spaces = [];
    }, ms(CLOSE_MS));

    stopScrollFocus ??= initScrollFocus();
    refreshBar();
    for (const a of links) a.removeAttribute('aria-current');
    window.dispatchEvent(new Event('scroll'));
    toggle?.focus();
  }

  function go(n: number): void {
    const from = ws(cur);
    const to = ws(n);
    if (!on || n === cur || !from || !to) return;
    const dir = n > cur ? 1 : -1;
    const prev = cur;
    cur = n;

    layout(n);
    to.layer.style.transition = 'none';
    to.layer.style.transform = `translateX(${dir * 100}%)`;
    to.layer.classList.remove('is-parked');
    void to.layer.offsetWidth;
    to.layer.style.transition = '';
    to.layer.style.transform = '';
    from.layer.style.transform = `translateX(${-dir * 100}%)`;
    const park = () => {
      if (cur === prev) return;
      from.layer.classList.add('is-parked');
      from.layer.style.transform = '';
    };
    if (ms(SLIDE_MS) === 0) park();
    else setTimeout(park, SLIDE_MS);

    setFocus(to.focus ?? to.wins[0]);
    refreshBar();
  }

  function add(el: HTMLElement, focus = true): void {
    const space = ws(cur);
    if (!space) return;
    space.full = null;
    space.wins.push(el);
    space.layer.append(el);
    layout(cur);
    popIn([el], 20);
    if (focus) setFocus(el);
    refreshBar();
  }

  function openPhoto(cat: string, focus = false): void {
    const t = document.querySelector<HTMLTemplateElement>(`template[data-cat="${CSS.escape(cat)}"]`);
    if (!on || !t) return;
    const open = ws(cur)?.wins.find((w) => w.dataset.cat === cat);
    if (open) {
      if (focus) setFocus(open);
      return;
    }
    const el = fromTemplate(t);
    el.dataset.cat = cat;
    add(el, focus);
  }

  function openWindow(content: HTMLElement): void {
    enter();
    if (on) add(makeWindow(content, content.dataset.label ?? ''));
  }

  function openTerminal(): Terminal | null {
    let win: HTMLElement | null = null;
    const term = createTerminal({
      go,
      close: () => win && closeWindow(win),
      live: latest,
      open: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      photo: openPhoto,
    });
    openWindow(term.el);
    win = term.el.closest<HTMLElement>('.wm-window');
    if (!win) return null;
    terminals.set(win, term);
    return term;
  }

  function runInTerminal(line: string, complete: boolean): void {
    const space = ws(cur);
    const open = space?.wins.filter((w) => terminals.has(w)) ?? [];
    const win = open.find((w) => w === space?.focus) ?? open[open.length - 1];
    const term = win ? terminals.get(win) : openTerminal();
    if (!term) return;
    if (win) setFocus(win);
    term.focus();
    if (complete) term.exec(line);
    else term.fill(line);
  }

  function showWindow(t: HTMLTemplateElement): void {
    const n = Number(t.dataset.ws);
    go(n);
    const space = ws(cur);
    if (!space || cur !== n) return;
    const open = space.wins.find((w) => w.dataset.path === t.dataset.path);
    if (!open) {
      add(fromTemplate(t));
      return;
    }
    if (space.full && space.full !== open) {
      space.full = null;
      layout(cur);
    }
    setFocus(open);
  }

  function launcherEntries(): LauncherEntry[] {
    const kinds = launcherRoot?.dataset ?? {};
    const entries: LauncherEntry[] = links.map((a, i) => ({
      label: `${i + 1} ${a.querySelector('.label')?.textContent ?? ''}`,
      kind: kinds.kindWorkspace ?? '',
      run: () => go(i + 1),
    }));
    for (const t of document.querySelectorAll<HTMLTemplateElement>('template[data-window]')) {
      entries.push({ label: t.dataset.label ?? '', detail: t.dataset.path, kind: kinds.kindWindow ?? '', run: () => showWindow(t) });
    }
    for (const t of document.querySelectorAll<HTMLTemplateElement>('template[data-cat]')) {
      entries.push({
        label: t.dataset.label ?? '',
        detail: t.dataset.path,
        kind: kinds.kindWindow ?? '',
        run: () => {
          go(Number(t.dataset.ws));
          openPhoto(t.dataset.cat ?? '', true);
        },
      });
    }
    const keybinds = document.querySelector<HTMLTemplateElement>('template[data-keybinds]');
    if (keybinds) {
      entries.push({ label: keybinds.dataset.label ?? '', detail: keybinds.dataset.path, kind: kinds.kindWindow ?? '', run: openKeybinds });
    }
    for (const c of launchable) {
      entries.push({ label: c.usage, detail: c.description, kind: kinds.kindCommand ?? '', run: () => runInTerminal(c.line, c.complete) });
    }
    entries.push(
      { label: kinds.actionLeave ?? '', kind: kinds.kindAction ?? '', run: () => leave() },
      { label: kinds.actionLock ?? '', kind: kinds.kindAction ?? '', run: () => lock.now() }
    );
    return entries;
  }

  function typedLine(query: string): LauncherEntry | null {
    const words = query.trim().split(/\s+/);
    if (words.length < 2 || !isCommand(words[0])) return null;
    const line = words.join(' ');
    return { label: line, kind: launcherRoot?.dataset.kindCommand ?? '', run: () => runInTerminal(line, true) };
  }

  function openKeybinds(): void {
    const open = ws(cur)?.wins.find((w) => w.dataset.keybinds !== undefined);
    if (open) setFocus(open);
    else {
      const kb = keybindsWindow();
      if (kb) add(kb);
    }
  }

  function closeWindow(el: HTMLElement): void {
    const space = ws(cur);
    const i = space?.wins.indexOf(el) ?? -1;
    if (!on || !space || i < 0) return;
    const wasFocus = space.focus === el;
    space.wins.splice(i, 1);
    if (space.full === el) space.full = null;
    el.classList.remove('is-focus');
    el.classList.add('is-closing');
    setTimeout(() => el.remove(), ms(CLOSE_MS));
    layout(cur);
    if (wasFocus) {
      space.focus = null;
      setFocus(space.wins[Math.max(0, i - 1)]);
    }
    refreshBar();
  }

  function closeFocused(): void {
    const el = ws(cur)?.focus;
    if (el) closeWindow(el);
  }

  function toggleFull(): void {
    const space = ws(cur);
    if (!space?.focus) return;
    space.full = space.full === space.focus ? null : space.focus;
    layout(cur);
  }

  function center(el: HTMLElement): { x: number; y: number } {
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
  }

  function moveFocus(dx: number, dy: number): void {
    const space = ws(cur);
    if (!space) return;
    if (!space.focus) {
      setFocus(space.wins[0]);
      return;
    }
    const c = center(space.focus);
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const w of space.wins) {
      if (w === space.focus) continue;
      const p = center(w);
      const vx = p.x - c.x;
      const vy = p.y - c.y;
      const along = vx * dx + vy * dy;
      if (along <= 1) continue;
      const score = along + 2 * Math.abs(vx * dy - vy * dx);
      if (score < bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (best) setFocus(best);
  }

  const directions: Record<string, [number, number]> = {
    h: [-1, 0], arrowleft: [-1, 0],
    l: [1, 0], arrowright: [1, 0],
    k: [0, -1], arrowup: [0, -1],
    j: [0, 1], arrowdown: [0, 1],
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    if (isTyping(document.activeElement) || !media.matches) return;
    const k = e.key.toLowerCase();
    if (k === 'd') {
      if (e.repeat) return;
      if (on) leave();
      else enter();
    } else if (!on) {
      return;
    } else if (/^[1-6]$/.test(k)) {
      go(Number(k));
    } else if (k === 'escape') {
      leave();
    } else if (k === 'enter' && e.shiftKey) {
      if (!e.repeat) launcher.open();
    } else if (k === 'enter') {
      if ((e.target as Element | null)?.closest?.(INTERACTIVE)) return;
      if (!e.repeat) openTerminal();
    } else if (k === 'q') {
      closeFocused();
    } else if (k === 'f') {
      toggleFull();
    } else if (k === '?') {
      openKeybinds();
    } else if (directions[k]) {
      moveFocus(...directions[k]);
    } else {
      return;
    }
    e.preventDefault();
  });

  links.forEach((a, i) =>
    a.addEventListener('click', (e) => {
      if (!on) return;
      e.preventDefault();
      go(i + 1);
    })
  );

  toggle?.addEventListener('click', () => {
    if (on) leave();
    else enter();
  });

  new ResizeObserver(() => {
    if (on) layout(cur);
  }).observe(wm);

  const sync = () => {
    if (toggle) toggle.hidden = !media.matches;
    if (!media.matches) leave(false);
  };
  media.addEventListener('change', sync);
  sync();

  if (readStore(MODE_KEY) === 'desktop') enter();

  instance = {
    enter,
    leave: () => leave(),
    isOn: () => on,
    current: () => cur,
    go,
    openWindow,
    closeFocused,
  };
  return instance;
}
