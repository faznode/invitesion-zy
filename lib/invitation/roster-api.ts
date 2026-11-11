import 'server-only';

import { randomUUID } from 'node:crypto';
import { ApiProblem, apiConfigFromEnv, apiPostEmpty, apiPostTo } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
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
  OwnerRefusal,
  PassCheckinOutcome,
  PassScanInput,
  RegistrationDecision,
  RegistrationLinkAction,
  RegistrationOutcome,
  RosterFlags,
  RosterOperation,
  UndoOutcome,
} from './roster-outcomes';
import { passScanResultOf } from './roster-outcomes';
import type { RosterRowInput, RowReason } from './roster-rules';

/**
 * B-033: the Rust writer's side of the roster call sites (`BACKEND_ROSTER=rust`; `next` stays the default). Exactly one
 * writer per call and never a fallback to the other: a fallback after a timeout could write a second time for a request
 * the first writer already committed. Every write carries an `Idempotency-Key` that the API records in the transaction
 * of the write it protects, so a write whose outcome is unknown (unreachable, timed out, 5xx) is sent exactly once more
 * under the same key, and stays "unconfirmed" if that is unknown too (R-03's rule, D-043). Problems map to the outcomes
 * the TypeScript writer returns; a 400 or 401 is a deployment or programming error and propagates.
 */

type Env = Record<string, string | undefined>;
type Fields = components['schemas']['GuestFields'];

/**
 * 5xx problems the API answers before any write starts, so a resend could only be refused again: B-024's missing
 * guest-pass secret. They are definite, never resent and never "unconfirmed".
 */
const DEFINITE_5XX: ReadonlySet<string> = new Set(['guest_pass.not_configured']);
const isAmbiguous = (error: ApiProblem) => error.status === 0 || (error.status >= 500 && !DEFINITE_5XX.has(error.code));

async function sendUnderKey<T>(post: (key: string) => Promise<T>, key: string): Promise<T> {
  try {
    return await post(key);
  } catch (error) {
    if (error instanceof ApiProblem && isAmbiguous(error)) return post(key);
    throw error;
  }
}

/** Codes and status only: a problem never carries guest data, and neither does this line. */
function logUnconfirmed(where: string, error: ApiProblem) {
  console.error(`[roster] ${where}: outcome unknown after a retry under the same key (${error.status} ${error.code})`);
}

const REASONS: readonly RowReason[] = ['name', 'phone', 'seats', 'category'];
const reasonOf = (error: ApiProblem): RowReason => (REASONS as readonly string[]).includes(error.extras.reason ?? '') ? (error.extras.reason as RowReason) : 'name';

/** The refusals every owner write shares, or null for a problem the caller must map (or propagate). */
function ownerRefusal(error: ApiProblem, where: string): OwnerRefusal | null {
  if (error.code === 'roster.not_found') return { kind: 'notfound' };
  // The API knows no live customer for this session (deleted, or an administrator): the dashboard's rule is sign-in.
  if (error.status === 403) return { kind: 'signin' };
  if (isAmbiguous(error)) {
    logUnconfirmed(where, error);
    return { kind: 'unconfirmed' };
  }
  return null;
}

/** Runs one owner write under a fresh key; maps its problem with `refuse`, then the shared refusals, else rethrows. */
async function ownerWrite<T, R>(
  where: string,
  post: (key: string) => Promise<T>,
  done: (answer: T) => R,
  refuse: (error: ApiProblem) => R | null = () => null,
): Promise<R | OwnerRefusal> {
  try {
    return done(await sendUnderKey(post, randomUUID()));
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    const mapped = refuse(error) ?? ownerRefusal(error, where);
    if (mapped) return mapped;
    throw error;
  }
}

const fields = (row: RosterRowInput): Fields => ({
  ...(row.name != null && { name: String(row.name) }),
  ...(row.phone != null && row.phone !== '' && { phone: String(row.phone) }),
  ...(row.category != null && row.category !== '' && { category: String(row.category) }),
  ...(row.guestCount != null && row.guestCount !== '' && { guestCount: String(row.guestCount) }),
});

type Owner = { ownerToken: string };

export async function addGuestThroughApi(
  input: Owner & { invitationId: number; row: RosterRowInput; invitedEventIds: readonly string[]; flags: RosterFlags },
  env: Env = process.env,
): Promise<AddOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'add',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/guests', { invitation: input.invitationId },
        { guest: fields(input.row), invitedEventIds: [...input.invitedEventIds], flags: input.flags },
        { ownerToken: input.ownerToken, idempotencyKey }),
    (added): AddOutcome => ({ kind: 'saved', id: added.id, slug: added.slug }),
    (error): AddOutcome | null =>
      error.code === 'roster.row_invalid' ? { kind: 'invalid', reason: reasonOf(error) }
      : error.code === 'roster.full' ? { kind: 'full' }
      : null,
  );
}

function summaryOf(result: components['schemas']['GuestImportResult']): ImportSummary {
  return {
    verdicts: result.verdicts.map((verdict) =>
      verdict.status === 'ok' ? { status: 'ok', slug: verdict.slug ?? '' }
      : verdict.status === 'invalid' ? { status: 'invalid', reason: (verdict.reason ?? 'name') as RowReason }
      : { status: 'duplicate', of: verdict.of ?? 'roster' },
    ),
    ok: result.ok,
    invalid: result.invalid,
    duplicate: result.duplicate,
    refusal: result.refusal ?? null,
  };
}

export async function importGuestsThroughApi(
  input: Owner & { invitationId: number; rows: RosterRowInput[]; dryRun: boolean; flags: RosterFlags },
  env: Env = process.env,
): Promise<ImportOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    input.dryRun ? 'import preview' : 'import',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/guest-imports', { invitation: input.invitationId },
        { rows: input.rows.map(fields), dryRun: input.dryRun, flags: input.flags },
        { ownerToken: input.ownerToken, idempotencyKey: input.dryRun ? null : idempotencyKey }),
    (result): ImportOutcome => {
      const summary = summaryOf(result);
      if (input.dryRun) return { kind: 'planned', summary };
      if (summary.refusal || !result.batchId) return { kind: 'refused', summary };
      return { kind: 'imported', batchId: result.batchId, imported: result.imported, summary };
    },
  );
}

export async function undoImportThroughApi(input: Owner & { invitationId: number; batchId: string }, env: Env = process.env): Promise<UndoOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'undo import',
    (idempotencyKey) =>
      apiPostEmpty(config, '/v1/invitations/{invitation}/guest-imports/{batch}/undo', { invitation: input.invitationId, batch: input.batchId },
        { ownerToken: input.ownerToken, idempotencyKey }),
    (undone) => ({ kind: 'undone', deleted: undone.deleted, kept: undone.kept }) as const,
  );
}

const OPERATIONS = { sent: 'SENT', checkin: 'CHECKIN', 'undo-checkin': 'UNDO_CHECKIN' } as const;

export async function guestOperationThroughApi(
  input: Owner & { invitationId: number; guestId: number; operation: RosterOperation },
  env: Env = process.env,
): Promise<OperationOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'operation',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/guests/{guest}/operation', { invitation: input.invitationId, guest: input.guestId },
        { operation: OPERATIONS[input.operation] }, { ownerToken: input.ownerToken, idempotencyKey }),
    () => ({ kind: 'saved' }) as const,
  );
}

/**
 * B-024 (D-056): a batch of scans. The key is the scanner's own for this batch, so a batch the scanner resends after a
 * lost answer replays the first answer (recorded by either writer) instead of turning its first check-ins into `already`.
 */
export async function passCheckinsThroughApi(
  input: Owner & { invitationId: number; scans: readonly PassScanInput[]; key: string },
  env: Env = process.env,
): Promise<PassCheckinOutcome> {
  const config = apiConfigFromEnv(env);
  try {
    const answer = await sendUnderKey(
      (idempotencyKey) =>
        apiPostTo(config, '/v1/invitations/{invitation}/guest-pass-checkins', { invitation: input.invitationId },
          { scans: input.scans.map((scan) => ({ token: scan.token, ...(scan.scannedAt ? { scannedAt: scan.scannedAt } : {}) })) },
          { ownerToken: input.ownerToken, idempotencyKey }),
      input.key,
    );
    return { kind: 'checked', results: answer.results.map(passScanResultOf) };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.code === 'guest_pass.not_enabled') return { kind: 'disabled' };
    if (error.code === 'guest_pass.not_configured') return { kind: 'unconfigured' };
    if (error.code === 'idempotency.key_reused') return { kind: 'key-reused' };
    const refusal = ownerRefusal(error, 'pass check-in');
    if (refusal) return refusal;
    throw error;
  }
}

export async function setInvitedEventsThroughApi(
  input: Owner & { invitationId: number; guestId: number; ticked: readonly string[]; flags: RosterFlags },
  env: Env = process.env,
): Promise<InvitedOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'invited events',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/guests/{guest}/invited-events', { invitation: input.invitationId, guest: input.guestId },
        { ticked: [...input.ticked], flags: input.flags }, { ownerToken: input.ownerToken, idempotencyKey }),
    (): InvitedOutcome => ({ kind: 'saved' }),
    (error): InvitedOutcome | null => (error.code === 'roster.invite_invalid' ? { kind: 'invalid' } : null),
  );
}

export async function setCategoryInvitationThroughApi(
  input: Owner & { invitationId: number; eventId: string; category: string; mode: CategoryMode; flags: RosterFlags },
  env: Env = process.env,
): Promise<CategoryOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'category invitation',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/category-invitations', { invitation: input.invitationId },
        { eventId: input.eventId, category: input.category, mode: input.mode === 'add' ? 'ADD' : 'REMOVE', flags: input.flags },
        { ownerToken: input.ownerToken, idempotencyKey }),
    (saved): CategoryOutcome => ({ kind: 'saved', changed: saved.changed }),
    (error): CategoryOutcome | null => (error.code === 'roster.invite_invalid' ? { kind: 'invalid' } : null),
  );
}

const LINK_ACTIONS = { open: 'OPEN', rotate: 'ROTATE', close: 'CLOSE' } as const;

export async function registrationLinkThroughApi(
  input: Owner & { invitationId: number; action: RegistrationLinkAction },
  env: Env = process.env,
): Promise<LinkOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'registration link',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/registration-link', { invitation: input.invitationId },
        { action: LINK_ACTIONS[input.action] }, { ownerToken: input.ownerToken, idempotencyKey }),
    (saved) => ({ kind: 'saved', token: saved.token ?? null }) as const,
  );
}

export async function decideRegistrationThroughApi(
  input: Owner & { invitationId: number; registrationId: number; decision: RegistrationDecision; flags: RosterFlags },
  env: Env = process.env,
): Promise<DecisionOutcome> {
  const config = apiConfigFromEnv(env);
  return ownerWrite(
    'registration decision',
    (idempotencyKey) =>
      apiPostTo(config, '/v1/invitations/{invitation}/registrations/{registration}/decision',
        { invitation: input.invitationId, registration: input.registrationId },
        { decision: input.decision === 'approve' ? 'APPROVE' : 'REJECT', flags: input.flags },
        { ownerToken: input.ownerToken, idempotencyKey }),
    (decided): DecisionOutcome =>
      decided.status === 'APPROVED' && decided.guestId ? { kind: 'approved', guestId: decided.guestId } : { kind: 'rejected' },
    (error): DecisionOutcome | null =>
      error.code === 'roster.full' ? { kind: 'full' }
      : error.code === 'roster.duplicate' ? { kind: 'duplicate' }
      : error.code === 'roster.row_invalid' ? { kind: 'invalid', reason: reasonOf(error) }
      : null,
  );
}

/** A registration link's last segment, as the API addresses it ("." and ".." would be normalised away). */
const addressable = (segment: string) => segment !== '' && segment !== '.' && segment !== '..';

function registrationRefusal(error: ApiProblem, key: string): RegistrationOutcome {
  switch (error.code) {
    case 'registration.link_not_found':
    case 'registration.closed':
      return { kind: 'closed' };
    case 'registration.full':
      return { kind: 'full' };
    case 'roster.row_invalid':
      return { kind: 'invalid', reason: reasonOf(error) };
    case 'rate_limit.exceeded':
      return error.extras.retryAfter ? { kind: 'busy', retryAfter: error.extras.retryAfter } : { kind: 'busy' };
  }
  if (isAmbiguous(error)) {
    logUnconfirmed('registration', error);
    return { kind: 'unconfirmed', key };
  }
  throw error;
}

export async function registerThroughApi(
  input: { token: string; row: RosterRowInput; clientIp?: string | null; idempotencyKey?: string | null },
  env: Env = process.env,
): Promise<RegistrationOutcome> {
  if (!addressable(input.token)) return { kind: 'closed' };
  const config = apiConfigFromEnv(env);
  const row = fields(input.row);
  const body = {
    name: row.name ?? '',
    ...(row.phone !== undefined && { phone: row.phone }),
    ...(row.guestCount !== undefined && { guestCount: row.guestCount }),
    ...(input.clientIp && { clientIp: input.clientIp }),
  };
  const post = (idempotencyKey: string) =>
    apiPostTo(config, '/v1/registration-links/{token}/registrations', { token: input.token }, body, { idempotencyKey });
  const key = input.idempotencyKey || randomUUID();
  try {
    await sendUnderKey(post, key);
    return { kind: 'received' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.code !== 'idempotency.key_reused') return registrationRefusal(error, key);
  }
  // The form's key with other values is a new submission (the page brought back and changed): a fresh key.
  const fresh = randomUUID();
  try {
    await sendUnderKey(post, fresh);
    return { kind: 'received' };
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return registrationRefusal(error, fresh);
  }
}
