import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogIdentityProblems, catalogManifestReport } from '../../lib/invitation/catalog-manifest';

/**
 * `pnpm harness catalog` (G-062): validates the manifest of every catalog template (`lib/invitation/catalog-manifest.ts`,
 * derived from `templates.ts` and `palettes.ts`) and proves each declared art file on disk byte for byte. The catalog,
 * the admin surface and this gate read the same manifests, so a template the gate refuses is one the admin sees refused.
 */
export function checkCatalogManifests(root = process.cwd()): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  const report = catalogManifestReport();
  const identity = catalogIdentityProblems();
  let failed = identity.length;
  for (const problem of identity) lines.push(`FAIL  catalog: ${problem}`);
  for (const { template, manifest, problems } of report) {
    const fileProblems: string[] = [];
    for (const file of manifest?.art.files ?? []) {
      const path = join(root, 'public', file.path);
      if (!existsSync(path)) fileProblems.push(`${file.path} is missing`);
      else if (createHash('sha256').update(readFileSync(path)).digest('hex') !== file.sha256) fileProblems.push(`${file.path} differs from its sha256`);
    }
    const all = [...problems, ...fileProblems];
    if (all.length) failed += 1;
    const summary = manifest
      ? `${manifest.tier} → ${manifest.entitlement}, palette ${manifest.palette.id} (${manifest.palette.tier}), ${manifest.sections.length} sections, art ${manifest.art.pool} (${manifest.art.files.length} files)`
      : 'no valid manifest';
    lines.push(`${all.length ? 'FAIL' : 'PASS'}  ${template.id} ${template.slug}: ${summary}`);
    for (const problem of all) lines.push(`      ${problem}`);
  }
  const ok = failed === 0;
  lines.push(`catalog: ${ok ? 'PASS' : 'FAIL'} (${report.length} manifests, ${failed} failing)`);
  return { ok, lines };
}
