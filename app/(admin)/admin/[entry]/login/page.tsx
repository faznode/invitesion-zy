import { SignIn } from '@clerk/nextjs';
import { assertPrivateAdminEntry } from '@/lib/auth/admin-access';
import { getLocale } from '@/lib/locale-server';
import { AuthShell } from '@/app/(login)/auth-shell';

export const dynamic = 'force-dynamic';

/**
 * Sign-in reached through the private admin entry.
 *
 * The entry path is still validated here, so a guessed URL 404s before anything
 * renders — Clerk does not affect that obscurity control.
 *
 * Deliberately the same Clerk form as the customer sign-in: there is one identity
 * system, and `role` on the local user row is what separates an administrator
 * from a customer. A separate admin login form would imply a second credential
 * store that does not exist.
 *
 * After signing in, Clerk returns to the admin entry, and the admin layout
 * rejects anyone whose local row is not ADMIN.
 */
export default async function PrivateAdminLoginPage({ params }: { params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  assertPrivateAdminEntry(entry);
  const en = (await getLocale()) === 'en';

  return (
    <AuthShell en={en}>
      {/* No sign-up link: administrators are promoted from existing accounts. */}
      <SignIn routing="hash" fallbackRedirectUrl={`/admin/${entry}`} forceRedirectUrl={`/admin/${entry}`} />
    </AuthShell>
  );
}
