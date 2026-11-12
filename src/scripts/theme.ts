export const FLAVORS = ['latte', 'frappe', 'macchiato', 'mocha'] as const;
export type Flavor = (typeof FLAVORS)[number];

export const THEME_EVENT = 'paulwtf:theme';
const KEY = 'paulwtf:theme';
const DEFAULT: Flavor = 'mocha';

export const isFlavor = (value: unknown): value is Flavor => FLAVORS.includes(value as Flavor);

export function currentFlavor(): Flavor {
  const flavor = document.documentElement.dataset.theme;
  return isFlavor(flavor) ? flavor : DEFAULT;
}

export function syncThemeColor(): void {
  const mantle = getComputedStyle(document.documentElement).getPropertyValue('--mantle').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mantle);
}

export function setFlavor(flavor: Flavor): void {
  if (flavor === DEFAULT) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = flavor;
  try {
    localStorage.setItem(KEY, flavor);
  } catch {}
  syncThemeColor();
  window.dispatchEvent(new Event(THEME_EVENT));
}
