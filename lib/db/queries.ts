import { resolveLocalUser } from '@/lib/auth/clerk-user';

/**
 * The signed-in user, as this application's own record.
 *
 * Signature deliberately unchanged by the move to Clerk: thirty-nine call sites
 * ask for a local `User` with an integer `id`, and they still get exactly that.
 * Where the session came from is `lib/auth/clerk-user.ts`'s business alone.
 *
 * Returns null when nobody is signed in — never throws for that case, because a
 * signed-out visitor is an ordinary request, not an exception.
 */
export async function getUser() {
  return resolveLocalUser();
}
