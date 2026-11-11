import { createHash, randomBytes } from 'node:crypto';

/**
 * G-044 (D-057): a team join link's secret. 32 random bytes as base64url (43 characters, `JOIN_TOKEN_PATTERN` in
 * `members.ts`), shown to the owner once and never stored: `invitation_members.token_hash` keeps its SHA-256, so a copy of
 * the database alone opens no link. Server code only (Node's crypto); the client-safe team rules stay in `members.ts`.
 */
export function newJoinToken(): string {
  return randomBytes(32).toString('base64url');
}

export function joinTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
