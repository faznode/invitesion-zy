import { UserProfile } from '@clerk/nextjs';
import { ShieldCheck } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin } from '@/lib/auth/admin-access';

export const dynamic = 'force-dynamic';

/**
 * Account security, now rendered by Clerk.
 *
 * This page previously hand-rolled change-password and delete-account forms. Both
 * are Clerk's responsibility since the migration, and Clerk's own component
 * brings what we never had: email verification before a change takes effect,
 * multi-factor enrolment, connected social accounts, and a list of active
 * sessions with the ability to revoke them.
 *
 * The one thing deliberately NOT here is role. Admin is granted by setting
 * `role = 'ADMIN'` on the database row, so the privilege boundary stays inside
 * our own database and a misconfigured Clerk instance cannot mint an
 * administrator.
 */
export default async function SecurityPage() {
  assertAuthorizedAdmin(await getUser());

  return (
    <section className="p-4 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-medium text-brand-700">Keamanan</p>
        <h1 className="mt-1 text-2xl font-semibold">Akun &amp; keamanan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Password, verifikasi email, autentikasi dua faktor, dan sesi aktif.
        </p>

        <p className="mt-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600 shadow-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span>
            Hak akses admin <strong>tidak</strong> diatur di sini maupun di Clerk. Role diberikan
            langsung pada baris database, supaya batas hak akses tetap berada di dalam sistem kita
            sendiri.
          </span>
        </p>

        <div className="mt-6">
          <UserProfile routing="hash" />
        </div>
      </div>
    </section>
  );
}
