import { latest, subscribe, type Week } from './status';
import { ui } from '../../data/ui';
import { lang } from '../lang';

const t = ui[lang].week;
const LINKHOP = 'https://linkhop.paul.wtf/';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function artists(w: Week): HTMLLIElement[] {
  const top = Math.max(1, ...w.artists.map((a) => a.count));
  return w.artists.map((a) => {
    const li = el('li');
    if (a.image) {
      const img = el('img');
      img.src = a.image;
      img.alt = '';
      img.width = 28;
      img.height = 28;
      img.loading = 'lazy';
      li.append(img);
    } else {
      li.append(el('span', undefined, 'noimg'));
    }
    const bar = el('span', undefined, 'bar');
    bar.style.width = `${Math.round((a.count / top) * 100)}%`;
    const track = el('span', undefined, 'track');
    track.append(bar);
    li.append(el('span', a.name, 'name'), track, el('span', String(a.count), 'count'));
    return li;
  });
}

function grid(w: Week): Node[] {
  const top = Math.max(0, ...w.grid.flat());
  const nodes: Node[] = [];
  w.grid.forEach((row, d) => {
    nodes.push(el('span', t.days[d], 'day'));
    for (const n of row) {
      const cell = el('span', undefined, 'cell');
      cell.dataset.level = String(n && top ? Math.ceil((n / top) * 4) : 0);
      nodes.push(cell);
    }
  });
  return nodes;
}

function tracks(w: Week): HTMLLIElement[] {
  return w.tracks.map((tr) => {
    const li = el('li');
    const a = el('a');
    a.href = `${LINKHOP}?q=${encodeURIComponent(`${tr.artist} ${tr.track}`)}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', t.trackLabel(tr.track, tr.artist));
    a.append(el('span', tr.track, 'name'), el('span', tr.artist, 'artist'));
    li.append(a, el('span', String(tr.count), 'count'));
    return li;
  });
}

function render(root: HTMLElement, w: Week): void {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-week-${name}]`);
  const total = part('total');
  if (total) total.textContent = t.total(w.listens, Math.round(w.seconds / 3600));
  part('artists')?.replaceChildren(...artists(w));
  part('grid')?.replaceChildren(...grid(w));
  part('tracks')?.replaceChildren(...tracks(w));
  const link = root.querySelector<HTMLAnchorElement>('a[data-week-link]');
  if (link) link.href = w.url;
}

export function fillWeek(scope: ParentNode = document): void {
  const w = latest()?.week;
  if (!w) return;
  for (const root of scope.querySelectorAll<HTMLElement>('[data-week]')) render(root, w);
}

subscribe(() => fillWeek());
