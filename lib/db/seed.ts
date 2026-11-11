import { eq } from 'drizzle-orm';
import { db, client } from './drizzle';
import { users } from './schema';

/**
 * Prepares local identity rows for accounts that will sign in through Clerk.
 *
 * Clerk owns credentials, so this script cannot — and must not — create a
 * login. What it can do is put the *local* row in place with the right role, so
 * that the moment someone signs up with that email, `provision()` in
 * `lib/auth/clerk-user.ts` adopts the row by email and the account is already an
 * administrator. No second "promote" step, and no window where the only admin
 * account is a customer.
 *
 * Rows created here carry no `password_hash` and no `clerk_user_id`. They are
 * inert until Clerk adopts them: nothing can authenticate as them, because there
 * is nothing to authenticate against.
 *
 * Idempotent. Running it twice promotes rather than duplicates.
 *
 *   ADMIN_SEED_EMAIL=admin@example.com \
 *   CUSTOMER_SEED_EMAIL=user@example.com \
 *   pnpm db:seed
 */
type Seed = { email: string; role: 'ADMIN' | 'CUSTOMER' };

async function upsertRole({ email, role }: Seed) {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!existing) {
    await db.insert(users).values({ email, role, name: null, passwordHash: null });
    console.log(`  created ${email} as ${role} — inert until Clerk adoption`);
    return;
  }

  if (existing.role === role) {
    const state = existing.clerkUserId ? 'linked to Clerk' : 'awaiting Clerk adoption';
    console.log(`  ${email} is already ${role} (${state})`);
    return;
  }

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, existing.id));
  console.log(`  ${email}: ${existing.role} -> ${role}`);
}

async function seed() {
  const wanted: Seed[] = [];
  const admin = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const customer = process.env.CUSTOMER_SEED_EMAIL?.trim().toLowerCase();

  if (admin) wanted.push({ email: admin, role: 'ADMIN' });
  if (customer) wanted.push({ email: customer, role: 'CUSTOMER' });

  if (wanted.length === 0) {
    throw new Error(
      'Nothing to seed. Set ADMIN_SEED_EMAIL and/or CUSTOMER_SEED_EMAIL to the addresses that ' +
        'will sign up through Clerk.',
    );
  }

  for (const entry of wanted) await upsertRole(entry);

  console.log('\nNext step is yours: sign up at /sign-up with each address.');
  console.log('Clerk holds the password; this script never does.');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
