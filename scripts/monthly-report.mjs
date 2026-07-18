#!/usr/bin/env node
// STEVANO monthly traffic report.
// Pulls the previous calendar month from Google Analytics (GA4 Data API) and
// Google Search Console, formats a plain-text summary and emails it via Resend.
// Runs unattended from .github/workflows/monthly-report.yml; also runnable by hand.
//
// The report itself is in Slovak — it goes to the client, not to us.
//
// Usage:
//   node scripts/monthly-report.mjs              report on the previous calendar month
//   node scripts/monthly-report.mjs --month 2026-06   report on a specific month
//   node scripts/monthly-report.mjs --dry        print the report, send no email
//   node scripts/monthly-report.mjs --dry --html also write report-preview.html to eyeball the layout
//
// Requires (from the environment or the project .env file):
//   GOOGLE_SERVICE_ACCOUNT_KEY  service-account JSON key, base64-encoded
//   GA4_PROPERTY_ID             numeric GA4 property id
//   GSC_SITE_URL                verified Search Console property, exactly as listed
//   RESEND_API_KEY              same key the contact form uses
//   REPORT_TO                   recipient(s), comma-separated
//   REPORT_FROM                 optional sender; falls back to CONTACT_FROM, then resend.dev

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JWT } from 'google-auth-library';
import { Resend } from 'resend';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
// --sample skips the Google APIs and uses representative fixed data, so the
// exact report layout can be previewed (or emailed) without GA4/GSC credentials.
const SAMPLE = argv.includes('--sample');
const monthArg = argv.find((a) => a.startsWith('--month'));
let month = null;
if (monthArg) {
  const val = monthArg.includes('=') ? monthArg.split('=')[1] : argv[argv.indexOf(monthArg) + 1];
  if (!/^\d{4}-\d{2}$/.test(val || '')) { console.error('--month needs a YYYY-MM value'); process.exit(1); }
  month = val;
}

// ---- env --------------------------------------------------------------------
function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)\\s*$`));
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return null;
}

const REQUIRED = SAMPLE ? [] : ['GOOGLE_SERVICE_ACCOUNT_KEY', 'GA4_PROPERTY_ID', 'GSC_SITE_URL'];
if (!DRY) REQUIRED.push('RESEND_API_KEY', 'REPORT_TO');

const env = {};
const missing = [];
for (const name of REQUIRED) {
  const v = loadEnv(name);
  if (v) env[name] = v; else missing.push(name);
}
if (missing.length) {
  console.error(`Missing required env var(s): ${missing.join(', ')}`);
  console.error('Set them in the environment or the project .env file (see .env.example).');
  process.exit(1);
}

// ---- date range -------------------------------------------------------------
// Default: the previous calendar month, resolved in UTC so a CI run and a local
// run on the same day always report the same period.
function monthRange(ym) {
  let year, mon; // mon is 0-indexed
  if (ym) {
    [year, mon] = ym.split('-').map(Number);
    mon -= 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    mon = now.getUTCMonth() - 1;
    if (mon < 0) { mon = 11; year -= 1; }
  }
  const first = new Date(Date.UTC(year, mon, 1));
  const last = new Date(Date.UTC(year, mon + 1, 0)); // day 0 of next month = last day of this one
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    startDate: iso(first),
    endDate: iso(last),
    label: first.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

const { startDate, endDate, label } = monthRange(month);

// ---- formatting -------------------------------------------------------------
// The report goes to the client, who is Slovak and not technical: every metric
// is labelled in Slovak and carries a one-line plain-language explanation.
const num = (v) => Number(v || 0).toLocaleString('sk-SK');
// GA4 returns ISO country codes (SK, CZ, DE…); show the client Slovak country
// names. Unknown/"(not set)" codes fall back to whatever GA4 sent.
const countryNames = new Intl.DisplayNames(['sk'], { type: 'region' });
const countryName = (code) => {
  if (!code || code === '(not set)') return 'Neznáma krajina';
  try { return countryNames.of(code) || code; } catch { return code; }
};
const pct = (v) => `${(Number(v || 0) * 100).toLocaleString('sk-SK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const dec = (v) => Number(v || 0).toLocaleString('sk-SK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Brand palette — Graphite & Ice, matching the site.
const INK = '#0d1013', ICE = '#5BA8C9', BODY = '#14171A', MUTED = '#6b7280', LINE = '#e5e7eb';

const T = {
  sessions:    ['Návštevy', 'Koľkokrát niekto prišiel na web. Jedna návšteva môže zahŕňať viac stránok.'],
  users:       ['Návštevníci', 'Počet skutočných ľudí. Ak sa ten istý človek vráti viackrát, počíta sa raz.'],
  views:       ['Zobrazenia stránok', 'Koľko stránok si návštevníci spolu pozreli.'],
  clicks:      ['Kliknutia', 'Koľkokrát niekto klikol na web priamo vo výsledkoch vyhľadávania Google.'],
  impressions: ['Zobrazenia vo vyhľadávaní', 'Koľkokrát sa web ukázal vo výsledkoch Google — aj keď naň nikto neklikol.'],
  ctr:         ['Miera prekliku (CTR)', 'Podiel zobrazení, ktoré viedli ku kliknutiu. Vyššie číslo = lákavejší popis vo vyhľadávaní.'],
  position:    ['Priemerná pozícia', 'Priemerné poradie vo výsledkoch Google. Nižšie číslo je lepšie (1 = úplne hore).'],
};

// ---- plain-text part (fallback for clients that block HTML) ------------------
// Pads to the widest label so the column lines up whatever the Slovak wording is.
function textRows(pairs) {
  const w = Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([k, v]) => `  ${(k + ':').padEnd(w + 2)}${String(v).padStart(8)}`);
}

function textList(rows, unit) {
  if (!rows.length) return ['   (zatiaľ žiadne údaje)'];
  const width = Math.min(40, Math.max(...rows.map((r) => r.name.length)));
  return rows.map((r, i) => {
    const name = r.name.length > width ? `${r.name.slice(0, width - 1)}…` : r.name.padEnd(width);
    return `  ${String(i + 1).padStart(2)}. ${name}  ${String(num(r.value)).padStart(6)} ${unit}`;
  });
}

// ---- HTML part --------------------------------------------------------------
// Table-based with inline styles: the client reads mail in Apple Mail/iCloud,
// and Outlook ignores <style> blocks and modern layout entirely.
function metric(label, help, value) {
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${LINE};">
        <div style="font:600 22px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${INK};">${value}</div>
        <div style="font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${BODY};padding-top:3px;">${label}</div>
        <div style="font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MUTED};padding-top:2px;">${help}</div>
      </td>
    </tr>`;
}

function htmlList(rows, unit) {
  if (!rows.length) {
    return `<tr><td style="font:400 13px/1.5 -apple-system,sans-serif;color:${MUTED};padding:8px 0;">Zatiaľ žiadne údaje za toto obdobie.</td></tr>`;
  }
  return rows.map((r, i) => `
    <tr>
      <td style="font:400 13px/1.5 -apple-system,sans-serif;color:${MUTED};padding:7px 8px 7px 0;width:18px;">${i + 1}.</td>
      <td style="font:400 13px/1.5 -apple-system,sans-serif;color:${BODY};padding:7px 0;word-break:break-all;">${esc(r.name)}</td>
      <td style="font:600 13px/1.5 -apple-system,sans-serif;color:${INK};padding:7px 0 7px 12px;text-align:right;white-space:nowrap;">${num(r.value)} <span style="font-weight:400;color:${MUTED};">${unit}</span></td>
    </tr>`).join('');
}

function section(title, subtitle) {
  return `
    <tr><td style="padding:30px 0 4px;">
      <div style="font:600 11px/1.3 -apple-system,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${ICE};">${title}</div>
      <div style="font:400 12px/1.5 -apple-system,sans-serif;color:${MUTED};padding-top:4px;">${subtitle}</div>
    </td></tr>`;
}

// ---- API --------------------------------------------------------------------
// Both APIs are plain REST — google-auth-library only signs the service-account
// JWT and hands back a bearer token. (The `googleapis` SDK would do the same but
// weighs 200MB, and this repo's Dockerfile ships node_modules into the image.)
async function post(api, url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    // 403 here almost always means the service account was never granted access
    // in the GA4 property / Search Console property itself (see .env.example).
    throw new Error(`${api} returned ${res.status}: ${msg}`);
  }
  return data;
}

// ---- main -------------------------------------------------------------------
async function main() {
  let sessions, users, views, pages, countries, gsc, queries;

  if (SAMPLE) {
    // Representative fixed data — layout preview only, no Google APIs involved.
    sessions = '1842'; users = '1517'; views = '4630';
    pages = [
      { name: '/', value: '2104' },
      { name: '/galeria', value: '1187' },
      { name: '/kontakt', value: '643' },
      { name: '/o-nas', value: '412' },
      { name: '/cennik', value: '284' },
    ];
    countries = [
      { name: countryName('SK'), value: '1103' },
      { name: countryName('CZ'), value: '241' },
      { name: countryName('AT'), value: '87' },
      { name: countryName('DE'), value: '52' },
      { name: countryName('GB'), value: '34' },
    ];
    gsc = { clicks: 318, impressions: 9427, ctr: 0.0337, position: 12.4 };
    queries = [
      { name: 'stevano', value: 96 },
      { name: 'stevano ateliér', value: 41 },
      { name: 'svadobné fotenie', value: 28 },
      { name: 'fotograf stevano', value: 19 },
      { name: 'portrétne fotenie', value: 12 },
    ];
  } else {
    let key;
    try {
      key = JSON.parse(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8'));
    } catch {
      console.error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid base64-encoded JSON.');
      console.error('Encode the whole service-account key file: base64 -i key.json | pbcopy');
      process.exit(1);
    }

    // One credential, both APIs — the scopes ride on the same access token.
    const jwt = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
    });
    const { token } = await jwt.getAccessToken();

    const GA4 = `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`;
    const GSC = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_SITE_URL)}/searchAnalytics/query`;

    const [gaTotals, gaPages, gaCountries, gscTotals, gscQueries] = await Promise.all([
      post('GA4', GA4, token, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
      }),
      post('GA4', GA4, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
      post('GA4', GA4, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'countryId' }], // ISO code, translated to Slovak below
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 5,
      }),
      post('Search Console', GSC, token, { startDate, endDate, dimensions: [] }),
      post('Search Console', GSC, token, { startDate, endDate, dimensions: ['query'], rowLimit: 5 }),
    ]);

    [sessions, users, views] = gaTotals.rows?.[0]?.metricValues?.map((m) => m.value) ?? [];
    pages = (gaPages.rows ?? []).map((r) => ({
      name: r.dimensionValues[0].value,
      value: r.metricValues[0].value,
    }));
    countries = (gaCountries.rows ?? []).map((r) => ({
      name: countryName(r.dimensionValues[0].value),
      value: r.metricValues[0].value,
    }));

    gsc = gscTotals.rows?.[0] ?? {};
    queries = (gscQueries.rows ?? [])
      .map((r) => ({ name: r.keys[0], value: r.clicks }))
      .sort((a, b) => b.value - a.value);
  }

  const period = `${startDate.split('-').reverse().join('. ')} – ${endDate.split('-').reverse().join('. ')}`;
  const generated = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  const text = [
    `STEVANO — Mesačný prehľad webu — ${label}`,
    `Obdobie: ${period}`,
    '',
    'NÁVŠTEVNOSŤ WEBU (Google Analytics)',
    ...textRows([[T.sessions[0], num(sessions)], [T.users[0], num(users)], [T.views[0], num(views)]]),
    '',
    '  Najnavštevovanejšie stránky:',
    ...textList(pages, 'zobrazení'),
    '',
    '  Odkiaľ návštevníci prichádzajú (krajiny):',
    ...textList(countries, 'návštevníkov'),
    '',
    'VYHĽADÁVANIE NA GOOGLE (Search Console)',
    ...textRows([
      [T.clicks[0], num(gsc.clicks)], [T.impressions[0], num(gsc.impressions)],
      [T.ctr[0], pct(gsc.ctr)], [T.position[0], dec(gsc.position)],
    ]),
    '',
    '  Najčastejšie vyhľadávané výrazy:',
    ...textList(queries, 'kliknutí'),
    '',
    'ČO ZNAMENAJÚ ČÍSLA',
    ...Object.values(T).map(([k, v]) => `  ${k} — ${v}`),
    '',
    `Automaticky generované ${generated}. Zdroj: Google Analytics 4 a Google Search Console.`,
  ].join('\n');

  // Full document with an explicit charset: the Slovak diacritics turn to
  // mojibake in any client that falls back to Latin-1 without it.
  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>STEVANO — prehľad webu za ${label}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:24px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;">

   <tr><td style="background:${INK};padding:26px 28px;">
     <div style="font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.22em;color:#ffffff;">STEVANO</div>
     <div style="font:400 13px/1.4 -apple-system,sans-serif;color:${ICE};padding-top:9px;">Mesačný prehľad webu</div>
     <div style="font:600 20px/1.3 -apple-system,sans-serif;color:#ffffff;padding-top:2px;text-transform:capitalize;">${label}</div>
     <div style="font:400 12px/1.4 -apple-system,sans-serif;color:#8b949e;padding-top:6px;">${period}</div>
   </td></tr>

   <tr><td style="padding:0 28px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
     ${section('Návštevnosť webu', 'Koľko ľudí navštívilo web a čo si prezerali. Zdroj: Google Analytics.')}
     ${metric(T.sessions[0], T.sessions[1], num(sessions))}
     ${metric(T.users[0], T.users[1], num(users))}
     ${metric(T.views[0], T.views[1], num(views))}
    </table>

    <div style="font:600 13px/1.4 -apple-system,sans-serif;color:${BODY};padding:22px 0 2px;">Najnavštevovanejšie stránky</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlList(pages, 'zobrazení')}</table>

    <div style="font:600 13px/1.4 -apple-system,sans-serif;color:${BODY};padding:22px 0 2px;">Odkiaľ návštevníci prichádzajú</div>
    <div style="font:400 12px/1.5 -apple-system,sans-serif;color:${MUTED};padding-bottom:4px;">Krajiny, z ktorých sa ľudia pripájali na web (podľa polohy pripojenia).</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlList(countries, 'návštevníkov')}</table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
     ${section('Vyhľadávanie na Google', 'Ako si web vedie vo výsledkoch vyhľadávania. Zdroj: Google Search Console.')}
     ${metric(T.clicks[0], T.clicks[1], num(gsc.clicks))}
     ${metric(T.impressions[0], T.impressions[1], num(gsc.impressions))}
     ${metric(T.ctr[0], T.ctr[1], pct(gsc.ctr))}
     ${metric(T.position[0], T.position[1], dec(gsc.position))}
    </table>

    <div style="font:600 13px/1.4 -apple-system,sans-serif;color:${BODY};padding:22px 0 2px;">Najčastejšie vyhľadávané výrazy</div>
    <div style="font:400 12px/1.5 -apple-system,sans-serif;color:${MUTED};padding-bottom:4px;">Slová, ktoré ľudia zadali do Google a následne uvideli váš web.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlList(queries, 'kliknutí')}</table>
   </td></tr>

   <tr><td style="background:#fafbfb;border-top:1px solid ${LINE};padding:16px 28px;">
     <div style="font:400 11px/1.6 -apple-system,sans-serif;color:${MUTED};">
       Automaticky generované ${generated}. Zdroj údajov: Google Analytics 4 a Google Search Console.
     </div>
   </td></tr>

  </table>
 </td></tr>
</table>
</body>
</html>`;

  if (DRY) {
    console.log(text);
    if (argv.includes('--html')) writeFileSync(join(ROOT, 'report-preview.html'), html);
    return;
  }

  const from = loadEnv('REPORT_FROM') || loadEnv('CONTACT_FROM') || 'STEVANO <onboarding@resend.dev>';
  const to = env.REPORT_TO.split(',').map((s) => s.trim()).filter(Boolean);

  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `STEVANO — prehľad webu za ${label}`,
    text,
    html,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);

  console.log(`Sent ${label} report to ${to.join(', ')} (id ${data?.id})`);
  console.log(`GA4: ${num(sessions)} návštev · GSC: ${num(gsc.clicks)} kliknutí`);
}

main().catch((err) => {
  console.error('Report failed:', err?.message || err);
  if (err?.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
