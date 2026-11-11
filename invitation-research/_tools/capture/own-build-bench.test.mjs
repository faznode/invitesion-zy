// Offline tests for own-build-bench.mjs (no browser, no network): node --test invitation-research/_tools/capture/own-build-bench.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ANDROID_UA, compare, extractRun, mannWhitneyExact, median, rotate, summarize } from './own-build-bench.mjs';

test('compare: medians per arm, tests against the first arm, failed runs excluded and counted', () => {
  const run = (arm, lcpMs, ok = true) => ({ arm, ok, lcpMs, performance: 0.9, fcpMs: 1000, siMs: 1000, tbtMs: 0, cls: 0,
    ttiMs: 2000, totalBytes: 1000, benchmarkIndex: 1400 });
  const runs = [
    run('old', 3000), run('old', 3100), run('old', 3200),
    run('new', 2000), run('new', 2100), run('new', 2200), run('new', 9999, false),
  ];
  const { summary, tests, failed } = compare(['old', 'new'], runs);
  assert.equal(failed, 1);
  assert.equal(summary.new.runs, 3);
  assert.equal(summary.new.lcpMs.median, 2100);
  assert.equal(summary.old.lcpMs.median, 3100);
  assert.equal(tests['new vs old'].lcpMs.medianDifference, -1000);
  assert.equal(tests['new vs old'].lcpMs.p, 0.1);
  assert.equal(tests['new vs old'].tbtMs.p, 1);
});

test('the user agent is the one capture.mjs sends, so runs match the C-INV Lighthouse block', () => {
  const capture = readFileSync(new URL('./capture.mjs', import.meta.url), 'utf8');
  const literal = capture.match(/const ANDROID_UA = '([^']+)'/)?.[1];
  assert.equal(ANDROID_UA, literal);
});

test('rounds rotate the arms so each takes every position once per cycle', () => {
  const arms = ['A', 'B', 'C'];
  assert.deepEqual(rotate(arms, 0), ['A', 'B', 'C']);
  assert.deepEqual(rotate(arms, 1), ['B', 'C', 'A']);
  assert.deepEqual(rotate(arms, 2), ['C', 'A', 'B']);
  assert.deepEqual(rotate(arms, 3), ['A', 'B', 'C']);
  const positions = { A: [], B: [], C: [] };
  for (let r = 0; r < 6; r += 1) rotate(arms, r).forEach((arm, p) => positions[arm].push(p));
  for (const list of Object.values(positions)) assert.deepEqual([...list].sort(), [0, 0, 1, 1, 2, 2]);
});

test('median and summarize ignore missing values', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, 5, undefined, 7]), 6);
  assert.equal(median([]), null);
  assert.deepEqual(summarize([2, null, 8, 5]), { n: 3, median: 5, min: 2, max: 8 });
  assert.deepEqual(summarize([null]), { n: 0, median: null, min: null, max: null });
});

test('exact Mann-Whitney U: known values, symmetry and ties', () => {
  const separated = mannWhitneyExact([1, 2, 3], [4, 5, 6]);
  assert.equal(separated.u, 0);
  assert.equal(separated.assignments, 20);
  assert.equal(separated.p, 2 / 20);
  const six = mannWhitneyExact([10, 11, 12, 13, 14, 15], [20, 21, 22, 23, 24, 25]);
  assert.equal(six.assignments, 924);
  assert.equal(six.p, 2 / 924);
  assert.equal(mannWhitneyExact([5, 5, 5], [5, 5, 5]).p, 1);
  const x = [3.1, 2.4, 5.0, 4.4];
  const y = [2.0, 2.4, 3.9, 1.5, 2.2];
  assert.equal(mannWhitneyExact(x, y).p, mannWhitneyExact(y, x).p);
  const interleaved = mannWhitneyExact([1, 3, 5], [2, 4, 6]);
  assert.ok(interleaved.p > 0.5 && interleaved.p <= 1);
  assert.deepEqual(mannWhitneyExact([], [1]), { u: null, p: null, assignments: 0 });
});

/** The definition the counted distribution must match: every assignment of the pooled mid-ranks, enumerated. */
function enumeratedMannWhitney(x, y) {
  const pooled = [...x, ...y];
  const order = pooled.map((value, index) => [value, index]).sort((p, q) => p[0] - q[0]);
  const ranks = new Array(pooled.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) ranks[order[k][1]] = (i + j + 2) / 2;
    i = j + 1;
  }
  const n1 = x.length;
  const uOf = (picked) => picked.reduce((s, i) => s + ranks[i], 0) - (n1 * (n1 + 1)) / 2;
  const observed = uOf([...Array(n1).keys()]);
  const nullMean = (n1 * y.length) / 2;
  let extreme = 0;
  let total = 0;
  const walk = (start, picked) => {
    if (picked.length === n1) {
      total += 1;
      if (Math.abs(uOf(picked) - nullMean) >= Math.abs(observed - nullMean) - 1e-9) extreme += 1;
      return;
    }
    for (let i = start; i <= pooled.length - (n1 - picked.length); i += 1) walk(i + 1, [...picked, i]);
  };
  walk(0, []);
  return { u: observed, p: extreme / total, assignments: total };
}

test('exact Mann-Whitney U: the counted distribution equals full enumeration, ties included, and covers merged runs', () => {
  let seed = 20261106;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 60; trial += 1) {
    const draw = () => Math.floor(random() * 5);
    const x = Array.from({ length: 1 + Math.floor(random() * 7) }, draw);
    const y = Array.from({ length: 1 + Math.floor(random() * 7) }, draw);
    assert.deepEqual(mannWhitneyExact(x, y), enumeratedMannWhitney(x, y), `${x} | ${y}`);
  }
  const twelve = mannWhitneyExact([...Array(12).keys()], [...Array(12).keys()].map((i) => i + 100));
  assert.equal(twelve.assignments, 2704156);
  assert.equal(twelve.p, 2 / 2704156);
  assert.equal(twelve.u, 0);
  assert.throws(() => mannWhitneyExact(new Array(26).fill(1), new Array(25).fill(2)), /more than 50/);
});

test('extractRun keeps the metrics, sizes and host fields of one report', () => {
  const report = {
    lighthouseVersion: '12.8.2',
    finalDisplayedUrl: 'http://127.0.0.1:3113/i/budi-sari/budi-hartono',
    categories: { performance: { score: 0.91 } },
    environment: { benchmarkIndex: 1432.5 },
    runWarnings: ['The tested device appears to have a slower CPU than Lighthouse expects.'],
    audits: {
      'first-contentful-paint': { numericValue: 1200.4 },
      'largest-contentful-paint': { numericValue: 2400.6 },
      'speed-index': { numericValue: 1300 },
      'total-blocking-time': { numericValue: 50 },
      'cumulative-layout-shift': { numericValue: 0.01 },
      interactive: { numericValue: 3100 },
      'total-byte-weight': { numericValue: 230000 },
      'resource-summary': { details: { items: [
        { resourceType: 'total', requestCount: 18, transferSize: 230000 },
        { resourceType: 'document', requestCount: 1, transferSize: 21000 },
        { resourceType: 'script', requestCount: 9, transferSize: 150000 },
      ] } },
    },
  };
  const run = extractRun(report);
  assert.equal(run.performance, 0.91);
  assert.equal(run.lcpMs, 2400.6);
  assert.equal(run.tbtMs, 50);
  assert.equal(run.requests, 18);
  assert.equal(run.documentBytes, 21000);
  assert.equal(run.scriptBytes, 150000);
  assert.equal(run.benchmarkIndex, 1432.5);
  assert.equal(run.warnings.length, 1);
  assert.equal(run.runtimeError, null);
  assert.equal(extractRun({ runtimeError: { code: 'NO_FCP' }, audits: {} }).runtimeError, 'NO_FCP');
});
