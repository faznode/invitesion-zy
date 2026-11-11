/**
 * B-038 (G-058): the page Content-Security-Policy in one place: its directives, the disposition each path gets, and where
 * violation reports go. `proxy.ts` makes a fresh nonce per request and sends the policy on the request (Next reads the
 * nonce from either header name for its own inline bootstrap scripts) and on the response.
 *
 * Every page renders per request (the root layout reads the locale header), so every page carries the nonce. A
 * prerendered page would not, and an enforced `strict-dynamic` policy would refuse all of its scripts.
 */

export type CspDisposition = 'enforce' | 'report-only';

/** The same-origin collector (`app/api/csp-report/route.ts`): `report-uri` for every browser, `report-to` where supported. */
export const CSP_REPORT_PATH = '/api/csp-report';
export const CSP_REPORT_GROUP = 'csp-endpoint';

/** An invitation, a personal link and a guest pass: every guest-facing page is under `/i/`. */
export function isGuestPage(pathname: string): boolean {
  return pathname.startsWith('/i/');
}

/**
 * `CSP_ENFORCE` stages the rollout, guest pages first (G-058): `guest` enforces the policy on guest pages and keeps it
 * report-only elsewhere, `true` enforces it everywhere, and anything else (unset included) keeps it report-only
 * everywhere. Rolling back is unsetting the variable; the policy is the same in both dispositions apart from
 * `upgrade-insecure-requests`, which only an enforced policy carries (`contentSecurityPolicy`).
 */
export function cspDisposition(pathname: string, setting: string | undefined = process.env.CSP_ENFORCE): CspDisposition {
  const value = setting?.trim().toLowerCase();
  if (value === 'true') return 'enforce';
  if (value === 'guest' && isGuestPage(pathname)) return 'enforce';
  return 'report-only';
}

export function cspHeaderName(disposition: CspDisposition): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
  return disposition === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
}

const CLERK_SHARED_HOSTS = ['https://*.clerk.accounts.dev', 'https://*.clerk.com'];
const HOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A production Clerk instance answers on its own Frontend API host (`clerk.<the app's domain>`), which its publishable
 * key carries: `pk_live_` or `pk_test_`, then base64 of `<host>$`. A key that does not decode to a plain host name (the
 * `.env.example` placeholder, a typo) yields null.
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const encoded = /^pk_(?:live|test)_([A-Za-z0-9+/]+={0,2})$/.exec(publishableKey?.trim() ?? '')?.[1];
  if (!encoded) return null;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const host = decoded.endsWith('$') ? decoded.slice(0, -1).toLowerCase() : '';
  return HOST_NAME.test(host) ? `https://${host}` : null;
}

/** Development instances answer under Clerk's shared hosts, which the policy names already. */
function isClerkSharedHost(origin: string): boolean {
  const host = new URL(origin).hostname;
  return host.endsWith('.clerk.accounts.dev') || host.endsWith('.clerk.com');
}

/**
 * B-035: only the owner preview may be framed, and only by this origin: the editor shows it beside the fields. It is
 * owner-only content without forms (no RSVP or guestbook renders without a guest link). B-037: the wizard's
 * try-with-your-names preview likewise, framed by the wizard beside its fields; it renders the visitor's own typed
 * content and no form either. Every other page stays unframeable.
 */
function frameAncestorsFor(pathname: string): string {
  return pathname.startsWith('/preview/') || pathname === '/buat/pratinjau' ? "frame-ancestors 'self'" : "frame-ancestors 'none'";
}

export type PolicyRequest = {
  nonce: string;
  pathname: string;
  /** The visitor reached the app over HTTPS, directly or through the platform's proxy. */
  secure: boolean;
  /** `next dev` evaluates code for its overlay and Fast Refresh; a production build never needs `unsafe-eval`. */
  development?: boolean;
  /** `clerkFrontendApiOrigin()` of the deployment's publishable key. */
  clerkFrontendApi?: string | null;
  /** The header the policy is sent under (`cspDisposition`). */
  disposition?: CspDisposition;
};

export function contentSecurityPolicy({ nonce, pathname, secure, development = false, clerkFrontendApi = null, disposition = 'enforce' }: PolicyRequest): string {
  const clerkHosts = clerkFrontendApi && !isClerkSharedHost(clerkFrontendApi) ? [...CLERK_SHARED_HOSTS, clerkFrontendApi] : CLERK_SHARED_HOSTS;
  return [
    "default-src 'self'",
    // `strict-dynamic` lets a nonced loader pull in the chunks it needs without enumerating every hashed filename. The
    // http/https fallbacks are ignored by browsers that understand strict-dynamic and keep older ones working. Clerk's
    // script is inserted by a nonced chunk, so it needs no entry of its own.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: http:${development ? " 'unsafe-eval'" : ''}`,
    // Tailwind and the invitation themes set inline styles; nonces do not reach style attributes, so this stays
    // permissive and is a known limitation.
    "style-src 'self' 'unsafe-inline'",
    // D-045 and the image rule: a host may give any image, and the music, as an http(s) address of their own, so images
    // and media accept https sources (over HTTPS an http address is upgraded first, below). Neither can run script.
    // Clerk's avatars (img.clerk.com) are among them.
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    "font-src 'self' data:",
    // Clerk's client calls its Frontend API: the shared development hosts, or a production instance's own host.
    `connect-src 'self' ${clerkHosts.join(' ')}`,
    // Clerk renders its bot-protection challenge in a frame. B-025: a gallery video plays, after the guest's tap, in the
    // provider's privacy-enhanced player, exactly these two hosts (`lib/invitation/gallery.ts` builds only their URLs).
    // G-029: an event's map, after the guest's tap, from this one host (`lib/invitation/map-embed.ts` builds only its URLs).
    "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com",
    "worker-src 'self' blob:",
    frameAncestorsFor(pathname),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Only meaningful over HTTPS: a page served over plain HTTP (a local server) has nothing to upgrade to. A browser
    // ignores it in a report-only policy and logs a console error on every page for it, so only an enforced policy has it.
    ...(secure && disposition === 'enforce' ? ['upgrade-insecure-requests'] : []),
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ');
}

/** `Reporting-Endpoints` names the `report-to` group; an absolute address, as the Reporting API resolves it. */
export function reportingEndpointsHeader(origin: string): string {
  return `${CSP_REPORT_GROUP}="${new URL(CSP_REPORT_PATH, origin).href}"`;
}
