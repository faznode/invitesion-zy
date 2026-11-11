#!/usr/bin/env node
// rea-har-smoke.mjs — REA verification (new instructions Step 0.3, network-capture route): record a body-less HAR of
// ONE page on our OWN running instance with the playwright-core that ships inside the pinned REA package, strip
// cookies and auth headers, then inspect it offline with `rea inspect-web-network-capture` (whole capture + record 0).
// Own instance only: competitor HARs are inspected only when a human visitor saved them (playbook §2 step 5).
// REA never fetches the URLs inside a HAR (docs/web-network-captures.md).
//
//   source /vercel/share/work/tools/env.sh
//   "$REA_NODE" invitation-research/_tools/capture/rea-har-smoke.mjs --url http://127.0.0.1:3100/i/budi-sari/budi-hartono
//
// HAR + full Evidence → $INVITESION_PRIVATE_DIR/rea-smoke/har-own/ (never committed).
// Compact summary (exit codes, durations, Evidence IDs, counts; no bodies, no header values) → raw/_setup/rea-smoke-har-own.json.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESEARCH = join(HERE, '..', '..');
const NODE24 = process.env.REA_NODE ?? process.execPath;
const REA = process.env.REA_BIN;
const CDP = (process.env.CDP_HTTP ?? 'http://127.0.0.1:9222').replace('localhost', '127.0.0.1');
const PRIVATE = process.env.INVITESION_PRIVATE_DIR ?? join(RESEARCH, '_private');
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const SENSITIVE_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-clerk-[\w-]*|x-middleware-[\w-]*)$/i;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const url = args.url ? new URL(args.url) : null;
if (!REA || !url || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  console.error('usage: source /vercel/share/work/tools/env.sh; "$REA_NODE" rea-har-smoke.mjs --url http://127.0.0.1:3100/i/<slug>/<guest>  (own instance only)');
  process.exit(2);
}
const outDir = join(PRIVATE, 'rea-smoke', 'har-own');
mkdirSync(outDir, { recursive: true });
const harPath = join(outDir, 'session.har');

// rea-agents depends on playwright-core, so the HAR recorder adds no new package to the toolchain.
const pwEntry = join(dirname(REA), '..', '..', 'playwright-core', 'index.mjs');
const { chromium } = await import(pathToFileURL(pwEntry).href);
const pwVersion = JSON.parse(readFileSync(join(dirname(pwEntry), 'package.json'), 'utf8')).version;

let browser;
let browserMode = 'launch';
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
} catch (error) {
  browserMode = `connectOverCDP (launch failed: ${String(error.message).split('\n')[0].slice(0, 120)})`;
  browser = await chromium.connectOverCDP(CDP);
}
const context = await browser.newContext({
  recordHar: { path: harPath, content: 'omit', mode: 'full' },
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
  userAgent: ANDROID_UA, locale: 'id-ID', timezoneId: 'Asia/Jakarta',
});
const page = await context.newPage();
const started = Date.now();
const response = await page.goto(args.url, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(3000);
for (let n = 0; n < 4; n += 1) { await page.mouse.wheel(0, 800); await page.waitForTimeout(700); }
const visitMs = Date.now() - started;
await context.close();
await browser.close();

const har = JSON.parse(readFileSync(harPath, 'utf8'));
let stripped = 0;
for (const entry of har.log.entries) {
  for (const side of [entry.request, entry.response]) {
    const before = side.headers.length;
    side.headers = side.headers.filter((h) => !SENSITIVE_HEADER.test(h.name));
    stripped += before - side.headers.length;
    if (side.cookies?.length) { stripped += side.cookies.length; side.cookies = []; }
  }
}
// REA validates HAR 1.2 strictly (entry `time` must be >= 0); Playwright writes time/status -1 for requests that never
// completed (e.g. DNS failure). Drop those entries for admission and keep a record of what they were.
const recorded = har.log.entries.length;
const failed = har.log.entries.filter((e) => !(Number.isFinite(e.time) && e.time >= 0));
har.log.entries = har.log.entries.filter((e) => Number.isFinite(e.time) && e.time >= 0);
const failedRequests = Object.entries(failed.reduce((acc, e) => {
  const u = new URL(e.request.url);
  const key = `${u.host}${u.pathname}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {})).map(([request, attempts]) => ({ request, attempts }));
const sanitized = JSON.stringify(har);
writeFileSync(harPath, sanitized);

function rea(name, argv) {
  const t0 = Date.now();
  const run = spawnSync(NODE24, [REA, ...argv, '--json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 120000 });
  writeFileSync(join(outDir, `${name}.json`), run.stdout || '');
  let json = null;
  try { json = JSON.parse(run.stdout); } catch { /* recorded as parsed:false */ }
  const nr = json?.normalized_result && typeof json.normalized_result === 'object' ? json.normalized_result : {};
  const arrays = Object.fromEntries(Object.entries(nr).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  return {
    command: `rea ${argv.join(' ').replaceAll(outDir, '$INVITESION_PRIVATE_DIR/rea-smoke/har-own')} --json`, exit: run.status, ms: Date.now() - t0,
    parsed: json !== null, evidence_id: json?.evidence_id ?? null, resultKeys: Object.keys(nr).slice(0, 25), arrayCounts: arrays,
    limitations: Array.isArray(json?.limitations) ? json.limitations.length : null, stderr: run.status === 0 ? undefined : (run.stderr || '').trim().slice(0, 300),
  };
}
const steps = [
  rea('inspect-har', ['inspect-web-network-capture', harPath, 'har']),
  rea('inspect-har-record-0', ['inspect-web-network-capture', harPath, 'har', '--record', '0']),
];

const summary = {
  label: 'har-own', url: args.url, own: true, observedAt: new Date().toISOString(),
  reaVersion: spawnSync(NODE24, [REA, '--version'], { encoding: 'utf8' }).stdout.trim(), node: spawnSync(NODE24, ['-v'], { encoding: 'utf8' }).stdout.trim(),
  recorder: { tool: `playwright-core ${pwVersion} (bundled with rea-agents)`, browserMode, emulation: '412x915 @2.625, isMobile, hasTouch, Android Chrome UA, id-ID, Asia/Jakarta' },
  har: {
    recordedEntries: recorded, admittedEntries: har.log.entries.length, mainStatus: response?.status() ?? null, visitMs, content: 'omit (no bodies)',
    strippedHeadersOrCookies: stripped, droppedNeverCompleted: failedRequests, sha256: createHash('sha256').update(sanitized).digest('hex'),
  },
  privateEvidenceDir: '$INVITESION_PRIVATE_DIR/rea-smoke/har-own/',
  steps,
};
mkdirSync(join(RESEARCH, 'raw', '_setup'), { recursive: true });
writeFileSync(join(RESEARCH, 'raw', '_setup', 'rea-smoke-har-own.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ label: summary.label, entries: `${summary.har.admittedEntries}/${recorded}`, browserMode, steps: steps.map((s) => `${s.command.split(' ')[1]}${s.command.includes('--record') ? '#record0' : ''}:${s.exit}:${s.ms}ms`) }));
