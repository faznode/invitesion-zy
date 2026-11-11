/**
 * Generates `contracts/vectors/member-roles.json` from the TypeScript team rules (G-044, D-057: `lib/invitation/members.ts`
 * and `join-token.ts`). Both sides run the file: `tests/g044-team-access.test.ts` and
 * `services/api/tests/member_roles_vectors.rs`, which holds the writers' capability table (`services/api/src/members.rs`)
 * and the guest operations' capabilities to it. After a rule change, regenerate it here and make the Rust table agree;
 * `--check` fails instead of writing when the file is stale.
 *
 *   npx tsx scripts/api/member-roles-vectors.ts [--check]   # from the repository root
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinTokenHash } from '../../lib/invitation/join-token';
import {
  CAPABILITIES,
  can,
  decideJoin,
  JOIN_LINK_TTL_DAYS,
  JOIN_TOKEN_PATTERN,
  joinLinkExpiry,
  LABEL_MAX_CHARS,
  MAX_TEAM_ROWS,
  MAX_WORKSPACE_ROWS,
  MEMBER_ROLES,
  memberHome,
  memberRolesFor,
  normalizeLabel,
  operationCapability,
  teamRowState,
  WORKSPACE_ROLE_AS_MEMBER,
  WORKSPACE_ROLES,
  workspaceRolesFor,
  type AccessRole,
  type JoinRow,
} from '../../lib/invitation/members';

const OUT = join(process.cwd(), 'contracts/vectors/member-roles.json');

const ACCESS_ROLES: readonly AccessRole[] = ['owner', ...MEMBER_ROLES];
const matrix = ACCESS_ROLES.map((role) => ({
  role,
  capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [capability, can(role, capability)])),
}));

// The capabilities the writers enforce in both languages (the roster, the RSVP override, the wishes). `insights` and
// `manage` are decided in Next.js only (reads, and the owner's own surfaces).
const WRITER_CAPABILITIES = ['checkin', 'guests', 'wishes'] as const;
const writers = WRITER_CAPABILITIES.map((capability) => ({ capability, memberRoles: [...memberRolesFor(capability)] }));

// G-052 (D-067): a workspace role carries one team role's capabilities on the workspace's client invitations; the
// writers' workspace clause allows these roles per capability (`members::Capability::workspace_roles`).
const workspace = {
  roles: [...WORKSPACE_ROLES],
  asMember: WORKSPACE_ROLE_AS_MEMBER,
  writers: WRITER_CAPABILITIES.map((capability) => ({ capability, workspaceRoles: [...workspaceRolesFor(capability)] })),
  limits: { maxWorkspaceRows: MAX_WORKSPACE_ROWS },
};

// `api` is the operation's name in the API request (`GuestOperation`), as `roster-api.ts` sends it.
const operations = (
  [
    { operation: 'sent', api: 'SENT' },
    { operation: 'checkin', api: 'CHECKIN' },
    { operation: 'undo-checkin', api: 'UNDO_CHECKIN' },
  ] as const
).map((entry) => ({ ...entry, capability: operationCapability(entry.operation) }));

const homes = MEMBER_ROLES.map((role) => ({ role, invitationId: 42, path: memberHome(42, role) }));

const labelCases: { name: string; raw: unknown }[] = [
  { name: 'a plain name', raw: 'Rina' },
  { name: 'surrounding and repeated spaces collapse', raw: '  Rina   Wati  ' },
  { name: 'tabs and newlines become one space', raw: 'Rina\tmeja\npria' },
  { name: 'NUL and DEL are dropped', raw: '\u0000Rina\u007f' },
  { name: 'markup is kept as text (rendered escaped)', raw: 'Bu Sari & Pak Budi <meja 3>' },
  { name: 'exactly 60 characters', raw: 'a'.repeat(LABEL_MAX_CHARS) },
  { name: '61 characters', raw: 'a'.repeat(LABEL_MAX_CHARS + 1) },
  { name: '60 emoji are 60 characters', raw: '\u{1F470}'.repeat(LABEL_MAX_CHARS) },
  { name: '61 emoji', raw: '\u{1F470}'.repeat(LABEL_MAX_CHARS + 1) },
  { name: 'spaces only', raw: '   ' },
  { name: 'control characters only', raw: '\u0001\u0002\u001f' },
  { name: 'empty', raw: '' },
  { name: 'not a string: null', raw: null },
  { name: 'not a string: a number', raw: 42 },
];
const labels = labelCases.map((input) => ({ ...input, expect: normalizeLabel(input.raw) }));

const TOKEN_A = 'Ab0-_cDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcd';
const TOKEN_B = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
const tokenCases: { name: string; token: string }[] = [
  { name: '43 base64url characters', token: TOKEN_A },
  { name: 'another 43', token: TOKEN_B },
  { name: '42 characters', token: TOKEN_A.slice(1) },
  { name: '44 characters', token: `${TOKEN_A}a` },
  { name: 'standard base64 plus', token: `${TOKEN_A.slice(1)}+` },
  { name: 'standard base64 slash', token: `${TOKEN_A.slice(1)}/` },
  { name: 'padding', token: `${TOKEN_A.slice(1)}=` },
  { name: 'a space', token: `${TOKEN_A.slice(1)} ` },
  { name: 'a non-ASCII letter', token: `${TOKEN_A.slice(1)}\u00e9` },
  { name: 'empty', token: '' },
];
const tokens = tokenCases.map((input) => ({ ...input, valid: JOIN_TOKEN_PATTERN.test(input.token) }));
const hashes = [TOKEN_A, TOKEN_B].map((token) => ({ token, hash: joinTokenHash(token) }));

const NOW = '2026-11-08T10:00:00.000Z';
const OWNER = 3;
const ME = 7;
const OTHER = 9;
const at = (offsetMs: number) => new Date(Date.parse(NOW) + offsetMs).toISOString();
type RowInput = { ownerId: number; userId: number | null; revokedAt: string | null; expiresAt: string };
const open: RowInput = { ownerId: OWNER, userId: null, revokedAt: null, expiresAt: at(86_400_000) };
const joinCases: { name: string; row: RowInput | null; userId: number; holdsLiveGrant: boolean }[] = [
  { name: 'no such link', row: null, userId: ME, holdsLiveGrant: false },
  { name: 'an open link', row: open, userId: ME, holdsLiveGrant: false },
  { name: 'open for one more millisecond', row: { ...open, expiresAt: at(1) }, userId: ME, holdsLiveGrant: false },
  { name: 'expiring this instant', row: { ...open, expiresAt: NOW }, userId: ME, holdsLiveGrant: false },
  { name: 'expired', row: { ...open, expiresAt: at(-1) }, userId: ME, holdsLiveGrant: false },
  { name: 'revoked before use', row: { ...open, revokedAt: at(-60_000) }, userId: ME, holdsLiveGrant: false },
  { name: 'accepted by this account: a second tap', row: { ...open, userId: ME }, userId: ME, holdsLiveGrant: true },
  { name: 'accepted by this account, past its expiry: a grant does not expire', row: { ...open, userId: ME, expiresAt: at(-1) }, userId: ME, holdsLiveGrant: true },
  { name: 'accepted by this account, then revoked', row: { ...open, userId: ME, revokedAt: at(-1) }, userId: ME, holdsLiveGrant: false },
  { name: 'accepted by another account', row: { ...open, userId: OTHER }, userId: ME, holdsLiveGrant: false },
  { name: "the owner's own link", row: open, userId: OWNER, holdsLiveGrant: false },
  { name: "the owner's own link, expired", row: { ...open, expiresAt: at(-1) }, userId: OWNER, holdsLiveGrant: false },
  { name: 'an account already on the team', row: open, userId: ME, holdsLiveGrant: true },
  { name: 'an account already on the team, link expired', row: { ...open, expiresAt: at(-1) }, userId: ME, holdsLiveGrant: true },
];
const toRow = (row: RowInput | null): JoinRow | null =>
  row && { ...row, revokedAt: row.revokedAt ? new Date(row.revokedAt) : null, expiresAt: new Date(row.expiresAt) };
const joins = joinCases.map((input) => ({ ...input, now: NOW, expect: decideJoin(toRow(input.row), input.userId, input.holdsLiveGrant, new Date(NOW)) }));

const rowStates = [
  { name: 'accepted, past its link expiry', userId: ME, expiresAt: at(-1) },
  { name: 'not used, still open', userId: null, expiresAt: at(1) },
  { name: 'not used, expiring this instant', userId: null, expiresAt: NOW },
].map((input) => ({ ...input, now: NOW, expect: teamRowState({ userId: input.userId, expiresAt: new Date(input.expiresAt) }, new Date(NOW)) }));

const out = {
  description:
    'G-044 (D-057): an invitation team; G-052 (D-067): a workspace role carries one team role. Generated by scripts/api/member-roles-vectors.ts from lib/invitation/members.ts and join-token.ts; services/api/src/members.rs must agree for the writer capabilities (services/api/tests/member_roles_vectors.rs).',
  limits: { maxTeamRows: MAX_TEAM_ROWS, labelMaxChars: LABEL_MAX_CHARS, joinLinkTtlDays: JOIN_LINK_TTL_DAYS, tokenChars: 43 },
  roles: [...MEMBER_ROLES],
  matrix,
  writers,
  workspace,
  operations,
  homes,
  labels,
  tokens,
  hashes,
  joins,
  rowStates,
  expiry: { now: NOW, expect: joinLinkExpiry(new Date(NOW)).toISOString() },
};
const text = `${JSON.stringify(out, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== text) {
    console.error(`stale: ${OUT} differs from the rules; run without --check`);
    process.exit(1);
  }
  console.log('member-roles vectors current');
} else {
  writeFileSync(OUT, text);
  const decisions = joins.reduce<Record<string, number>>((count, { expect }) => ({ ...count, [expect]: (count[expect] ?? 0) + 1 }), {});
  console.log('matrix', matrix.length, 'labels', labels.length, 'tokens', tokens.length, 'joins', joins.length, JSON.stringify(decisions));
}
