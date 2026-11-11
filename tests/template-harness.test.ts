// Self-tests for the template harness (B-012, masterplan 08 §5): happy paths pass, deliberate failures are caught.
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lighthouseFromReport, type LighthouseRun, type SnapshotRun } from '../tools/template-harness/browser';
import { contrastRatio, imageInfo, solidPng } from '../tools/template-harness/files';
import { runChecks } from '../tools/template-harness/gates';
import { TIER_BUDGETS } from '../tools/template-harness/policy';
import { PROOFS, runProofs } from '../tools/template-harness/proofs';
import { renderTemplate, RenderError } from '../tools/template-harness/render';
import { reportStatus } from '../tools/template-harness/report';
import { scaffoldTemplate } from '../tools/template-harness/scaffold';
import { manifestSchema } from '../tools/template-harness/schema';

const SAMPLES = ['basic-wedding-melati', 'premium-islamic-zamrud', 'signature-cincin-3d'].map((id) => join(process.cwd(), 'templates/_harness-samples', id));

test('harness: the three dogfood templates pass every static gate', () => {
  for (const dir of SAMPLES) {
    const result = runChecks(dir);
    const failures = result.gates.filter((gate) => !gate.ok).map((gate) => `${gate.gate}: ${gate.problems.join('; ')}`);
    assert.deepEqual(failures, [], dir);
  }
});

test('harness: every applicable deliberate failure is caught on every dogfood template', () => {
  for (const dir of SAMPLES) {
    const results = runProofs(dir);
    assert.ok(results.length >= 13, `${dir}: only ${results.length} proofs ran`);
    const missed = results.filter((proof) => !proof.caught).map((proof) => proof.id);
    assert.deepEqual(missed, [], dir);
  }
  const ids = PROOFS.map((proof) => proof.id);
  for (const required of ['oversized-asset', 'unlicensed-font', 'missing-reduced-motion', 'unsafe-guest-markup', 'guest-name-from-url', 'unverified-religious-text', 'external-script']) {
    assert.ok(ids.includes(required), `proof ${required} exists`);
  }
});

test('harness: audio and 3D proofs run only where the template declares them', () => {
  const premium = runProofs(SAMPLES[1]).map((proof) => proof.id);
  const signature = runProofs(SAMPLES[2]).map((proof) => proof.id);
  assert.ok(premium.includes('autoplay-audio') && !premium.includes('eager-3d-model'));
  assert.ok(signature.includes('eager-3d-model') && !signature.includes('autoplay-audio'));
});

test('harness: `new` scaffolds a template that passes, and refuses to overwrite one', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'harness-new-')), 'my-template');
  try {
    scaffoldTemplate(dir, { tier: 'premium', niche: 'birthday', locales: ['id', 'en'] });
    assert.equal(runChecks(dir).ok, true);
    assert.throws(() => scaffoldTemplate(dir), /already holds a template/);
    assert.throws(() => scaffoldTemplate(join(dir, 'x'), { tier: 'gold' }), /--tier/);
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true });
  }
});

test('harness: the manifest schema is strict', () => {
  const manifest = JSON.parse(readFileSync(join(SAMPLES[0], 'template.manifest.json'), 'utf8'));
  assert.equal(manifestSchema.safeParse(manifest).success, true);
  assert.equal(manifestSchema.safeParse({ ...manifest, autoplay: true }).success, false, 'unknown top-level key');
  assert.equal(manifestSchema.safeParse({ ...manifest, personalization: { ...manifest.personalization, allowedSources: ['query-string'] } }).success, false);
  assert.equal(manifestSchema.safeParse({ ...manifest, assets: [{ ...manifest.assets[0], path: '../secret.woff2' }] }).success, false, 'path traversal');
  assert.equal(manifestSchema.safeParse({ ...manifest, audio: { asset: 'x', preload: 'auto', startsOn: 'open-gesture', control: true } }).success, false);
});

test('harness: renderer escapes every fixture and refuses raw placeholders', () => {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(SAMPLES[0], 'template.manifest.json'), 'utf8')));
  const hostile = renderTemplate(SAMPLES[0], manifest, 'hostile');
  assert.equal(hostile.includes('<script>alert(1)'), false);
  assert.ok(hostile.includes('<bdi>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;&quot;&#39;&amp;</bdi>'));
  const rtl = renderTemplate(SAMPLES[0], manifest, 'rtl');
  assert.ok(rtl.includes('<bdi>عبد الرحمن</bdi>'));
  const english = renderTemplate(SAMPLES[0], manifest, 'default', 'en');
  assert.ok(english.includes('The wedding of'));
  const times = renderTemplate(SAMPLES[0], manifest, 'default');
  for (const label of ['08.00 WIB', '19.00 WITA', '10.30 WIT']) assert.ok(times.includes(label), label);
  assert.ok(new RenderError('x') instanceof Error);
});

test('harness: image headers, contrast and budget table', () => {
  const png = solidPng(1200, 630, [1, 2, 3]);
  assert.deepEqual(imageInfo(png), { format: 'png', width: 1200, height: 630 });
  for (const dir of SAMPLES) {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(dir, 'template.manifest.json'), 'utf8')));
    for (const asset of manifest.assets.filter((item) => item.kind === 'image' || item.kind === 'og')) {
      const info = imageInfo(readFileSync(join(dir, asset.path)));
      assert.equal(info.width, asset.width, asset.id);
      assert.equal(info.height, asset.height, asset.id);
    }
  }
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(TIER_BUDGETS).map(([tier, budget]) => [tier, [budget.coldLoadKiB, budget.jsKiB, budget.fontsKiB, budget.imageKiB, budget.maxMotion]])),
    { basic: [320, 8, 120, 200, 1], premium: [380, 20, 160, 250, 2], signature: [420, 40, 160, 250, 3] },
    'budgets equal masterplan 08 §3',
  );
});

const VALID_LIGHTHOUSE_REPORT = {
  categories: { performance: { score: 0.98 }, accessibility: { score: 1 } },
  audits: {
    'largest-contentful-paint': { numericValue: 1361.4 },
    'total-blocking-time': { numericValue: 12.6 },
    'cumulative-layout-shift': { numericValue: 0.0004 },
    'total-byte-weight': { numericValue: 84_992 },
  },
};

test('harness: a Lighthouse report without a valid measurement is never scored', () => {
  assert.deepEqual(lighthouseFromReport(VALID_LIGHTHOUSE_REPORT, '12.8.2'), {
    ran: true,
    version: '12.8.2',
    performance: 98,
    accessibility: 100,
    lcpMs: 1361,
    tbtMs: 13,
    cls: 0,
    totalByteWeight: 84_992,
  });
  const invalid = {
    runtimeError: {
      ...VALID_LIGHTHOUSE_REPORT,
      runtimeError: { code: 'NO_LCP', message: 'The page did not display content that qualifies as a Largest Contentful Paint.' },
      categories: { performance: { score: null }, accessibility: { score: 1 } },
    },
    nullPerformanceScore: { ...VALID_LIGHTHOUSE_REPORT, categories: { performance: { score: null }, accessibility: { score: 1 } } },
    missingPerformanceCategory: { ...VALID_LIGHTHOUSE_REPORT, categories: { accessibility: { score: 1 } } },
    zeroLcp: { ...VALID_LIGHTHOUSE_REPORT, audits: { ...VALID_LIGHTHOUSE_REPORT.audits, 'largest-contentful-paint': { numericValue: 0 } } },
    missingLcp: { ...VALID_LIGHTHOUSE_REPORT, audits: { 'total-blocking-time': { numericValue: 0 } } },
  };
  for (const [name, report] of Object.entries(invalid)) {
    const run = lighthouseFromReport(report, '12.8.2');
    assert.equal(run.ran, false, name);
    assert.match(run.reason ?? '', /^invalid Lighthouse result/, name);
    assert.equal(run.performance, undefined, `${name}: no score may be reported`);
    assert.equal(run.lcpMs, undefined, `${name}: no LCP may be reported`);
  }
  assert.match(lighthouseFromReport(invalid.runtimeError, '12.8.2').reason ?? '', /NO_LCP/);
});

test('harness: the report says PASS only when every static and browser check is valid', () => {
  const shot = { viewport: '390×844', fixture: 'default', reducedMotion: false, file: '/tmp/x.png', bytes: 1, sha256: '0'.repeat(64) };
  const allShots: SnapshotRun = { ran: true, chrome: 'Chrome', expected: 2, shots: [shot, shot] };
  const validLighthouse: LighthouseRun = lighthouseFromReport(VALID_LIGHTHOUSE_REPORT, '12.8.2');
  const ok = { check: { ok: true }, proofs: [{ caught: true }], snapshots: allShots, lighthouse: validLighthouse };
  assert.equal(reportStatus(ok).status, 'PASS');

  const invalidLighthouse = reportStatus({ ...ok, lighthouse: lighthouseFromReport({ categories: { performance: { score: null } } }, '12.8.2') });
  assert.equal(invalidLighthouse.status, 'INCOMPLETE');
  assert.match(invalidLighthouse.detail, /no performance score/);
  assert.equal(reportStatus({ ...ok, lighthouse: { ran: false, reason: 'Chrome Lighthouse not installed' } }).status, 'INCOMPLETE');
  assert.equal(reportStatus({ ...ok, snapshots: { ...allShots, shots: [shot], reason: 'Chrome produced 1 of 2 planned screenshots' } }).status, 'INCOMPLETE');
  assert.equal(reportStatus({ ...ok, snapshots: { ran: false, reason: 'Chrome not found', expected: 2, shots: [] } }).status, 'INCOMPLETE');

  assert.equal(reportStatus({ ...ok, check: { ok: false } }).status, 'FAIL');
  assert.equal(reportStatus({ ...ok, proofs: [{ caught: true }, { caught: false }] }).status, 'FAIL');
  assert.equal(reportStatus({ ...ok, check: { ok: false }, lighthouse: { ran: false, reason: 'missing' } }).status, 'FAIL', 'a static failure outranks a missing browser check');
});
