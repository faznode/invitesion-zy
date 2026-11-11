import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobs, mediaVariants } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { groupVariants, IMAGE_VARIANTS_JOB, NO_IMAGE_VARIANTS, variantSourceKey, type ImageVariants } from './variants';

/**
 * B-019: queue the variant job for a public upload the route has just stored. Best-effort by design: the upload has
 * succeeded either way, and the page serves the original until variants exist. One job per source (the dedupe key is
 * the storage key). `run_at` is written in UTC wall time, the clock the Rust runner compares against.
 */
export async function enqueueImageVariants(url: string): Promise<boolean> {
  if (!isFlagOn('IMAGE_VARIANTS')) return false;
  const key = variantSourceKey(url);
  if (!key) return false;
  try {
    await db
      .insert(jobs)
      .values({ kind: IMAGE_VARIANTS_JOB, payload: { key }, dedupeKey: key, runAt: new Date() })
      .onConflictDoNothing({ target: [jobs.kind, jobs.dedupeKey] });
    return true;
  } catch (error) {
    console.error('[b019] image variant job not queued:', error instanceof Error ? error.name : 'unknown error');
    return false;
  }
}

/**
 * The variants of an invitation's uploads, for the guest page (one indexed query, `media_variants_invitation_idx`).
 * Flag off, or the read failing: no variants, so every image renders as its original exactly as before.
 */
export async function loadImageVariants(invitationId: number): Promise<ImageVariants> {
  if (!isFlagOn('IMAGE_VARIANTS')) return NO_IMAGE_VARIANTS;
  try {
    const rows = await db
      .select({ sourceKey: mediaVariants.sourceKey, variantKey: mediaVariants.variantKey, tier: mediaVariants.tier, width: mediaVariants.width })
      .from(mediaVariants)
      .where(eq(mediaVariants.invitationId, invitationId));
    return groupVariants(rows);
  } catch (error) {
    console.error('[b019] image variants not read:', error instanceof Error ? error.name : 'unknown error');
    return NO_IMAGE_VARIANTS;
  }
}
