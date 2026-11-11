import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

/**
 * B-013 / D-043: the write limiter's pure rules, used by the TypeScript roster writer's limits (`lib/rate-limit.ts`)
 * and pinned against `services/api/src/limits.rs` by the `rateLimit` cases of `contracts/vectors/roster-rules.json`:
 * limit strings, windows, address keys and keyed buckets. No database here, so the vectors run without one.
 */

export type Limit = { max: number; windowSeconds: number };
export type Verdict = { allowed: boolean; retryAfter: number };

/** The largest count the API's `Limit::max` (an `i32`) holds. */
const MAX_COUNT = 2_147_483_647;

/**
 * `"<count>/<seconds>"`, both positive, or the fallback, as the API's `Limit::parse` reads its `RATE_LIMIT_*`
 * variables: each number may carry a leading `+`, and a count an `i32` cannot hold is refused there, so it is here.
 */
export function parseLimit(raw: string | undefined, fallback: Limit): Limit {
  const match = /^\s*\+?(\d+)\s*\/\s*\+?(\d+)\s*$/.exec(raw ?? '');
  if (!match) return fallback;
  const limit = { max: Number(match[1]), windowSeconds: Number(match[2]) };
  const fits = limit.max > 0 && limit.max <= MAX_COUNT && limit.windowSeconds > 0 && Number.isSafeInteger(limit.windowSeconds);
  return fits ? limit : fallback;
}

/** The start of the epoch-aligned window holding `now`. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const seconds = Math.floor(now.getTime() / 1000);
  return new Date((seconds - (((seconds % windowSeconds) + windowSeconds) % windowSeconds)) * 1000);
}

/** Whole seconds from `now` to the end of its window, at least 1. */
export function retryAfter(now: Date, limit: Limit): number {
  const end = windowStart(now, limit.windowSeconds).getTime() + limit.windowSeconds * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

/** IPv6 text to its eight segments, or null (zone ids and anything `node:net` refuses are not addresses here). */
function ipv6Segments(raw: string): number[] | null {
  if (!isIPv6(raw) || raw.includes('%')) return null;
  let text = raw.toLowerCase();
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  const parse = (part: string) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const left = parse(halves[0]);
  if (halves.length === 1) return left.length === 8 ? left : null;
  const right = parse(halves[1]);
  const missing = 8 - left.length - right.length;
  return halves.length === 2 && missing >= 0 ? [...left, ...Array<number>(missing).fill(0), ...right] : null;
}

/**
 * The limiter's identity for a client address, as the API makes it (D-043): IPv4 as itself, an IPv4-mapped IPv6 address
 * as its IPv4 address, any other IPv6 address by its /64. Null for anything that is not an IP literal.
 */
export function addressKey(raw: string): string | null {
  const text = raw.trim();
  if (isIPv4(text)) return text.split('.').map(Number).join('.');
  const s = ipv6Segments(text);
  if (!s) return null;
  if (s.slice(0, 5).every((group) => group === 0) && s[5] === 0xffff) {
    return [s[6] >> 8, s[6] & 0xff, s[7] >> 8, s[7] & 0xff].join('.');
  }
  return `${s.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

/** `<scope>:ip:` and 32 hex digits of HMAC-SHA256 under the service secret: the API's bucket for the same address. */
export function ipBucket(secret: string, scope: string, address: string): string {
  const mac = createHmac('sha256', Buffer.from(secret, 'utf8'));
  mac.update('invitesion rate-limit address v1\0');
  mac.update(address.trim());
  return `${scope}:ip:${mac.digest('hex').slice(0, 32)}`;
}

/**
 * The key the API hashes addresses with: the bytes of `INTERNAL_API_SECRET`, trimmed, as `services/api/src/config.rs`
 * reads it (rotation keeps the previous secret in `INTERNAL_API_SECRET_PREVIOUS`, which never keys a bucket). Null
 * without one.
 */
export function addressSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.INTERNAL_API_SECRET?.trim() || null;
}
