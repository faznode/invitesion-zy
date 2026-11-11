import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { workspaceCreditEntries, workspaces } from '@/lib/db/schema';

/**
 * G-052 (D-067): a workspace's credit ledger, the mechanics only. Every change is one append-only entry written with
 * `workspaces.credit_balance` in a single transaction, under the workspace's row lock, so concurrent operations queue
 * and the balance always equals the sum of the entries. An entry's operation key is unique per workspace: the same
 * operation sent again (a retry, a double tap) returns the first entry and changes nothing, while another payload under a
 * used key is a conflict. A debit that would take the balance below zero is refused with nothing written, and a debit
 * runs inside its operation's transaction (`debitWith`), so an operation that fails takes its debit back with it.
 *
 * What a credit buys, its price, packs, top-ups and the sale that grants them are owner decisions (B-040, G-049): no
 * product path calls this module yet. Next.js is its only writer; a Rust port would follow B-039's writer selection.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreditKind = 'grant' | 'debit';

export type CreditRequest = {
  workspaceId: number;
  /** The operation's stable identity, 3–80 characters: letters, digits and `: . _ -`, starting with a letter or digit. */
  operationKey: string;
  kind: CreditKind;
  /** A whole number of credits, 1 to `MAX_CREDITS_PER_ENTRY`. */
  amount: number;
  invitationId?: number | null;
  actorUserId?: number | null;
  note?: string | null;
};

export type CreditEntry = typeof workspaceCreditEntries.$inferSelect;
export type CreditOutcome = { entry: CreditEntry; replayed: boolean };

export const MAX_CREDITS_PER_ENTRY = 100_000;
const OPERATION_KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]{2,79}$/;

export class CreditRequestError extends Error {
  constructor(readonly field: 'workspace' | 'operationKey' | 'amount' | 'note') {
    super(`invalid credit request: ${field}`);
    this.name = 'CreditRequestError';
  }
}
export class WorkspaceUnavailableError extends Error {
  constructor() {
    super('the workspace does not exist or is disabled');
    this.name = 'WorkspaceUnavailableError';
  }
}
export class InsufficientCreditsError extends Error {
  constructor(
    readonly balance: number,
    readonly requested: number,
  ) {
    super(`insufficient credits: ${balance} < ${requested}`);
    this.name = 'InsufficientCreditsError';
  }
}
export class CreditConflictError extends Error {
  constructor(readonly operationKey: string) {
    super(`the operation key ${operationKey} was used for another credit entry`);
    this.name = 'CreditConflictError';
  }
}

/** Refuses a malformed request before any database work. */
export function validateCreditRequest(request: CreditRequest): void {
  if (!Number.isInteger(request.workspaceId) || request.workspaceId <= 0) throw new CreditRequestError('workspace');
  if (!OPERATION_KEY.test(request.operationKey)) throw new CreditRequestError('operationKey');
  if (!Number.isInteger(request.amount) || request.amount < 1 || request.amount > MAX_CREDITS_PER_ENTRY) throw new CreditRequestError('amount');
  if (request.note != null && [...request.note].length > 200) throw new CreditRequestError('note');
}

/** The signed change an entry makes: a grant adds, a debit takes away. */
export function creditDelta(kind: CreditKind, amount: number): number {
  return kind === 'grant' ? amount : -amount;
}

/**
 * Writes one entry inside the caller's transaction. Locks the workspace row first; then a stored entry under the same
 * key is a replay when its kind, delta and invitation match the request, else a conflict; then the new balance is
 * checked and written with the entry.
 */
export async function applyCreditEntry(tx: Tx, request: CreditRequest): Promise<CreditOutcome> {
  validateCreditRequest(request);
  const [workspace] = await tx
    .select({ id: workspaces.id, balance: workspaces.creditBalance, disabledAt: workspaces.disabledAt })
    .from(workspaces)
    .where(eq(workspaces.id, request.workspaceId))
    .for('update');
  if (!workspace || workspace.disabledAt) throw new WorkspaceUnavailableError();

  const delta = creditDelta(request.kind, request.amount);
  const invitationId = request.invitationId ?? null;
  const [stored] = await tx
    .select()
    .from(workspaceCreditEntries)
    .where(and(eq(workspaceCreditEntries.workspaceId, workspace.id), eq(workspaceCreditEntries.operationKey, request.operationKey)))
    .limit(1);
  if (stored) {
    if (stored.kind === request.kind && stored.delta === delta && stored.invitationId === invitationId) return { entry: stored, replayed: true };
    throw new CreditConflictError(request.operationKey);
  }

  const balanceAfter = workspace.balance + delta;
  if (balanceAfter < 0) throw new InsufficientCreditsError(workspace.balance, request.amount);
  const [entry] = await tx
    .insert(workspaceCreditEntries)
    .values({
      workspaceId: workspace.id,
      operationKey: request.operationKey,
      kind: request.kind,
      delta,
      balanceAfter,
      invitationId,
      actorUserId: request.actorUserId ?? null,
      note: request.note ?? null,
    })
    .returning();
  await tx.update(workspaces).set({ creditBalance: sql`${workspaces.creditBalance} + ${delta}` }).where(eq(workspaces.id, workspace.id));
  return { entry, replayed: false };
}

/** One entry in its own transaction (a grant, or a debit with no associated operation). */
export function recordCredit(request: CreditRequest): Promise<CreditOutcome> {
  return db.transaction((tx) => applyCreditEntry(tx, request));
}

export type DebitOutcome<T> = { replayed: false; entry: CreditEntry; result: T } | { replayed: true; entry: CreditEntry };

/**
 * A debit and the operation it pays for, in one transaction: the debit is written first under the workspace's lock,
 * then `operation` runs on the same transaction. If the operation throws, the transaction rolls back and the debit with
 * it. A replayed key does not run the operation again: the first call already did, and committed, with its debit.
 */
export async function debitWith<T>(request: Omit<CreditRequest, 'kind'>, operation: (tx: Tx) => Promise<T>): Promise<DebitOutcome<T>> {
  return db.transaction(async (tx) => {
    const debit = await applyCreditEntry(tx, { ...request, kind: 'debit' });
    if (debit.replayed) return { replayed: true, entry: debit.entry };
    const result = await operation(tx);
    return { replayed: false, entry: debit.entry, result };
  });
}

/**
 * The balance and whether it equals the sum of the entries (a check for tests and the operator). The subqueries name the
 * outer row as `"workspaces"."id"` on purpose: a single-table select renders `${workspaces.id}` unqualified, and inside
 * the subquery a bare `"id"` would bind to the entry's own id.
 */
export async function creditBalance(workspaceId: number): Promise<{ balance: number; ledgerSum: number; entries: number } | null> {
  const [row] = await db
    .select({
      balance: workspaces.creditBalance,
      ledgerSum: sql<number>`coalesce((select sum(e.delta) from workspace_credit_entries e where e.workspace_id = "workspaces"."id"), 0)::int`,
      entries: sql<number>`(select count(*) from workspace_credit_entries e where e.workspace_id = "workspaces"."id")::int`,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row ? { balance: Number(row.balance), ledgerSum: Number(row.ledgerSum), entries: Number(row.entries) } : null;
}
