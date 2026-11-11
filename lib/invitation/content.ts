import 'server-only';

import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { backendFor } from '@/lib/backend';
import { db } from '@/lib/db/drizzle';
import { invitations, invitationVersions } from '@/lib/db/schema';
import * as api from './content-api';
import * as next from './content-next';
import { normalizeStoredConfig, prepareConfigWrite, prepareRestoreWrite } from './content-read';
import type { Tier } from '@/lib/pricing';
import type { ContentWriteOutcome, ContentWriteRequest } from './content-rules';
import type { DetailConfig } from './detail-config';

/**
 * B-035: the one entry for the editor's content writes. `BACKEND_CONTENT` (default `next`) selects exactly one writer
 * per call; the branch for `rust` returns its own outcome, so the TypeScript writer is never reached as a fallback (a
 * fallback after a timeout could be a second writer for a save the first already committed).
 *
 * The facade owns the content contract (the merge and the strict schema, S18-Q4, D-035, D-036), prepared from the config
 * and version it read in one statement. Each writer re-checks that version under the invitation's row lock before it
 * writes, so a config prepared from anything but the stored one is refused, never stored.
 */

type Env = Record<string, string | undefined>;

/** The signed-in host: the local user id for the TypeScript writer, the session token for the Rust writer. */
export type ContentCaller = { userId: number; ownerToken: () => Promise<string | null> };

export type ContentSaveOutcome = Exclude<ContentWriteOutcome, { kind: 'saved' }> | { kind: 'saved'; version: number; config: DetailConfig };

export type ContentState = {
  /** As stored (the write path's base); readers show `normalizeStoredConfig(config).config`. */
  config: Record<string, unknown>;
  eventType: string;
  /** `max(invitation_versions.version_no)`, 0 for an invitation without a version row. */
  version: number;
};

/** The owner's invitation config with its version as one statement, so the two always belong together. */
export function contentStateQuery(invitationId: number, userId: number) {
  return db
    .select({
      config: invitations.config,
      eventType: invitations.eventType,
      // The id is bound, not correlated: drizzle leaves columns unqualified in a single-table select, so `= ${invitations.id}`
      // would compare with the subquery's own `invitation_versions.id` and load a wrong version (found in s32).
      version: sql<number>`coalesce((select max(${invitationVersions.versionNo}) from ${invitationVersions} where ${invitationVersions.invitationId} = ${invitationId}), 0)`.mapWith(Number),
    })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.userId, userId), isNull(invitations.deletedAt)))
    .limit(1);
}

export async function loadContentState(invitationId: number, userId: number): Promise<ContentState | null> {
  const [row] = await contentStateQuery(invitationId, userId);
  if (!row) return null;
  return { config: (row.config as Record<string, unknown> | null) ?? {}, eventType: row.eventType, version: row.version };
}

/** What the editor loads and the detail API's GET answers: the lenient read (S18-Q4) and the version it belongs to. */
export async function loadEditorContent(invitationId: number, userId: number): Promise<{ config: DetailConfig; version: number } | null> {
  const state = await loadContentState(invitationId, userId);
  return state ? { config: normalizeStoredConfig(state.config).config, version: state.version } : null;
}

/**
 * B-036: the tier the owner's theme writes are entitled to, for the editor's theme picker (which themes it offers as
 * free switches and which it marks for an upgrade). The writers look it up again under the row lock, so this read only
 * shapes the choices; the server decides. Null when the invitation is not this owner's.
 */
export async function loadThemeTier(invitationId: number, userId: number): Promise<Tier | null> {
  const [row] = await db
    .select({ templateId: invitations.templateId })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.userId, userId), isNull(invitations.deletedAt)))
    .limit(1);
  return row ? next.themeTierOf(db, invitationId, row.templateId) : null;
}

/**
 * Saves the sections in `patch`. `expectedVersion` is the version the editor loaded (or last saved): a different stored
 * version is a conflict and nothing is written. Without it (a page loaded before B-035) the save is prepared from the
 * version read here, which the writer still checks under the lock.
 */
export async function saveInvitationContent(
  caller: ContentCaller,
  input: { invitationId: number; patch: DetailConfig; expectedVersion?: number | null },
  env: Env = process.env,
): Promise<ContentSaveOutcome> {
  const state = await loadContentState(input.invitationId, caller.userId);
  if (!state) return { kind: 'notfound' };
  if (input.expectedVersion != null && input.expectedVersion !== state.version) {
    return { kind: 'conflict', currentVersion: state.version };
  }
  // S18-Q4 / D-035 (a stored condition naming a deleted question cannot block saving another section; a save of the form
  // itself is checked strictly) and D-036 (events keep their ids; new ones get fresh ids): `prepareConfigWrite`.
  const validated: DetailConfig = prepareConfigWrite(state.config, input.patch);
  return writeContent(caller, { invitationId: input.invitationId, baseVersion: state.version, config: validated, touchedSections: Object.keys(input.patch) }, env);
}

/** Exactly one writer per call, the one `BACKEND_CONTENT` selects; never a fallback to the other (B-035). */
async function writeContent(caller: ContentCaller, request: ContentWriteRequest, env: Env): Promise<ContentSaveOutcome> {
  let outcome: ContentWriteOutcome;
  if (backendFor('CONTENT', env) === 'rust') {
    const ownerToken = await caller.ownerToken();
    outcome = ownerToken ? await api.writeContentThroughApi({ ...request, ownerToken }, env) : { kind: 'signin' };
  } else {
    outcome = await next.writeContentNext({ ...request, userId: caller.userId });
  }
  return outcome.kind === 'saved' ? { kind: 'saved', version: outcome.version, config: request.config } : outcome;
}

export type ContentRestoreOutcome = ContentSaveOutcome | { kind: 'current' } | { kind: 'unrestorable' };

/**
 * G-046: restores the owner's saved version `versionNo` as a new version, through the selected writer like any save, so
 * every writer rule applies to it: the version check under the row lock (a restore prepared from a stale page is a
 * conflict and writes nothing), D-040 media references and the B-041 theme entitlement, judged on every section because a
 * restore replaces them all. It writes the config and a version row, nothing else: guests, RSVP answers, wishes, media
 * and payments are never read or written here.
 */
export async function restoreInvitationVersion(
  caller: ContentCaller,
  input: { invitationId: number; versionNo: number; expectedVersion: number },
  env: Env = process.env,
): Promise<ContentRestoreOutcome> {
  const state = await loadContentState(input.invitationId, caller.userId);
  if (!state) return { kind: 'notfound' };
  if (input.expectedVersion !== state.version) return { kind: 'conflict', currentVersion: state.version };
  if (input.versionNo === state.version) return { kind: 'current' };
  // A number may repeat on rows written before B-035's lock: the latest row of that number is the version shown.
  const [row] = await db
    .select({ config: invitationVersions.config })
    .from(invitationVersions)
    .where(and(eq(invitationVersions.invitationId, input.invitationId), eq(invitationVersions.versionNo, input.versionNo)))
    .orderBy(desc(invitationVersions.id))
    .limit(1);
  if (!row) return { kind: 'notfound' };
  let config: DetailConfig | null;
  try {
    config = prepareRestoreWrite(state.config, row.config);
  } catch (error) {
    if (error instanceof ZodError) return { kind: 'unrestorable' };
    throw error;
  }
  if (!config) return { kind: 'unrestorable' };
  const touchedSections = [...new Set([...Object.keys(config), ...Object.keys(state.config)])].filter((key) => key !== 'schemaVersion');
  return writeContent(caller, { invitationId: input.invitationId, baseVersion: state.version, config, touchedSections }, env);
}

export type VersionEntry = { versionNo: number; createdAt: Date; createdBy: string; config: unknown };

/**
 * G-046: the owner's versions, newest first, `limit` at a time below `before` (keyset paging), with the current state
 * they are compared to. Null when the invitation is not this owner's (or deleted), exactly as for the editor.
 */
export async function loadVersionHistory(
  invitationId: number,
  userId: number,
  { before, limit }: { before?: number; limit: number },
): Promise<{ state: ContentState; versions: VersionEntry[]; more: boolean } | null> {
  const state = await loadContentState(invitationId, userId);
  if (!state) return null;
  const rows = await versionHistoryQuery(invitationId, { before, limit });
  return { state, versions: rows.slice(0, limit), more: rows.length > limit };
}

/**
 * One page of an invitation's versions below `before`, newest first, plus one row that says whether more exist. One row
 * per number, the latest written (the row a restore of that number reads), made distinct in the database: a page holds
 * `limit` versions however often a number repeats on rows written before B-035's lock, so the cursor reaches every older
 * version (dropping repeats after a fixed window ended the paging early and hid them). Callers check ownership first.
 */
export function versionHistoryQuery(invitationId: number, { before, limit }: { before?: number; limit: number }) {
  return db
    .selectDistinctOn([invitationVersions.versionNo], { versionNo: invitationVersions.versionNo, createdAt: invitationVersions.createdAt, createdBy: invitationVersions.createdBy, config: invitationVersions.config })
    .from(invitationVersions)
    .where(and(eq(invitationVersions.invitationId, invitationId), before === undefined ? undefined : lt(invitationVersions.versionNo, before)))
    .orderBy(desc(invitationVersions.versionNo), desc(invitationVersions.id))
    .limit(limit + 1);
}
