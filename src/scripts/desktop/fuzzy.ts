const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const isLetter = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const isWordStart = (text: string, i: number) => !isLetter(text[i - 1]);

const MAX_GAP = 4;

function scattered(query: string, text: string, start: number): number | null {
  let total = 0;
  let from = start;
  let last = -2;
  for (const ch of query) {
    const i = text.indexOf(ch, from);
    if (i < 0 || (last >= 0 && i - from > MAX_GAP)) return null;
    total += 4 + (i === last + 1 ? 6 : 0) + (isWordStart(text, i) ? 8 : 0) - (i - from);
    last = i;
    from = i + 1;
  }
  return total - Math.min(start, 30);
}

function word(query: string, text: string): number | null {
  const at = text.indexOf(query);
  if (at >= 0) {
    const whole = isWordStart(text, at) && !isLetter(text[at + query.length]);
    return 100 + (isWordStart(text, at) ? 40 : 0) + (whole ? 10 : 0) - Math.min(at, 30);
  }
  let best: number | null = null;
  for (let i = text.indexOf(query[0]); i >= 0; i = text.indexOf(query[0], i + 1)) {
    const s = scattered(query, text, i);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

export function score(query: string, text: string): number | null {
  const hay = fold(text);
  let total = 0;
  for (const w of fold(query).split(/\s+/).filter(Boolean)) {
    const s = word(w, hay);
    if (s === null) return null;
    total += s;
  }
  return total;
}

export function rank<T>(query: string, items: T[], text: (item: T) => string): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(query, text(item)) }))
    .filter((r): r is { item: T; i: number; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
