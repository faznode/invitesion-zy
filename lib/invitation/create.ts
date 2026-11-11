import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations, templates } from '@/lib/db/schema';
import { createDraftNext } from './create-next';
import { prepareDraftRequest } from './creation';

export const EVENT_TYPES = ['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Creates a DRAFT invitation for a customer: the wrapper scripts and fixtures use (`scripts/verify-*.ts`). Product
 * callers go through `createDraftInvitation` in `creation.ts` (B-037, D-055), which selects the content writer with
 * `BACKEND_CONTENT` and carries the session's owner token; this wrapper has no session, so it always uses the TypeScript
 * writer, with the same preparation and the same statements.
 *
 * The template's `defaultConfig` seeds the config (template-owned keys set aside before the strict schema, B-001,
 * ADR-O01; invalid defaults degrade to an empty preset), then the new-invitation defaults (gift details on personal
 * links, B-026 / D-047; the event type's design family under `DEFAULT_FAMILY`, F-02 / D-041 (3)), and version 1 is
 * recorded in the same transaction so the revision history has an origin. An unknown template id creates the draft
 * without a template, as before.
 */
export async function createInvitation({
  userId,
  eventType,
  templateId,
  title,
}: {
  userId: number;
  eventType: EventType;
  templateId?: number | null;
  title?: string;
}) {
  const [template] = templateId ? await db.select().from(templates).where(eq(templates.id, templateId)).limit(1) : [];
  const request = prepareDraftRequest({ eventType, template: template ?? null, title: title ?? null });
  const outcome = await createDraftNext({ ...request, userId });
  if (outcome.kind !== 'created') throw new Error(`[createInvitation] not created: ${outcome.kind}`);
  const [invitation] = await db.select().from(invitations).where(eq(invitations.id, outcome.invitationId)).limit(1);
  return invitation;
}
