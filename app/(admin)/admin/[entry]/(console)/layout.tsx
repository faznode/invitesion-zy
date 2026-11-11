import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin, assertPrivateAdminEntry } from '@/lib/auth/admin-access';
import { AdminShell } from './admin-shell';
import { getLocale } from '@/lib/locale-server';

/**
 * The administrator console. It sits in the `(console)` route group so that `/admin/<entry>/login`, a sibling outside the
 * group, is not wrapped by it: this layout answers 404 to anyone who is not a signed-in administrator, which made the
 * private sign-in page unreachable for the signed-out administrators it exists for (found by the B-038 route crawl).
 */
export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  // `entry` is only safe to render back because it is compared against the
  // configured private path first; a mismatch 404s before we get here.
  assertPrivateAdminEntry(entry);
  assertAuthorizedAdmin(await getUser());
  return <AdminShell entry={entry} locale={await getLocale()}>{children}</AdminShell>;
}
