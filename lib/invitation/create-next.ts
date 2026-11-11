import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations, invitationVersions, templates } from '@/lib/db/schema';
import type { Tier } from '@/lib/pricing';
import {
  catalogIdOfDefaults,
  creationDecision,
  firstFreeSlug,
  isCreationKey,
  isSlugBase,
  SLUG_SUFFIX_LIMIT,
  type DraftCreateOutcome,
  type DraftCreateRequest,
} from './creation-rules';

/**
 * B-037 (D-055): the TypeScript creation writer (`BACKEND_CONTENT=next`, the default). Reached only through `creation.ts`
 * (and `create.ts`'s wrapper for scripts). One transaction, the statements and order of the Rust writer
 * (`services/api/src/content/create.rs`):
 * 1. an earlier creation by this owner with this key answers with its row (a retry, a double submit);
 * 2. the template row (category, tier, defaults) and the shared decision (`creationDecision`);
 * 3. the taken slugs among `base`, `base-2` … `base-200` in one indexed lookup, and the first free one;
 * 4. the row, `on conflict do nothing`: a conflict is either this key committed by a concurrent request (answered from
 *    step 1's lookup, now visible) or a slug taken meanwhile (steps 3–4 again);
 * 5. version 1, live, in the same transaction.
 * The owner is the caller's session user, never a submitted id.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SLUG_ATTEMPTS = 3;

export function slugCandidates(base: string): string[] {
  return [base, ...Array.from({ length: SLUG_SUFFIX_LIMIT - 1 }, (_, index) => `${base}-${index + 2}`)];
}

async function priorCreation(tx: Tx, userId: number, key: string | null) {
  if (key === null) return null;
  const [row] = await tx
    .select({ id: invitations.id, slug: invitations.slug })
    .from(invitations)
    .where(and(eq(invitations.userId, userId), eq(invitations.creationKey, key)))
    .limit(1);
  return row ?? null;
}

export async function createDraftNext(input: DraftCreateRequest & { userId: number }): Promise<DraftCreateOutcome> {
  if (!isSlugBase(input.slugBase)) throw new Error('[creation] slug base out of contract');
  if (input.creationKey !== null && !isCreationKey(input.creationKey)) throw new Error('[creation] creation key out of contract');

  return db.transaction(async (tx) => {
    const prior = await priorCreation(tx, input.userId, input.creationKey);
    if (prior) return { kind: 'created', invitationId: prior.id, slug: prior.slug, replayed: true };

    let templateCategory: string | null = null;
    let templateCatalogId: number | null = null;
    let templateTier: Tier = 'standard';
    if (input.templateId !== null) {
      const [template] = await tx
        .select({ category: templates.category, isPremium: templates.isPremium, defaultConfig: templates.defaultConfig })
        .from(templates)
        .where(eq(templates.id, input.templateId))
        .limit(1);
      if (!template) return { kind: 'template-missing' };
      templateCategory = template.category;
      templateCatalogId = catalogIdOfDefaults(template.defaultConfig);
      templateTier = template.isPremium ? 'premium' : 'standard';
    }
    const decision = creationDecision({ eventType: input.eventType, templateCategory, templateCatalogId, templateTier, config: input.config });
    if (decision.kind !== 'write') return decision;

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const taken = await tx.select({ slug: invitations.slug }).from(invitations).where(inArray(invitations.slug, slugCandidates(input.slugBase)));
      const slug = firstFreeSlug(input.slugBase, taken.map((row) => row.slug)) ?? `${input.slugBase}-${Date.now().toString(36)}`;
      const [row] = await tx
        .insert(invitations)
        .values({
          userId: input.userId,
          templateId: input.templateId,
          slug,
          eventType: input.eventType,
          config: input.config,
          status: 'DRAFT',
          creationKey: input.creationKey,
        })
        .onConflictDoNothing()
        .returning({ id: invitations.id, slug: invitations.slug });
      if (row) {
        await tx.insert(invitationVersions).values({
          invitationId: row.id,
          versionNo: 1,
          config: input.config,
          createdBy: 'customer',
          isLive: true,
        });
        return { kind: 'created', invitationId: row.id, slug: row.slug, replayed: false };
      }
      const raced = await priorCreation(tx, input.userId, input.creationKey);
      if (raced) return { kind: 'created', invitationId: raced.id, slug: raced.slug, replayed: true };
    }
    throw new Error('[creation] no free slug after retries');
  });
}
