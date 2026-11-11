import 'server-only';

import { cookies, headers } from 'next/headers';
import { decodeTrialState, encodeTrialState, type TrialState } from '@/lib/invitation/trial';

/**
 * B-037: the wizard's typed content between requests, kept only in the visitor's browser. HttpOnly (page scripts never
 * read it), scoped to `/buat` (sent only to the wizard, its preview and its save, never to guest pages or the dashboard),
 * SameSite=Lax, Secure over HTTPS, and short-lived: long enough to sign up and come back, gone after the save.
 */
export const TRIAL_COOKIE = 'inv_trial';
export const TRIAL_COOKIE_PATH = '/buat';
export const TRIAL_MAX_AGE_SECONDS = 6 * 60 * 60;

async function overHttps(): Promise<boolean> {
  return (await headers()).get('x-forwarded-proto') === 'https' || process.env.VERCEL === '1';
}

export async function readTrialState(): Promise<TrialState | null> {
  return decodeTrialState((await cookies()).get(TRIAL_COOKIE)?.value);
}

/** Only from a server action: setting a cookie is a write the page render may not do. */
export async function writeTrialState(state: TrialState): Promise<void> {
  (await cookies()).set(TRIAL_COOKIE, encodeTrialState(state), {
    httpOnly: true,
    sameSite: 'lax',
    secure: await overHttps(),
    path: TRIAL_COOKIE_PATH,
    maxAge: TRIAL_MAX_AGE_SECONDS,
  });
}

export async function clearTrialState(): Promise<void> {
  (await cookies()).set(TRIAL_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: await overHttps(), path: TRIAL_COOKIE_PATH, maxAge: 0 });
}
