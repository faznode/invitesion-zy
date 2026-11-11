import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { isFlagOn } from '@/lib/flags';
import { parseLimit, type Limit } from '@/lib/rate-limit-keys';

/**
 * G-047 (D-069): the optional guest passcode's pure rules. No database and no request here, so the tests run them
 * directly; `guest-gate.ts` applies them to a request and `guest-passcode-db.ts` is the only writer of the stored hash.
 *
 * - A passcode is 6–32 letters or digits. Guests type it on phones, so case and surrounding spaces never matter: it is
 *   compared trimmed, NFKC-normalised and lower-cased. Six characters (36^6 codes) keep guessing far out of reach under
 *   the per-invitation limit below, which a shorter numeric code would not.
 * - Only a salted scrypt hash is stored (`invitations.guest_passcode_hash`), never the code, and never in the config.
 * - Admission is an HttpOnly cookie scoped to the invitation's path, holding an expiry and an HMAC keyed by the stored
 *   hash: changing or removing the passcode invalidates every earlier admission at once, with no session table.
 */

type Env = Record<string, string | undefined>;

export const PASSCODE_MIN_LENGTH = 6;
export const PASSCODE_MAX_LENGTH = 32;

/** How long one admission lasts on a device. */
export const PASSCODE_UNLOCK_TTL_SECONDS = 30 * 24 * 60 * 60;

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 32 } as const;

/** The passcode as compared and hashed, or null when it is not 6–32 letters or digits. */
export function normalizePasscode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.normalize('NFKC').trim().toLowerCase();
  return code.length >= PASSCODE_MIN_LENGTH && code.length <= PASSCODE_MAX_LENGTH && /^[a-z0-9]+$/.test(code) ? code : null;
}

function derive(code: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, SCRYPT.keyLength, { ...params, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** `scrypt$N$r$p$<salt>$<hash>` (base64url) for a normalised passcode. */
export async function hashPasscode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(code, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Whether a normalised passcode matches the stored hash; any malformed hash matches nothing. */
export async function verifyPasscode(code: string | null, stored: string | null | undefined): Promise<boolean> {
  if (!code || !stored) return false;
  const [scheme, n, r, p, saltText, hashText] = stored.split('$');
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (scheme !== 'scrypt' || !saltText || !hashText || !Object.values(params).every((value) => Number.isSafeInteger(value) && value > 0)) return false;
  const expected = Buffer.from(hashText, 'base64url');
  if (expected.length !== SCRYPT.keyLength) return false;
  const actual = await derive(code, Buffer.from(saltText, 'base64url'), params);
  return timingSafeEqual(actual, expected);
}

/** The admission cookie of one invitation (scoped to its path, so two invitations never share one). */
export function unlockCookieName(invitationId: number): string {
  return `inv_unlock_${invitationId}`;
}

function unlockMac(invitationId: number, stored: string, expires: number): string {
  const key = createHash('sha256').update('invitesion guest passcode admission v1\0').update(stored).digest();
  return createHmac('sha256', key).update(`${invitationId}.${expires}`).digest('base64url');
}

/** `<expiry seconds>.<mac>`: an admission to this invitation under this passcode until the expiry. */
export function unlockToken(invitationId: number, stored: string, now: Date = new Date()): string {
  const expires = Math.floor(now.getTime() / 1000) + PASSCODE_UNLOCK_TTL_SECONDS;
  return `${expires}.${unlockMac(invitationId, stored, expires)}`;
}

/** Whether a cookie value admits a visitor to this invitation under its current passcode at `now`. */
export function unlockTokenValid(token: string | null | undefined, invitationId: number, stored: string, now: Date = new Date()): boolean {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= now.getTime()) return false;
  const expected = Buffer.from(unlockMac(invitationId, stored, expires));
  const given = Buffer.from(match[2]);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The gate applies when the flag is on (the rollback is `FLAG_GUEST_PASSCODE=off`) and the host has set a passcode. */
export function passcodeGateActive(invitation: { guestPasscodeHash?: string | null }, env: Env = process.env): boolean {
  return Boolean(invitation.guestPasscodeHash) && isFlagOn('GUEST_PASSCODE', env);
}

/**
 * Attempts allowed per window, counted before the passcode is checked (a correct guess inside a refused window is
 * refused too, so the limit cannot be used as an oracle): per client address and invitation, and per invitation from
 * every address together (a bound on guessing spread over many addresses).
 */
export function passcodeLimits(env: Env = process.env): { address: Limit; invitation: Limit } {
  return {
    address: parseLimit(env.RATE_LIMIT_PASSCODE_IP, { max: 5, windowSeconds: 600 }),
    invitation: parseLimit(env.RATE_LIMIT_PASSCODE_LINK, { max: 50, windowSeconds: 600 }),
  };
}

export type PasscodeNotice = { kind: 'wrong' } | { kind: 'wait'; minutes: number } | null;

/** What the unlock action reported through the page's query (`?kode=salah`, `?kode=tunggu&menit=N`); anything else: none. */
export function passcodeNoticeOf(query: { kode?: string | string[]; menit?: string | string[] }): PasscodeNotice {
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  const kode = first(query.kode);
  if (kode === 'salah') return { kind: 'wrong' };
  const minutes = Number(first(query.menit));
  if (kode === 'tunggu') return { kind: 'wait', minutes: Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : 10 };
  return null;
}

/** The limiter's bucket for one invitation's attempts from every address. */
export const passcodeInvitationBucket = (invitationId: number) => `passcode:${invitationId}:link`;
/** The scope `ipBucket` keys one invitation's per-address attempts under. */
export const passcodeAddressScope = (invitationId: number) => `passcode:${invitationId}`;
