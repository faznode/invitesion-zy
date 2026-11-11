/**
 * rendered-contrast.ts — Lighthouse `color-contrast` on rendered guest pages: the rendered half of B-016's acceptance
 * ("passes on a rendered sample of every palette"), complementing the token arithmetic in tests/palette-contrast.test.ts.
 *
 *   source /vercel/share/work/tools/env.sh
 *   npx tsx tools/template-harness/rendered-contrast.ts --out /tmp/contrast [--desktop] \
 *     --url legacy-ivory=http://127.0.0.1:3100/i/review-legacy-p-ivory/budi-hartono [--url label=URL ...]
 *
 * One sequential Lighthouse run per URL: only the `color-contrast` audit, mobile emulation (or `--preset=desktop` with
 * --desktop), provided throttling and reduced motion, so entrance animations cannot leave text mid-fade. Artifacts are
 * gathered so axe's needs-review list is read too. Verdicts per page and overall follow contrast-gate.ts:
 *   PASS        every page measured, score 1, no failing node, no unmeasured contrast node      exit 0
 *   FAIL        at least one failing node on at least one page                                  exit 1
 *   INCOMPLETE  no FAIL, but at least one page without a usable result (null / missing / errored /
 *               not-applicable audit, runtime error, redirect, unreadable report, unmeasured text)  exit 3
 *   usage error (missing LH_BIN / CHROME_PATH, no --url)                                          exit 2
 * Writes contrast.json (overall, counts, per-page verdicts) and the raw reports to --out, outside the repository.
 * Limits: axe cannot measure text over a background image; such pages end INCOMPLETE here and are bounded separately
 * (worstContrastOverImage in lib/invitation/contrast.ts). Hover and focus states are not audited.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditPage, summarizeContrast, type AuditTarget, type PageVerdict } from './contrast-gate';

function lighthouseVersion(lighthouse: string): string {
  try {
    return String(execFileSync(lighthouse, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 })).trim();
  } catch {
    return 'unknown';
  }
}

function line(page: PageVerdict): string {
  if (page.status === 'PASS') return `PASS        ${page.label}`;
  if (page.status === 'FAIL') {
    return `FAIL        ${page.label} failing=${page.failures.length} first=${page.failures[0]?.selector || page.failures[0]?.snippet || '?'}${page.failures[0]?.explanation ? ` (${page.failures[0].explanation})` : ''}`;
  }
  return `INCOMPLETE  ${page.label}: ${page.reasons.join('; ')}`;
}

function main(): number {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const out = valueAfter('--out') ?? join(process.env.TMPDIR ?? '/tmp', 'invitesion-rendered-contrast');
  const desktop = args.includes('--desktop');
  const lighthouse = process.env.LH_BIN;
  const chromePath = process.env.CHROME_PATH;
  if (!lighthouse || !chromePath) {
    console.error('LH_BIN and CHROME_PATH are required (source /vercel/share/work/tools/env.sh)');
    return 2;
  }
  const targets: AuditTarget[] = args
    .flatMap((arg, index) => (arg === '--url' ? [args[index + 1] ?? ''] : []))
    .map((pair) => ({ label: pair.slice(0, pair.indexOf('=')), url: pair.slice(pair.indexOf('=') + 1) }))
    .filter((target) => /^[\w.-]+$/.test(target.label) && /^https?:\/\//.test(target.url));
  if (!targets.length) {
    console.error('Pass at least one --url label=http://… (label: letters, digits, ".", "_" or "-")');
    return 2;
  }
  mkdirSync(out, { recursive: true });

  const pages: PageVerdict[] = [];
  for (const target of targets) {
    const page = auditPage(target, { lighthouse, chromePath, outDir: out, desktop });
    pages.push(page);
    console.log(line(page));
  }
  const summary = summarizeContrast(pages);
  const record = {
    tool: 'rendered-contrast',
    generatedAt: new Date().toISOString(),
    lighthouse: lighthouseVersion(lighthouse),
    emulation: desktop ? 'desktop preset' : 'mobile (Lighthouse default)',
    reducedMotion: true,
    overall: summary.overall,
    counts: summary.counts,
    pages,
  };
  writeFileSync(join(out, 'contrast.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`overall: ${summary.overall} (pass ${summary.counts.PASS}, fail ${summary.counts.FAIL}, incomplete ${summary.counts.INCOMPLETE})`);
  return summary.exitCode;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
