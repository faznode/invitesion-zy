// Rendered-contrast gate (B-016): only positive evidence passes; every unusable audit result is INCOMPLETE.
// Regression for the owner's transfer probe at checkpoint e983700: a mocked report with `color-contrast` score null and
// no failing node printed "n/a" and exited 0, so an unmeasured page counted as a finished gate.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  auditPage,
  classifyContrast,
  lighthouseContrastArgs,
  summarizeContrast,
  type Exec,
  type PageVerdict,
} from '../tools/template-harness/contrast-gate';

const URL_OK = 'http://127.0.0.1:3100/i/review-legacy-p-ivory/budi-hartono';
const PASS_REPORT = {
  requestedUrl: URL_OK,
  finalDisplayedUrl: URL_OK,
  audits: { 'color-contrast': { score: 1, scoreDisplayMode: 'binary', details: { type: 'table', items: [] } } },
};
const CLEAN_AXE = { violations: [], incomplete: [], notApplicable: [] };
const FAILING_NODE = {
  node: {
    selector: 'main > section > p.text-accent',
    snippet: '<p class="text-accent">',
    explanation: 'Fix any of the following:\n  Element has insufficient color contrast of 2.83 (foreground color: #c9a227)',
  },
};
const withAudit = (audit: unknown) => ({ ...PASS_REPORT, audits: { 'color-contrast': audit } });
const classify = (report: unknown, accessibility: unknown) => classifyContrast({ label: 'page', url: URL_OK, report, accessibility });

test('contrast gate: a measured page with score 1, no failing node and nothing unmeasured is PASS', () => {
  const verdict = classify(PASS_REPORT, CLEAN_AXE);
  assert.equal(verdict.status, 'PASS');
  assert.deepEqual(verdict.reasons, []);
  assert.equal(verdict.score, 1);
  assert.equal(classify({ ...PASS_REPORT, finalDisplayedUrl: `${URL_OK}/#rsvp` }, CLEAN_AXE).status, 'PASS', 'trailing slash and fragment are the same page');
});

test('contrast gate: missing, null, errored or otherwise unusable results are INCOMPLETE, never PASS', () => {
  const cases: Record<string, [unknown, unknown, RegExp]> = {
    'null score, no failing node (transfer probe)': [withAudit({ score: null, details: { items: [] } }), CLEAN_AXE, /audit returned no score/],
    'score as a string': [withAudit({ score: '1', scoreDisplayMode: 'binary', details: { items: [] } }), CLEAN_AXE, /audit returned no score/],
    'audit missing': [{ ...PASS_REPORT, audits: {} }, CLEAN_AXE, /no color-contrast audit/],
    'audits object missing': [{ requestedUrl: URL_OK, finalDisplayedUrl: URL_OK }, CLEAN_AXE, /no color-contrast audit/],
    'not applicable': [withAudit({ score: null, scoreDisplayMode: 'notApplicable' }), CLEAN_AXE, /not applicable/],
    'audit errored': [
      withAudit({ score: null, scoreDisplayMode: 'error', errorMessage: 'Required Accessibility gatherer encountered an error' }),
      CLEAN_AXE,
      /audit errored: Required Accessibility gatherer/,
    ],
    'manual score mode': [withAudit({ score: null, scoreDisplayMode: 'manual' }), CLEAN_AXE, /unexpected score mode "manual"/],
    'score 0 without a failing node': [withAudit({ score: 0, scoreDisplayMode: 'binary', details: { items: [] } }), CLEAN_AXE, /score 0 without any failing node/],
    'non-binary score': [withAudit({ score: 0.5, scoreDisplayMode: 'binary', details: { items: [] } }), CLEAN_AXE, /non-binary score 0.5/],
    'runtime error beside score 1': [
      { ...PASS_REPORT, runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'Lighthouse was unable to reliably load the page (Status code: 404)' } },
      CLEAN_AXE,
      /runtime error ERRORED_DOCUMENT_REQUEST/,
    ],
    redirect: [{ ...PASS_REPORT, finalDisplayedUrl: 'http://127.0.0.1:3100/sign-in' }, CLEAN_AXE, /redirect/],
    'report for another page': [{ ...PASS_REPORT, requestedUrl: 'http://127.0.0.1:3100/i/other/budi-hartono' }, CLEAN_AXE, /report is for/],
    'no measured page named': [{ audits: PASS_REPORT.audits }, CLEAN_AXE, /does not name the page/],
    'needs-review results not collected': [PASS_REPORT, undefined, /needs-review results were not collected/],
    'axe could not measure text': [
      PASS_REPORT,
      { ...CLEAN_AXE, incomplete: [{ id: 'color-contrast', nodes: [{ node: { selector: 'header h1', snippet: '<h1>' }, failureSummary: 'background image' }] }] },
      /could not measure text contrast \(needs review; sample header h1\)/,
    ],
    'axe rule error': [PASS_REPORT, { ...CLEAN_AXE, incomplete: [{ id: 'color-contrast', nodes: [], error: { message: 'boom' } }] }, /axe error: boom/],
    'report is null': [null, CLEAN_AXE, /no readable Lighthouse report/],
    'report is an array': [[PASS_REPORT], CLEAN_AXE, /no readable Lighthouse report/],
  };
  for (const [name, [report, accessibility, reason]] of Object.entries(cases)) {
    const verdict = classifyContrast({ label: 'page', url: URL_OK, report, accessibility });
    assert.equal(verdict.status, 'INCOMPLETE', name);
    assert.ok(verdict.reasons.some((text) => reason.test(text)), `${name}: ${verdict.reasons.join(' | ')}`);
  }
  const unrelatedNeedsReview = classify(PASS_REPORT, { ...CLEAN_AXE, incomplete: [{ id: 'link-in-text-block', nodes: [{ node: { selector: 'a' } }] }] });
  assert.equal(unrelatedNeedsReview.status, 'PASS', 'needs-review results of other rules do not block the contrast gate');
});

test('contrast gate: any failing node is FAIL with the node named, whatever the score says', () => {
  const failing = classify(withAudit({ score: 0, scoreDisplayMode: 'binary', details: { items: [FAILING_NODE] } }), CLEAN_AXE);
  assert.equal(failing.status, 'FAIL');
  assert.deepEqual(failing.failures, [
    { selector: 'main > section > p.text-accent', snippet: '<p class="text-accent">', explanation: 'Fix any of the following:' },
  ]);
  assert.equal(classify(withAudit({ score: 1, scoreDisplayMode: 'binary', details: { items: [FAILING_NODE] } }), CLEAN_AXE).status, 'FAIL', 'nodes win over a contradictory score');
  const failingWithError = classify({ ...withAudit({ score: 0, details: { items: [FAILING_NODE] } }), runtimeError: { code: 'NO_FCP' } }, CLEAN_AXE);
  assert.equal(failingWithError.status, 'FAIL');
  assert.ok(failingWithError.reasons.some((text) => /NO_FCP/.test(text)), 'other problems stay on the record');
});

test('contrast gate: the summary passes only when every page passed; FAIL wins over INCOMPLETE', () => {
  const page = (status: PageVerdict['status']): PageVerdict => ({ label: status, url: URL_OK, status, reasons: [], score: null, failures: [], unmeasured: [] });
  assert.deepEqual(summarizeContrast([]), { overall: 'INCOMPLETE', counts: { PASS: 0, FAIL: 0, INCOMPLETE: 0 }, exitCode: 3 });
  assert.equal(summarizeContrast([page('PASS'), page('PASS')]).exitCode, 0);
  assert.deepEqual(summarizeContrast([page('PASS'), page('INCOMPLETE')]), { overall: 'INCOMPLETE', counts: { PASS: 1, FAIL: 0, INCOMPLETE: 1 }, exitCode: 3 });
  assert.equal(summarizeContrast([page('INCOMPLETE'), page('FAIL'), page('PASS')]).overall, 'FAIL');
  assert.equal(summarizeContrast([page('INCOMPLETE'), page('FAIL')]).exitCode, 1);
});

test('contrast gate: every way a Lighthouse run can go wrong ends INCOMPLETE, and stale files are never reused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrast-gate-'));
  try {
    const target = { label: 'page', url: URL_OK };
    const reportFile = join(dir, 'page.report.json');
    const artifactsFile = join(dir, 'page.artifacts', 'artifacts.json');
    const writeRun = (report: string | null, accessibility: unknown): Exec => () => {
      if (report !== null) writeFileSync(reportFile, report);
      if (accessibility !== undefined) {
        mkdirSync(join(dir, 'page.artifacts'), { recursive: true });
        writeFileSync(artifactsFile, JSON.stringify({ Accessibility: accessibility }));
      }
      return '';
    };
    const run = (exec: Exec, desktop = false) => auditPage(target, { lighthouse: '/fake/lighthouse', chromePath: '/fake/chrome', outDir: dir, desktop, exec });

    const passed = run(writeRun(JSON.stringify(PASS_REPORT), CLEAN_AXE));
    assert.equal(passed.status, 'PASS', passed.reasons.join(' | '));
    assert.ok(existsSync(reportFile) && existsSync(artifactsFile));

    const stale = run(writeRun(null, undefined));
    assert.equal(stale.status, 'INCOMPLETE');
    assert.deepEqual(stale.reasons, ['Lighthouse wrote no report'], 'the PASS report of the previous run was removed first');

    const crashed = run(() => {
      throw new Error('Command failed: lighthouse exited with code 1\nstack');
    });
    assert.deepEqual(crashed.reasons, ['Lighthouse did not finish (Command failed: lighthouse exited with code 1)']);
    assert.equal(crashed.status, 'INCOMPLETE');
    const refused = run(() => {
      throw Object.assign(new Error('Command failed: lighthouse http://…'), { status: 1, stderr: 'Runtime error encountered: Lighthouse was unable to reliably load the page you requested. (Status code: 404)\n' });
    });
    assert.deepEqual(refused.reasons, ['Lighthouse did not finish (exited 1): Runtime error encountered: Lighthouse was unable to reliably load the page you requested. (Status code: 404)']);
    const killed = run(() => {
      throw Object.assign(new Error('spawnSync lighthouse ETIMEDOUT'), { status: null, signal: 'SIGTERM' });
    });
    assert.deepEqual([killed.status, killed.reasons], ['INCOMPLETE', ['Lighthouse did not finish (killed by SIGTERM)']]);

    const garbled = run(writeRun('{"audits": ', CLEAN_AXE));
    assert.deepEqual([garbled.status, garbled.reasons], ['INCOMPLETE', ['report is not valid JSON']]);

    const noArtifacts = run(writeRun(JSON.stringify(PASS_REPORT), undefined));
    assert.equal(noArtifacts.status, 'INCOMPLETE');
    assert.ok(noArtifacts.reasons.some((text) => /needs-review results were not collected/.test(text)), 'artifacts of the earlier run were removed first');

    const garbledArtifacts = run((file, args, options) => {
      writeRun(JSON.stringify(PASS_REPORT), undefined)(file, args, options);
      mkdirSync(join(dir, 'page.artifacts'), { recursive: true });
      writeFileSync(artifactsFile, '{');
      return '';
    });
    assert.equal(garbledArtifacts.status, 'INCOMPLETE');

    let seenArgs: string[] = [];
    let seenChrome: string | undefined;
    run((_file, args, options) => {
      seenArgs = args;
      seenChrome = options.env.CHROME_PATH;
      return '';
    }, true);
    assert.equal(seenChrome, '/fake/chrome');
    for (const flag of ['--only-audits=color-contrast', '--output=json', `--output-path=${reportFile}`, `--gather-mode=${join(dir, 'page.artifacts')}`, `--audit-mode=${join(dir, 'page.artifacts')}`, '--preset=desktop']) {
      assert.ok(seenArgs.includes(flag), flag);
    }
    assert.ok(seenArgs.some((arg) => arg.includes('--force-prefers-reduced-motion')), 'reduced motion, so entrance animations cannot leave text mid-fade');
    assert.ok(!lighthouseContrastArgs(URL_OK, 'r', 'a').includes('--preset=desktop'), 'mobile emulation by default');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contrast gate: the CLI exits non-zero for the transfer probe and zero only for a complete pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrast-cli-'));
  try {
    const fake = join(dir, 'fake-lighthouse.cjs');
    writeFileSync(
      fake,
      [
        `#!${process.execPath}`,
        "const fs = require('node:fs'); const path = require('node:path');",
        'const args = process.argv.slice(2);',
        "if (args.includes('--version')) { console.log('12.8.2-fake'); process.exit(0); }",
        "const value = (prefix) => (args.find((arg) => arg.startsWith(prefix)) || '').slice(prefix.length);",
        "const entry = JSON.parse(fs.readFileSync(process.env.FAKE_LH_SPEC, 'utf8'))[args[0]];",
        'if (entry.exit) process.exit(entry.exit);',
        "fs.writeFileSync(value('--output-path='), JSON.stringify(entry.report));",
        "const gather = value('--gather-mode=');",
        "fs.mkdirSync(gather, { recursive: true }); fs.writeFileSync(path.join(gather, 'artifacts.json'), JSON.stringify({ Accessibility: entry.accessibility }));",
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const urls = { probe: 'http://127.0.0.1:9/i/probe/budi-hartono', ok: 'http://127.0.0.1:9/i/ok/budi-hartono', bad: 'http://127.0.0.1:9/i/bad/budi-hartono', crash: 'http://127.0.0.1:9/i/crash/budi-hartono' };
    const at = (url: string, audit: unknown) => ({ requestedUrl: url, finalDisplayedUrl: url, audits: { 'color-contrast': audit } });
    const spec = join(dir, 'spec.json');
    writeFileSync(
      spec,
      JSON.stringify({
        [urls.probe]: { report: at(urls.probe, { score: null, details: { items: [] } }), accessibility: CLEAN_AXE },
        [urls.ok]: { report: at(urls.ok, { score: 1, scoreDisplayMode: 'binary', details: { items: [] } }), accessibility: CLEAN_AXE },
        [urls.bad]: { report: at(urls.bad, { score: 0, scoreDisplayMode: 'binary', details: { items: [FAILING_NODE] } }), accessibility: CLEAN_AXE },
        [urls.crash]: { exit: 1 },
      }),
    );
    const cli = (pairs: string[], env: Record<string, string> = {}) => {
      const out = join(dir, `out-${pairs.join('-').replace(/[^a-z]/g, '') || 'none'}`);
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'tools/template-harness/rendered-contrast.ts', '--out', out, ...pairs.flatMap((name) => ['--url', `${name}=${urls[name as keyof typeof urls]}`])],
        { encoding: 'utf8', env: { ...process.env, LH_BIN: fake, CHROME_PATH: process.execPath, FAKE_LH_SPEC: spec, ...env }, timeout: 60_000 },
      );
      const record = existsSync(join(out, 'contrast.json')) ? JSON.parse(readFileSync(join(out, 'contrast.json'), 'utf8')) : undefined;
      return { status: result.status, stdout: result.stdout, stderr: result.stderr, record };
    };

    const probe = cli(['probe']);
    assert.equal(probe.status, 3, probe.stdout + probe.stderr);
    assert.match(probe.stdout, /^INCOMPLETE\s+probe: audit returned no score$/m);
    assert.doesNotMatch(probe.stdout, /n\/a/);
    assert.equal(probe.record?.overall, 'INCOMPLETE');

    const ok = cli(['ok']);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^PASS\s+ok$/m);
    assert.equal(ok.record?.overall, 'PASS');
    assert.equal(ok.record?.lighthouse, '12.8.2-fake');

    assert.equal(cli(['ok', 'probe']).status, 3, 'one unusable page keeps the whole sweep incomplete');
    const bad = cli(['probe', 'bad', 'ok']);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^FAIL\s+bad failing=1 first=main > section > p\.text-accent/m);
    const crash = cli(['crash']);
    assert.equal(crash.status, 3);
    assert.match(crash.stdout, /^INCOMPLETE\s+crash: Lighthouse did not finish/m);
    assert.equal(cli([]).status, 2, 'no --url is a usage error');
    assert.equal(cli(['ok'], { LH_BIN: '' }).status, 2, 'missing LH_BIN is a usage error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
