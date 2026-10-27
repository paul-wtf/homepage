export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function dwindle(area: Rect, n: number, gapIn: number): Rect[] {
  if (n <= 0) return [];
  if (n === 1) return [area];
  let first: Rect;
  let rest: Rect;
  if (area.w >= area.h) {
    const w = (area.w - gapIn) / 2;
    first = { x: area.x, y: area.y, w, h: area.h };
    rest = { x: area.x + w + gapIn, y: area.y, w: area.w - w - gapIn, h: area.h };
  } else {
    const h = (area.h - gapIn) / 2;
    first = { x: area.x, y: area.y, w: area.w, h };
    rest = { x: area.x, y: area.y + h + gapIn, w: area.w, h: area.h - h - gapIn };
  }
  return [first, ...dwindle(rest, n - 1, gapIn)];
}
