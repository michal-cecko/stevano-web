import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://stevano.example',          // used for canonical + hreflang URLs
  i18n: {
    locales: ['en', 'sk', 'de', 'nl', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,           // en at "/", others at "/fr/", "/sk/" ...
    },
  },
});
