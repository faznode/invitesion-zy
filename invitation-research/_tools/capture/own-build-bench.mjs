#!/usr/bin/env node
// own-build-bench.mjs — RQ-OWN-02: several builds of the own guest page measured on ONE host in ONE session with
// interleaved Lighthouse runs, so build differences are not confounded with host differences (s13's problem).
//
//   source /vercel/share/work/tools/env.sh
//   node invitation-research/_tools/capture/own-build-bench.mjs --out /vercel/share/work/own02 --rounds 6 \
//     --arm 22ed99e=http://127.0.0.1:3111/i/budi-sari/budi-hartono \
//     --arm 9bbd813=http://127.0.0.1:3112/i/budi-sari/budi-hartono \
//     --arm s23r=http://127.0.0.1:3113/i/budi-sari/budi-hartono [--profile v1-412]
//   node invitation-research/_tools/capture/own-build-bench.mjs --merge merged.json run-1/runs.json run-2/runs.json
//
// A long batch can exceed a 10-minute tool limit: run complete squares (rounds = arm count) as separate invocations
// and --merge their runs.json files; the merged comparison uses every successful run of every input.
// Lighthouse arguments come from capture-profile.mjs (`lighthouseArgs`, default profile v1-412: 412 x 915 @ 2.625,
// simulated Slow 4G and 4x CPU) with capture.mjs's Android user agent, so each run matches the Lighthouse block of the
// stored C-INV captures. The runs are still a separate population: no REA scenario, no capture rows, no queue entry.
// Order: round r runs the arms rotated by r (A B C, B C A, C A B, ...); with rounds a multiple of the arm count every
// arm takes every position equally often. Before round 1 each URL is fetched once and must answer 200 (warm-up).
// Per run: scores, FCP / LCP / SI / TBT / CLS / TTI, bytes, requests, document bytes, benchmarkIndex, warnings.
// Comparison: medians and ranges per arm, and an exact two-sided Mann-Whitney U test per metric against the first arm
// (all rank permutations enumerated; with 6 vs 6 runs the smallest possible p is 0.0022). Nothing else may run on the
// host meanwhile (builds, tests, browser review). Writes runs.json, runs.csv and the raw reports to --out.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getProfile, lighthouseArgs } from './capture-profile.mjs';

/** Same string as `ANDROID_UA` in capture.mjs (C-INV captures); kept literal because capture.mjs runs on import. */
export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';

export const METRICS = Object.freeze([
  ['performance', 'score'], ['fcpMs', 'first-contentful-paint'], ['lcpMs', 'largest-contentful-paint'],
  ['siMs', 'speed-index'], ['tbtMs', 'total-blocking-time'], ['cls', 'cumulative-layout-shift'],
  ['ttiMs', 'interactive'], ['totalBytes', 'total-byte-weight'],
]);

export function rotate(items, round) {
  const k = ((round % items.length) + items.length) % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return { n: 0, median: null, min: null, max: null };
  return { n: v.length, median: median(v), min: Math.min(...v), max: Math.max(...v) };
}

/** Mid-ranks of the pooled sample (ties share their average rank). */
function midRanks(pooled) {
  const order = pooled.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(pooled.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = rank;
    i = j + 1;
  }
  return ranks;
}

/** Largest pooled sample whose assignment counts stay exact in a double: C(50, 25) ≈ 1.3e14 < 2^53. */
const MAX_POOLED = 50;

/**
 * Exact two-sided Mann-Whitney U test over every assignment of the pooled mid-ranks to the first sample. The
 * assignments are counted per rank sum by dynamic programming (mid-ranks doubled to integers) rather than enumerated,
 * so the distribution is the same exact one, ties included, while merged invocations (12 + 12 runs, s27) stay cheap.
 * Returns U for x, the p-value (share of assignments at least as far from the null mean as observed) and the number
 * of assignments, C(n1 + n2, n1). Limited to 50 pooled values.
 */
export function mannWhitneyExact(x, y) {
  const a = x.filter(Number.isFinite);
  const b = y.filter(Number.isFinite);
  if (a.length === 0 || b.length === 0) return { u: null, p: null, assignments: 0 };
  if (a.length + b.length > MAX_POOLED) throw new Error(`mannWhitneyExact: more than ${MAX_POOLED} pooled values`);
  const doubled = midRanks([...a, ...b]).map((rank) => Math.round(rank * 2));
  const n1 = a.length;
  const maxSum = doubled.reduce((s, r) => s + r, 0);
  // ways[k][s]: assignments of k pooled values to the first sample whose doubled rank sum is s (each value used once).
  const ways = Array.from({ length: n1 + 1 }, () => new Float64Array(maxSum + 1));
  ways[0][0] = 1;
  doubled.forEach((rank, index) => {
    for (let k = Math.min(index + 1, n1); k >= 1; k -= 1) {
      const from = ways[k - 1];
      const to = ways[k];
      for (let s = maxSum - rank; s >= 0; s -= 1) if (from[s]) to[s + rank] += from[s];
    }
  });
  const uOf = (doubledSum) => doubledSum / 2 - (n1 * (n1 + 1)) / 2;
  const observed = uOf(doubled.slice(0, n1).reduce((s, r) => s + r, 0));
  const nullMean = (n1 * b.length) / 2;
  const distance = Math.abs(observed - nullMean);
  let extreme = 0;
  let total = 0;
  ways[n1].forEach((count, sum) => {
    if (!count) return;
    total += count;
    if (Math.abs(uOf(sum) - nullMean) >= distance - 1e-9) extreme += count;
  });
  return { u: observed, p: extreme / total, assignments: total };
}

/** The per-run record kept from one Lighthouse report. */
export function extractRun(report) {
  const audit = (id) => report.audits?.[id];
  const run = {};
  for (const [key, id] of METRICS) {
    run[key] = key === 'performance'
      ? (report.categories?.performance?.score ?? null)
      : (audit(id)?.numericValue ?? null);
  }
  const summary = audit('resource-summary')?.details?.items ?? [];
  const byType = Object.fromEntries(summary.map((i) => [i.resourceType, { requests: i.requestCount, bytes: i.transferSize }]));
  run.requests = byType.total?.requests ?? null;
  run.documentBytes = byType.document?.bytes ?? null;
  run.scriptBytes = byType.script?.bytes ?? null;
  run.benchmarkIndex = report.environment?.benchmarkIndex ?? null;
  run.lighthouseVersion = report.lighthouseVersion ?? null;
  run.finalUrl = report.finalDisplayedUrl ?? report.finalUrl ?? null;
  run.warnings = (report.runWarnings ?? []).map((w) => String(w).slice(0, 160));
  run.runtimeError = report.runtimeError?.code ?? null;
  return run;
}

/** Medians, ranges and exact Mann-Whitney tests against the first arm, over the successful runs given. */
export function compare(armLabels, runs) {
  const good = runs.filter((r) => r.ok);
  const byArm = Object.fromEntries(armLabels.map((label) => [label, good.filter((r) => r.arm === label)]));
  const summary = {};
  for (const label of armLabels) {
    summary[label] = { runs: byArm[label].length, benchmarkIndex: summarize(byArm[label].map((r) => r.benchmarkIndex)) };
    for (const [key] of [...METRICS, ['documentBytes'], ['scriptBytes'], ['requests']]) {
      summary[label][key] = summarize(byArm[label].map((r) => r[key]));
    }
  }
  const reference = armLabels[0];
  const tests = {};
  for (const label of armLabels.slice(1)) {
    tests[`${label} vs ${reference}`] = Object.fromEntries(METRICS.map(([key]) => {
      const mw = mannWhitneyExact(byArm[label].map((r) => r[key]), byArm[reference].map((r) => r[key]));
      const a = summary[label][key].median;
      const b = summary[reference][key].median;
      return [key, { medianDifference: a === null || b === null ? null : a - b, ...mw }];
    }));
  }
  return { summary, tests, failed: runs.length - good.length };
}

function printComparison(armLabels, { summary, tests }) {
  for (const label of armLabels) {
    const s = summary[label];
    console.log(`${label.padEnd(8)} n=${s.runs} perf ${s.performance.median} LCP ${Math.round(s.lcpMs.median)} `
      + `[${Math.round(s.lcpMs.min)}–${Math.round(s.lcpMs.max)}] FCP ${Math.round(s.fcpMs.median)} TBT ${Math.round(s.tbtMs.median)} `
      + `bytes ${s.totalBytes.median} BI ${s.benchmarkIndex.median} [${s.benchmarkIndex.min}–${s.benchmarkIndex.max}]`);
  }
  for (const [pair, metrics] of Object.entries(tests)) {
    console.log(`${pair}: ${Object.entries(metrics).map(([k, t]) => `${k} Δ${t.medianDifference === null ? '?' : Math.round(t.medianDifference * 1000) / 1000} p=${t.p === null ? '?' : t.p.toFixed(4)}`).join('; ')}`);
  }
}

/** `--merge OUT IN...`: one comparison over the runs of several invocations with the same arms (e.g. two 3-round squares). */
function merge(outPath, inputs) {
  const sets = inputs.map((path) => JSON.parse(readFileSync(path, 'utf8')));
  const labels = sets[0].arms.map((a) => a.label);
  for (const set of sets) {
    if (JSON.stringify(set.arms.map((a) => a.label)) !== JSON.stringify(labels)) throw new Error(`arms differ in ${inputs[sets.indexOf(set)]}`);
  }
  const runs = sets.flatMap((set, i) => set.runs.map((r) => ({ ...r, invocation: i + 1 })));
  const comparison = compare(labels, runs);
  const result = { tool: 'own-build-bench.mjs --merge', generatedAt: new Date().toISOString(), inputs, profile: sets[0].profile,
    userAgent: sets[0].userAgent, lighthouse: sets[0].lighthouse, arms: sets[0].arms, warmup: sets.map((s) => s.warmup), ...comparison, runs };
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  printComparison(labels, comparison);
}

function parseArgs(argv) {
  const opts = { arms: [], rounds: 6, profile: 'v1-412', out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--arm') {
      const value = argv[++i] ?? '';
      const eq = value.indexOf('=');
      if (eq < 1) throw new Error(`--arm needs label=url, got "${value}"`);
      opts.arms.push({ label: value.slice(0, eq), url: value.slice(eq + 1) });
    } else if (flag === '--rounds') opts.rounds = Number(argv[++i]);
    else if (flag === '--profile') opts.profile = argv[++i];
    else if (flag === '--out') opts.out = argv[++i];
    else throw new Error(`unknown argument ${flag}`);
  }
  if (opts.arms.length < 2 || !opts.out || !Number.isInteger(opts.rounds) || opts.rounds < 3) {
    throw new Error('usage: --out DIR --rounds N (>= 3) --arm label=url --arm label=url [...] [--profile v1-412]');
  }
  return opts;
}

const csvCell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const lighthouse = process.env.LH_BIN;
  const chrome = process.env.CHROME_PATH;
  if (!lighthouse || !chrome) { console.error('LH_BIN and CHROME_PATH must be set (source env.sh)'); process.exit(2); }
  const profile = getProfile(opts.profile);
  mkdirSync(opts.out, { recursive: true });

  const warmup = [];
  for (const arm of opts.arms) {
    const res = await fetch(arm.url, { headers: { 'user-agent': ANDROID_UA } });
    const body = await res.arrayBuffer();
    warmup.push({ label: arm.label, status: res.status, bytes: body.byteLength });
    if (res.status !== 200) { console.error(`warm-up: ${arm.label} answered ${res.status}`); process.exit(3); }
  }
  console.log(`warm-up: ${warmup.map((w) => `${w.label} ${w.status} ${w.bytes} B`).join('; ')}`);

  const runs = [];
  for (let round = 0; round < opts.rounds; round += 1) {
    const order = rotate(opts.arms, round);
    for (let position = 0; position < order.length; position += 1) {
      const arm = order[position];
      const file = join(opts.out, `r${round + 1}-p${position + 1}-${arm.label}.report.json`);
      const startedAt = new Date().toISOString();
      const proc = spawnSync(lighthouse, lighthouseArgs(profile, { url: arm.url, outPath: file, userAgent: ANDROID_UA }),
        { encoding: 'utf8', env: { ...process.env, CHROME_PATH: chrome }, timeout: 240000 });
      const base = { round: round + 1, position: position + 1, arm: arm.label, url: arm.url, startedAt };
      if (proc.status !== 0 || !existsSync(file)) {
        runs.push({ ...base, ok: false, error: (proc.stderr || '').slice(-300) });
        console.log(`r${round + 1} p${position + 1} ${arm.label}: ERROR`);
        continue;
      }
      const raw = readFileSync(file);
      const run = { ...base, ok: true, sha256: createHash('sha256').update(raw).digest('hex'), ...extractRun(JSON.parse(raw)) };
      if (run.runtimeError) run.ok = false;
      runs.push(run);
      console.log(`r${round + 1} p${position + 1} ${arm.label.padEnd(8)} perf ${run.performance} LCP ${Math.round(run.lcpMs)} ms `
        + `FCP ${Math.round(run.fcpMs)} TBT ${Math.round(run.tbtMs)} bytes ${run.totalBytes} BI ${run.benchmarkIndex}`);
    }
  }

  const labels = opts.arms.map((a) => a.label);
  const comparison = compare(labels, runs);
  const result = {
    tool: 'own-build-bench.mjs', generatedAt: new Date().toISOString(), profile, userAgent: ANDROID_UA,
    lighthouse: runs.find((r) => r.ok)?.lighthouseVersion ?? null, rounds: opts.rounds, arms: opts.arms, warmup,
    ...comparison, runs,
  };
  writeFileSync(join(opts.out, 'runs.json'), `${JSON.stringify(result, null, 2)}\n`);
  const columns = ['round', 'position', 'arm', 'ok', 'startedAt', ...METRICS.map(([k]) => k), 'requests', 'documentBytes',
    'scriptBytes', 'benchmarkIndex', 'lighthouseVersion', 'warnings', 'sha256'];
  writeFileSync(join(opts.out, 'runs.csv'), `${[columns.join(','), ...runs.map((r) => columns
    .map((c) => csvCell(Array.isArray(r[c]) ? r[c].join(' | ') : r[c])).join(','))].join('\n')}\n`);

  printComparison(labels, comparison);
  if (result.failed > 0) { console.error(`${result.failed} run(s) failed`); process.exit(1); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  try {
    if (argv[0] === '--merge') merge(argv[1], argv.slice(2));
    else await main();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
