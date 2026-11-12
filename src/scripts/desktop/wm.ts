import { dwindle, type Rect } from './layout';
import { initScrollFocus } from '../scroll-focus';
import { revealEmails } from '../contact-actions';
import { createTerminal, isCommand, launchable, type Terminal } from './terminal';
import { createLock } from './lock';
import { createLauncher, type LauncherEntry } from './launcher';
import { latest, subscribe } from '../live/status';
import { markProjects } from '../live/projects';
import { fillWeek } from '../live/week';
import { fillCluster } from '../live/cluster';
import { ui } from '../../data/ui';
import { lang } from '../lang';

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
const OVERVIEW_COLS = 3;
const OVERVIEW_LABEL = 34;
// Hyprland's default special_scale_factor of 1 would cover the workspace below.
const SCRATCH_SCALE = 0.8;
const MODE_KEY = 'paulwtf:mode';
const SEEN_KEY = 'paulwtf:keybinds-seen';
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable]';
const QUALIFIES = '(min-width: 900px) and (pointer: fine)';

const NEEDS = ['week', 'cluster'] as const;
type Need = (typeof NEEDS)[number];
const has = (need: Need): boolean => !!latest()?.[need];
const usable = (t: HTMLTemplateElement): boolean => !t.dataset.needs || has(t.dataset.needs as Need);

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
  const strings = ui[lang];
  const media = matchMedia(QUALIFIES);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ms = (n: number) => (reduced.matches ? 0 : n);

  let on = false;
  let cur = 1;
  let spaces: Workspace[] = [];
  let keybindsShown = false;
  let clearTimer = 0;
  let overview = false;
  let overviewTimer = 0;
  let cells: HTMLButtonElement[] = [];
  let scratch: Workspace | null = null;
  let scratchOn = false;
  let scratchTimer = 0;
  let had = new Set<Need>();
  const overviewEl = document.createElement('div');
  overviewEl.className = 'wm-overview';
  overviewEl.setAttribute('role', 'group');
  overviewEl.setAttribute('aria-label', strings.desktop.overview);
  overviewEl.hidden = true;
  let stopScrollFocus: (() => void) | null = initScrollFocus();
  const lock = createLock();
  const terminals = new Map<HTMLElement, Terminal>();
  const launcher = createLauncher(launcherEntries, typedLine);

  const ws = (n: number): Workspace | undefined => spaces[n - 1];
  const active = (): Workspace | undefined => (scratchOn && scratch ? scratch : ws(cur));

  function makeWindow(content: Node, label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'wm-window is-pre';
    el.tabIndex = -1;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', label);
    el.append(content);
    revealEmails(el);
    markProjects(el);
    fillWeek(el);
    fillCluster(el);
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
    had = new Set(NEEDS.filter(has));
    for (const t of document.querySelectorAll<HTMLTemplateElement>('template[data-window]')) {
      const space = ws(Number(t.dataset.ws));
      if (!space || !usable(t)) continue;
      const el = fromTemplate(t);
      space.wins.push(el);
      space.layer.append(el);
    }
    cells = links.map((a, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'wm-cell';
      cell.dataset.ws = String(i + 1);
      const label = document.createElement('span');
      label.className = 'wm-cell-label';
      label.textContent = `${i + 1} ${a.querySelector('.label')?.textContent ?? ''}`;
      cell.append(label);
      cell.addEventListener('click', () => closeOverview(i + 1));
      return cell;
    });
    overviewEl.replaceChildren(...cells);
    overviewEl.hidden = true;
    const special = document.createElement('div');
    special.className = 'wm-layer wm-scratch is-parked';
    special.addEventListener('pointerdown', (e) => {
      if (e.target === special) hideScratch();
    });
    scratch = { layer: special, wins: [], focus: null, full: null };
    scratchOn = false;
    wm.replaceChildren(...layers, special, overviewEl);
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

  function layout(space: Workspace | undefined): void {
    if (!space) return;
    const { outer, gapIn } = outerArea();
    const w = outer.w * SCRATCH_SCALE;
    const h = outer.h * SCRATCH_SCALE;
    const area = space === scratch ? { x: outer.x + (outer.w - w) / 2, y: outer.y + (outer.h - h) / 2, w, h } : outer;
    const rects = dwindle(area, space.wins.length, gapIn);
    space.wins.forEach((el, i) => {
      const full = space.full === el;
      const r = full ? area : rects[i];
      el.classList.toggle('is-full', full);
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
    });
  }

  function overviewGrid(): { scale: number; at(i: number): { x: number; y: number } } {
    const { outer, gapIn } = outerArea();
    const rows = Math.ceil(WORKSPACES / OVERVIEW_COLS);
    const gap = gapIn * 2;
    const W = wm.clientWidth;
    const H = wm.clientHeight;
    const scale = Math.min(
      (outer.w - (OVERVIEW_COLS - 1) * gap) / (OVERVIEW_COLS * W),
      (outer.h - (rows - 1) * gap - rows * OVERVIEW_LABEL) / (rows * H)
    );
    const w = W * scale;
    const h = H * scale + OVERVIEW_LABEL;
    const left = (W - OVERVIEW_COLS * w - (OVERVIEW_COLS - 1) * gap) / 2;
    const top = (H - rows * h - (rows - 1) * gap) / 2;
    return {
      scale,
      at: (i) => ({ x: left + (i % OVERVIEW_COLS) * (w + gap), y: top + Math.floor(i / OVERVIEW_COLS) * (h + gap) }),
    };
  }

  // Every layer keeps its size and is scaled into its cell. Zoomed on a cell, that layer fills
  // the screen again and the others lie outside of it, so opening and closing is one zoom.
  function placeOverview(zoomOn: number | null): void {
    const grid = overviewGrid();
    const origin = zoomOn === null ? null : grid.at(zoomOn - 1);
    wm.style.setProperty('--overview-scale', String(grid.scale));
    wm.style.setProperty('--overview-label', `${OVERVIEW_LABEL}px`);
    spaces.forEach((space, i) => {
      const { x, y } = grid.at(i);
      space.layer.style.transform = origin
        ? `translate(${(x - origin.x) / grid.scale}px, ${(y - origin.y) / grid.scale}px)`
        : `translate(${x}px, ${y}px) scale(${grid.scale})`;
      const cell = cells[i];
      if (!cell) return;
      cell.style.left = `${x}px`;
      cell.style.top = `${y}px`;
      cell.style.width = `${wm.clientWidth * grid.scale}px`;
      cell.style.height = `${wm.clientHeight * grid.scale + OVERVIEW_LABEL}px`;
    });
  }

  function openOverview(): void {
    if (!on || overview) return;
    hideScratch();
    clearTimeout(overviewTimer);
    overview = true;
    spaces.forEach((space, i) => {
      layout(space);
      space.layer.style.transition = 'none';
      space.layer.classList.remove('is-parked');
      space.layer.inert = true;
      cells[i]?.classList.toggle('is-empty', space.wins.length === 0);
      space.layer.classList.toggle('is-empty', space.wins.length === 0);
      if (i + 1 === cur) cells[i]?.setAttribute('aria-current', 'true');
      else cells[i]?.removeAttribute('aria-current');
    });
    placeOverview(cur);
    void wm.offsetWidth;
    for (const space of spaces) space.layer.style.transition = '';
    placeOverview(null);
    wm.classList.add('is-overview');
    overviewEl.hidden = false;
    cells[cur - 1]?.focus({ preventScroll: true });
  }

  function closeOverview(n = cur): void {
    if (!overview || !ws(n)) return;
    overview = false;
    cur = n;
    wm.classList.remove('is-overview');
    overviewEl.hidden = true;
    for (const space of spaces) space.layer.inert = false;
    placeOverview(n);
    const settle = () => {
      if (overview) return;
      spaces.forEach((space, i) => {
        space.layer.style.transition = 'none';
        space.layer.style.transform = '';
        space.layer.classList.toggle('is-parked', i + 1 !== cur);
        space.layer.classList.remove('is-empty');
        void space.layer.offsetWidth;
        space.layer.style.transition = '';
      });
    };
    if (ms(SLIDE_MS) === 0) settle();
    else overviewTimer = window.setTimeout(settle, SLIDE_MS);
    const space = ws(cur);
    setFocus(space?.focus ?? space?.wins[0]);
    refreshBar();
  }

  function moveCell(dx: number, dy: number): void {
    const i = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) {
      cells[cur - 1]?.focus({ preventScroll: true });
      return;
    }
    const col = (i % OVERVIEW_COLS) + dx;
    const next = i + dx + dy * OVERVIEW_COLS;
    if (col < 0 || col >= OVERVIEW_COLS || !cells[next]) return;
    cells[next].focus({ preventScroll: true });
  }

  function findTerminal(): { win: HTMLElement; from: Workspace } | null {
    const here = ws(cur);
    const order = here ? [here, ...spaces.filter((space) => space !== here)] : spaces;
    for (const from of order) {
      const open = from.wins.filter((w) => terminals.has(w));
      const win = open.find((w) => w === from.focus) ?? open[open.length - 1];
      if (win) return { win, from };
    }
    return null;
  }

  function moveWindow(win: HTMLElement, from: Workspace, to: Workspace): void {
    const i = from.wins.indexOf(win);
    from.wins.splice(i, 1);
    if (from.full === win) from.full = null;
    if (from.focus === win) from.focus = from.wins[Math.max(0, i - 1)] ?? null;
    win.classList.remove('is-focus', 'is-full', 'is-pre');
    to.full = null;
    to.wins.push(win);
    to.layer.append(win);
    to.focus = win;
    layout(from);
    layout(to);
    refreshBar();
  }

  function showScratch(): void {
    if (!on || overview || scratchOn || !scratch) return;
    clearTimeout(scratchTimer);
    scratchOn = true;
    for (const w of ws(cur)?.wins ?? []) w.classList.remove('is-focus');
    for (const space of spaces) space.layer.inert = true;
    html.classList.add('scratch-on');

    const { layer } = scratch;
    layout(scratch);
    layer.style.transition = 'none';
    layer.style.transform = 'translateY(-100%)';
    layer.classList.remove('is-parked');
    void layer.offsetWidth;
    layer.style.transition = '';
    layer.style.transform = '';

    if (!scratch.wins.some((w) => terminals.has(w))) {
      const found = findTerminal();
      if (found) moveWindow(found.win, found.from, scratch);
      else openTerminal();
    }
    const win = scratch.focus ?? scratch.wins[0];
    setFocus(win);
    if (win) terminals.get(win)?.focus();
  }

  function hideScratch(): void {
    if (!scratchOn || !scratch) return;
    scratchOn = false;
    html.classList.remove('scratch-on');
    for (const space of spaces) space.layer.inert = false;
    const { layer } = scratch;
    layer.style.transform = 'translateY(-100%)';
    const park = () => {
      if (scratchOn) return;
      layer.classList.add('is-parked');
      layer.style.transform = '';
    };
    if (ms(SLIDE_MS) === 0) park();
    else scratchTimer = window.setTimeout(park, SLIDE_MS);
    if (document.activeElement instanceof HTMLElement && layer.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    const below = ws(cur);
    setFocus(below?.focus ?? below?.wins[0]);
  }

  function setFocus(el: HTMLElement | null | undefined, moveDom = true): void {
    const space = active();
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

    layout(space);
    popIn(space.wins, POP_DELAY);
    setFocus(space.focus ?? space.wins[0]);
    refreshBar();
    lock.arm();
  }

  function leave(remember = true): void {
    if (!on) return;
    on = false;
    overview = false;
    scratchOn = false;
    clearTimeout(overviewTimer);
    clearTimeout(scratchTimer);
    wm.classList.remove('is-overview');
    html.classList.remove('scratch-on');
    overviewEl.hidden = true;
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
    if (overview) {
      closeOverview(n);
      return;
    }
    hideScratch();
    const from = ws(cur);
    const to = ws(n);
    if (!on || n === cur || !from || !to) return;
    const dir = n > cur ? 1 : -1;
    const prev = cur;
    cur = n;

    layout(to);
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
    const space = active();
    if (!space) return;
    space.full = null;
    space.wins.push(el);
    space.layer.append(el);
    layout(space);
    popIn([el], 20);
    if (focus) setFocus(el);
    refreshBar();
  }

  function openPhoto(cat: string, focus = false): void {
    const t = document.querySelector<HTMLTemplateElement>(`template[data-cat="${CSS.escape(cat)}"]`);
    if (!on || !t) return;
    const open = active()?.wins.find((w) => w.dataset.cat === cat);
    if (open) {
      if (focus) setFocus(open);
      return;
    }
    const el = fromTemplate(t);
    el.dataset.cat = cat;
    add(el, focus);
  }

  function dataArrived(): void {
    if (!on) return;
    const fresh = NEEDS.filter((need) => !had.has(need) && has(need));
    if (fresh.length === 0) return;
    const order = [...document.querySelectorAll<HTMLTemplateElement>('template[data-window]')].map((t) => t.dataset.path);
    const rank = (path: string | undefined) => {
      const i = order.indexOf(path);
      return i < 0 ? Infinity : i;
    };
    for (const need of fresh) {
      had.add(need);
      for (const t of document.querySelectorAll<HTMLTemplateElement>(`template[data-window][data-needs="${need}"]`)) {
        const space = ws(Number(t.dataset.ws));
        if (!space) continue;
        const el = fromTemplate(t);
        const at = space.wins.findIndex((w) => rank(w.dataset.path) > rank(t.dataset.path));
        if (at < 0) {
          space.wins.push(el);
          space.layer.append(el);
        } else {
          space.layer.insertBefore(el, space.wins[at]);
          space.wins.splice(at, 0, el);
        }
        layout(space);
        popIn([el], 20);
      }
    }
    refreshBar();
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
    const space = active();
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
      layout(space);
    }
    setFocus(open);
  }

  function launcherEntries(): LauncherEntry[] {
    const kind = strings.launcher;
    const entries: LauncherEntry[] = links.map((a, i) => ({
      label: `${i + 1} ${a.querySelector('.label')?.textContent ?? ''}`,
      kind: kind.workspace,
      run: () => go(i + 1),
    }));
    for (const tpl of document.querySelectorAll<HTMLTemplateElement>('template[data-window]')) {
      if (!usable(tpl)) continue;
      entries.push({ label: tpl.dataset.label ?? '', detail: tpl.dataset.path, kind: kind.window, run: () => showWindow(tpl) });
    }
    for (const tpl of document.querySelectorAll<HTMLTemplateElement>('template[data-cat]')) {
      entries.push({
        label: tpl.dataset.label ?? '',
        detail: tpl.dataset.path,
        kind: kind.window,
        run: () => {
          go(Number(tpl.dataset.ws));
          openPhoto(tpl.dataset.cat ?? '', true);
        },
      });
    }
    const keybinds = document.querySelector<HTMLTemplateElement>('template[data-keybinds]');
    if (keybinds) {
      entries.push({ label: keybinds.dataset.label ?? '', detail: keybinds.dataset.path, kind: kind.window, run: openKeybinds });
    }
    for (const c of launchable) {
      entries.push({ label: c.usage, detail: c.description, kind: kind.command, run: () => runInTerminal(c.line, c.complete) });
    }
    entries.push(
      { label: kind.leave, kind: kind.action, run: () => leave() },
      { label: kind.lock, kind: kind.action, run: () => lock.now() }
    );
    return entries;
  }

  function typedLine(query: string): LauncherEntry | null {
    const words = query.trim().split(/\s+/);
    if (words.length < 2 || !isCommand(words[0])) return null;
    const line = words.join(' ');
    return { label: line, kind: strings.launcher.command, run: () => runInTerminal(line, true) };
  }

  function openKeybinds(): void {
    const open = active()?.wins.find((w) => w.dataset.keybinds !== undefined);
    if (open) setFocus(open);
    else {
      const kb = keybindsWindow();
      if (kb) add(kb);
    }
  }

  function closeWindow(el: HTMLElement): void {
    const space = [...spaces, ...(scratch ? [scratch] : [])].find((sp) => sp.wins.includes(el));
    if (!on || !space) return;
    const i = space.wins.indexOf(el);
    const wasFocus = space.focus === el;
    space.wins.splice(i, 1);
    terminals.delete(el);
    if (space.full === el) space.full = null;
    el.classList.remove('is-focus');
    el.classList.add('is-closing');
    setTimeout(() => el.remove(), ms(CLOSE_MS));
    layout(space);
    if (wasFocus) {
      space.focus = space.wins[Math.max(0, i - 1)] ?? null;
      if (space === active()) setFocus(space.focus);
    }
    if (space === scratch && space.wins.length === 0) hideScratch();
    refreshBar();
  }

  function closeFocused(): void {
    const el = active()?.focus;
    if (el) closeWindow(el);
  }

  function toggleFull(): void {
    const space = active();
    if (!space?.focus) return;
    space.full = space.full === space.focus ? null : space.focus;
    layout(space);
  }

  function center(el: HTMLElement): { x: number; y: number } {
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
  }

  function moveFocus(dx: number, dy: number): void {
    const space = active();
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
    } else if (k === 'tab') {
      if (e.shiftKey || (!overview && (e.target as Element | null)?.closest?.(INTERACTIVE))) return;
      if (overview) closeOverview();
      else openOverview();
    } else if (overview) {
      if (k === 'escape') closeOverview();
      else if (directions[k]) moveCell(...directions[k]);
      else if (k !== 'enter' || !e.shiftKey) return;
    } else if (k === 's') {
      if (scratchOn) hideScratch();
      else showScratch();
    } else if (k === 'escape') {
      if (scratchOn) hideScratch();
      else leave();
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
    if (!on) return;
    layout(scratch ?? undefined);
    if (!overview) {
      layout(ws(cur));
      return;
    }
    spaces.forEach(layout);
    placeOverview(null);
  }).observe(wm);

  const sync = () => {
    if (toggle) toggle.hidden = !media.matches;
    if (!media.matches) leave(false);
  };
  media.addEventListener('change', sync);
  sync();

  subscribe(dataArrived);
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
