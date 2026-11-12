import { latest, subscribe, type Cluster, type ClusterNode } from './status';
import { ui } from '../../data/ui';
import { lang } from '../lang';

const t = ui[lang].cluster;
const live = ui[lang].live;
const locale = ui[lang].locale;
const GB = 1e9;
const TB = 1e12;

export function bytes(n: number): string {
  if (n >= TB - GB / 2) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n / TB)} TB`;
  const gb = n / GB;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: gb < 10 ? 1 : 0 }).format(gb)} GB`;
}

export function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  if (d > 0) return live.days(d);
  const h = Math.floor(s / 3600);
  return h > 0 ? live.hours(h) : live.minutes(Math.floor(s / 60));
}

export const celsius = (n: number): string => `${Math.round(n)} °C`;

export const share = (used: number, total: number): number =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((used / total) * 100))) : 0;

export function stats(c: Cluster): [string, string][] {
  const out: [string, string][] = [];
  if (c.nodes_total !== null) out.push([t.nodes, c.nodes_ready === null ? String(c.nodes_total) : `${c.nodes_ready}/${c.nodes_total}`]);
  if (c.pods !== null) out.push([t.pods, String(c.pods)]);
  if (c.workloads !== null) out.push([t.workloads, String(c.workloads)]);
  if (c.services !== null) out.push([t.services, String(c.services)]);
  if (c.kubernetes) out.push([t.kubernetes, [c.kubernetes.version, c.kubernetes.distribution].filter(Boolean).join(' · ')]);
  return out;
}

export function temps(c: Cluster): [string, string][] {
  const out: [string, string][] = [];
  if (c.cpu_temp_c !== null) out.push([t.cpu, celsius(c.cpu_temp_c)]);
  if (c.nvme_temp_c !== null) out.push([t.nvme, celsius(c.nvme_temp_c)]);
  return out;
}

export const storage = (used: number | null, total: number | null): [number, number] | null =>
  used !== null && total !== null ? [used, total] : null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function pairs(items: [string, string][]): HTMLDivElement[] {
  return items.map(([label, value]) => {
    const div = el('div');
    div.append(el('dt', label), el('dd', value));
    return div;
  });
}

function bar(used: number, total: number, label: string): HTMLSpanElement {
  const pct = share(used, total);
  const track = el('span', undefined, 'track');
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', label);
  const fill = el('span', undefined, 'bar');
  fill.style.width = `${pct}%`;
  if (pct >= 90) fill.dataset.level = 'high';
  track.append(fill);
  return track;
}

function row(n: ClusterNode): HTMLLIElement {
  const li = el('li');
  const dot = el('span', undefined, 'dot');
  if (n.ready !== null) {
    dot.dataset.ready = String(n.ready);
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', n.ready ? t.ready : t.notReady);
  }
  li.append(dot, el('span', n.name, 'name'));
  if (n.uptime_s !== null) li.append(el('span', t.up(uptime(n.uptime_s)), 'up'));
  const s = storage(n.storage_used, n.storage_total);
  if (s) {
    const [used, total] = [bytes(s[0]), bytes(s[1])];
    li.append(bar(s[0], s[1], t.storageOf(n.name, used, total)), el('span', `${used} / ${total}`, 'amount'));
  }
  return li;
}

function render(root: HTMLElement, c: Cluster): void {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-cluster-${name}]`);
  const summary = stats(c);
  const statsEl = part('stats');
  if (statsEl) {
    statsEl.replaceChildren(...pairs(summary));
    statsEl.hidden = summary.length === 0;
  }
  const nodes = part('nodes');
  if (nodes) {
    nodes.replaceChildren(...c.nodes.map(row));
    nodes.hidden = c.nodes.length === 0;
  }
  const total = part('total');
  const s = storage(c.storage_used, c.storage_total);
  if (total) {
    total.hidden = !s;
    if (s) {
      const [used, all] = [bytes(s[0]), bytes(s[1])];
      total.replaceChildren(el('span', t.total, 'label'), bar(s[0], s[1], `${t.total}: ${used} / ${all}`), el('span', `${used} / ${all}`, 'amount'));
    }
  }
  const tempsEl = part('temps');
  const heat = temps(c);
  if (tempsEl) {
    tempsEl.hidden = heat.length === 0;
    tempsEl.querySelector('dl')?.replaceChildren(...pairs(heat));
  }
}

export function fillCluster(scope: ParentNode = document): void {
  const c = latest()?.cluster;
  if (!c) return;
  for (const root of scope.querySelectorAll<HTMLElement>('[data-cluster]')) render(root, c);
}

subscribe(() => fillCluster());
