import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://stevano.eu',               // used for canonical + hreflang URLs
  // Pages stay prerendered/static; only routes marked `prerender = false`
  // (the /api/contact endpoint) run on-demand on the Node server.
  adapter: node({ mode: 'standalone' }),
  integrations: [
    // Generates sitemap-index.xml + sitemap-0.xml with per-URL hreflang alternates.
    // Emits one (generic) hreflang per locale; the regional variants (nl-BE, fr-BE)
    // are added in the page <head> (src/layouts/Base.astro), the authoritative set.
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', sk: 'sk', de: 'de', nl: 'nl', fr: 'fr' },
      },
    }),
  ],
  i18n: {
    locales: ['en', 'sk', 'de', 'nl', 'fr'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,           // en at "/", others at "/fr/", "/sk/" ...
    },
  },
});
