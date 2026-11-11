import 'server-only';

import { cookies, headers } from 'next/headers';
import { JOIN_TOKEN_PATTERN } from '@/lib/invitation/members';

/**
 * G-044 (D-057): a team join link's secret while its visitor signs in or signs up, so the secret never rides in the
 * sign-in URL (`redirect_url` names `/gabung/terima` only). HttpOnly, scoped to `/gabung`, SameSite=Lax, Secure over
 * HTTPS, for one hour; cleared once the link is accepted or refused. B-037's wizard cookie works the same way.
 */
export const JOIN_COOKIE = 'inv_join';
export const JOIN_COOKIE_PATH = '/gabung';
export const JOIN_MAX_AGE_SECONDS = 60 * 60;
export const SIGN_IN_TO_JOIN = `/sign-in?redirect_url=${encodeURIComponent('/gabung/terima')}`;

async function overHttps(): Promise<boolean> {
  return (await headers()).get('x-forwarded-proto') === 'https' || process.env.VERCEL === '1';
}

export async function readJoinToken(): Promise<string | null> {
  const value = (await cookies()).get(JOIN_COOKIE)?.value;
  return value && JOIN_TOKEN_PATTERN.test(value) ? value : null;
}

/** Only from a server action: setting a cookie is a write a page render may not do. */
export async function writeJoinToken(token: string): Promise<void> {
  (await cookies()).set(JOIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: await overHttps(), path: JOIN_COOKIE_PATH, maxAge: JOIN_MAX_AGE_SECONDS });
}

export async function clearJoinToken(): Promise<void> {
  (await cookies()).set(JOIN_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: await overHttps(), path: JOIN_COOKIE_PATH, maxAge: 0 });
}
