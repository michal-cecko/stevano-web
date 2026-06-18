import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://stevano.example',          // used for canonical + hreflang URLs
  // Pages stay prerendered/static; only routes marked `prerender = false`
  // (the /api/contact endpoint) run on-demand on the Node server.
  adapter: node({ mode: 'standalone' }),
  i18n: {
    locales: ['en', 'sk', 'de', 'nl', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,           // en at "/", others at "/fr/", "/sk/" ...
    },
  },
});
