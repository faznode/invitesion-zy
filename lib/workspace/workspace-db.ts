import 'server-only';

import { and, asc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitations, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { joinTokenHash, newJoinToken } from '@/lib/invitation/join-token';
import {
  decideJoin,
  isWorkspaceRole,
  JOIN_TOKEN_PATTERN,
  joinLinkExpiry,
  MAX_WORKSPACE_ROWS,
  teamRowState,
  type TeamRowState,
  type WorkspaceRole,
} from '@/lib/invitation/members';

/**
 * G-052 (D-067): reseller workspaces at the Next.js boundary, which owns the Clerk boundary as G-044's team does: the
 * workspace, its staff's join links, acceptance, revocation and leaving, and the owner's assignment of their own
 * invitations as client invitations. This module is the only writer of those rows. Callers check `FLAG_WORKSPACES`
 * first; what staff may do on a client invitation is decided by `invitationAccess` and both writers' membership clause.
 */

export type Workspace = typeof workspaces.$inferSelect;

/** The workspace this account owns, if any (one per account), disabled or not. */
export async function ownedWorkspace(userId: number): Promise<Workspace | null> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, userId)).limit(1);
  return row ?? null;
}

export type Membership = { workspaceId: number; name: string; role: WorkspaceRole };

/** The workspaces this account staffs: live grants of workspaces that are not disabled. */
export async function workspaceMemberships(userId: number): Promise<Membership[]> {
  const rows = await db
    .select({ workspaceId: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), isNull(workspaceMembers.revokedAt), isNull(workspaces.disabledAt)))
    .orderBy(asc(workspaces.name));
  return rows.flatMap((row) => (isWorkspaceRole(row.role) ? [{ ...row, role: row.role }] : []));
}

export type CreateWorkspaceOutcome = { kind: 'created'; workspace: Workspace } | { kind: 'exists' };

/** One workspace per account: a second create (or two at once) finds the unique owner index and changes nothing. */
export async function createWorkspace(ownerId: number, name: string, now: Date = new Date()): Promise<CreateWorkspaceOutcome> {
  const [created] = await db
    .insert(workspaces)
    .values({ name, ownerUserId: ownerId, createdAt: now })
    .onConflictDoNothing({ target: workspaces.ownerUserId })
    .returning();
  return created ? { kind: 'created', workspace: created } : { kind: 'exists' };
}

export type StaffRow = {
  id: number;
  role: WorkspaceRole;
  label: string;
  state: TeamRowState;
  name: string | null;
  email: string | null;
  createdAt: Date;
  expiresAt: Date;
};

/** The owner's view of the staff: live grants and links (revoked rows are history and stay out). */
export async function workspaceStaff(workspaceId: number, now: Date = new Date()): Promise<StaffRow[]> {
  const rows = await db
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      label: workspaceMembers.label,
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      createdAt: workspaceMembers.createdAt,
      expiresAt: workspaceMembers.expiresAt,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.revokedAt)))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.id));
  return rows.flatMap((row) =>
    isWorkspaceRole(row.role)
      ? [
          {
            id: row.id,
            role: row.role,
            label: row.label,
            state: teamRowState(row, now),
            name: row.name,
            email: row.email,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
          },
        ]
      : [],
  );
}

export type CreateStaffLinkOutcome = { kind: 'created'; token: string } | { kind: 'full' } | { kind: 'notfound' };

/**
 * A staff join link for one role. The owner's workspace row is locked while the live rows are counted, so two links
 * made at once cannot pass the ceiling together. The token is returned once and never stored: the row keeps its SHA-256.
 */
export async function createStaffLink(
  ownerId: number,
  input: { role: WorkspaceRole; label: string },
  now: Date = new Date(),
): Promise<CreateStaffLinkOutcome> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.ownerUserId, ownerId), isNull(workspaces.disabledAt)))
      .for('update');
    if (!workspace) return { kind: 'notfound' };
    const [{ live }] = await tx
      .select({ live: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          isNull(workspaceMembers.revokedAt),
          or(isNotNull(workspaceMembers.userId), gt(workspaceMembers.expiresAt, now)),
        ),
      );
    if (live >= MAX_WORKSPACE_ROWS) return { kind: 'full' };
    const token = newJoinToken();
    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      role: input.role,
      label: input.label,
      tokenHash: joinTokenHash(token),
      expiresAt: joinLinkExpiry(now),
      createdAt: now,
    });
    return { kind: 'created', token };
  });
}

/** The owner revokes a grant or a link of their own workspace: the member's next request is refused everywhere. */
export async function revokeStaffRow(ownerId: number, rowId: number, now: Date = new Date()): Promise<boolean> {
  if (!Number.isInteger(rowId) || rowId <= 0) return false;
  const changed = await db
    .update(workspaceMembers)
    .set({ revokedAt: now })
    .where(
      and(
        eq(workspaceMembers.id, rowId),
        isNull(workspaceMembers.revokedAt),
        // Qualified on purpose: a single-table update renders `${workspaceMembers.workspaceId}` as a bare column name.
        sql`exists (select 1 from workspaces w where w.id = "workspace_members"."workspace_id" and w.owner_user_id = ${ownerId})`,
      ),
    )
    .returning({ id: workspaceMembers.id });
  return changed.length > 0;
}

/** A member leaves a workspace (their own grant only). */
export async function leaveWorkspace(userId: number, workspaceId: number, now: Date = new Date()): Promise<boolean> {
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) return false;
  const changed = await db
    .update(workspaceMembers)
    .set({ revokedAt: now })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), isNull(workspaceMembers.revokedAt)))
    .returning({ id: workspaceMembers.id });
  return changed.length > 0;
}

export type StaffJoinPreview =
  | { state: 'open'; role: WorkspaceRole; workspaceName: string }
  | { state: 'already'; role: WorkspaceRole; workspaceName: string }
  | { state: 'invalid' };

/** What a staff link offers, for its page: nothing about a link that cannot be accepted, whatever the reason. */
export async function staffJoinPreview(token: string, userId: number | null, now: Date = new Date()): Promise<StaffJoinPreview> {
  if (!JOIN_TOKEN_PATTERN.test(token)) return { state: 'invalid' };
  const [row] = await db
    .select({
      role: workspaceMembers.role,
      userId: workspaceMembers.userId,
      revokedAt: workspaceMembers.revokedAt,
      expiresAt: workspaceMembers.expiresAt,
      workspaceName: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.tokenHash, joinTokenHash(token)), isNull(workspaces.disabledAt)))
    .limit(1);
  if (!row || row.revokedAt || !isWorkspaceRole(row.role)) return { state: 'invalid' };
  if (row.userId !== null) {
    return userId !== null && row.userId === userId ? { state: 'already', role: row.role, workspaceName: row.workspaceName } : { state: 'invalid' };
  }
  return row.expiresAt.getTime() > now.getTime() ? { state: 'open', role: row.role, workspaceName: row.workspaceName } : { state: 'invalid' };
}

export type StaffJoinOutcome = { kind: 'joined' | 'already'; workspaceId: number; role: WorkspaceRole } | { kind: 'invalid' | 'owner' | 'member' };

function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) => (typeof value === 'object' && value !== null && 'code' in value ? (value as { code?: unknown }).code : undefined);
  return codeOf(error) === '23505' || (typeof error === 'object' && error !== null && codeOf((error as { cause?: unknown }).cause) === '23505');
}

/**
 * Accepts a staff link for the signed-in customer (`decideJoin`, as a team link). The link's row is locked, so two
 * accounts racing for one link get one grant; the partial unique index keeps one live grant per account and workspace
 * if two links race. The workspace's owner never joins their own workspace.
 */
export async function acceptStaffLink(userId: number, token: string, now: Date = new Date()): Promise<StaffJoinOutcome> {
  if (!JOIN_TOKEN_PATTERN.test(token)) return { kind: 'invalid' };
  try {
    return await db.transaction(async (tx): Promise<StaffJoinOutcome> => {
      const [row] = await tx
        .select({
          id: workspaceMembers.id,
          workspaceId: workspaceMembers.workspaceId,
          role: workspaceMembers.role,
          userId: workspaceMembers.userId,
          revokedAt: workspaceMembers.revokedAt,
          expiresAt: workspaceMembers.expiresAt,
          ownerId: workspaces.ownerUserId,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(and(eq(workspaceMembers.tokenHash, joinTokenHash(token)), isNull(workspaces.disabledAt)))
        .for('update', { of: workspaceMembers });
      if (!row || !isWorkspaceRole(row.role)) return { kind: 'invalid' };
      const live =
        row.userId === null
          ? await tx
              .select({ id: workspaceMembers.id })
              .from(workspaceMembers)
              .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(workspaceMembers.userId, userId), isNull(workspaceMembers.revokedAt)))
              .limit(1)
          : [];
      const decision = decideJoin(row, userId, live.length > 0, now);
      if (decision === 'join') {
        await tx.update(workspaceMembers).set({ userId, acceptedAt: now }).where(eq(workspaceMembers.id, row.id));
        return { kind: 'joined', workspaceId: row.workspaceId, role: row.role };
      }
      if (decision === 'already') return { kind: 'already', workspaceId: row.workspaceId, role: row.role };
      return { kind: decision };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: 'member' };
    throw error;
  }
}

/**
 * The owner makes one of their own live invitations a client invitation of their own workspace (not disabled), or
 * changes its client's name. Nothing else about the invitation changes: its owner of record stays the owner.
 */
export async function assignClientInvitation(ownerId: number, invitationId: number, clientLabel: string): Promise<boolean> {
  if (!Number.isInteger(invitationId) || invitationId <= 0) return false;
  const changed = await db
    .update(invitations)
    .set({
      workspaceId: sql`(select w.id from workspaces w where w.owner_user_id = ${ownerId} and w.disabled_at is null)`,
      clientLabel,
    })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.userId, ownerId),
        isNull(invitations.deletedAt),
        sql`exists (select 1 from workspaces w where w.owner_user_id = ${ownerId} and w.disabled_at is null)`,
      ),
    )
    .returning({ id: invitations.id });
  return changed.length > 0;
}

/** The owner takes a client invitation back to a personal one: its staff lose it at their next request. */
export async function unassignClientInvitation(ownerId: number, invitationId: number): Promise<boolean> {
  if (!Number.isInteger(invitationId) || invitationId <= 0) return false;
  const changed = await db
    .update(invitations)
    .set({ workspaceId: null, clientLabel: null })
    .where(and(eq(invitations.id, invitationId), eq(invitations.userId, ownerId), isNotNull(invitations.workspaceId)))
    .returning({ id: invitations.id });
  return changed.length > 0;
}

export type ClientInvitation = { invitationId: number; slug: string; eventType: string; status: string; clientLabel: string | null };

/** A workspace's live client invitations: only those its owner owns, whatever wrote the column. */
export async function clientInvitations(workspaceId: number): Promise<ClientInvitation[]> {
  return db
    .select({
      invitationId: invitations.id,
      slug: invitations.slug,
      eventType: invitations.eventType,
      status: invitations.status,
      clientLabel: invitations.clientLabel,
    })
    .from(invitations)
    .innerJoin(workspaces, and(eq(workspaces.id, invitations.workspaceId), eq(workspaces.ownerUserId, invitations.userId)))
    .where(and(eq(invitations.workspaceId, workspaceId), isNull(invitations.deletedAt)))
    .orderBy(asc(invitations.clientLabel), asc(invitations.slug));
}

/** The owner's personal invitations that could become client invitations (live, not yet in the workspace). */
export async function assignableInvitations(ownerId: number): Promise<{ invitationId: number; slug: string }[]> {
  return db
    .select({ invitationId: invitations.id, slug: invitations.slug })
    .from(invitations)
    .where(and(eq(invitations.userId, ownerId), isNull(invitations.workspaceId), isNull(invitations.deletedAt)))
    .orderBy(asc(invitations.slug));
}
