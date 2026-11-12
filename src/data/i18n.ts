export const LANGS = ['de', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export type Localized<T> = Record<Lang, T>;

export const DEFAULT_LANG: Lang = 'de';

export const toLang = (value: string | null | undefined): Lang => LANGS.find((l) => l === value) ?? DEFAULT_LANG;

export function localizedPath(path: string, lang: Lang): string {
  const prefixes = LANGS.filter((l) => l !== DEFAULT_LANG).join('|');
  const bare = path.replace(new RegExp(`^/(${prefixes})(?=/|$)`), '') || '/';
  if (lang === DEFAULT_LANG) return bare;
  return bare === '/' ? `/${lang}` : `/${lang}${bare}`;
}
