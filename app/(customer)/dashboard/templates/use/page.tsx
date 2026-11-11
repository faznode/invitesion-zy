import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { isFlagOn } from '@/lib/flags';
import { createDraftInvitation } from '@/lib/invitation/creation';
import { templateUseHref } from '@/lib/invitation/template-use-href';
import { getTemplateRowBySlug, resolveEventType } from '@/lib/invitation/template-sync';

export const dynamic = 'force-dynamic';

/**
 * Pintu masuk dari katalog publik: /dashboard/templates/use?slug=<tema>.
 *
 * B-037: dengan `FLAG_CREATION_WIZARD` menyala, katalog menautkan wizard (`/buat/<tema>`) langsung, dan tautan lama ke
 * sini (bookmark, tab yang masih terbuka) diteruskan ke wizard yang sama: nama, tanggal, dan tema dulu, simpan setelah
 * masuk. Saat flag mati, jalur lama berlaku persis seperti sebelumnya: middleware memagari /dashboard, lalu draf kosong
 * dari tema dibuat lewat fasad pembuatan (`creation.ts`, satu penulis per `BACKEND_CONTENT`).
 *
 * getTemplateRowBySlug meng-upsert baris DB dari katalog kode saat itu juga,
 * sehingga deep-link tetap bekerja meski `pnpm db:seed:templates` belum pernah
 * dijalankan di environment tersebut.
 */
export default async function UseTemplateFromCatalog({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  if (slug && isFlagOn('CREATION_WIZARD')) redirect(templateUseHref(slug, true));

  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');
  if (!slug) redirect('/dashboard/templates');

  const template = await getTemplateRowBySlug(slug);
  if (!template) redirect('/dashboard/templates?error=notfound');

  const eventType = resolveEventType(template.category);
  if (!eventType) redirect('/dashboard/templates?error=category');

  const outcome = await createDraftInvitation({ userId: user.id, ownerToken: ownerSessionToken }, { eventType, template, title: template.name });
  if (outcome.kind === 'signin') redirect('/sign-in');
  if (outcome.kind !== 'created') redirect('/dashboard/templates?error=create');

  redirect(`/dashboard/invitations/${outcome.invitationId}/edit`);
}
