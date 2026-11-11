import 'server-only';

import { cookies, headers } from 'next/headers';
import { JOIN_TOKEN_PATTERN } from '@/lib/invitation/members';

/**
 * G-052 (D-067): a staff link's secret while its visitor signs in or signs up, as G-044's `/gabung` cookie: the secret
 * never rides in the sign-in URL (`redirect_url` names `/gabung/ruang/terima` only). HttpOnly, scoped to `/gabung/ruang`,
 * SameSite=Lax, Secure over HTTPS, for one hour; cleared once the link is accepted or refused.
 */
export const STAFF_JOIN_COOKIE = 'inv_ws_join';
export const STAFF_JOIN_COOKIE_PATH = '/gabung/ruang';
const MAX_AGE_SECONDS = 60 * 60;
export const SIGN_IN_TO_JOIN_WORKSPACE = `/sign-in?redirect_url=${encodeURIComponent('/gabung/ruang/terima')}`;

async function overHttps(): Promise<boolean> {
  return (await headers()).get('x-forwarded-proto') === 'https' || process.env.VERCEL === '1';
}

export async function readStaffJoinToken(): Promise<string | null> {
  const value = (await cookies()).get(STAFF_JOIN_COOKIE)?.value;
  return value && JOIN_TOKEN_PATTERN.test(value) ? value : null;
}

/** Only from a server action: setting a cookie is a write a page render may not do. */
export async function writeStaffJoinToken(token: string): Promise<void> {
  (await cookies()).set(STAFF_JOIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: await overHttps(), path: STAFF_JOIN_COOKIE_PATH, maxAge: MAX_AGE_SECONDS });
}

export async function clearStaffJoinToken(): Promise<void> {
  (await cookies()).set(STAFF_JOIN_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: await overHttps(), path: STAFF_JOIN_COOKIE_PATH, maxAge: 0 });
}
