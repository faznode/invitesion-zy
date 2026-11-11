import { ClerkProvider } from '@clerk/nextjs';
import { clerkAppearance, clerkLocalization } from '@/lib/auth/clerk-appearance';
import { getLocale } from '@/lib/locale-server';

/**
 * B-015: Clerk's client provider, only around the route groups where someone signs in — `(login)`, `(customer)` and
 * `(admin)`. It used to wrap the root layout, so every guest page serialised the provider's appearance and the whole
 * localisation dictionary into its RSC payload (≈ 67 KB of ≈ 97 KB, s21 measurement) and SSR parsed it back on every
 * view, for guests who never sign in. Server-side `auth()` / `currentUser()` (`lib/auth/clerk-user.ts`, `/preview`)
 * come from `@clerk/nextjs/server` through the middleware and do not need this provider.
 */
export async function AuthProvider({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <ClerkProvider appearance={clerkAppearance} localization={clerkLocalization(locale)}>
      {children}
    </ClerkProvider>
  );
}
