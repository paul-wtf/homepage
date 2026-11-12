import { toLang, type Lang } from '../data/i18n';

export const lang: Lang = toLang(document.documentElement.lang);
