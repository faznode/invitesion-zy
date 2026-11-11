import type { DetailConfig } from './detail-config';

/**
 * B-029 (G-033): the programme a corporate host already typed (description, agenda, speakers, dress code, contact),
 * rendered when filled. `buildGuestView()` reads the stored fields for corporate invitations only and passes them here;
 * this module trims, drops blank rows and decides which contact values may become links. No layout reads the profile.
 */
type CorporateProfile = NonNullable<DetailConfig['corporateProfile']>;

export type ProgrammeInput = Pick<CorporateProfile, 'description' | 'agenda' | 'speakers' | 'dressCode' | 'contactName' | 'contactPhone' | 'contactEmail'>;

export type ProgrammeLink = { label: string; href?: string };

export type Programme = {
  description?: string;
  agenda: { time?: string; title: string; speaker?: string }[];
  speakers: { name: string; role?: string; org?: string }[];
  dressCode?: string;
  contact?: { name?: string; phone?: ProgrammeLink; email?: ProgrammeLink };
};

const filled = (value: string | undefined) => value?.trim() || undefined;

/** `tel:` only for a dialable number: an optional leading +, then 6–15 digits once spaces, dots, dashes and brackets go. */
export function telHref(value: string | undefined): string | undefined {
  const dialable = value?.replace(/[\s().-]/g, '');
  return dialable && /^\+?\d{6,15}$/.test(dialable) ? `tel:${dialable}` : undefined;
}

/** `mailto:` only for one plain address. The stored field is free text, so anything else is shown as text, unlinked. */
export function mailtoHref(value: string | undefined): string | undefined {
  const address = value?.trim();
  return address && /^[^\s@"'<>(),;:\\/?#&=]+@[^\s@"'<>(),;:\\/?#&=]+\.[a-z]{2,}$/i.test(address) ? `mailto:${address}` : undefined;
}

/** The programme with every value trimmed and blank rows dropped; null when nothing is left to show. */
export function programmeOf(input: ProgrammeInput | undefined): Programme | null {
  if (!input) return null;
  const agenda = (input.agenda ?? []).flatMap((row) => {
    const title = filled(row.title);
    return title ? [{ title, time: filled(row.time), speaker: filled(row.speaker) }] : [];
  });
  const speakers = (input.speakers ?? []).flatMap((row) => {
    const name = filled(row.name);
    return name ? [{ name, role: filled(row.role), org: filled(row.org) }] : [];
  });
  const name = filled(input.contactName);
  const phone = filled(input.contactPhone);
  const email = filled(input.contactEmail);
  const contact =
    name || phone || email
      ? {
          name,
          phone: phone ? { label: phone, href: telHref(phone) } : undefined,
          email: email ? { label: email, href: mailtoHref(email) } : undefined,
        }
      : undefined;
  const description = filled(input.description);
  const dressCode = filled(input.dressCode);
  return description || agenda.length || speakers.length || dressCode || contact ? { description, agenda, speakers, dressCode, contact } : null;
}
