import { readFileSync } from 'node:fs';
import type { Lang } from './i18n';
import { til } from './til';

export interface TilEntry {
  date: string;
  text: string | { de: string; en?: string } | { de?: string; en: string };
  link?: string;
}

export interface TilItem {
  date: string;
  html: string;
  link: string | null;
  host: string | null;
}

const SHOWN = 12;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TOKEN = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\((https:\/\/[^\s()]+)\)|\*([^*\s](?:[^*]*[^*\s])?)\*/g;
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function inlineMarkdown(src: string): string {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += escape(src.slice(last, m.index));
    if (m[1] !== undefined) out += `<code>${escape(m[1])}</code>`;
    else if (m[2] !== undefined) out += `<strong>${inlineMarkdown(m[2])}</strong>`;
    else if (m[3] !== undefined) {
      out += `<a href="${escape(m[4])}" target="_blank" rel="noopener noreferrer">${inlineMarkdown(m[3])}</a>`;
    } else out += `<em>${inlineMarkdown(m[5])}</em>`;
    last = m.index + m[0].length;
  }
  return out + escape(src.slice(last));
}

function validDate(v: unknown): v is string {
  const m = typeof v === 'string' ? DATE.exec(v) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function textFor(text: unknown, lang: Lang): string | null {
  if (filled(text)) return text;
  if (!isObj(text)) return null;
  const other = lang === 'de' ? 'en' : 'de';
  return filled(text[lang]) ? text[lang] : filled(text[other]) ? text[other] : null;
}

function item(v: unknown, lang: Lang, i: number): TilItem {
  const fail = (why: string): never => {
    throw new Error(`TIL entry ${i + 1}: ${why}`);
  };
  if (!isObj(v)) return fail('not an object');
  if (!validDate(v.date)) return fail('date must be YYYY-MM-DD');
  const text = textFor(v.text, lang) ?? fail('text is empty');
  let link: URL | null = null;
  if (v.link !== undefined) {
    try {
      link = new URL(String(v.link));
    } catch {
      link = null;
    }
    if (link?.protocol !== 'https:') return fail('link must be an https URL');
  }
  return {
    date: v.date,
    html: inlineMarkdown(text.trim()),
    link: link ? String(v.link) : null,
    host: link ? link.hostname.replace(/^www\./, '') : null,
  };
}

export function tilItems(entries: unknown[], lang: Lang): TilItem[] {
  return entries
    .map((e, i) => item(e, lang, i))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, SHOWN);
}

export function loadTil(lang: Lang): TilItem[] {
  const file = process.env.TIL_FILE;
  const entries: unknown = file ? JSON.parse(readFileSync(file, 'utf8')) : til;
  if (!Array.isArray(entries)) throw new Error(`TIL entries in ${file} must be a list`);
  return tilItems(entries, lang);
}
