import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runLighthouse, takeSnapshots } from './browser';
import { checkCatalogManifests } from './catalog';
import { checkFamilyManifests } from './families';
import { formatCheck, runChecks } from './gates';
import { runProofs } from './proofs';
import { defaultOutDir, writePreview } from './render';
import { reportStatus, writeReport } from './report';
import { scaffoldTemplate } from './scaffold';

/**
 * `pnpm harness <command> <dir> [options]` — masterplan 08 §5.
 *   new <dir> --tier basic|premium|signature --niche <niche> --locale id[,en]   scaffold that passes `check`
 *   check <dir> [--json]      static gates; exit 1 on any failure
 *   preview <dir> [--out d]   preview.html + fixture variants (outside the repo by default)
 *   snapshot <dir>            headless Chrome at 360×800, 390×844, 412×915 (+ fixtures, reduced motion)
 *   bench <dir>               budgets + Lighthouse cold load when Chrome and Lighthouse are installed
 *   prove <dir>               deliberate-failure proofs (each must be caught)
 *   report <dir>              all of the above → <dir>/GENERATION-REPORT.md; exit 0 PASS, 3 INCOMPLETE (browser
 *                             checks missing or invalid), 1 FAIL
 *   families                  B-030: validate every product family's manifest (sections, order rules, motion tier,
 *                             event types, budget); exit 1 on any problem
 *   catalog                   G-062: validate every catalog template's manifest (registry agreement, palette tokens,
 *                             entitlement, G-041 choices, G-016 art files byte for byte); exit 1 on any problem
 */
function option(args: string[], name: string, fallback?: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main() {
  const [command, target, ...rest] = process.argv.slice(2);
  if (command === 'families') {
    const result = checkFamilyManifests();
    console.log(result.lines.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }
  if (command === 'catalog') {
    const result = checkCatalogManifests();
    console.log(result.lines.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }
  if (!command || !target) {
    console.log('usage: pnpm harness <new|check|preview|snapshot|bench|prove|report> <dir> [options]');
    process.exit(2);
  }
  const dir = resolve(target);
  if (command === 'new') {
    scaffoldTemplate(dir, { tier: option(rest, 'tier'), niche: option(rest, 'niche'), locales: option(rest, 'locale')?.split(',') });
    const result = runChecks(dir);
    console.log(formatCheck(result));
    process.exit(result.ok ? 0 : 1);
  }
  const check = runChecks(dir);
  if (command === 'check') {
    console.log(rest.includes('--json') ? JSON.stringify({ ok: check.ok, gates: check.gates, measurements: check.measurements }, null, 2) : formatCheck(check));
    process.exit(check.ok ? 0 : 1);
  }
  if (!check.manifest) {
    console.log(formatCheck(check));
    process.exit(1);
  }
  const outDir = option(rest, 'out', defaultOutDir(check.manifest))!;
  const preview = writePreview(dir, check.manifest, outDir);
  if (command === 'preview') {
    console.log(Object.entries(preview.files).map(([fixture, file]) => `${fixture}: ${file}`).join('\n'));
    return;
  }
  if (command === 'snapshot') {
    const run = await takeSnapshots(outDir);
    console.log(run.ran ? run.shots.map((shot) => `${shot.viewport} ${shot.fixture}${shot.reducedMotion ? ' (reduced motion)' : ''}: ${shot.file} ${shot.sha256.slice(0, 16)}`).join('\n') : `not run: ${run.reason}`);
    process.exit(run.ran ? 0 : 1);
  }
  if (command === 'bench') {
    console.log(formatCheck(check));
    const lighthouse = await runLighthouse(outDir);
    console.log(JSON.stringify(lighthouse, null, 2));
    process.exit(check.ok ? 0 : 1);
  }
  if (command === 'prove') {
    const proofs = runProofs(dir);
    for (const proof of proofs) console.log(`${proof.caught ? 'caught ' : 'MISSED '} ${proof.id} → ${proof.gate}: ${proof.problem ?? '-'}`);
    process.exit(proofs.every((proof) => proof.caught) ? 0 : 1);
  }
  if (command === 'report') {
    const [snapshots, lighthouse] = [await takeSnapshots(outDir), await runLighthouse(outDir)];
    const proofs = runProofs(dir);
    writeReport(dir, { check, snapshots, lighthouse, proofs, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
    writeFileSync(join(outDir, 'results.json'), JSON.stringify({ check, snapshots, lighthouse, proofs }, null, 2));
    const { status, detail } = reportStatus({ check, snapshots, lighthouse, proofs });
    console.log(`${formatCheck(check)}\nproofs caught ${proofs.filter((proof) => proof.caught).length}/${proofs.length}\nlighthouse ${lighthouse.ran ? `perf ${lighthouse.performance} a11y ${lighthouse.accessibility}` : `no valid result (${lighthouse.reason})`}\nsnapshots ${snapshots.shots.length}/${snapshots.expected}\nstatus ${status}: ${detail}\nreport: ${join(dir, 'GENERATION-REPORT.md')}`);
    process.exit(status === 'PASS' ? 0 : status === 'INCOMPLETE' ? 3 : 1);
  }
  console.log(`unknown command ${command}`);
  process.exit(2);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
