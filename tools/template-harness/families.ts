import { FAMILY_IDS } from '../../lib/invitation/families';
import { composedSectionOrder, FAMILY_MANIFESTS, MOTION_TIERS, validateFamilyManifest } from '../../lib/invitation/family-manifest';
import { FAMILY_BUDGET_BASIS, PRODUCT_PAGE_BUDGETS } from './policy';

/**
 * `pnpm harness families` (B-030): validates every product family's manifest (`lib/invitation/family-manifest.ts`)
 * and checks its byte budget against the product-page policy. The rendered order is proven by
 * `tests/b030-family-manifest.test.ts` on the review fixtures; this command is the quick static gate.
 */
export function checkFamilyManifests(): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  for (const id of FAMILY_IDS) {
    const manifest = FAMILY_MANIFESTS[id];
    const problems = validateFamilyManifest(manifest);
    if (manifest.byteBudget.familyKiB !== PRODUCT_PAGE_BUDGETS.familyKiB) problems.push(`byte budget ${manifest.byteBudget.familyKiB} KiB is not the policy's ${PRODUCT_PAGE_BUDGETS.familyKiB} KiB`);
    if (manifest.byteBudget.basis !== FAMILY_BUDGET_BASIS) problems.push(`budget basis ${manifest.byteBudget.basis} is not the policy's ${FAMILY_BUDGET_BASIS}`);
    ok &&= problems.length === 0;
    lines.push(`${problems.length ? 'FAIL' : 'PASS'}  ${id}: motion tier ${manifest.motionTier} (${MOTION_TIERS[manifest.motionTier].label}); starts new ${manifest.startsNewFor.join(', ') || '-'}`);
    lines.push(`      sections: ${composedSectionOrder(manifest).join(' → ')}${manifest.coverIncludes.length ? ` (cover includes ${manifest.coverIncludes.join(', ')})` : ''}`);
    for (const problem of problems) lines.push(`      ${problem}`);
  }
  lines.push(`families: ${ok ? 'PASS' : 'FAIL'} (${FAMILY_IDS.length} manifests)`);
  return { ok, lines };
}
