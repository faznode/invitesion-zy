import 'server-only';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { GUEST_PHOTO_TYPE } from './post-event';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { invitations, mediaAssets } from '@/lib/db/schema';
import type { MediaAsset } from '@/lib/db/schema';
import { saveInvitationContent } from './content';
import { normalizeStoredConfig } from './content-read';
import type { DetailConfig } from './detail-config';
import { MediaReferenceError } from './media-ownership';
import { ThemeEntitlementError } from './theme-entitlement';

export { MediaReferenceError } from './media-ownership';
export { ThemeEntitlementError } from './theme-entitlement';

export class OwnershipError extends Error {
  constructor(message = 'Invitation not found') {
    super(message);
    this.name = 'OwnershipError';
  }
}

/**
 * Resolve an invitation only if it belongs to the given user and is not deleted (B-031): publishing, checkout, media,
 * the detail API and the owner's protected photos all stop at a deletion until the owner restores the invitation.
 */
export async function requireOwnedInvitation(invitationId: number, userId: number) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.userId, userId), isNull(invitations.deletedAt)))
    .limit(1);
  if (!row) throw new OwnershipError();
  return row;
}

// ── Detail config ────────────────────────────────────────────
export async function getDetailConfig(
  invitationId: number,
  userId: number,
): Promise<DetailConfig> {
  const inv = await requireOwnedInvitation(invitationId, userId);
  // Stored config may predate this schema; return the valid subset rather than throwing. The guest page's lenient read
  // (S18-Q4), so the editor shows what guests see instead of an empty config when one section fails today's rules.
  return normalizeStoredConfig(inv.config ?? {}).config;
}

/** B-035: another save stored a newer version than the one this save was prepared from; nothing was written. */
export class ContentConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super(`Invitation content changed (version ${currentVersion})`);
    this.name = 'ContentConflictError';
  }
}

/**
 * The detail save as an exception-style call, for callers without a session token (the verification scripts). It is the
 * editor's write path (`saveInvitationContent`, B-035): the same contract, selected writer, rules and version check, with
 * refusals turned into the errors this module has always thrown. Under `BACKEND_CONTENT=rust` it needs a session token,
 * which these callers do not have, so it refuses rather than writing through the other writer.
 */
export async function updateDetailConfig(
  invitationId: number,
  userId: number,
  patch: DetailConfig,
  expectedVersion?: number | null,
): Promise<DetailConfig> {
  const outcome = await saveInvitationContent({ userId, ownerToken: async () => null }, { invitationId, patch, expectedVersion });
  switch (outcome.kind) {
    case 'saved':
      return outcome.config;
    case 'notfound':
      throw new OwnershipError();
    case 'media':
      throw new MediaReferenceError(outcome.issues);
    case 'theme':
      throw new ThemeEntitlementError(outcome.issues);
    case 'conflict':
      throw new ContentConflictError(outcome.currentVersion);
    default:
      throw new Error(`content save not completed (${outcome.kind})`);
  }
}

// ── Media ordering ───────────────────────────────────────────
export const mediaCreateSchema = z.object({
  type: z.enum(['photo', 'video', 'music']),
  url: z.string().url().max(1000),
  // Explicit 1-based order the asset arrived in (e.g. the order it was sent in
  // chat). This — never the filename/url/id — is the source of ordering truth.
  uploadSequence: z.number().int().positive(),
  source: z.enum(['web', 'chat', 'import']).default('web'),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type MediaCreateInput = z.infer<typeof mediaCreateSchema>;

export const mediaUpdateSchema = z
  .object({
    sortOrder: z.number().int().min(0).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => v.sortOrder !== undefined || v.meta !== undefined, {
    message: 'No updatable fields provided',
  });
export type MediaUpdateInput = z.infer<typeof mediaUpdateSchema>;

export class DuplicateSequenceError extends Error {
  constructor() {
    super('uploadSequence already exists for this invitation');
    this.name = 'DuplicateSequenceError';
  }
}

export async function listMedia(
  invitationId: number,
  userId: number,
): Promise<MediaAsset[]> {
  await requireOwnedInvitation(invitationId, userId);
  // Canonical order is the persisted sortOrder, tie-broken by insertion id.
  // Filenames and URLs are never used for ordering.
  // I-21 (D-070): guest photos are reviewed on their own page, never offered as the host's media.
  return db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.invitationId, invitationId), ne(mediaAssets.type, GUEST_PHOTO_TYPE)))
    .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.id));
}

export async function addMedia(
  invitationId: number,
  userId: number,
  input: MediaCreateInput,
): Promise<MediaAsset> {
  await requireOwnedInvitation(invitationId, userId);
  try {
    const [row] = await db
      .insert(mediaAssets)
      .values({
        invitationId,
        type: input.type,
        url: input.url,
        // sortOrder is seeded from the explicit upload sequence; a later
        // reorder can change sortOrder without losing uploadSequence.
        sortOrder: input.uploadSequence,
        uploadSequence: input.uploadSequence,
        source: input.source,
        meta: input.meta ?? null,
      })
      .returning();
    return row;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new DuplicateSequenceError();
    throw err;
  }
}

export async function updateMedia(
  invitationId: number,
  userId: number,
  assetId: number,
  input: MediaUpdateInput,
): Promise<MediaAsset> {
  await requireOwnedInvitation(invitationId, userId);
  const patch: Partial<MediaAsset> = {};
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.meta !== undefined) patch.meta = input.meta;
  const [row] = await db
    .update(mediaAssets)
    .set(patch)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.invitationId, invitationId)))
    .returning();
  if (!row) throw new OwnershipError('Media asset not found');
  return row;
}

export async function deleteMedia(
  invitationId: number,
  userId: number,
  assetId: number,
): Promise<void> {
  await requireOwnedInvitation(invitationId, userId);
  const [row] = await db
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.invitationId, invitationId)))
    .returning();
  if (!row) throw new OwnershipError('Media asset not found');
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
