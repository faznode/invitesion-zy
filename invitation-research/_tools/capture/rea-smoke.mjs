#!/usr/bin/env node
// rea-smoke.mjs — REA verification (new instructions Step 0.3): prove the pinned REA CLI works end to end on ONE
// public page, using only REA commands for page inspection, network capture and JS bundle analysis.
//
//   node rea-smoke.mjs --label own-guest --url http://127.0.0.1:3100/i/budi-sari/budi-hartono --own
//   node rea-smoke.mjs --label viding-home --url https://viding.co/
//
// Sequence: doctor → list-browser-targets → capture-browser-scenario (connect mode on a fresh CDP target: goto,
// settle, PageDown scrolls, network/console events, final URL + screenshot) → inspect-web-page → analyze-web-bundle
// → capture-web-screenshot. One navigation; no clicks, forms or repeated loads (R1). robots.txt is honoured (R8).
// Full Evidence → $INVITESION_PRIVATE_DIR/rea-smoke/<label>/ (never committed).
// Compact summary (exit codes, durations, Evidence IDs, counts; no page copy) → raw/_setup/rea-smoke-<label>.json.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { robotsStatusVerdict, robotsUnreachable, robotsVerdict } from './robots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESEARCH = join(HERE, '..', '..');
const NODE24 = process.env.REA_NODE ?? process.execPath;
const REA = process.env.REA_BIN;
const CDP = (process.env.CDP_HTTP ?? 'http://127.0.0.1:9222').replace('localhost', '127.0.0.1');
const PRIVATE = process.env.INVITESION_PRIVATE_DIR ?? join(RESEARCH, '_private');
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
if (!REA || !args.label || !args.url) {
  console.error('usage: REA_BIN=… node rea-smoke.mjs --label <name> --url <https://…> [--own]  (source /vercel/share/work/tools/env.sh first)');
  process.exit(2);
}
const outDir = join(PRIVATE, 'rea-smoke', args.label);
mkdirSync(outDir, { recursive: true });

function rea(name, argv, timeout = 300000) {
  const started = Date.now();
  const run = spawnSync(NODE24, [REA, ...argv, '--format', 'json'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout });
  const ms = Date.now() - started;
  writeFileSync(join(outDir, `${name}.json`), run.stdout || '');
  if (run.stderr) writeFileSync(join(outDir, `${name}.stderr.txt`), run.stderr);
  let json = null;
  try { json = JSON.parse(run.stdout); } catch { /* recorded as parse failure */ }
  return { name, exit: run.status, ms, json, stderr: (run.stderr || '').trim().slice(0, 300), command: `rea ${argv.join(' ')} --format json` };
}

const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).slice(0, 25) : null);
const count = (v) => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : null);
function digest(step) {
  const j = step.json ?? {};
  const nr = j.normalized_result ?? j.result ?? {};
  return {
    command: step.command.replace(/[0-9A-F]{32}/g, '<TARGET_ID>'), exit: step.exit, ms: step.ms, parsed: step.json !== null,
    evidence_id: j.evidence_id ?? j.evidenceId ?? null, status: j.status ?? nr.status ?? nr.completeness?.status ?? null,
    topKeys: keysOf(j), resultKeys: keysOf(nr), stderr: step.exit === 0 ? undefined : step.stderr,
  };
}

const cdpTarget = async () => (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const url = new URL(args.url);
let robots = { allowed: true, note: 'own instance' };
if (!args.own) {
  const res = await fetch(`${url.origin}/robots.txt`, { headers: { 'user-agent': ANDROID_UA }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  robots = res ? (robotsStatusVerdict(res.status) ?? robotsVerdict(await res.text(), url.pathname + url.search)) : robotsUnreachable('network');
  if (!robots.allowed) { console.log(JSON.stringify({ label: args.label, skipped: 'robots.txt disallows', robots })); process.exit(0); }
  await sleep(1500);
}

const steps = [];
steps.push(rea('doctor', ['doctor'], 60000));
const target = await cdpTarget();
steps.push(rea('list-browser-targets', ['list-browser-targets', CDP], 60000));

const scenario = {
  browser: { mode: 'connect', cdp_endpoint: CDP, target_id: target.id },
  start_url: { url: args.url },
  environment: { viewport: { width: 412, height: 915, device_scale_factor: 2.625 }, locale: 'id-ID', timezone: 'Asia/Jakarta', reduced_motion: 'no-preference' },
  actions: [
    { step_id: 'settle', action: 'wait_for_timeout', duration_ms: 3000 },
    ...[1, 2, 3, 4].flatMap((n) => [
      { step_id: `scroll-${n}`, action: 'press', locator: { kind: 'css', selector: 'body' }, key: 'PageDown', timeout_ms: 8000 },
      { step_id: `pause-${n}`, action: 'wait_for_timeout', duration_ms: 700 },
    ]),
  ],
  capture: { at_end: ['url', 'screenshot'], events: ['network', 'console', 'page-errors'] },
};
const scenarioPath = join(outDir, 'scenario-input.json');
writeFileSync(scenarioPath, JSON.stringify(scenario, null, 1));
steps.push(rea('capture-browser-scenario', ['capture-browser-scenario', scenarioPath], 180000));
steps.push(rea('inspect-web-page', ['inspect-web-page', CDP, target.id, '--observation-ms', '1500'], 180000));
steps.push(rea('analyze-web-bundle', ['analyze-web-bundle', CDP, target.id], 360000));
steps.push(rea('capture-web-screenshot', ['capture-web-screenshot', CDP, target.id], 60000));
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});

const version = spawnSync(NODE24, [REA, '--version'], { encoding: 'utf8' }).stdout.trim();
const summary = {
  label: args.label, url: args.own ? args.url : `${url.origin}${url.pathname}`, own: !!args.own, robots,
  observedAt: new Date().toISOString(), reaVersion: version, node: spawnSync(NODE24, ['-v'], { encoding: 'utf8' }).stdout.trim(),
  privateEvidenceDir: `$INVITESION_PRIVATE_DIR/rea-smoke/${args.label}/`,
  steps: steps.map(digest),
};
mkdirSync(join(RESEARCH, 'raw', '_setup'), { recursive: true });
writeFileSync(join(RESEARCH, 'raw', '_setup', `rea-smoke-${args.label}.json`), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ label: args.label, steps: summary.steps.map((s) => `${s.command.split(' ')[1]}:${s.exit}:${s.ms}ms`) }));
