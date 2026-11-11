import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { notFound } from 'next/navigation';
import { getAdminAllowedEmails, getAdminEntryPath } from '@/lib/env';

type AuthenticatedUser = {
  id: number;
  role: string;
  email: string;
  avatarUrl: string | null;
};

/**
 * Constant-time comparison for the secret entry segment.
 *
 * `===` on strings short-circuits at the first differing byte, which leaks the
 * shared prefix length through response timing and makes the entry path
 * recoverable character by character. The whole control is obscurity, so the
 * comparison has to not leak.
 */
function secretEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function assertPrivateAdminEntry(entry: string) {
  const privateEntry = getAdminEntryPath();

  // A wildcard route must never turn into a discoverable admin endpoint.
  if (!privateEntry || !secretEquals(entry, privateEntry)) notFound();
}

export function assertAuthorizedAdmin(user: AuthenticatedUser | null | undefined) {
  if (!user || user.role !== 'ADMIN') notFound();

  const allowedEmails = getAdminAllowedEmails();
  if (allowedEmails.length > 0 && !allowedEmails.includes(user.email.toLowerCase())) {
    notFound();
  }

  return user;
}

export function getPrivateAdminPath() {
  const privateEntry = getAdminEntryPath();
  if (!privateEntry) return null;
  return `/admin/${privateEntry}`;
}
