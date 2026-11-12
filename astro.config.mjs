import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://paul.wtf',
  output: 'static',
  trailingSlash: 'never',
  build: {
    assets: '_astro',
    inlineStylesheets: 'auto'
  },
  compressHTML: true,
  i18n: {
    locales: ['de', 'en'],
    defaultLocale: 'de'
  },
  integrations: [
    sitemap({
      filter: (page) => !/\/404\/?$/.test(page),
      i18n: { defaultLocale: 'de', locales: { de: 'de', en: 'en' } }
    })
  ]
});
