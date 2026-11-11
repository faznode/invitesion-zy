import 'server-only';

import { backendFor } from '@/lib/backend';
import { isFlagOn } from '@/lib/flags';
import { passVerifySecrets } from './guest-pass';
import * as api from './roster-api';
import * as next from './roster-next';
import type {
  AddOutcome,
  CategoryMode,
  CategoryOutcome,
  DecisionOutcome,
  ImportOutcome,
  InvitedOutcome,
  LinkOutcome,
  OperationOutcome,
  PassCheckinOutcome,
  PassScanInput,
  RegistrationDecision,
  RegistrationLinkAction,
  RegistrationOutcome,
  RosterFlags,
  RosterOperation,
  UndoOutcome,
} from './roster-outcomes';
import type { RosterRowInput } from './roster-rules';

/**
 * B-033: the one entry for every roster write. `BACKEND_ROSTER` (default `next`) selects exactly one writer per call;
 * the branch for `rust` returns its own outcome, so the TypeScript writer is never reached as a fallback (a fallback
 * after a timeout could be a second writer for a request the first already committed). Call sites map the shared
 * outcomes (`roster-outcomes.ts`) to their notices and never branch on the writer themselves.
 */

type Env = Record<string, string | undefined>;

/** The signed-in host: the local user id for the TypeScript writer, the session token for the Rust writer. */
export type RosterCaller = { userId: number; ownerToken: () => Promise<string | null> };

export function rosterFlags(env: Env = process.env): RosterFlags {
  return { opaqueLinks: isFlagOn('OPAQUE_GUEST_LINKS', env), inviteOnlyEvents: isFlagOn('INVITE_ONLY_EVENTS', env) };
}

const rust = (env: Env) => backendFor('ROSTER', env) === 'rust';

/** The session token, or null: the API would refuse the call, and the dashboard's rule for that is sign-in. */
async function tokenOf(caller: RosterCaller): Promise<string | null> {
  return caller.ownerToken();
}

export async function addRosterGuest(
  caller: RosterCaller,
  input: { invitationId: number; row: RosterRowInput; invitedEventIds: readonly string[] },
  env: Env = process.env,
): Promise<AddOutcome> {
  const flags = rosterFlags(env);
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.addGuestThroughApi({ ...input, flags, ownerToken }, env) : { kind: 'signin' };
  }
  return next.addGuestNext({ ...input, userId: caller.userId, flags });
}

export async function importRosterGuests(
  caller: RosterCaller,
  input: { invitationId: number; rows: RosterRowInput[]; dryRun: boolean },
  env: Env = process.env,
): Promise<ImportOutcome> {
  const flags = rosterFlags(env);
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.importGuestsThroughApi({ ...input, flags, ownerToken }, env) : { kind: 'signin' };
  }
  return next.importGuestsNext({ ...input, userId: caller.userId, flags });
}

export async function undoRosterImport(caller: RosterCaller, input: { invitationId: number; batchId: string }, env: Env = process.env): Promise<UndoOutcome> {
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.undoImportThroughApi({ ...input, ownerToken }, env) : { kind: 'signin' };
  }
  return next.undoImportNext({ ...input, userId: caller.userId });
}

export async function rosterOperation(
  caller: RosterCaller,
  input: { invitationId: number; guestId: number; operation: RosterOperation },
  env: Env = process.env,
): Promise<OperationOutcome> {
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.guestOperationThroughApi({ ...input, ownerToken }, env) : { kind: 'signin' };
  }
  return next.guestOperationNext({ ...input, userId: caller.userId });
}

export async function setRosterInvitedEvents(
  caller: RosterCaller,
  input: { invitationId: number; guestId: number; ticked: readonly string[] },
  env: Env = process.env,
): Promise<InvitedOutcome> {
  const flags = rosterFlags(env);
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.setInvitedEventsThroughApi({ ...input, flags, ownerToken }, env) : { kind: 'signin' };
  }
  return next.setInvitedEventsNext({ ...input, userId: caller.userId, flags });
}

export async function setRosterCategoryInvitation(
  caller: RosterCaller,
  input: { invitationId: number; eventId: string; category: string; mode: CategoryMode },
  env: Env = process.env,
): Promise<CategoryOutcome> {
  const flags = rosterFlags(env);
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.setCategoryInvitationThroughApi({ ...input, flags, ownerToken }, env) : { kind: 'signin' };
  }
  return next.setCategoryInvitationNext({ ...input, userId: caller.userId, flags });
}

export async function setRegistrationLink(
  caller: RosterCaller,
  input: { invitationId: number; action: RegistrationLinkAction },
  env: Env = process.env,
): Promise<LinkOutcome> {
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.registrationLinkThroughApi({ ...input, ownerToken }, env) : { kind: 'signin' };
  }
  return next.registrationLinkNext({ ...input, userId: caller.userId });
}

export async function decideRosterRegistration(
  caller: RosterCaller,
  input: { invitationId: number; registrationId: number; decision: RegistrationDecision },
  env: Env = process.env,
): Promise<DecisionOutcome> {
  const flags = rosterFlags(env);
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.decideRegistrationThroughApi({ ...input, flags, ownerToken }, env) : { kind: 'signin' };
  }
  return next.decideRegistrationNext({ ...input, userId: caller.userId, flags });
}

/**
 * B-024 (D-056): a batch of guest-pass scans from the host's scanner. Flag off: every pass is inert and no writer is
 * called. Otherwise exactly one writer, like every roster write; the TypeScript writer verifies with this process's
 * secrets, the Rust writer with its own (`GUEST_PASS_SECRET` on the API). Both record the scanner's batch key with the
 * answer in `api_idempotency_keys`, so a resent batch replays its first answer whichever writer gave it.
 */
export async function checkInWithPasses(
  caller: RosterCaller,
  input: { invitationId: number; scans: readonly PassScanInput[]; key: string },
  env: Env = process.env,
): Promise<PassCheckinOutcome> {
  if (!isFlagOn('GUEST_PASS', env)) return { kind: 'disabled' };
  if (rust(env)) {
    const ownerToken = await tokenOf(caller);
    return ownerToken ? api.passCheckinsThroughApi({ ...input, ownerToken }, env) : { kind: 'signin' };
  }
  const secrets = passVerifySecrets(env);
  if (!secrets.length) return { kind: 'unconfigured' };
  return next.passCheckinNext({ userId: caller.userId, invitationId: input.invitationId, scans: input.scans, key: input.key, secrets });
}

/** A self-registration from the public form; the key is the rendered form's, so a double submit writes once (Rust). */
export async function registerRosterGuest(
  input: { token: string; row: RosterRowInput; clientIp?: string | null; idempotencyKey?: string | null },
  env: Env = process.env,
): Promise<RegistrationOutcome> {
  if (rust(env)) return api.registerThroughApi(input, env);
  return next.registerNext({ token: input.token, row: input.row, clientIp: input.clientIp }, env);
}
