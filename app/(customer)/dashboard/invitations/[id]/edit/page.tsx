import { and, asc, eq, ne } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { mediaAssets } from '@/lib/db/schema';
import { isFlagOn } from '@/lib/flags';
import { getLocale } from '@/lib/locale-server';
import { loadContentState, loadThemeTier } from '@/lib/invitation/content';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { loadPasscodeState } from '@/lib/invitation/guest-passcode-db';
import { occasionOf } from '@/lib/invitation/occasion';
import { GUEST_PHOTO_TYPE } from '@/lib/invitation/post-event';
import { paletteHex, paletteIds } from '@/lib/invitation/palettes';
import { approvedCorpusOptions } from '@/lib/invitation/religious-text';
import { ownerPreviewPath } from '@/lib/invitation/public-path';
import { paletteTier } from '@/lib/invitation/theme-entitlement';
import { themeSwitchOptions } from '@/lib/invitation/theme-switch';
import { InvitationEditor } from './editor';
import type { PaletteOption } from './editor-appearance';

/** G-041: the colour choice, judged like the writers do (`paletteTier`); every registered palette is known. */
const PALETTE_OPTIONS: PaletteOption[] = paletteIds.map((id) => {
  const tokens = paletteHex(id);
  return { id, tier: paletteTier(id) ?? 'standard', bg: tokens.bg, accent: tokens.accent, ink: tokens.ink };
});

export const dynamic = 'force-dynamic';

/** G-047: the passcode's on / off state and date for the editor's card (never the code or its hash). */
async function passcodeProps(invitationId: number, userId: number) {
  const state = await loadPasscodeState(invitationId, userId);
  return { enabled: state?.enabled ?? false, setAt: state?.setAt?.toISOString() ?? null };
}

export default async function EditInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // B-035: the owner's config and its version from one statement, so the editor's first save is checked against the
  // version of exactly the config it shows.
  const invitation = await loadContentState(id, user.id);
  if (!invitation) notFound();

  // The guest page's lenient read (S18-Q4): one section that fails today's rules no longer opens an empty editor.
  const { config } = normalizeStoredConfig(invitation.config ?? {});

  // I-21 (D-070): guest photos are reviewed on their own page, never offered as the host's media.
  const media = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.invitationId, id), ne(mediaAssets.type, GUEST_PHOTO_TYPE)))
    .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.id));

  const locale = await getLocale();
  // B-036: which catalog themes the picker offers as a free switch; the writers judge each switch again.
  const themeTier = (await loadThemeTier(id, user.id)) ?? 'standard';
  const storedTemplateId = (config.theme as { templateId?: unknown } | undefined)?.templateId;
  // B-032: a memorial is offered memorial themes only.
  const themeOptions = themeSwitchOptions(invitation.eventType, typeof storedTemplateId === 'number' ? storedTemplateId : undefined, occasionOf(config));

  return (
    <InvitationEditor
      invitationId={id}
      previewHref={ownerPreviewPath(id)}
      embedPreviewHref={`${ownerPreviewPath(id)}?embed=1`}
      eventType={invitation.eventType}
      locale={locale}
      initialConfig={config}
      initialVersion={invitation.version}
      autosave={isFlagOn('EDITOR_AUTOSAVE')}
      themeOptions={themeOptions}
      themeTier={themeTier}
      paletteOptions={PALETTE_OPTIONS}
      corpusOptions={approvedCorpusOptions()}
      guestLanguage={isFlagOn('GUEST_LANGUAGE')}
      guestShare={isFlagOn('GUEST_SHARE')}
      cardExport={isFlagOn('CARD_EXPORT')}
      historyHref={isFlagOn('VERSION_HISTORY') ? `/dashboard/invitations/${id}/history` : null}
      guestPasscode={isFlagOn('GUEST_PASSCODE') ? await passcodeProps(id, user.id) : null}
      postEventMemory={isFlagOn('POST_EVENT_MEMORY')}
      initialMedia={media.map((m) => ({
        id: m.id,
        url: m.url,
        type: m.type,
        sortOrder: m.sortOrder,
        uploadSequence: m.uploadSequence,
      }))}
    />
  );
}
