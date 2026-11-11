'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { createDraftInvitation } from '@/lib/invitation/creation';
import { occasionOfCategory } from '@/lib/invitation/occasion';
import { templateEventTypes } from '@/lib/invitation/template-event-types';
import { getTemplateRowBySlug, resolveEventType } from '@/lib/invitation/template-sync';
import { getTemplateBySlug } from '@/lib/invitation/templates';
import { draftKeySchema, trialInputSchema, trialSaveIssues, type TrialInput, type TrialState } from '@/lib/invitation/trial';
import { clearTrialState, readTrialState, writeTrialState } from './trial-session';

/**
 * B-037 + I-08: the wizard's server actions. `updateTrial` keeps the typed content in the visitor's cookie for the
 * preview (nothing is stored on the server); `saveTrial` and `confirmTrialSave` create the draft for the signed-in owner
 * through the creation facade (`creation.ts`, one writer per `BACKEND_CONTENT`) with the wizard's draft key, so a retry
 * or a double tap finds the draft it made instead of making a second (D-055). Signed out, the save keeps the content and
 * sends the visitor to sign in (or sign up) with the way back to `/buat/simpan`.
 *
 * The key arrives with every call and an action never mints one: the first save clears the cookie, so a repeat that
 * read its key from the cookie (or minted a fresh one) would create a second draft. s33's browser harness caught exactly
 * that: three taps queued three saves and made three drafts.
 */

export type TrialFormValues = TrialInput;
export type TrialField = keyof TrialFormValues;
export type TrialFieldErrors = Partial<Record<TrialField, string>>;
export type TrialActionResult = { ok: true } | { ok: false; errors: TrialFieldErrors; message?: string };

const SIGN_IN_TO_SAVE = `/sign-in?redirect_url=${encodeURIComponent('/buat/simpan')}`;

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): TrialFieldErrors {
  const errors: TrialFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in errors)) errors[field as TrialField] = issue.message;
  }
  return errors;
}

/** The submitted values with the wizard's draft key, or the field errors. */
function stateFrom(values: unknown, key: unknown): { state: TrialState } | { result: TrialActionResult } {
  if (!isFlagOn('CREATION_WIZARD')) return { result: { ok: false, errors: {}, message: 'Fitur ini belum tersedia.' } };
  const parsed = trialInputSchema.safeParse(values);
  if (!parsed.success) return { result: { ok: false, errors: fieldErrors(parsed.error.issues) } };
  if (!getTemplateBySlug(parsed.data.slug)) return { result: { ok: false, errors: { slug: 'Tema tidak ditemukan.' } } };
  const draftKey = draftKeySchema.safeParse(key);
  if (!draftKey.success) return { result: { ok: false, errors: {}, message: 'Muat ulang halaman ini lalu coba lagi.' } };
  return { state: { v: 1, key: draftKey.data, ...parsed.data } };
}

export async function updateTrial(values: TrialFormValues, key: string): Promise<TrialActionResult> {
  const prepared = stateFrom(values, key);
  if ('result' in prepared) return prepared.result;
  await writeTrialState(prepared.state);
  return { ok: true };
}

async function persistTrial(state: TrialState): Promise<TrialActionResult> {
  const user = await getUser();
  if (!user) redirect(SIGN_IN_TO_SAVE);
  if (user.role === 'ADMIN') return { ok: false, errors: {}, message: 'Akun admin tidak bisa membuat undangan pelanggan.' };

  const template = await getTemplateRowBySlug(state.slug);
  const eventType = template ? resolveEventType(template.category) : null;
  if (!template || !eventType) return { ok: false, errors: { slug: 'Tema tidak ditemukan.' } };

  const outcome = await createDraftInvitation(
    { userId: user.id, ownerToken: ownerSessionToken },
    { eventType, template, trial: { input: state, key: state.key } },
  );
  switch (outcome.kind) {
    case 'created':
      await clearTrialState();
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/invitations');
      redirect(`/dashboard/invitations/${outcome.invitationId}/edit`);
    case 'signin':
      redirect(SIGN_IN_TO_SAVE);
    case 'unconfirmed':
      return {
        ok: false,
        errors: {},
        message: 'Penyimpanan belum terkonfirmasi. Coba simpan lagi: draf yang sama tidak akan dibuat dua kali.',
      };
    default:
      // Codes only, never the typed names (UU PDP).
      console.error(`[b037] draft not created: ${outcome.kind}`);
      return { ok: false, errors: {}, message: 'Draf tidak bisa dibuat dengan tema ini. Pilih tema lain atau coba lagi.' };
  }
}

/** The wizard's "Simpan": checks what the draft needs, keeps the latest content, then creates it (or asks to sign in). */
export async function saveTrial(values: TrialFormValues, key: string): Promise<TrialActionResult> {
  const prepared = stateFrom(values, key);
  if ('result' in prepared) return prepared.result;
  const template = getTemplateBySlug(prepared.state.slug);
  const issues = template ? trialSaveIssues(templateEventTypes[template.category], prepared.state, occasionOfCategory(template.category)) : [];
  if (issues.length) return { ok: false, errors: Object.fromEntries(issues.map((issue) => [issue.field, issue.message])) };
  await writeTrialState(prepared.state);
  return persistTrial(prepared.state);
}

/** `/buat/simpan` after signing in: the cookie's content, unchanged, becomes the draft. */
export async function confirmTrialSave(): Promise<TrialActionResult> {
  if (!isFlagOn('CREATION_WIZARD')) return { ok: false, errors: {}, message: 'Fitur ini belum tersedia.' };
  const state = await readTrialState();
  const template = state ? getTemplateBySlug(state.slug) : undefined;
  if (!state || !template) return { ok: false, errors: {}, message: 'Tidak ada draf yang menunggu disimpan.' };
  if (trialSaveIssues(templateEventTypes[template.category], state, occasionOfCategory(template.category)).length) {
    return { ok: false, errors: {}, message: 'Draf belum lengkap. Kembali ke wizard untuk melengkapinya.' };
  }
  return persistTrial(state);
}
