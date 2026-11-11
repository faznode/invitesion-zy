/**
 * ADR-A3 (B-024): routes the browser writes to directly (the check-in scanner) refuse cross-site requests before any
 * session is read. A request passes when the browser marks it same-origin (`Sec-Fetch-Site`), or, from a browser that
 * does not send that header, when its `Origin` names this host (the rule Next.js applies to server actions). A request
 * with neither header is refused: browsers send at least `Origin` on every cross-site POST.
 */
export function sameOrigin(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = headers.get('origin');
  if (!origin) return site === 'same-origin';
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(',')[0].trim();
  } catch {
    return false;
  }
}
