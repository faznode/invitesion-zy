import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, type User } from '@/lib/db/schema';

/**
 * The only bridge between Clerk and this application's identity.
 *
 * Clerk owns credentials, sessions, password reset, email verification, and
 * social sign-in. It does not own *identity*: `invitations`, `orders`, `guests`
 * and the rest reference `users.id` as an integer, and rewriting five foreign
 * keys to carry a `user_xxx` string would be a large migration bought for
 * nothing.
 *
 * So a Clerk account is resolved to a local row here and nowhere else. Every
 * caller keeps using `getUser()` and receives the same local `User` it always
 * did — which is why adopting Clerk touched five files instead of the
 * thirty-nine that call it.
 */

/**
 * Resolves the signed-in Clerk account to a local user, creating the row on
 * first sight.
 *
 * Just-in-time provisioning rather than a `user.created` webhook: a webhook can
 * arrive after the user's first request, which would mean a signed-in customer
 * briefly having no local row and every ownership check failing. Doing it on the
 * request that needs it makes that race impossible.
 *
 * Returns null when nobody is signed in.
 */
export async function resolveLocalUser(): Promise<User | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.clerkUserId, clerkUserId), isNull(users.deletedAt)))
    .limit(1);
  if (existing) return existing;

  return provision(clerkUserId);
}

/**
 * Creates or adopts the local row for a Clerk account.
 *
 * Two cases, and the second is the one that matters during migration:
 *
 *  1. genuinely new customer → insert;
 *  2. an account that already existed under the old password auth, matched by
 *     email → adopt it by writing `clerk_user_id` onto the existing row. Without
 *     this, every pre-migration customer would sign in successfully and find an
 *     empty dashboard, their invitations still attached to the orphaned row.
 */
async function provision(clerkUserId: string): Promise<User | null> {
  const clerk = await currentUser();
  if (!clerk) return null;

  const email = clerk.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (!email) {
    // Clerk can be configured for username- or phone-only sign-in. This app
    // keys identity on email, so refuse rather than invent one.
    throw new Error(`Clerk user ${clerkUserId} has no primary email address`);
  }

  const name = [clerk.firstName, clerk.lastName].filter(Boolean).join(' ').trim() || null;

  const [claimed] = await db
    .update(users)
    .set({
      clerkUserId,
      // Only fill gaps. A customer who edited their profile here should not have
      // it overwritten by whatever Clerk holds.
      name: name ?? undefined,
      avatarUrl: clerk.imageUrl || undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(users.email, email), isNull(users.clerkUserId), isNull(users.deletedAt)))
    .returning();
  if (claimed) return claimed;

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId,
      email,
      name,
      avatarUrl: clerk.imageUrl || null,
      // Clerk holds the credential; there is no local password to store.
      passwordHash: null,
      role: 'CUSTOMER',
    })
    // A concurrent first request could insert the same email twice.
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (created) return created;

  // Lost the race: the other request created it, so read it back.
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return existing ?? null;
}

/**
 * The signed-in account's Clerk session token, sent as the owner token to the Rust API's owner endpoints (R-03). The
 * API verifies it against Clerk's keys and resolves the owner and role from `users`, never from the token. Null when
 * nobody is signed in.
 */
export async function ownerSessionToken(): Promise<string | null> {
  const { getToken } = await auth();
  return getToken();
}

/**
 * Role stays local, deliberately.
 *
 * Admin is granted by setting `role = 'ADMIN'` on the database row, not in the
 * Clerk dashboard. Keeping the privilege boundary inside our own database means
 * a compromised or misconfigured Clerk instance cannot mint an administrator,
 * and the admin entry path plus email allowlist still apply on top.
 */
export async function isAdmin(user: User | null): Promise<boolean> {
  return user?.role === 'ADMIN';
}
