#!/usr/bin/env node
// STEVANO image generator.
// Generates the site's photography from scripts/image-briefs.json via the
// Google Gemini API, then post-processes each result to the exact pixel size
// the site expects (center-cropped to aspect, downscaled, JPEG) with macOS `sips`.
//
// Usage:
//   node scripts/generate-images.mjs                 generate only missing images
//   node scripts/generate-images.mjs --force         regenerate everything
//   node scripts/generate-images.mjs --only a,b,c    regenerate just these keys (implies force)
//   node scripts/generate-images.mjs --dry           print composed prompts, call nothing
//   node scripts/generate-images.mjs --keep-raw      also keep the raw PNGs in scripts/out/raw
//
// Requires GEMINI_API_KEY (read from the environment or the project .env file).
// Models per brief entry: "gemini-2.5-flash-image" (default) or "imagen-4.0-generate-001".

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_IMG = join(ROOT, 'public', 'img');
const RAW_DIR = join(__dirname, 'out', 'raw');
const BRIEFS = join(__dirname, 'image-briefs.json');

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const FORCE = argv.includes('--force');
const KEEP_RAW = argv.includes('--keep-raw');
const onlyArg = argv.find((a) => a.startsWith('--only'));
let only = null;
if (onlyArg) {
  const val = onlyArg.includes('=') ? onlyArg.split('=')[1] : argv[argv.indexOf(onlyArg) + 1];
  only = new Set((val || '').split(',').map((s) => s.trim()).filter(Boolean));
  if (!only.size) { console.error('--only needs a comma-separated list of keys'); process.exit(1); }
}

// ---- key --------------------------------------------------------------------
function loadEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return null;
}

// ---- API --------------------------------------------------------------------
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(model, prompt, aspect, key) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error?.message || JSON.stringify(json)}`);
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const reason = json?.candidates?.[0]?.finishReason || 'no image returned';
    const txt = parts.find((p) => p.text)?.text || '';
    throw new Error(`no image (${reason}) ${txt}`.trim());
  }
  return Buffer.from(img.inlineData.data, 'base64');
}

async function callImagen(model, prompt, aspect, key) {
  const res = await fetch(`${API}/${model}:predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: aspect, sampleImageSize: '2K', personGeneration: 'dont_allow' },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error?.message || JSON.stringify(json)}`);
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error(`no image returned: ${JSON.stringify(json).slice(0, 200)}`);
  return Buffer.from(b64, 'base64');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(model, prompt, aspect, key) {
  const isImagen = model.startsWith('imagen');
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return isImagen ? await callImagen(model, prompt, aspect, key) : await callGemini(model, prompt, aspect, key);
    } catch (err) {
      lastErr = err;
      const retriable = /HTTP (429|5\d\d)|fetch failed|network|ECONN|timeout/i.test(err.message);
      if (!retriable || attempt === 4) throw err;
      const wait = 2000 * attempt;
      console.log(`      retry ${attempt}/3 after ${wait}ms (${err.message.slice(0, 80)})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// ---- sips post-processing ---------------------------------------------------
function sips(args) { return execFileSync('sips', args, { stdio: ['ignore', 'pipe', 'pipe'] }); }

function dims(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
  const w = +(out.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = +(out.match(/pixelHeight:\s*(\d+)/)?.[1]);
  return { w, h };
}

// Center-crop to the target aspect, downscale (never upscale) to target size, write JPEG.
function postProcess(rawPath, outPath, tw, th, quality) {
  const { w: sw, h: sh } = dims(rawPath);
  const ta = tw / th;
  let cw = sw, ch = sh;
  if (sw / sh > ta) cw = Math.round(sh * ta); else ch = Math.round(sw / ta); // crop the long side
  sips(['-c', String(ch), String(cw), rawPath]); // sips crop order is HEIGHT then WIDTH, centered
  const fw = Math.min(tw, cw); // don't upscale past what the model produced
  const fh = Math.round(fw / ta);
  sips(['-z', String(fh), String(fw), rawPath]); // resize order is HEIGHT then WIDTH
  sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), rawPath, '--out', outPath]);
}

// ---- run --------------------------------------------------------------------
async function main() {
  const brief = JSON.parse(readFileSync(BRIEFS, 'utf8'));
  const d = brief.defaults;
  let images = brief.images;
  if (only) {
    images = images.filter((im) => only.has(im.key));
    const missing = [...only].filter((k) => !images.find((im) => im.key === k));
    if (missing.length) { console.error(`unknown keys: ${missing.join(', ')}`); process.exit(1); }
  }

  const key = DRY ? 'dry-run' : loadEnvKey();
  if (!key) {
    console.error('\n  GEMINI_API_KEY not found. Add it to .env:\n    GEMINI_API_KEY=AIza...\n  Get a key at https://aistudio.google.com/apikey\n');
    process.exit(1);
  }

  mkdirSync(OUT_IMG, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });

  const forceThis = FORCE || !!only;
  let made = 0, skipped = 0, failed = [];

  for (const im of images) {
    const model = im.model || d.model;
    const aspect = im.aspect || d.aspect;
    const tw = im.width || d.width, th = im.height || d.height;
    const quality = im.quality || d.quality;
    const outPath = join(OUT_IMG, im.file);
    const prompt = `${im.style || brief.style} ${im.prompt} ${brief.negative}`;

    if (DRY) { console.log(`\n[${im.key}] -> ${im.file} (${model}, ${aspect}, ${tw}x${th})\n${prompt}`); continue; }
    if (!forceThis && existsSync(outPath)) { console.log(`= skip ${im.file} (exists)`); skipped++; continue; }

    process.stdout.write(`> ${im.key.padEnd(20)} ${model.replace('-generate-001', '')} ${aspect} ... `);
    try {
      const buf = await generate(model, prompt, aspect, key);
      const rawPath = join(RAW_DIR, `${im.key}.png`);
      writeFileSync(rawPath, buf);
      postProcess(rawPath, outPath, tw, th, quality);
      if (!KEEP_RAW) rmSync(rawPath, { force: true });
      const kb = Math.round(dims(outPath) && Buffer.byteLength(readFileSync(outPath)) / 1024);
      console.log(`ok (${kb} KB)`);
      made++;
      await sleep(1500); // gentle on rate limits
    } catch (err) {
      console.log(`FAIL ${err.message}`);
      failed.push(im.key);
    }
  }

  if (DRY) return;
  console.log(`\nDone. ${made} generated, ${skipped} skipped${failed.length ? `, ${failed.length} failed: ${failed.join(', ')}` : ''}.`);
  if (failed.length) { console.log(`Retry with: node scripts/generate-images.mjs --only ${failed.join(',')}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
