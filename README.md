# STEVANO — website

Multilingual marketing site for **STEVANO** — premium commercial cleaning
(hotels, restaurants, offices and commercial spaces). Built from the *Immersive*
design direction: dark, full-bleed photography, Graphite & Ice palette, ice-blue
accent.

## Tech stack

**[Astro](https://astro.build)** — component-based, builds to **static HTML** with
built-in i18n routing. Ships ~0 JavaScript to the browser (only a few tiny inline
scripts for the menu, language dropdown, preloader and contact form). Chosen over
a heavier framework because this is a low-traffic brochure site and the goal was
minimum RAM.

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Framework      | Astro (static output, component reuse)            |
| i18n           | Astro i18n routing — 5 languages: EN · SK · DE · NL · FR |
| Styles         | One global CSS file                               |
| Fonts          | Self-hosted woff2 (Inter + Space Grotesk subsets) |
| Images         | Local JPGs in `public/img` (placeholder — replace)|
| Contact form   | Zero-backend `mailto:` (upgrade path below)       |

### URLs

- `/` → English (default, no prefix)
- `/fr/`, `/sk/`, `/de/`, `/nl/` → other languages
- `/services/<key>` and `/<lang>/services/<key>` → service detail pages
  (`hotel`, `rest`, `apt`, `kitchen`, `machine`, `office`)

Every page is pre-rendered per language with translated text, correct
`<html lang>`, canonical + `hreflang` alternates baked in.

### RAM footprint when served

The build output (`dist/`) is plain static files.

- **Static hosting (recommended): ~0 RAM.** Cloudflare Pages / Netlify / GitHub
  Pages — free, global CDN, no server to run.
- **Self-hosted:** Caddy (~15–30 MB idle, auto-HTTPS — see `Caddyfile`) or nginx
  (~3–10 MB). Both just serve flat files.

Astro/Node are only needed at **build** time, never at serve time.

## Project structure

```
stevano-web/
├── astro.config.mjs        # i18n config (locales, default = en at "/")
├── src/
│   ├── pages/              # routes (thin wrappers)
│   │   ├── index.astro                     -> /
│   │   ├── [lang]/index.astro              -> /fr/ /sk/ /de/ /nl/
│   │   ├── services/[service].astro        -> /services/<key>
│   │   └── [lang]/services/[service].astro -> /<lang>/services/<key>
│   ├── layouts/Base.astro  # <head>, hreflang, Header + Footer + Preloader
│   ├── components/
│   │   ├── Header.astro, Footer.astro, Logo.astro
│   │   ├── LangSwitcher.astro, Preloader.astro
│   │   ├── ClientsMarquee.astro, ServiceCard.astro
│   │   └── pages/Home.astro, pages/ServiceDetail.astro
│   ├── i18n/data.ts        # ALL translations (EN/SK/DE/NL/FR) + t() helper
│   ├── data/               # images map+tint, clients, service icons
│   └── styles/global.css   # all styles
└── public/                 # fonts/, img/ (+ favicon) — copied as-is
```

## Develop

```bash
npm install        # once
npm run dev        # live dev server at http://localhost:4321
```

## Build & preview

```bash
npm run build      # generates static site into dist/
npm run preview    # serves dist/ locally to check the production build
```

## Deploy

- **Cloudflare Pages / Netlify:** build command `npm run build`, output dir `dist`.
- **GitHub Pages:** publish the `dist/` folder.
- **Self-host with Caddy:** `npm run build`, set your domain in `Caddyfile`, `caddy run`.

## Editing content

- **Text & translations:** `src/i18n/data.ts` — one entry per key, in each of the
  5 language blocks. Add a language by adding a block + listing it in
  `astro.config.mjs` and the `LOCALES` array.
- **Photos:** replace files in `public/img` keeping the same names
  (`hero.jpg`, `lobby.jpg`, …). Currently royalty-free placeholders.
- **Services:** catalogue in `src/i18n/data.ts` (`STV_SERVICES` /
  `STV_SERVICE_META`); copy in the `svc.*` keys; icons in
  `src/data/serviceIcons.ts`.
- **Company details / partner logos:** `src/components/pages/Home.astro`
  (contact block) and `src/data/clients.ts`.

## Scroll animations

Minimal, dependency-free reveal-on-scroll (an AOS-equivalent, ~25 lines):
`src/components/ScrollReveal.astro` uses an `IntersectionObserver` to fade/slide
elements in as they enter the viewport. To animate any element, add `data-reveal`
(optionally `data-reveal="left"` / `"right"`); stagger a group with
`style="--reveal-delay:120ms"`. It respects `prefers-reduced-motion` and shows
everything immediately if JS is unavailable (styles in `global.css`).

## Image lightbox

Gallery tiles (home portfolio + service-detail gallery) open in a lightbox with
prev/next/close, a counter, keyboard (←/→/Esc) and backdrop-click — see
`src/components/Lightbox.astro`. To make any element open it, add `data-lb`,
`data-src="<image url>"`, and an optional `data-lb-group="<name>"` to scope
prev/next within one gallery.

## Contact form

Submitting opens the visitor's email client pre-filled (no backend). To collect
submissions server-side without running one, point the form at a hosted endpoint
(**Formspree**, **Netlify Forms**, **Cloudflare**) and remove the `data-mailto`
handler in `src/components/pages/Home.astro`.

---

Placeholder imagery and partner logos to be replaced with real assets before launch.
