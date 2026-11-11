import type { Tier } from './schema';

/**
 * Tier budgets (masterplan 08 §3). Internal budgets anchored on our own lab page C-INV-005 (311 KiB cold load,
 * LCP 2.53 s); NOT competitor-parity thresholds — benchmark tier aggregates are unfinished, so none are invented.
 * Revisit when eligible tier aggregates or field data exist. A manifest may only tighten these.
 */
export const TIER_BUDGETS: Record<Tier, { coldLoadKiB: number; jsKiB: number; fontsKiB: number; imageKiB: number; audioKiB: number; modelKiB: number; fallbackKiB: number; maxMotion: number }> = {
  basic: { coldLoadKiB: 320, jsKiB: 8, fontsKiB: 120, imageKiB: 200, audioKiB: 0, modelKiB: 0, fallbackKiB: 120, maxMotion: 1 },
  premium: { coldLoadKiB: 380, jsKiB: 20, fontsKiB: 160, imageKiB: 250, audioKiB: 1536, modelKiB: 0, fallbackKiB: 120, maxMotion: 2 },
  signature: { coldLoadKiB: 420, jsKiB: 40, fontsKiB: 160, imageKiB: 250, audioKiB: 1536, modelKiB: 900, fallbackKiB: 120, maxMotion: 3 },
};

/**
 * Guest-page budgets for the product's design families (`product-bytes.ts`, s21), measured on the review fixture's
 * `review-<layout>-full` pages (same content, one guest). Decoded bytes of what the first render fetches: the shared
 * shell once, each family's own bytes (its document plus anything not every family loads) and each page's total; plus
 * the page total as served, which keeps the basic tier's 320 KiB cold load anchored on C-INV-005 (311 KiB, lab
 * `next start`, gzip). Internal, anchored on build `NqzpKCeG8LELJLqtDZ24K` (shell 609 KiB: JS 464, CSS 91, fonts 54;
 * families 49–61 KiB; pages 658–670 KiB decoded, 233–235 KiB served) with headroom ≈ 5 % on the shell and ≈ 30 % on
 * the largest family [ASSUMPTION; revisit with field data]. The pre-B-015 build (`xWS3KXzRmrlQhlvBsV-YW`: shell 786 KiB,
 * families 123–134 KiB) fails them: that regression is what they guard. NOT competitor-parity thresholds.
 */
export const PRODUCT_PAGE_BUDGETS = { shellKiB: 640, familyKiB: 80, totalKiB: 720, totalTransferKiB: 320 };

/**
 * What the family budget measures (Q-O11, resolved s25 under the owner's delegation; reversible). `design`: a family's
 * own bytes minus the host's uploads (`isHostUpload` in `product-bytes.ts`), so a layout is judged on what it costs and
 * not on the size of a file a host uploaded. The uploads are not excluded from the measurement: they stay inside both
 * page totals (720 KiB decoded, 320 KiB as served) and are reported separately per family. `family` is the s21–s24
 * basis, which also counted the uploads against the family budget. On a page without host uploads both bases give the
 * same verdict, so the anchoring above and every verdict on such pages are unchanged. Reverse by setting `family` here,
 * or for one run with `product-bytes.ts --family-basis family`; every run stores both verdicts.
 */
export type FamilyBudgetBasis = 'design' | 'family';
export const FAMILY_BUDGET_BASIS: FamilyBudgetBasis = 'design';

export const MAX_FONT_FAMILIES = 2;

/** SPDX ids (plus `own-work`) an asset may carry; fonts are narrower. */
export const LICENSE_ALLOWLIST = ['OFL-1.1', 'Apache-2.0', 'MIT', 'CC0-1.0', 'CC-BY-4.0', 'own-work'];
export const FONT_LICENSES = ['OFL-1.1', 'Apache-2.0'];

/** External origins a template may load from. Empty by design: everything is self-hosted. */
export const EXTERNAL_SCRIPT_ALLOWLIST: string[] = [];

/**
 * Competitor brands and domains from the research shortlist (Tier A + named Tier B). Their appearance in a template
 * file, asset source or originality reference fails the originality gate: we extract structure and measurements from
 * competitors, never assets, wording or references (AGENTS.md "No copying competitors").
 */
export const COMPETITOR_MARKERS = [
  'invitato',
  'katsudoto',
  'enviory',
  'wevitation',
  'viding',
  'indoinvite',
  'satumomen',
  'satu momen',
  'paleo.id',
  'invi.id',
  'barunson',
  'paperlesspost',
  'paperless post',
  'withjoy',
  'rsvpify',
  'partiful',
  'sitemu',
  'weddingku',
  'bridestory',
];

/** Fixture viewports for visual snapshots (brief: 360×800, 390×844, 412×915). */
export const SNAPSHOT_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const;
