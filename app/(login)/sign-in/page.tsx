import { SignIn } from '@clerk/nextjs';
import { getLocale } from '@/lib/locale-server';
import { AuthShell } from '../auth-shell';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const en = (await getLocale()) === 'en';

  return (
    <AuthShell en={en}>
      {/*
        Clerk renders the form; appearance and copy come from the ClerkProvider in
        the root layout so the hosted UI cannot drift from the rest of the product.
        `routing="hash"` keeps every step — password reset, email code, MFA — on
        this same styled page instead of bouncing to Clerk's own domain.
      */}
      <SignIn
        routing="hash"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
      />
    </AuthShell>
  );
}
