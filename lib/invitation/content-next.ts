import 'server-only';

import { and, eq, isNull, max, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations, invitationVersions, orders, templates } from '@/lib/db/schema';
import type { Tier } from '@/lib/pricing';
import { contentDecision, contentNeedsTier, type ContentWriteOutcome, type ContentWriteRequest } from './content-rules';

/**
 * B-035: the TypeScript content writer (`BACKEND_CONTENT=next`, the default). Reached only through `content.ts`. One
 * transaction: the owner's invitation row is locked first, so two saves of one invitation run one after the other and the
 * second sees the first's version; then the shared decision (version, D-040 references, B-041 theme), then the config, the
 * live flag and the next version row. The Rust writer issues the same statements in the same order.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeContentNext(input: ContentWriteRequest & { userId: number }): Promise<ContentWriteOutcome> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: invitations.id, eventType: invitations.eventType, templateId: invitations.templateId, config: invitations.config })
      .from(invitations)
      // B-031: under the lock, so a save racing the owner's deletion sees it and changes nothing.
      .where(and(eq(invitations.id, input.invitationId), eq(invitations.userId, input.userId), isNull(invitations.deletedAt)))
      .limit(1)
      .for('update');
    if (!row) return { kind: 'notfound' };

    const [{ value: lastNo } = { value: 0 }] = await tx
      .select({ value: max(invitationVersions.versionNo) })
      .from(invitationVersions)
      .where(eq(invitationVersions.invitationId, row.id));

    const judged = {
      invitationId: row.id,
      eventType: row.eventType,
      storedConfig: row.config ?? {},
      config: input.config,
      touchedSections: input.touchedSections,
      baseVersion: input.baseVersion,
      currentVersion: lastNo ?? 0,
    };
    // The tier is consulted only for a Premium palette or theme, so other saves cost no extra query (B-041, B-036).
    const tier: Tier = contentNeedsTier(judged) ? await themeTierOf(tx, row.id, row.templateId) : 'standard';
    const decision = contentDecision(judged, tier);
    if (decision.kind !== 'write') return decision;

    await tx.update(invitations).set({ config: input.config }).where(eq(invitations.id, row.id));
    // Only the live row changes: rows already off stay off, so a save no longer rewrites the whole history.
    await tx
      .update(invitationVersions)
      .set({ isLive: false })
      .where(and(eq(invitationVersions.invitationId, row.id), eq(invitationVersions.isLive, true)));
    await tx.insert(invitationVersions).values({
      invitationId: row.id,
      versionNo: decision.nextVersion,
      config: input.config,
      createdBy: 'customer',
      isLive: true,
    });
    return { kind: 'saved', version: decision.nextVersion };
  });
}

/**
 * The tier an invitation's theme writes are entitled to (B-041). Premium when its purchased theme
 * (`invitations.template_id`) is Premium, since checkout charges that tier for it, or when a PAID order bought a Premium
 * tier for this invitation. Otherwise Standard. A theme switch (B-036) never changes either input. Runs inside the
 * writer's transaction, or on `db` for the editor's read of what its theme picker may offer.
 */
export async function themeTierOf(tx: Tx | typeof db, invitationId: number, templateId: number | null): Promise<Tier> {
  if (templateId !== null) {
    const [template] = await tx.select({ isPremium: templates.isPremium }).from(templates).where(eq(templates.id, templateId)).limit(1);
    if (template?.isPremium) return 'premium';
  }
  const [premiumOrder] = await tx
    .select({ id: orders.id })
    .from(orders)
    .leftJoin(templates, eq(templates.id, orders.templateId))
    .where(and(eq(orders.invitationId, invitationId), eq(orders.status, 'PAID'), or(eq(orders.tier, 'premium'), eq(templates.isPremium, true))))
    .limit(1);
  return premiumOrder ? 'premium' : 'standard';
}
