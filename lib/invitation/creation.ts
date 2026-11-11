import 'server-only';

import { randomUUID } from 'node:crypto';
import { backendFor } from '@/lib/backend';
import type { Template } from '@/lib/db/schema';
import * as api from './create-api';
import * as next from './create-next';
import type { ContentCaller } from './content';
import type { DraftCreateOutcome, DraftCreateRequest } from './creation-rules';
import { draftSlugBase, initialDraftConfig, type TrialInput } from './trial';

/**
 * B-037 (D-055): the one entry for creating a draft invitation, for every product caller (the wizard's save, the catalog's
 * "Pakai tema" path, the dashboard's template picker). `BACKEND_CONTENT` (default `next`) selects exactly one writer per
 * call, the same flag as the editor's saves, so `invitations.config` and `invitation_versions` have one writer whichever
 * way it points; the branch for `rust` returns its own outcome and never falls back to the TypeScript writer.
 *
 * The facade prepares the content (`initialDraftConfig`: the template's defaults, the new-invitation defaults, the typed
 * content) and the slug base; each writer judges the template row it reads (`creationDecision`) and writes the row and
 * version 1 in one transaction. Every creation carries a key: the wizard's draft key, or one minted here, so a retry of
 * this call (the API path's resend) finds the draft it made instead of making a second.
 */

type Env = Record<string, string | undefined>;

export type DraftTemplate = Pick<Template, 'id' | 'name' | 'category' | 'defaultConfig'>;

export type CreateDraftInput = {
  eventType: string;
  /** The template row (the price anchor), or null for a creation without one. */
  template: DraftTemplate | null;
  /** The slug's source when there are no typed names (the template's name before B-037). */
  title?: string | null;
  /** The wizard's typed content and its draft key. */
  trial?: { input: Omit<TrialInput, 'slug'>; key: string } | null;
};

export function prepareDraftRequest(input: CreateDraftInput, env: Env = process.env): DraftCreateRequest {
  const { config, presetIssues } = initialDraftConfig(input.template?.defaultConfig ?? null, input.eventType, input.trial ?? null, env);
  // Paths and rules of the template's own defaults only: never the typed content.
  if (presetIssues.length) console.warn(`[creation] template ${input.template?.id} defaults rejected: ${presetIssues.join('; ')}`);
  return {
    templateId: input.template?.id ?? null,
    eventType: input.eventType,
    slugBase: draftSlugBase(input.eventType, input.trial?.input ?? null, input.title ?? input.template?.name ?? null),
    config,
    creationKey: input.trial?.key ?? randomUUID(),
  };
}

export async function createDraftInvitation(caller: ContentCaller, input: CreateDraftInput, env: Env = process.env): Promise<DraftCreateOutcome> {
  const request = prepareDraftRequest(input, env);
  if (backendFor('CONTENT', env) === 'rust') {
    const ownerToken = await caller.ownerToken();
    return ownerToken ? api.createDraftThroughApi({ ...request, ownerToken }, env) : { kind: 'signin' };
  }
  return next.createDraftNext({ ...request, userId: caller.userId });
}
