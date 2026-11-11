import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { analyticsEvents, guestRegistrationLinks, guestRegistrations, guests, invitations } from '@/lib/db/schema';
import { lookupIdempotent, recordIdempotent, type IdempotentPrior } from '@/lib/idempotency';
import { addressKey, addressSecret, hit, ipBucket, parseLimit, type Limit } from '@/lib/rate-limit';
import { normalizeStoredConfig } from './content-read';
import { invitedIdsFromTicked, inviteOnlyEvents } from './event-eligibility';
import { GUEST_LINK_TOKEN_PATTERN, newGuestLinkToken } from './guest-link';
import { checkInTime, normalizedPassScans, passCheckInEnabled, passCheckinHash, passCheckinScope, readGuestPass } from './guest-pass';
import { memberRolesFor, operationCapability, workspaceRolesFor, type Capability } from './members';
import type {
  AddOutcome,
  CategoryMode,
  CategoryOutcome,
  DecisionOutcome,
  ImportOutcome,
  ImportSummary,
  InvitedOutcome,
  LinkOutcome,
  OperationOutcome,
  PassCheckinOutcome,
  PassScanInput,
  PassScanResult,
  RegistrationDecision,
  RegistrationLinkAction,
  RegistrationOutcome,
  RosterFlags,
  RosterOperation,
  UndoOutcome,
} from './roster-outcomes';
import { passScanResultOf } from './roster-outcomes';
import {
  checkRosterRow,
  claimSlug,
  decideRegistration,
  duplicateKey,
  planImport,
  registrationOpen,
  ROSTER_LIMITS,
  rosterKeys,
  type ImportPlan,
  type RosterRowInput,
} from './roster-rules';

/**
 * B-033: the TypeScript writer of the guest roster (`BACKEND_ROSTER=next`, the default). The Rust writer
 * (`services/api/src/roster/`) holds the same rules (`roster-rules.ts`, shared vectors), the same order of refusals and
 * the same statements, and takes the same advisory lock, so the stored rows are identical whichever writer is live and
 * a flip of the flag never interleaves two writers on one roster. Owner writes check the invitation's owner inside their
 * own transaction; the call sites have already refused administrators.
 */

/** The ASCII bytes of "ROST" as an int4: the advisory-lock namespace both roster writers take, keyed by invitation. */
export const ROSTER_LOCK_NAMESPACE = 0x524f5354;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockRoster(tx: Tx, invitationId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${ROSTER_LOCK_NAMESPACE}::int4, ${invitationId}::int4)`);
}

/**
 * G-044 (D-057): the invitation `i` is the caller's, or the caller holds a live grant on it whose role has the
 * capability (`members.ts`). The Rust writer applies the same rule (`members::caller_may`). A refusal is `notfound`,
 * exactly as for another owner's invitation, so a member learns nothing about what lies outside their role. B-031
 * (D-063): a deleted invitation is refused to everyone, its owner included, until it is restored.
 *
 * G-052 (D-067): or the invitation is a client invitation of a workspace its owner owns, not disabled, where the caller
 * holds a live membership whose workspace role carries the capability (`workspaceRolesFor`). Like a team grant, the
 * flag is the boundary's (`invitationAccess`); the Rust writer applies the same clause.
 */
function callerMay(userId: number, capability: Capability) {
  const roles = memberRolesFor(capability);
  if (!roles.length) return sql`(i.deleted_at is null and i.user_id = ${userId})`;
  const allowed = sql.join(
    roles.map((role) => sql`${role}`),
    sql`, `,
  );
  const workspaceRoles = workspaceRolesFor(capability);
  const viaWorkspace = workspaceRoles.length
    ? sql` or exists (select 1 from workspace_members wm join workspaces w on w.id = wm.workspace_id where w.id = i.workspace_id and w.owner_user_id = i.user_id and w.disabled_at is null and wm.user_id = ${userId} and wm.revoked_at is null and wm.role in (${sql.join(
        workspaceRoles.map((role) => sql`${role}`),
        sql`, `,
      )}))`
    : sql``;
  return sql`(i.deleted_at is null and (i.user_id = ${userId} or exists (select 1 from invitation_members m where m.invitation_id = i.id and m.user_id = ${userId} and m.revoked_at is null and m.role in (${allowed}))${viaWorkspace}))`;
}

async function accessibleInvitation(tx: Tx, invitationId: number, userId: number, capability: Capability) {
  const rows = await tx.execute<{ id: number; config: unknown }>(sql`
    select i.id, i.config from invitations i where i.id = ${invitationId} and ${callerMay(userId, capability)}`);
  return rows[0] ?? null;
}

const eventsOf = (config: unknown) => normalizeStoredConfig(config ?? {}).config.events;

export async function addGuestNext(input: {
  userId: number;
  invitationId: number;
  row: RosterRowInput;
  /** Invite-only events ticked in the form; only this invitation's current invite-only events are kept (D-037). */
  invitedEventIds: readonly string[];
  flags: RosterFlags;
}): Promise<AddOutcome> {
  return db.transaction(async (tx) => {
    const invitation = await accessibleInvitation(tx, input.invitationId, input.userId, 'guests');
    if (!invitation) return { kind: 'notfound' };
    const check = checkRosterRow(input.row);
    if (!check.ok) return { kind: 'invalid', reason: check.reason };
    await lockRoster(tx, input.invitationId);
    const existing = await tx.select({ slug: guests.slug }).from(guests).where(eq(guests.invitationId, input.invitationId));
    if (existing.length >= ROSTER_LIMITS.maxGuests) return { kind: 'full' };
    const invited = input.flags.inviteOnlyEvents ? invitedIdsFromTicked(input.invitedEventIds, eventsOf(invitation.config), null) : [];
    const [saved] = await tx
      .insert(guests)
      .values({
        invitationId: input.invitationId,
        name: check.row.name,
        phone: check.row.phone,
        category: check.row.category,
        guestCount: check.row.guestCount,
        slug: claimSlug(check.row.name, new Set(existing.map((guest) => guest.slug))),
        linkToken: input.flags.opaqueLinks ? newGuestLinkToken() : null,
        invitedEventIds: invited.length ? invited : null,
      })
      .returning({ id: guests.id, slug: guests.slug });
    return { kind: 'saved', id: saved.id, slug: saved.slug };
  });
}

export function summarize(plan: ImportPlan): ImportSummary {
  return {
    verdicts: plan.verdicts.map((verdict) =>
      verdict.status === 'ok'
        ? { status: 'ok', slug: verdict.slug }
        : verdict.status === 'invalid'
          ? { status: 'invalid', reason: verdict.reason }
          : { status: 'duplicate', of: verdict.of },
    ),
    ok: plan.ok,
    invalid: plan.invalid,
    duplicate: plan.duplicate,
    refusal: plan.refusal,
  };
}

/** A preview (`dryRun`) or the import itself: every accepted row in one INSERT under one batch id, or nothing. */
export async function importGuestsNext(input: {
  userId: number;
  invitationId: number;
  rows: RosterRowInput[];
  dryRun: boolean;
  flags: RosterFlags;
}): Promise<ImportOutcome> {
  return db.transaction(async (tx) => {
    if (!(await accessibleInvitation(tx, input.invitationId, input.userId, 'guests'))) return { kind: 'notfound' };
    if (!input.dryRun) await lockRoster(tx, input.invitationId);
    const existing = await tx
      .select({ name: guests.name, phone: guests.phone, slug: guests.slug })
      .from(guests)
      .where(eq(guests.invitationId, input.invitationId));
    const plan = planImport(existing, input.rows);
    const summary = summarize(plan);
    if (input.dryRun) return { kind: 'planned', summary };
    if (plan.refusal) return { kind: 'refused', summary };
    const batchId = randomUUID();
    const values = plan.verdicts.flatMap((verdict) =>
      verdict.status === 'ok'
        ? [
            {
              invitationId: input.invitationId,
              name: verdict.row.name,
              phone: verdict.row.phone,
              category: verdict.row.category,
              guestCount: verdict.row.guestCount,
              slug: verdict.slug,
              linkToken: input.flags.opaqueLinks ? newGuestLinkToken() : null,
              importBatchId: batchId,
            },
          ]
        : [],
    );
    await tx.insert(guests).values(values);
    return { kind: 'imported', batchId, imported: values.length, summary };
  });
}

export const IMPORT_BATCH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Undo one import: its guests the host has not touched are deleted; a guest that was opened, sent, answered, checked
 * in, wrote a wish or has a WhatsApp log row is kept (its rows elsewhere point at it). No guests in the batch = not found.
 */
export async function undoImportNext(input: { userId: number; invitationId: number; batchId: string }): Promise<UndoOutcome> {
  if (!IMPORT_BATCH_PATTERN.test(input.batchId)) return { kind: 'notfound' };
  return db.transaction(async (tx) => {
    if (!(await accessibleInvitation(tx, input.invitationId, input.userId, 'guests'))) return { kind: 'notfound' };
    await lockRoster(tx, input.invitationId);
    const rows = await tx.execute<{ id: number; touched: boolean }>(sql`
      select g.id, (g.opened_count > 0 or g.opened_at is not null or g.rsvp_status <> 'PENDING' or g.attending_count is not null
        or g.rsvp_answers is not null or g.rsvp_event_answers is not null or g.sent_at is not null or g.checked_in_at is not null
        or exists (select 1 from analytics_events a where a.guest_id = g.id)
        or exists (select 1 from guest_messages m where m.guest_id = g.id)
        or exists (select 1 from wa_log w where w.guest_id = g.id)) as touched
      from guests g where g.invitation_id = ${input.invitationId} and g.import_batch_id = ${input.batchId}
      for update of g`);
    if (rows.length === 0) return { kind: 'notfound' };
    const untouched = rows.filter((row) => !row.touched).map((row) => Number(row.id));
    if (untouched.length > 0) {
      await tx.delete(guests).where(and(eq(guests.invitationId, input.invitationId), inArray(guests.id, untouched)));
    }
    return { kind: 'undone', deleted: untouched.length, kept: rows.length - untouched.length };
  });
}

async function accessibleGuest(tx: Tx, invitationId: number, guestId: number, userId: number, capability: Capability) {
  const rows = await tx.execute<{ id: number; invited_event_ids: unknown; config: unknown }>(sql`
    select g.id, g.invited_event_ids, i.config from guests g join invitations i on i.id = g.invitation_id
    where g.id = ${guestId} and g.invitation_id = ${invitationId} and ${callerMay(userId, capability)}
    for update of g`);
  return rows[0] ?? null;
}

/** Sent, check-in (with its CHECKIN row, in the same transaction) and undo check-in, as the guest list has done. */
export async function guestOperationNext(input: {
  userId: number;
  invitationId: number;
  guestId: number;
  operation: RosterOperation;
}): Promise<OperationOutcome> {
  return db.transaction(async (tx) => {
    const capability = operationCapability(input.operation);
    if (!(await accessibleGuest(tx, input.invitationId, input.guestId, input.userId, capability))) return { kind: 'notfound' };
    const where = and(eq(guests.id, input.guestId), eq(guests.invitationId, input.invitationId));
    if (input.operation === 'sent') await tx.update(guests).set({ sentAt: new Date() }).where(where);
    else if (input.operation === 'checkin') {
      // B-024 (D-056): a guest arrives once. Another check-in (a second desk, a stale list, a pass already scanned) keeps
      // the first time and writes no second CHECKIN row; undo clears the time, so a later check-in counts again.
      const first = await tx.update(guests).set({ checkedInAt: new Date() }).where(and(where, isNull(guests.checkedInAt))).returning({ id: guests.id });
      if (first.length) await tx.insert(analyticsEvents).values({ invitationId: input.invitationId, guestId: input.guestId, eventType: 'CHECKIN' });
    } else await tx.update(guests).set({ checkedInAt: null }).where(where);
    return { kind: 'saved' };
  });
}

/**
 * Raised inside a pass check-in's transaction when a concurrent twin with the same key committed first: it rolls this
 * transaction's writes back and carries the twin's recorded answer, read in that transaction after its access check.
 */
class TwinCommitted extends Error {
  constructor(readonly outcome: PassCheckinOutcome) {
    super('pass check-in: a concurrent batch committed this key first');
  }
}

/** A recorded answer for this key: the same batch replays it, a different batch under the key is refused. */
function recordedPassCheckin(prior: Exclude<IdempotentPrior, { kind: 'none' }>): PassCheckinOutcome {
  if (prior.kind === 'mismatch') return { kind: 'key-reused' };
  const results = (prior.body as { results?: unknown } | null)?.results;
  if (prior.status !== 200 || !Array.isArray(results)) throw new Error('pass check-in: the recorded answer is not a check-in answer');
  return { kind: 'checked', results: results.map(passScanResultOf) };
}

/**
 * B-024 (D-056): a batch of guest-pass scans, as the Rust writer applies it (`pass_checkins`). First the caller's current
 * access (G-044, D-057: the owner, or a live grant whose role holds `checkin`), so a revoked member or another account
 * never reads a stored answer or learns that its key exists. Then a batch already answered under this caller, invitation
 * and key replays that answer, whichever writer gave it (`api_idempotency_keys`, the API's scope and request hash);
 * another batch under the same key is refused. Otherwise the invitation must have opted in; the roster lock is taken as
 * for every roster write; then each scan in order: the token is read (shape, MAC, expiry); the pass's guest is locked; a
 * first check-in stores the scan's time and one CHECKIN event (`source: pass`), and a guest already checked in is
 * answered `already` with nothing written, so a replayed pass, a retried batch or two ushers scanning one guest never
 * count twice. The answer is recorded with the key in the same transaction; when a concurrent twin committed the key
 * first, this transaction reads the twin's record and rolls back, answering with it.
 */
export async function passCheckinNext(input: {
  userId: number;
  invitationId: number;
  scans: readonly PassScanInput[];
  key: string;
  secrets: readonly Uint8Array[];
  now?: Date;
}): Promise<PassCheckinOutcome> {
  const now = input.now ?? new Date();
  const scans = normalizedPassScans(input.scans);
  const scope = passCheckinScope(input.userId, input.invitationId);
  const hash = passCheckinHash(scans);
  try {
    return await passCheckinTransaction({ ...input, scans, now, scope, hash });
  } catch (error) {
    if (error instanceof TwinCommitted) return error.outcome;
    throw error;
  }
}

function passCheckinTransaction(input: {
  userId: number;
  invitationId: number;
  scans: readonly PassScanInput[];
  key: string;
  secrets: readonly Uint8Array[];
  now: Date;
  scope: string;
  hash: string;
}): Promise<PassCheckinOutcome> {
  return db.transaction(async (tx) => {
    const invitation = await accessibleInvitation(tx, input.invitationId, input.userId, 'checkin');
    if (!invitation) return { kind: 'notfound' };
    const prior = await lookupIdempotent(tx, input.scope, input.key, input.hash, input.now);
    if (prior.kind !== 'none') return recordedPassCheckin(prior);
    if (!passCheckInEnabled(invitation.config)) return { kind: 'disabled' };
    await lockRoster(tx, input.invitationId);
    const now = input.now;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const results: PassScanResult[] = [];
    for (const scan of input.scans) {
      const read = readGuestPass(scan.token, input.secrets, nowSeconds);
      if (read.kind !== 'valid') {
        results.push({ outcome: read.kind });
        continue;
      }
      const [guest] = await tx
        .select({ id: guests.id, name: guests.name, checkedInAt: guests.checkedInAt })
        .from(guests)
        .where(and(eq(guests.invitationId, input.invitationId), eq(guests.passId, read.passId)))
        .for('update');
      if (!guest) results.push({ outcome: 'unknown' });
      else if (guest.checkedInAt) results.push({ outcome: 'already', name: guest.name, checkedInAt: guest.checkedInAt.toISOString() });
      else {
        const at = checkInTime(scan.scannedAt, now);
        await tx.update(guests).set({ checkedInAt: at }).where(eq(guests.id, guest.id));
        await tx.insert(analyticsEvents).values({ invitationId: input.invitationId, guestId: guest.id, eventType: 'CHECKIN', meta: { source: 'pass' } });
        results.push({ outcome: 'checked-in', name: guest.name, checkedInAt: at.toISOString() });
      }
    }
    if (!(await recordIdempotent(tx, input.scope, input.key, input.hash, 200, { results }, now))) {
      const twin = await lookupIdempotent(tx, input.scope, input.key, input.hash, now);
      if (twin.kind === 'none') throw new Error('pass check-in: a concurrent batch committed this key, but its record is gone');
      throw new TwinCommitted(recordedPassCheckin(twin));
    }
    return { kind: 'checked', results };
  });
}

/** D-037: one guest's invite-only events (`invitedIdsFromTicked`: stored ids the form could not show are kept). */
export async function setInvitedEventsNext(input: {
  userId: number;
  invitationId: number;
  guestId: number;
  ticked: readonly string[];
  flags: RosterFlags;
}): Promise<InvitedOutcome> {
  return db.transaction(async (tx) => {
    const guest = await accessibleGuest(tx, input.invitationId, input.guestId, input.userId, 'guests');
    if (!guest) return { kind: 'notfound' };
    if (!input.flags.inviteOnlyEvents) return { kind: 'invalid' };
    const invited = invitedIdsFromTicked(input.ticked, eventsOf(guest.config), guest.invited_event_ids);
    await tx
      .update(guests)
      .set({ invitedEventIds: invited.length ? invited : null })
      .where(and(eq(guests.id, input.guestId), eq(guests.invitationId, input.invitationId)));
    return { kind: 'saved' };
  });
}

/**
 * D-037: invite (or uninvite) every guest of one category to one current invite-only event, in one UPDATE. The category
 * is matched exactly after trimming; an empty one means guests without a category.
 */
export async function setCategoryInvitationNext(input: {
  userId: number;
  invitationId: number;
  eventId: string;
  category: string;
  mode: CategoryMode;
  flags: RosterFlags;
}): Promise<CategoryOutcome> {
  return db.transaction(async (tx) => {
    const invitation = await accessibleInvitation(tx, input.invitationId, input.userId, 'guests');
    if (!invitation) return { kind: 'notfound' };
    const category = input.category.trim();
    const current = inviteOnlyEvents(eventsOf(invitation.config)).some((event) => event.id === input.eventId);
    if (!input.flags.inviteOnlyEvents || !current || [...category].length > ROSTER_LIMITS.maxCategory) return { kind: 'invalid' };
    await lockRoster(tx, input.invitationId);
    const inCategory = category ? eq(guests.category, category) : sql`(${guests.category} IS NULL OR ${guests.category} = '')`;
    const invited = sql`coalesce(${guests.invitedEventIds}, '[]'::jsonb)`;
    const changed =
      input.mode === 'add'
        ? await tx
            .update(guests)
            .set({ invitedEventIds: sql`(CASE WHEN jsonb_typeof(${invited}) = 'array' THEN ${invited} ELSE '[]'::jsonb END) || jsonb_build_array(${input.eventId}::text)` })
            .where(and(eq(guests.invitationId, input.invitationId), inCategory, sql`NOT (${invited} ? ${input.eventId})`))
            .returning({ id: guests.id })
        : await tx
            .update(guests)
            .set({ invitedEventIds: sql`nullif(${guests.invitedEventIds} - ${input.eventId}::text, '[]'::jsonb)` })
            .where(and(eq(guests.invitationId, input.invitationId), inCategory, sql`${invited} ? ${input.eventId}`))
            .returning({ id: guests.id });
    return { kind: 'saved', changed: changed.length };
  });
}

/** Open (keeps an open link), rotate (a new token; the old link stops at once) or close the self-registration link. */
export async function registrationLinkNext(input: { userId: number; invitationId: number; action: RegistrationLinkAction }): Promise<LinkOutcome> {
  return db.transaction(async (tx) => {
    if (!(await accessibleInvitation(tx, input.invitationId, input.userId, 'guests'))) return { kind: 'notfound' };
    await lockRoster(tx, input.invitationId);
    if (input.action === 'close') {
      await tx.delete(guestRegistrationLinks).where(eq(guestRegistrationLinks.invitationId, input.invitationId));
      return { kind: 'saved', token: null };
    }
    if (input.action === 'open') {
      const [open] = await tx
        .select({ token: guestRegistrationLinks.token })
        .from(guestRegistrationLinks)
        .where(eq(guestRegistrationLinks.invitationId, input.invitationId))
        .limit(1);
      if (open) return { kind: 'saved', token: open.token };
    }
    const token = newGuestLinkToken();
    await tx
      .insert(guestRegistrationLinks)
      .values({ invitationId: input.invitationId, token })
      .onConflictDoUpdate({ target: guestRegistrationLinks.invitationId, set: { token, createdAt: sql`now()` } });
    return { kind: 'saved', token };
  });
}

/** The registration limits (B-013's shape): per link and per address, overridable as the API's are. */
export function registrationLimits(env: Record<string, string | undefined> = process.env): { perLink: Limit; perIp: Limit } {
  return {
    perLink: parseLimit(env.RATE_LIMIT_REGISTRATION_LINK, { max: 20, windowSeconds: 600 }),
    perIp: parseLimit(env.RATE_LIMIT_REGISTRATION_IP, { max: 5, windowSeconds: 600 }),
  };
}

/**
 * A self-registration: the link, then the limits (per link, then per address when the service secret keys it), then
 * the rules and the queue under the roster lock. A duplicate stores nothing and answers like a new request.
 */
export async function registerNext(
  input: { token: string; row: RosterRowInput; clientIp?: string | null },
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<RegistrationOutcome> {
  if (!GUEST_LINK_TOKEN_PATTERN.test(input.token)) return { kind: 'closed' };
  const [link] = await db
    .select({ invitationId: guestRegistrationLinks.invitationId, status: invitations.status, expiresAt: invitations.expiresAt })
    .from(guestRegistrationLinks)
    .innerJoin(invitations, eq(invitations.id, guestRegistrationLinks.invitationId))
    .where(and(eq(guestRegistrationLinks.token, input.token), isNull(invitations.deletedAt)))
    .limit(1);
  if (!link || !registrationOpen(link, now)) return { kind: 'closed' };
  const limits = registrationLimits(env);
  const perLink = await hit(`registration:link:${link.invitationId}`, limits.perLink, now);
  if (!perLink.allowed) return { kind: 'busy', retryAfter: perLink.retryAfter };
  const secret = addressSecret(env);
  const address = input.clientIp ? addressKey(input.clientIp) : null;
  if (secret && address) {
    const perIp = await hit(ipBucket(secret, 'registration', address), limits.perIp, now);
    if (!perIp.allowed) return { kind: 'busy', retryAfter: perIp.retryAfter };
  }
  return db.transaction(async (tx) => {
    await lockRoster(tx, link.invitationId);
    const known = {
      guests: await tx.select({ name: guests.name, phone: guests.phone }).from(guests).where(eq(guests.invitationId, link.invitationId)),
      pending: await tx
        .select({ name: guestRegistrations.name, phone: guestRegistrations.phone })
        .from(guestRegistrations)
        .where(eq(guestRegistrations.invitationId, link.invitationId)),
    };
    const verdict = decideRegistration(input.row, known);
    if (verdict.status === 'invalid') return { kind: 'invalid', reason: verdict.reason };
    if (verdict.status === 'full') return { kind: 'full' };
    if (verdict.status === 'ok') {
      await tx.insert(guestRegistrations).values({
        invitationId: link.invitationId,
        name: verdict.row.name,
        phone: verdict.row.phone,
        guestCount: verdict.row.guestCount,
      });
    }
    return { kind: 'received' };
  });
}

/** Approve (the request becomes a guest and leaves the queue, one transaction) or reject (the request is deleted). */
export async function decideRegistrationNext(input: {
  userId: number;
  invitationId: number;
  registrationId: number;
  decision: RegistrationDecision;
  flags: RosterFlags;
}): Promise<DecisionOutcome> {
  return db.transaction(async (tx) => {
    if (!(await accessibleInvitation(tx, input.invitationId, input.userId, 'guests'))) return { kind: 'notfound' };
    await lockRoster(tx, input.invitationId);
    const [registration] = await tx
      .select()
      .from(guestRegistrations)
      .where(and(eq(guestRegistrations.id, input.registrationId), eq(guestRegistrations.invitationId, input.invitationId)))
      .limit(1);
    if (!registration) return { kind: 'notfound' };
    const remove = () => tx.delete(guestRegistrations).where(eq(guestRegistrations.id, input.registrationId));
    if (input.decision === 'reject') {
      await remove();
      return { kind: 'rejected' };
    }
    const check = checkRosterRow(
      { name: registration.name, phone: registration.phone, guestCount: registration.guestCount },
      ROSTER_LIMITS.maxRegistrationSeats,
    );
    if (!check.ok) return { kind: 'invalid', reason: check.reason };
    const existing = await tx
      .select({ name: guests.name, phone: guests.phone, slug: guests.slug })
      .from(guests)
      .where(eq(guests.invitationId, input.invitationId));
    if (existing.length >= ROSTER_LIMITS.maxGuests) return { kind: 'full' };
    if (new Set(existing.flatMap(rosterKeys)).has(duplicateKey(check.row))) return { kind: 'duplicate' };
    const [saved] = await tx
      .insert(guests)
      .values({
        invitationId: input.invitationId,
        name: check.row.name,
        phone: check.row.phone,
        category: null,
        guestCount: check.row.guestCount,
        slug: claimSlug(check.row.name, new Set(existing.map((guest) => guest.slug))),
        linkToken: input.flags.opaqueLinks ? newGuestLinkToken() : null,
      })
      .returning({ id: guests.id });
    await remove();
    return { kind: 'approved', guestId: saved.id };
  });
}
