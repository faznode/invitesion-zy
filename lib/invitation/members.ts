/**
 * G-044 (D-057): an invitation's team. The owner may do everything; a member holds one role, and each role grants a
 * fixed set of capabilities. The Rust writers hold the same table (`services/api/src/members.rs`), pinned by
 * `contracts/vectors/member-roles.json` (`scripts/api/member-roles-vectors.ts`). Pure and safe in the browser: no
 * database, no session, no Node API (the link's secret is made in `join-token.ts`).
 */

export const MEMBER_ROLES = ['cohost', 'usher'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type AccessRole = 'owner' | MemberRole;

export const CAPABILITIES = ['checkin', 'guests', 'wishes', 'insights', 'manage'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * The member roles allowed each capability (the owner holds all of them):
 * - `checkin`: the scanner page, its batches and the manual fallback;
 * - `guests`: the guest list and its roster writes, RSVP overrides and imports;
 * - `wishes`: moderation and replies;
 * - `insights`: the analytics page and the guest exports;
 * - `manage`: content, theme, settings, checkout, publishing and the team itself, for the owner alone.
 */
export const MEMBER_CAPABILITIES: Readonly<Record<Capability, readonly MemberRole[]>> = {
  checkin: ['cohost', 'usher'],
  guests: ['cohost'],
  wishes: ['cohost'],
  insights: ['cohost'],
  manage: [],
};

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value);
}

export function can(role: AccessRole, capability: Capability): boolean {
  return role === 'owner' || MEMBER_CAPABILITIES[capability].includes(role);
}

export function memberRolesFor(capability: Capability): readonly MemberRole[] {
  return MEMBER_CAPABILITIES[capability];
}

/** A guest operation's capability: checking a guest in is the desk's; marking sent and undoing a check-in are the list's. */
export function operationCapability(operation: 'sent' | 'checkin' | 'undo-checkin'): Capability {
  return operation === 'checkin' ? 'checkin' : 'guests';
}

/** Where a member lands after joining and what the dashboard opens: an usher has only the desk. */
export function memberHome(invitationId: number, role: MemberRole): string {
  return role === 'usher' ? `/dashboard/invitations/${invitationId}/checkin` : `/dashboard/invitations/${invitationId}/guests`;
}

// ── Join links ────────────────────────────────────────────────────────────────────────────────────────────────────

/** 32 random bytes as base64url (`join-token.ts`): 43 characters, never stored; the row keeps its SHA-256. */
export const JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const JOIN_LINK_TTL_DAYS = 7;
/** Live rows per invitation: grants plus links not yet expired (a technical ceiling until B-040's plan limits). */
export const MAX_TEAM_ROWS = 20;
export const LABEL_MAX_CHARS = 60;

export function joinLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + JOIN_LINK_TTL_DAYS * 86_400_000);
}

/** The owner's note for whom a link is: control characters dropped, spaces collapsed, 1–60 characters, else null. */
export function normalizeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return label.length >= 1 && [...label].length <= LABEL_MAX_CHARS ? label : null;
}

export type JoinRow = {
  ownerId: number;
  userId: number | null;
  revokedAt: Date | null;
  expiresAt: Date;
};

export type JoinDecision = 'join' | 'already' | 'invalid' | 'owner' | 'member';

/**
 * Whether this account may accept this link now. A link works once and for one account: accepted by another account,
 * revoked or past its expiry it is `invalid`, with no hint of which. The account that accepted it may come back
 * (`already`: a second tap or a reload). The owner never joins their own invitation, and an account holds one live
 * grant per invitation (`member`).
 */
export function decideJoin(row: JoinRow | null, userId: number, holdsLiveGrant: boolean, now: Date): JoinDecision {
  if (!row || row.revokedAt) return 'invalid';
  if (row.userId !== null) return row.userId === userId ? 'already' : 'invalid';
  if (row.expiresAt.getTime() <= now.getTime()) return 'invalid';
  if (row.ownerId === userId) return 'owner';
  if (holdsLiveGrant) return 'member';
  return 'join';
}

export type TeamRowState = 'active' | 'pending' | 'expired';

export function teamRowState(row: { userId: number | null; expiresAt: Date }, now: Date): TeamRowState {
  if (row.userId !== null) return 'active';
  return row.expiresAt.getTime() > now.getTime() ? 'pending' : 'expired';
}

export const ROLE_COPY: Readonly<Record<MemberRole, { name: string; summary: string; can: readonly string[]; cannot: readonly string[] }>> = {
  cohost: {
    name: 'Co-host',
    summary: 'Ikut mengelola tamu bersama Anda.',
    can: ['Daftar tamu, termasuk nomor telepon, RSVP dan impor', 'Meja check-in', 'Moderasi dan balasan ucapan', 'Statistik dan ekspor daftar tamu'],
    cannot: ['Isi, tema dan pengaturan undangan', 'Pembayaran dan publikasi', 'Mengatur tim'],
  },
  usher: {
    name: 'Penerima tamu',
    summary: 'Hanya meja check-in di hari acara.',
    can: ['Memindai QR pass tamu', 'Mencari nama tamu untuk check-in manual'],
    cannot: ['Nomor telepon, RSVP dan ucapan', 'Mengubah daftar tamu', 'Semua pengaturan undangan'],
  },
};

// ── G-052 (D-067): a reseller workspace's staff ──────────────────────────────────────────────────────────────────────

export const WORKSPACE_ROLES = ['manager', 'desk'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Each workspace role carries exactly one team role's capabilities on every live client invitation of its workspace,
 * so a workspace grant can never reach further than a G-044 grant: `manager` is the co-host, `desk` the usher. Neither
 * holds `manage` (content, theme, settings, checkout, publishing and the team stay with the invitation's owner).
 */
export const WORKSPACE_ROLE_AS_MEMBER: Readonly<Record<WorkspaceRole, MemberRole>> = { manager: 'cohost', desk: 'usher' };

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

/** The workspace roles allowed a capability, derived from the team table (the writers' `wm.role in (…)`). */
export function workspaceRolesFor(capability: Capability): readonly WorkspaceRole[] {
  return WORKSPACE_ROLES.filter((role) => MEMBER_CAPABILITIES[capability].includes(WORKSPACE_ROLE_AS_MEMBER[role]));
}

/** The broader of two team roles an account holds on one invitation (a direct grant and a workspace grant). */
export function broaderMemberRole(a: MemberRole | null, b: MemberRole | null): MemberRole | null {
  if (a === 'cohost' || b === 'cohost') return 'cohost';
  return a ?? b;
}

/** Live staff rows per workspace (grants plus open links): a technical ceiling until B-040's plan limits. */
export const MAX_WORKSPACE_ROWS = 50;
export const WORKSPACE_NAME_MAX_CHARS = 80;
export const CLIENT_LABEL_MAX_CHARS = 80;

/** A workspace name or a client's name: control characters dropped, spaces collapsed, 2 to `max` characters, else null. */
export function normalizeWorkspaceText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const length = [...text].length;
  return length >= 2 && length <= max ? text : null;
}

export const WORKSPACE_ROLE_COPY: Readonly<Record<WorkspaceRole, { name: string; summary: string; can: readonly string[]; cannot: readonly string[] }>> = {
  manager: {
    name: 'Pengelola klien',
    summary: 'Mengelola tamu di semua undangan klien ruang kerja ini.',
    can: ['Daftar tamu, termasuk nomor telepon, RSVP dan impor', 'Meja check-in', 'Moderasi dan balasan ucapan', 'Statistik dan ekspor daftar tamu'],
    cannot: ['Isi, tema dan pengaturan undangan', 'Pembayaran dan publikasi', 'Mengatur staf ruang kerja'],
  },
  desk: {
    name: 'Staf meja tamu',
    summary: 'Hanya meja check-in di semua undangan klien ruang kerja ini.',
    can: ['Memindai QR pass tamu', 'Mencari nama tamu untuk check-in manual'],
    cannot: ['Nomor telepon, RSVP dan ucapan', 'Mengubah daftar tamu', 'Semua pengaturan undangan dan ruang kerja'],
  },
};

/**
 * The workspace roles in English, for the bilingual workspace page (s42). The join pages and the WhatsApp text keep the
 * Indonesian copy above: the join frame is Indonesian whatever the visitor's locale (D-057).
 */
export const WORKSPACE_ROLE_COPY_EN: typeof WORKSPACE_ROLE_COPY = {
  manager: {
    name: 'Client manager',
    summary: 'Manages guests on every client invitation of this workspace.',
    can: ['Guest list, including phone numbers, RSVPs and imports', 'Check-in desk', 'Wish moderation and replies', 'Insights and guest-list exports'],
    cannot: ['Invitation content, theme and settings', 'Payment and publishing', 'Managing workspace staff'],
  },
  desk: {
    name: 'Guest desk staff',
    summary: 'Only the check-in desk on every client invitation of this workspace.',
    can: ["Scanning guests' QR passes", 'Searching guest names for manual check-in'],
    cannot: ['Phone numbers, RSVPs and wishes', 'Changing the guest list', 'All invitation and workspace settings'],
  },
};

export function workspaceRoleCopy(locale: 'id' | 'en'): typeof WORKSPACE_ROLE_COPY {
  return locale === 'en' ? WORKSPACE_ROLE_COPY_EN : WORKSPACE_ROLE_COPY;
}

/** The WhatsApp text a workspace owner sends with a staff link (no recipient number: the owner picks the chat). */
export function staffLinkMessage(input: { label: string; role: WorkspaceRole; workspaceName: string; url: string }): string {
  return [
    `Halo ${input.label}, Anda diajak menjadi ${WORKSPACE_ROLE_COPY[input.role].name} di ruang kerja ${input.workspaceName}.`,
    `Buka tautan ini dan masuk dengan akun Invitesion Anda: ${input.url}`,
    `Tautan berlaku ${JOIN_LINK_TTL_DAYS} hari dan hanya untuk satu akun.`,
  ].join('\n\n');
}

/** The WhatsApp text the owner sends with a join link (no recipient number: the owner picks the chat). */
export function joinLinkMessage(input: { label: string; role: MemberRole; title: string; url: string }): string {
  return [
    `Halo ${input.label}, Anda diajak menjadi ${ROLE_COPY[input.role].name} untuk undangan ${input.title}.`,
    `Buka tautan ini dan masuk dengan akun Invitesion Anda: ${input.url}`,
    `Tautan berlaku ${JOIN_LINK_TTL_DAYS} hari dan hanya untuk satu akun.`,
  ].join('\n\n');
}
