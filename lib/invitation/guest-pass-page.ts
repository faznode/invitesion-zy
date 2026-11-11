import { isFlagOn } from '@/lib/flags';
import { passCheckInEnabled, passSigningSecret } from './guest-pass';

type PassCandidate = { guest: object | null; invitation: { config: unknown } };

/**
 * B-024 (D-056): whether a personal link has a pass page — a guest resolved from the link, guest passes on
 * (`GUEST_PASS`), the invitation opted in (`checkInSettings.enabled`) and a signing secret. Otherwise the pass page
 * answers 404 and the guest page shows no pass link.
 *
 * G-018 (I-31): the pass link, the pass page, its title and the document language (`guest-document-language.ts`) ask
 * this one question, so a pass that does not exist answers like every guest 404: in the visitor's locale, saying
 * nothing about the invitation.
 */
export function guestPassAvailable<T extends PassCandidate>(
  data: T | null | undefined,
  env: Record<string, string | undefined> = process.env,
): data is T & { guest: NonNullable<T['guest']> } {
  return Boolean(data?.guest && isFlagOn('GUEST_PASS', env) && passCheckInEnabled(data.invitation.config) && passSigningSecret(env));
}
