'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isFlagOn } from '@/lib/flags';
import { registerRosterGuest } from '@/lib/invitation/roster';
import { clientAddressFrom, trustedProxyHops } from '@/lib/net/client-address';

/** A form key as `randomUUID` makes it; anything else is ignored and the writer mints one. */
const FORM_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * B-033: a self-registration through the roster writer (`BACKEND_ROSTER`). The registrant's address comes from the
 * trusted-proxy contract (`TRUSTED_PROXY_HOPS`) for the per-address limit only. Redirects never carry what was typed.
 */
export async function submitRegistration(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const path = `/daftar/${encodeURIComponent(token)}`;
  if (!isFlagOn('SELF_REGISTRATION')) redirect(path);
  const forwarded = await headers();
  const key = String(formData.get('key') ?? '');
  const outcome = await registerRosterGuest({
    token,
    row: { name: String(formData.get('name') ?? ''), phone: String(formData.get('phone') ?? ''), guestCount: String(formData.get('guestCount') ?? '') },
    clientIp: clientAddressFrom(forwarded.get('x-forwarded-for'), trustedProxyHops()),
    idempotencyKey: FORM_KEY.test(key) ? key : null,
  });
  switch (outcome.kind) {
    case 'received':
      redirect(`${path}?daftar=ok`);
    case 'invalid':
      redirect(`${path}?daftar=invalid&field=${outcome.reason}`);
    case 'full':
      redirect(`${path}?daftar=full`);
    case 'busy':
      redirect(`${path}?daftar=busy${outcome.retryAfter ? `&r=${outcome.retryAfter}` : ''}`);
    case 'unconfirmed':
      redirect(`${path}?daftar=retry&k=${encodeURIComponent(outcome.key)}`);
    default:
      redirect(`${path}?daftar=closed`);
  }
}
