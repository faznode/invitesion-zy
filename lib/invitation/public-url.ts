import 'server-only';

import { headers } from 'next/headers';

// Path builders live in a client-safe module (the editor needs them); re-exported so server imports keep working.
export { guestPath, invitationPath, ownerPreviewPath } from './public-path';

/**
 * Absolute origin for links that leave the app (WhatsApp, email).
 * Configured value wins; otherwise fall back to the forwarded request host so
 * local development and preview deployments still produce reachable links.
 */
export async function getPublicOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) return '';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}
