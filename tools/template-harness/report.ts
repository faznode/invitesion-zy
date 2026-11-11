import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LighthouseRun, SnapshotRun } from './browser';
import { kib } from './files';
import type { CheckResult } from './gates';
import { TIER_BUDGETS } from './policy';
import type { ProofResult } from './proofs';

export type ReportStatus = { status: 'PASS' | 'FAIL' | 'INCOMPLETE'; detail: string };

/**
 * PASS needs every static gate, every proof, a valid Lighthouse result and every planned snapshot. Static success with a
 * missing or invalid browser check is INCOMPLETE: it is never evidence of browser validation.
 */
export function reportStatus(input: { check: Pick<CheckResult, 'ok'>; snapshots: SnapshotRun; lighthouse: LighthouseRun; proofs: Pick<ProofResult, 'caught'>[] }): ReportStatus {
  const { check, snapshots, lighthouse, proofs } = input;
  if (!check.ok) return { status: 'FAIL', detail: 'a static gate failed' };
  if (!proofs.every((proof) => proof.caught)) return { status: 'FAIL', detail: 'a deliberate failure was not caught' };
  const missing: string[] = [];
  if (!lighthouse.ran) missing.push(`Lighthouse: ${lighthouse.reason ?? 'no valid result'}`);
  if (snapshots.expected === 0 || snapshots.shots.length < snapshots.expected) {
    missing.push(`snapshots ${snapshots.shots.length}/${snapshots.expected}${snapshots.reason ? ` (${snapshots.reason})` : ''}`);
  }
  if (missing.length) return { status: 'INCOMPLETE', detail: `static gates and proofs pass; browser checks not validated: ${missing.join('; ')}` };
  return { status: 'PASS', detail: 'static gates, proofs, Lighthouse and every planned snapshot are valid' };
}

/** `GENERATION-REPORT.md`: the technical record of one harness run (results only; no prompts, no transcripts). */
export function writeReport(dir: string, input: { check: CheckResult; snapshots: SnapshotRun; lighthouse: LighthouseRun; proofs: ProofResult[]; generatedAt: string }) {
  const { check, snapshots, lighthouse, proofs, generatedAt } = input;
  const manifest = check.manifest;
  if (!manifest) throw new Error('cannot report on a template whose manifest does not parse');
  const budget = { ...TIER_BUDGETS[manifest.tier], ...manifest.budgets };
  const m = check.measurements;
  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const { status, detail } = reportStatus(input);
  const orDash = (value: number | undefined, unit = '') => (value === undefined ? '—' : `${value}${unit}`);
  const lines: string[] = [
    '<!-- SUMMARY (first 7 lines — greppable) -->',
    `# GENERATION-REPORT.md — ${manifest.name} (\`${manifest.id}\` v${manifest.version})`,
    `> WHAT: Harness run for this template: static gates, measured bytes vs tier budget, Lighthouse lab run, visual snapshots, deliberate-failure proofs.`,
    `> STATUS: ${status}: ${cell(detail)} (generated ${generatedAt} by \`pnpm harness report\`)`,
    '> OWNER: template author + Guardian review',
    '> DEPS: template.manifest.json, tools/template-harness/, invitation-research/09-masterplan/08-template-system-and-harness.md',
    '> GREP: generation report, harness, budget, lighthouse, snapshot, proof',
    `> UPDATED: ${generatedAt.slice(0, 10)}`,
    '',
    '## Summary',
    '| Tier | Niche | Motion level | Audio | 3D | Locales |',
    '|---|---|---|---|---|---|',
    `| ${manifest.tier} | ${manifest.niche} | ${manifest.motion.level} (reduced: ${manifest.motion.reducedMotion}) | ${manifest.audio ? 'after open gesture' : 'none'} | ${manifest.threeD ? `lazy (${manifest.threeD.trigger})` : 'none'} | ${manifest.locales.join(', ')} |`,
    '',
    '## Static gates (`harness check`)',
    '| Gate | Result | Problems / notes |',
    '|---|---|---|',
    ...check.gates.map((item) => `| ${item.gate} | ${item.ok ? 'pass' : '**FAIL**'} | ${cell([...item.problems.map((p) => `✗ ${p}`), ...item.notes].join(' · ') || '—')} |`),
    '',
    '## Bytes on disk vs the tier budget',
    '| Item | Measured | Budget |',
    '|---|---|---|',
  ];
  if (m) {
    lines.push(
      `| Cold-load total (HTML + CSS + JS + fonts + non-deferred images) | ${kib(m.coldLoadBytes)} KiB | ${budget.coldLoadKiB} KiB |`,
      `| Template JS | ${kib(m.jsBytes)} KiB | ${budget.jsKiB} KiB |`,
      `| Fonts | ${kib(m.fontBytes)} KiB | ${budget.fontsKiB} KiB |`,
      `| Largest image | ${m.largestImage ? `${kib(m.largestImage.bytes)} KiB (${m.largestImage.id})` : '—'} | ${budget.imageKiB} KiB |`,
      `| Deferred audio | ${kib(m.deferredAudioBytes)} KiB | ${budget.audioKiB} KiB |`,
      `| Deferred 3D model | ${kib(m.deferredModelBytes)} KiB | ${budget.modelKiB} KiB |`,
    );
  }
  lines.push('', '## Lighthouse (`harness bench`, lab, mobile, simulated throttling)');
  if (lighthouse.ran) {
    lines.push(
      '| Lighthouse | Performance | Accessibility | LCP | TBT (not INP) | CLS | Transfer weight |',
      '|---|---|---|---|---|---|---|',
      `| ${lighthouse.version} | ${orDash(lighthouse.performance)} | ${orDash(lighthouse.accessibility)} | ${orDash(lighthouse.lcpMs, ' ms')} | ${orDash(lighthouse.tbtMs, ' ms')} | ${orDash(lighthouse.cls)} | ${lighthouse.totalByteWeight ? `${kib(lighthouse.totalByteWeight)} KiB` : '—'} |`,
      '',
      'Served by the harness static server on 127.0.0.1 (no CDN, no compression): transfer weight ≈ bytes on disk. One run; not a field measurement.',
    );
  } else {
    lines.push(`No valid result${lighthouse.version ? ` (Lighthouse ${lighthouse.version})` : ''}: ${lighthouse.reason}. No score is reported.`);
  }
  lines.push('', '## Visual snapshots (`harness snapshot`)');
  if (snapshots.ran) {
    lines.push(
      `${snapshots.chrome}. ${snapshots.shots.length} of ${snapshots.expected} planned screenshots. Images are written outside the repository (not committed); hashes identify them.`,
      '',
      '| Viewport | Fixture | Reduced motion | Bytes | SHA-256 (first 16) |',
      '|---|---|---|---|---|',
      ...snapshots.shots.map((shot) => `| ${shot.viewport} | ${shot.fixture} | ${shot.reducedMotion ? 'yes' : 'no'} | ${shot.bytes} | \`${shot.sha256.slice(0, 16)}\` |`),
    );
  } else {
    lines.push(`Not run: ${snapshots.reason}.`);
  }
  lines.push(
    '',
    '## Deliberate-failure proofs (`harness prove`)',
    'Each proof copies the template to a temporary directory, breaks one rule and must make the named gate fail.',
    '',
    '| Proof | Expected gate | Caught | First problem reported |',
    '|---|---|---|---|',
    ...proofs.map((proof) => `| ${proof.id} | ${proof.gate} | ${proof.caught ? 'yes' : '**NO**'} | ${cell(proof.problem ?? '—')} |`),
    '',
    '## Assets and licences',
    '| Asset | Kind | Bytes | Licence | Provenance | Source |',
    '|---|---|---|---|---|---|',
    ...manifest.assets.map((asset) => `| ${asset.id} | ${asset.kind}${asset.deferred ? ' (deferred)' : ''} | ${asset.bytes} | ${asset.license} | ${asset.provenance} | ${cell(asset.source)} |`),
    '',
    '## Originality',
    manifest.originality.statement,
    '',
    '- Reviewer sign-off: **pending** (the originality gate only proves the absence of competitor references; visual dissimilarity needs a human reviewer).',
    '',
    '## Limits',
    '- Lab measurements on one sandbox host; no device, no in-app browser, no field data. TBT is not INP.',
    '- Audio playback and 3D frame rate are not verified without a device (opening ≠ playback).',
    `- Snapshot images and the Lighthouse JSON are written to \`$TMPDIR/invitesion-harness/${manifest.id}/\`, never to the repository.`,
    '- Budgets are internal (anchored on our own lab page C-INV-005), not competitor parity; the competitor tier aggregates (`invitation-research/04-template-benchmarks/benchmark-pack.md`) do not support a parity threshold yet.',
    '',
  );
  writeFileSync(join(dir, 'GENERATION-REPORT.md'), lines.join('\n'));
}
