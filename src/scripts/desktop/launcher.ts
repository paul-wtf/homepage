import { rank } from './fuzzy';

export interface LauncherEntry {
  label: string;
  detail?: string;
  kind: string;
  run(): void;
}

export interface Launcher {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createLauncher(
  entries: () => LauncherEntry[],
  typed: (line: string) => LauncherEntry | null
): Launcher {
  const root = document.querySelector<HTMLElement>('[data-launcher]');
  const input = root?.querySelector<HTMLInputElement>('input');
  const list = root?.querySelector<HTMLElement>('[role="listbox"]');
  const empty = root?.querySelector<HTMLElement>('.launcher-empty');

  let all: LauncherEntry[] = [];
  let shown: LauncherEntry[] = [];
  let index = 0;
  let before: Element | null = null;

  function select(i: number): void {
    if (!list || !input) return;
    index = shown.length ? (i + shown.length) % shown.length : 0;
    Array.from(list.children).forEach((li, n) => {
      li.setAttribute('aria-selected', String(n === index));
      if (n === index) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
    if (!shown.length) input.removeAttribute('aria-activedescendant');
  }

  function render(): void {
    if (!list || !input) return;
    const query = input.value;
    const line = typed(query);
    shown = [...(line ? [line] : []), ...rank(query, all, (e) => `${e.label} ${e.detail ?? ''} ${e.kind}`)];
    list.replaceChildren(
      ...shown.map((entry, i) => {
        const li = document.createElement('li');
        li.id = `launcher-option-${i}`;
        li.setAttribute('role', 'option');
        const label = document.createElement('span');
        label.className = 'launcher-label';
        label.textContent = entry.label;
        const detail = document.createElement('span');
        detail.className = 'launcher-detail';
        detail.textContent = entry.detail ?? '';
        const kind = document.createElement('span');
        kind.className = 'launcher-kind';
        kind.textContent = entry.kind;
        li.append(label, detail, kind);
        li.addEventListener('pointermove', () => {
          if (index !== i) select(i);
        });
        li.addEventListener('click', () => pick(i));
        return li;
      })
    );
    if (empty) empty.hidden = shown.length > 0;
    list.scrollTop = 0;
    select(0);
  }

  function close(): void {
    if (!root || root.hidden) return;
    root.hidden = true;
    if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
    before = null;
  }

  function pick(i: number): void {
    const entry = shown[i];
    if (!entry) return;
    close();
    entry.run();
  }

  function open(): void {
    if (!root || !input || !root.hidden) return;
    before = document.activeElement;
    all = entries();
    input.value = '';
    root.hidden = false;
    render();
    input.focus({ preventScroll: true });
  }

  input?.addEventListener('input', render);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      if (e.isComposing) return;
      pick(index);
    } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) select(index + 1);
    else if (e.key === 'ArrowUp' || e.key === 'Tab') select(index - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  root?.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
    else if (e.target !== input) e.preventDefault();
  });

  return { open, close, isOpen: () => !!root && !root.hidden };
}
