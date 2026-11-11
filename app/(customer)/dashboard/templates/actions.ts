'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { templates } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { isFlagOn } from '@/lib/flags';
import { createDraftInvitation } from '@/lib/invitation/creation';
import { templateUseHref } from '@/lib/invitation/template-use-href';
import { resolveEventType } from '@/lib/invitation/template-sync';
import { invitationTemplates } from '@/lib/invitation/templates';

/**
 * Turns a catalog selection into a real DRAFT invitation and sends the customer
 * straight into the editor. The invitation stays DRAFT until payment, so this
 * is deliberately free of any billing side effect.
 *
 * Kategori tema kini datang dari katalog (11 nilai, mis. 'baby-shower',
 * 'holiday-gathering'); resolveEventType memetakannya ke 6 event type inti
 * yang dipahami pipeline undangan, sekaligus tetap menerima baris seed lama.
 *
 * B-037: with `FLAG_CREATION_WIZARD` on, a theme the catalog knows (rows are matched to the catalog by name, as
 * `template-sync.ts` stores them) opens the wizard instead, so the host types names and a date before the draft exists.
 * Off, or for a row the catalog does not know, the draft is created here through the creation facade (`creation.ts`).
 */
export async function useTemplate(formData: FormData) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');

  const templateId = Number(formData.get('templateId'));
  if (!Number.isInteger(templateId) || templateId <= 0) {
    redirect('/dashboard/templates?error=invalid');
  }

  const [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!template) redirect('/dashboard/templates?error=notfound');

  if (isFlagOn('CREATION_WIZARD')) {
    const catalog = invitationTemplates.find((entry) => entry.name === template.name);
    if (catalog) redirect(templateUseHref(catalog.slug, true));
  }

  const eventType = resolveEventType(template.category);
  if (!eventType) redirect('/dashboard/templates?error=category');

  const outcome = await createDraftInvitation({ userId: user.id, ownerToken: ownerSessionToken }, { eventType, template, title: template.name });
  if (outcome.kind === 'signin') redirect('/sign-in');
  if (outcome.kind !== 'created') redirect('/dashboard/templates?error=create');

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/invitations');
  redirect(`/dashboard/invitations/${outcome.invitationId}/edit`);
}
