/**
 * B-018 (G-015, QA-013): the one builder of a guest's WhatsApp link. Every guest list sends through `guestWhatsApp`, so a
 * number is normalised the same way everywhere (`08…`, `+62…`, `62…`, `8…` give the same digits), a number that cannot
 * be a WhatsApp number gives no link but a reason the host can see, and the message is the host's own template
 * (`whatsappTemplate`, the editor's WhatsApp tab) with the guest's name and personal link filled in. Pure and client-safe.
 */

export type WhatsAppNumber = { ok: true; digits: string } | { ok: false; reason: 'missing' | 'invalid' };

const INDONESIA = '62';

/**
 * Digits for `wa.me/<digits>` (E.164 without the plus), or why there are none.
 * - Indonesian numbers (`0…`, `62…`, `+62…`, `0062…`, a bare `8…`, also `+62 (0)8…`) must be mobile: `8` and 9–12 digits after
 *   the country code, the length of every Indonesian mobile number.
 * - A number written with another country code (`+<code>…` or `00<code>…`) is kept as written when it has 8–15 digits.
 * - Spaces, dots, dashes and brackets are ignored; anything else (letters, a second `+`) makes the number invalid.
 */
export function parseWhatsAppNumber(phone: string | null | undefined): WhatsAppNumber {
  const compact = (phone ?? '').replace(/[\s.\-()]/g, '');
  if (!compact) return { ok: false, reason: 'missing' };
  if (!/^\+?\d+$/.test(compact)) return { ok: false, reason: 'invalid' };
  const international = compact.startsWith('+') || compact.startsWith('00');
  const digits = compact.replace(/^\+|^00/, '');
  if (international && !digits.startsWith(INDONESIA)) {
    return /^[1-9]\d{7,14}$/.test(digits) ? { ok: true, digits } : { ok: false, reason: 'invalid' };
  }
  const national = digits.startsWith(INDONESIA) ? digits.slice(INDONESIA.length).replace(/^0/, '') : digits.replace(/^0/, '');
  return /^8\d{8,11}$/.test(national) ? { ok: true, digits: `${INDONESIA}${national}` } : { ok: false, reason: 'invalid' };
}

/** The digits of a usable WhatsApp number, or null. */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  const parsed = parseWhatsAppNumber(phone);
  return parsed.ok ? parsed.digits : null;
}

/** Sent when the host has written no template; `{nama}` and `{link}` as in a host's template. */
export const DEFAULT_WHATSAPP_MESSAGE = {
  id: 'Halo {nama}, kami mengundang Anda ke acara kami. Undangan personal Anda: {link}',
  en: 'Hi {nama}, we would love to have you at our event. Your personal invitation: {link}',
} as const;

const NAME_TOKEN = /\{\s*(?:nama|name)\s*\}/gi;
const LINK_TOKEN = /\{\s*(?:link|tautan)\s*\}/gi;

/**
 * The message for one guest: the host's template (or the default) with `{nama}` replaced by the guest's name and `{link}`
 * by their personal link. A template without `{link}` still sends the link, on its own line at the end, because the link
 * is the invitation.
 */
export function whatsAppMessage(template: string | null | undefined, values: { name: string; link: string }, locale: 'id' | 'en' = 'id'): string {
  const text = template?.trim() || DEFAULT_WHATSAPP_MESSAGE[locale];
  const hasLink = new RegExp(LINK_TOKEN.source, 'i').test(text);
  const filled = text.replace(NAME_TOKEN, () => values.name).replace(LINK_TOKEN, () => values.link);
  return hasLink ? filled : `${filled}\n\n${values.link}`;
}

/**
 * I-29 (B-034): a message the host forwards to whoever they choose. No recipient, so WhatsApp asks whom to send it to;
 * callers pass counts only (the daily RSVP digest), never a guest's name, number or link.
 */
export function whatsAppShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type GuestWhatsApp = { href: string } | { hint: 'missing' | 'invalid' };

/** A guest's WhatsApp action: the `wa.me` link with the message, or why there is none. */
export function guestWhatsApp(input: {
  phone: string | null | undefined;
  name: string;
  link: string;
  template?: string | null;
  locale?: 'id' | 'en';
}): GuestWhatsApp {
  const number = parseWhatsAppNumber(input.phone);
  if (!number.ok) return { hint: number.reason };
  const text = whatsAppMessage(input.template, { name: input.name, link: input.link }, input.locale);
  return { href: `https://wa.me/${number.digits}?text=${encodeURIComponent(text)}` };
}
