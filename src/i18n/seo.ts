// Centralized SEO data + structured-data builders. Single source of truth so
// every locale is handled uniformly across canonical/hreflang/OG/JSON-LD.
import { getAbsoluteLocaleUrl } from 'astro:i18n';
import { t, STV_SERVICE_META } from './data';
import { STEVANO_IMG } from '../data/images';

// Unique, keyword-rich home <title> per locale (~50–60 chars).
export const SEO_HOME_TITLE: Record<string, string> = {
  en: 'Premium Commercial Cleaning in Belgium | STEVANO',
  sk: 'Prémiové komerčné upratovanie | STEVANO',
  de: 'Premium-Gewerbereinigung in Belgien | STEVANO',
  nl: 'Premium commerciële schoonmaak in België | STEVANO',
  fr: 'Nettoyage commercial haut de gamme en Belgique | STEVANO',
};

// hreflang annotations for the <head>. Multiple hreflang values may target the
// same locale URL (valid per Google), so we serve both generic and Belgium
// regional variants for the Dutch/French markets. x-default is added separately.
export const HREFLANG_ALTERNATES: { hreflang: string; locale: string }[] = [
  { hreflang: 'en', locale: 'en' },
  { hreflang: 'sk', locale: 'sk' },
  { hreflang: 'de', locale: 'de' },
  { hreflang: 'nl', locale: 'nl' },
  { hreflang: 'nl-BE', locale: 'nl' },
  { hreflang: 'fr', locale: 'fr' },
  { hreflang: 'fr-BE', locale: 'fr' },
];

// og:locale uses language_TERRITORY. Belgium is the primary nl/fr market.
export const OG_LOCALE: Record<string, string> = {
  en: 'en_GB',
  sk: 'sk_SK',
  de: 'de_DE',
  nl: 'nl_BE',
  fr: 'fr_BE',
};

// Static business facts (mirrors the contact section in Home.astro).
const BUSINESS = {
  name: 'STEVANO s.r.o.',
  telephone: '+421905368960',
  email: 'infostevano@gmail.eu',
  street: 'Dolné Rudiny 2956/8',
  city: 'Žilina',
  postalCode: '010 01',
  country: 'SK',
};

const abs = (site: URL | undefined, path: string) =>
  site ? new URL(path, site).href : path;

// LocalBusiness / CleaningService schema for the home page.
export function buildLocalBusinessJsonLd(lang: string, site: URL | undefined) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CleaningService',
    '@id': abs(site, '/#business'),
    name: BUSINESS.name,
    url: getAbsoluteLocaleUrl(lang, ''),
    logo: abs(site, '/img/favicon.svg'),
    image: abs(site, STEVANO_IMG.hero),
    description: t(lang, 'about.lead'),
    telephone: BUSINESS.telephone,
    email: BUSINESS.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.street,
      addressLocality: BUSINESS.city,
      postalCode: BUSINESS.postalCode,
      addressCountry: BUSINESS.country,
    },
    areaServed: [
      { '@type': 'Country', name: 'Belgium' },
      { '@type': 'Place', name: 'Europe' },
    ],
    availableLanguage: ['en', 'sk', 'de', 'nl', 'fr'],
  };
}

// Service schema for a service detail page.
export function buildServiceJsonLd(lang: string, service: string, site: URL | undefined) {
  const meta = STV_SERVICE_META[service];
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: t(lang, meta.key),
    name: t(lang, meta.key),
    description: t(lang, meta.key + '.d'),
    url: getAbsoluteLocaleUrl(lang, `services/${service}`),
    image: abs(site, STEVANO_IMG[meta.img[0]]),
    areaServed: [
      { '@type': 'Country', name: 'Belgium' },
      { '@type': 'Place', name: 'Europe' },
    ],
    provider: {
      '@type': 'CleaningService',
      '@id': abs(site, '/#business'),
      name: BUSINESS.name,
    },
  };
}

// Breadcrumb: Home › Services › <service>.
export function buildBreadcrumbJsonLd(lang: string, service: string) {
  const meta = STV_SERVICE_META[service];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t(lang, 'nav.home'),
        item: getAbsoluteLocaleUrl(lang, ''),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t(lang, 'nav.services'),
        item: getAbsoluteLocaleUrl(lang, '') + '#services',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: t(lang, meta.key),
        item: getAbsoluteLocaleUrl(lang, `services/${service}`),
      },
    ],
  };
}
