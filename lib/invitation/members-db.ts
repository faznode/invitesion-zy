import 'server-only';

import { and, asc, eq, gt, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { invitationMembers, invitations, users, workspaceMembers, workspaces, type Invitation } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { joinTokenHash, newJoinToken } from './join-token';
import {
  broaderMemberRole,
  can,
  decideJoin,
  isMemberRole,
  isWorkspaceRole,
  WORKSPACE_ROLE_AS_MEMBER,
  JOIN_TOKEN_PATTERN,
  joinLinkExpiry,
  MAX_TEAM_ROWS,
  teamRowState,
  type AccessRole,
  type Capability,
  type MemberRole,
  type TeamRowState,
} from './members';

/**
 * G-044 (D-057): the team at the Next.js boundary. Next.js owns the Clerk boundary (ADR-A2), so join links, acceptance
 * and revocation are written here only; the roster, RSVP and wishes writers in both languages read the grants this
 * table holds and check them again inside their own transactions.
 */

type Env = Record<string, string | undefined>;

/** `via` says where a member's role comes from: the invitation's own team (G-044) or its workspace (G-052). */
export type InvitationAccess = { role: AccessRole; invitation: Invitation; via?: 'team' | 'workspace' };

/**
 * May this signed-in customer work on this invitation, and as what? The owner always. A member only while
 * `FLAG_TEAM_ACCESS` is on and their grant is live, read on every call, so a revoked grant or the flag switched off
 * stops a member at their next request. A grant counts only for a live customer account: an account later made an
 * administrator, or deleted, holds none. Every page, action and route that can serve a member asks this first, since
 * the writers check the grant but not the flag. B-031 (D-063): a deleted invitation grants nothing to anyone; its owner
 * gets it back only through the restore on the invitations list.
 *
 * G-052 (D-067): a client invitation (`workspace_id` set) is also reachable through a live membership of its workspace
 * while `FLAG_WORKSPACES` is on and the workspace is not disabled, on the same account conditions, with the team role its
 * workspace role carries (`WORKSPACE_ROLE_AS_MEMBER`). An account holding both a direct grant and a workspace grant
 * works with the broader of the two. The workspace must belong to the invitation's owner, whatever wrote the column.
 */
export async function invitationAccess(userId: number, invitationId: number, env: Env = process.env): Promise<InvitationAccess | null> {
  if (!Number.isInteger(invitationId) || invitationId <= 0) return null;
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), isNull(invitations.deletedAt)))
    .limit(1);
  if (!invitation) return null;
  if (invitation.userId === userId) return { role: 'owner', invitation };
  const teamOn = isFlagOn('TEAM_ACCESS', env);
  const workspaceId = invitation.workspaceId;
  const workspaceOn = workspaceId !== null && isFlagOn('WORKSPACES', env);
  if (!teamOn && !workspaceOn) return null;
  const direct = teamOn ? await directGrantRole(userId, invitationId) : null;
  const viaWorkspace = workspaceOn ? await workspaceGrantRole(userId, workspaceId, invitation.userId) : null;
  const role = broaderMemberRole(direct, viaWorkspace);
  if (!role) return null;
  return { role, invitation, via: role === direct ? 'team' : 'workspace' };
}

async function directGrantRole(userId: number, invitationId: number): Promise<MemberRole | null> {
  const [grant] = await db
    .select({ role: invitationMembers.role })
    .from(invitationMembers)
    .innerJoin(users, eq(users.id, invitationMembers.userId))
    .where(
      and(
        eq(invitationMembers.invitationId, invitationId),
        eq(invitationMembers.userId, userId),
        isNull(invitationMembers.revokedAt),
        ne(users.role, 'ADMIN'),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return grant && isMemberRole(grant.role) ? grant.role : null;
}

/** The team role a live workspace membership carries on the invitations of the workspace `ownerId` owns, if any. */
async function workspaceGrantRole(userId: number, workspaceId: number, ownerId: number): Promise<MemberRole | null> {
  const [grant] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        isNull(workspaceMembers.revokedAt),
        eq(workspaces.ownerUserId, ownerId),
        isNull(workspaces.disabledAt),
        ne(users.role, 'ADMIN'),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return grant && isWorkspaceRole(grant.role) ? WORKSPACE_ROLE_AS_MEMBER[grant.role] : null;
}

/** `invitationAccess` narrowed to one capability: null unless the caller's role holds it. */
export async function accessFor(userId: number, invitationId: number, capability: Capability, env: Env = process.env): Promise<InvitationAccess | null> {
  const access = await invitationAccess(userId, invitationId, env);
  return access && can(access.role, capability) ? access : null;
}

export type SharedInvitation = { invitationId: number; role: MemberRole; slug: string; eventType: string; status: string };

/**
 * The invitations this customer works on as a member, for the dashboard: their team grants while `FLAG_TEAM_ACCESS` is
 * on, and the client invitations of the workspaces they staff while `FLAG_WORKSPACES` is on (G-052), one row per
 * invitation with the broader role.
 */
export async function sharedInvitations(userId: number, env: Env = process.env): Promise<SharedInvitation[]> {
  const columns = { invitationId: invitations.id, slug: invitations.slug, eventType: invitations.eventType, status: invitations.status };
  const teamRows = isFlagOn('TEAM_ACCESS', env)
    ? await db
        .select({ ...columns, role: invitationMembers.role })
        .from(invitationMembers)
        .innerJoin(invitations, eq(invitations.id, invitationMembers.invitationId))
        .where(and(eq(invitationMembers.userId, userId), isNull(invitationMembers.revokedAt), isNull(invitations.deletedAt)))
    : [];
  const workspaceRows = isFlagOn('WORKSPACES', env)
    ? await db
        .select({ ...columns, role: workspaceMembers.role })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .innerJoin(invitations, and(eq(invitations.workspaceId, workspaces.id), eq(invitations.userId, workspaces.ownerUserId)))
        .where(and(eq(workspaceMembers.userId, userId), isNull(workspaceMembers.revokedAt), isNull(workspaces.disabledAt), isNull(invitations.deletedAt)))
    : [];
  const byInvitation = new Map<number, SharedInvitation>();
  const add = (row: Omit<SharedInvitation, 'role'>, role: MemberRole | null) => {
    if (!role) return;
    const held = byInvitation.get(row.invitationId);
    byInvitation.set(row.invitationId, { ...row, role: broaderMemberRole(held?.role ?? null, role) as MemberRole });
  };
  for (const { role, ...row } of teamRows) add(row, isMemberRole(role) ? role : null);
  for (const { role, ...row } of workspaceRows) add(row, isWorkspaceRole(role) ? WORKSPACE_ROLE_AS_MEMBER[role] : null);
  return [...byInvitation.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export type TeamRow = {
  id: number;
  role: MemberRole;
  label: string;
  state: TeamRowState;
  expiresAt: Date;
  acceptedAt: Date | null;
  /** The account that accepted: shown so the owner can tell a forwarded link from the person they sent it to. */
  member: { name: string | null; email: string } | null;
};

/** The owner's view of the team (the caller has checked `manage`): live grants and unrevoked links, oldest first. */
export async function teamOf(invitationId: number, now: Date = new Date()): Promise<TeamRow[]> {
  const rows = await db
    .select({
      id: invitationMembers.id,
      role: invitationMembers.role,
      label: invitationMembers.label,
      userId: invitationMembers.userId,
      expiresAt: invitationMembers.expiresAt,
      acceptedAt: invitationMembers.acceptedAt,
      name: users.name,
      email: users.email,
    })
    .from(invitationMembers)
    .leftJoin(users, eq(users.id, invitationMembers.userId))
    .where(and(eq(invitationMembers.invitationId, invitationId), isNull(invitationMembers.revokedAt)))
    .orderBy(asc(invitationMembers.createdAt), asc(invitationMembers.id));
  return rows.flatMap((row) =>
    isMemberRole(row.role)
      ? [
          {
            id: row.id,
            role: row.role,
            label: row.label,
            state: teamRowState(row, now),
            expiresAt: row.expiresAt,
            acceptedAt: row.acceptedAt,
            member: row.userId !== null && row.email ? { name: row.name, email: row.email } : null,
          },
        ]
      : [],
  );
}

export type CreateLinkOutcome = { kind: 'created'; token: string } | { kind: 'full' } | { kind: 'notfound' };

/**
 * A join link for one role. The invitation's row is locked while the live rows are counted, so two links made at once
 * cannot pass the ceiling together. The token is returned once and never stored: the row keeps its SHA-256.
 */
export async function createJoinLink(
  ownerId: number,
  invitationId: number,
  input: { role: MemberRole; label: string },
  now: Date = new Date(),
): Promise<CreateLinkOutcome> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.userId, ownerId), isNull(invitations.deletedAt)))
      .for('update');
    if (!owned) return { kind: 'notfound' };
    const [{ live }] = await tx
      .select({ live: sql<number>`count(*)::int` })
      .from(invitationMembers)
      .where(
        and(
          eq(invitationMembers.invitationId, invitationId),
          isNull(invitationMembers.revokedAt),
          or(isNotNull(invitationMembers.userId), gt(invitationMembers.expiresAt, now)),
        ),
      );
    if (live >= MAX_TEAM_ROWS) return { kind: 'full' };
    const token = newJoinToken();
    await tx.insert(invitationMembers).values({
      invitationId,
      role: input.role,
      label: input.label,
      tokenHash: joinTokenHash(token),
      expiresAt: joinLinkExpiry(now),
      createdAt: now,
    });
    return { kind: 'created', token };
  });
}

/** The owner revokes a grant or a link: the member's next request is refused, and the link stops at once. */
export async function revokeTeamRow(ownerId: number, invitationId: number, rowId: number, now: Date = new Date()): Promise<boolean> {
  const changed = await db
    .update(invitationMembers)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitationMembers.id, rowId),
        eq(invitationMembers.invitationId, invitationId),
        isNull(invitationMembers.revokedAt),
        sql`exists (select 1 from invitations i where i.id = ${invitationMembers.invitationId} and i.user_id = ${ownerId})`,
      ),
    )
    .returning({ id: invitationMembers.id });
  return changed.length > 0;
}

/** A member leaves an invitation's team (their own grant only). */
export async function leaveTeam(userId: number, invitationId: number, now: Date = new Date()): Promise<boolean> {
  const changed = await db
    .update(invitationMembers)
    .set({ revokedAt: now })
    .where(and(eq(invitationMembers.invitationId, invitationId), eq(invitationMembers.userId, userId), isNull(invitationMembers.revokedAt)))
    .returning({ id: invitationMembers.id });
  return changed.length > 0;
}

export type JoinPreview =
  | { state: 'open'; role: MemberRole; slug: string }
  | { state: 'already'; role: MemberRole; slug: string; invitationId: number }
  | { state: 'invalid' };

/** What a join link offers, for its page: nothing about a link that cannot be accepted, whatever the reason. */
export async function joinPreview(token: string, userId: number | null, now: Date = new Date()): Promise<JoinPreview> {
  if (!JOIN_TOKEN_PATTERN.test(token)) return { state: 'invalid' };
  const [row] = await db
    .select({
      invitationId: invitationMembers.invitationId,
      role: invitationMembers.role,
      userId: invitationMembers.userId,
      revokedAt: invitationMembers.revokedAt,
      expiresAt: invitationMembers.expiresAt,
      slug: invitations.slug,
    })
    .from(invitationMembers)
    .innerJoin(invitations, eq(invitations.id, invitationMembers.invitationId))
    .where(and(eq(invitationMembers.tokenHash, joinTokenHash(token)), isNull(invitations.deletedAt)))
    .limit(1);
  if (!row || row.revokedAt || !isMemberRole(row.role)) return { state: 'invalid' };
  if (row.userId !== null) {
    return userId !== null && row.userId === userId ? { state: 'already', role: row.role, slug: row.slug, invitationId: row.invitationId } : { state: 'invalid' };
  }
  return row.expiresAt.getTime() > now.getTime() ? { state: 'open', role: row.role, slug: row.slug } : { state: 'invalid' };
}

export type JoinOutcome = { kind: 'joined' | 'already'; invitationId: number; role: MemberRole } | { kind: 'invalid' | 'owner' | 'member' };

function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) => (typeof value === 'object' && value !== null && 'code' in value ? (value as { code?: unknown }).code : undefined);
  return codeOf(error) === '23505' || (typeof error === 'object' && error !== null && codeOf((error as { cause?: unknown }).cause) === '23505');
}

/**
 * Accepts a join link for the signed-in customer (`decideJoin`). The link's row is locked, so two accounts racing for
 * one link get one grant; the partial unique index keeps one live grant per account and invitation if two links race.
 */
export async function acceptJoinLink(userId: number, token: string, now: Date = new Date()): Promise<JoinOutcome> {
  if (!JOIN_TOKEN_PATTERN.test(token)) return { kind: 'invalid' };
  try {
    return await db.transaction(async (tx): Promise<JoinOutcome> => {
      const [row] = await tx
        .select({
          id: invitationMembers.id,
          invitationId: invitationMembers.invitationId,
          role: invitationMembers.role,
          userId: invitationMembers.userId,
          revokedAt: invitationMembers.revokedAt,
          expiresAt: invitationMembers.expiresAt,
          ownerId: invitations.userId,
        })
        .from(invitationMembers)
        .innerJoin(invitations, eq(invitations.id, invitationMembers.invitationId))
        .where(and(eq(invitationMembers.tokenHash, joinTokenHash(token)), isNull(invitations.deletedAt)))
        .for('update', { of: invitationMembers });
      if (!row || !isMemberRole(row.role)) return { kind: 'invalid' };
      const live =
        row.userId === null
          ? await tx
              .select({ id: invitationMembers.id })
              .from(invitationMembers)
              .where(and(eq(invitationMembers.invitationId, row.invitationId), eq(invitationMembers.userId, userId), isNull(invitationMembers.revokedAt)))
              .limit(1)
          : [];
      const decision = decideJoin(row, userId, live.length > 0, now);
      if (decision === 'join') {
        await tx.update(invitationMembers).set({ userId, acceptedAt: now }).where(eq(invitationMembers.id, row.id));
        return { kind: 'joined', invitationId: row.invitationId, role: row.role };
      }
      if (decision === 'already') return { kind: 'already', invitationId: row.invitationId, role: row.role };
      return { kind: decision };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: 'member' };
    throw error;
  }
}
