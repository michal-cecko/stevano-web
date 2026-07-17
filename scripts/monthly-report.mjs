#!/usr/bin/env node
// STEVANO monthly traffic report.
// Pulls the previous calendar month from Google Analytics (GA4 Data API) and
// Google Search Console, formats a plain-text summary and emails it via Resend.
// Runs unattended from .github/workflows/monthly-report.yml; also runnable by hand.
//
// Usage:
//   node scripts/monthly-report.mjs              report on the previous calendar month
//   node scripts/monthly-report.mjs --month 2026-06   report on a specific month
//   node scripts/monthly-report.mjs --dry        print the report, send no email
//
// Requires (from the environment or the project .env file):
//   GOOGLE_SERVICE_ACCOUNT_KEY  service-account JSON key, base64-encoded
//   GA4_PROPERTY_ID             numeric GA4 property id
//   GSC_SITE_URL                verified Search Console property, exactly as listed
//   RESEND_API_KEY              same key the contact form uses
//   REPORT_TO                   recipient(s), comma-separated
//   REPORT_FROM                 optional sender; falls back to CONTACT_FROM, then resend.dev

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JWT } from 'google-auth-library';
import { Resend } from 'resend';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
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

const REQUIRED = ['GOOGLE_SERVICE_ACCOUNT_KEY', 'GA4_PROPERTY_ID', 'GSC_SITE_URL'];
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
    label: first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

const { startDate, endDate, label } = monthRange(month);

// ---- formatting -------------------------------------------------------------
const num = (v) => Number(v || 0).toLocaleString('en-GB');
const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const dec = (v) => Number(v || 0).toFixed(1);

// Fixed-width list: "  1. /some/path          123 views"
function list(rows, unit) {
  if (!rows.length) return ['   (no data)'];
  const width = Math.min(40, Math.max(...rows.map((r) => r.name.length)));
  return rows.map((r, i) => {
    const name = r.name.length > width ? `${r.name.slice(0, width - 1)}…` : r.name.padEnd(width);
    return `  ${String(i + 1).padStart(2)}. ${name}  ${String(num(r.value)).padStart(6)} ${unit}`;
  });
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

  const [gaTotals, gaPages, gscTotals, gscQueries] = await Promise.all([
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
    post('Search Console', GSC, token, { startDate, endDate, dimensions: [] }),
    post('Search Console', GSC, token, { startDate, endDate, dimensions: ['query'], rowLimit: 5 }),
  ]);

  const [sessions, users, views] = gaTotals.rows?.[0]?.metricValues?.map((m) => m.value) ?? [];
  const pages = (gaPages.rows ?? []).map((r) => ({
    name: r.dimensionValues[0].value,
    value: r.metricValues[0].value,
  }));

  const gsc = gscTotals.rows?.[0] ?? {};
  const queries = (gscQueries.rows ?? [])
    .map((r) => ({ name: r.keys[0], value: r.clicks }))
    .sort((a, b) => b.value - a.value);

  const text = [
    `STEVANO — Monthly Website Report — ${label}`,
    `(${startDate} to ${endDate})`,
    '',
    'GOOGLE ANALYTICS (GA4)',
    `  Sessions:   ${num(sessions).padStart(8)}`,
    `  Users:      ${num(users).padStart(8)}`,
    `  Pageviews:  ${num(views).padStart(8)}`,
    '',
    '  Top pages:',
    ...list(pages, 'views'),
    '',
    'SEARCH CONSOLE',
    `  Clicks:        ${num(gsc.clicks).padStart(8)}`,
    `  Impressions:   ${num(gsc.impressions).padStart(8)}`,
    `  CTR:           ${pct(gsc.ctr).padStart(8)}`,
    `  Avg. position: ${dec(gsc.position).padStart(8)}`,
    '',
    '  Top queries:',
    ...list(queries, 'clicks'),
    '',
    `— generated automatically on ${new Date().toISOString().slice(0, 10)} —`,
  ].join('\n');

  if (DRY) {
    console.log(text);
    return;
  }

  const from = loadEnv('REPORT_FROM') || loadEnv('CONTACT_FROM') || 'STEVANO website <onboarding@resend.dev>';
  const to = env.REPORT_TO.split(',').map((s) => s.trim()).filter(Boolean);

  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `STEVANO — website report — ${label}`,
    text,
    html: `<pre style="font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#14171A;">${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>`,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);

  console.log(`Sent ${label} report to ${to.join(', ')} (id ${data?.id})`);
  console.log(`GA4: ${num(sessions)} sessions · GSC: ${num(gsc.clicks)} clicks`);
}

main().catch((err) => {
  console.error('Report failed:', err?.message || err);
  if (err?.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
