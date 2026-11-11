import { SignUp } from '@clerk/nextjs';
import { getLocale } from '@/lib/locale-server';
import { AuthShell } from '../auth-shell';

export const dynamic = 'force-dynamic';

export default async function SignUpPage() {
  const en = (await getLocale()) === 'en';

  return (
    <AuthShell en={en}>
      {/*
        Name is collected by Clerk (enable "Name" under user & authentication in
        the Clerk dashboard) and copied onto the local user row on first sight.
        That closes the gap where a new account landed on a profile page which
        refused to save until they filled in a field nobody had asked them for.
      */}
      <SignUp routing="hash" signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" />
    </AuthShell>
  );
}
