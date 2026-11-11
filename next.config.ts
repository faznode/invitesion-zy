import type { NextConfig } from 'next';

/**
 * Baseline security headers.
 *
 * There were none. The public invitation pages render customer-controlled
 * content and are shared as links to hundreds of people, which is precisely the
 * surface where these earn their keep.
 *
 * Deliberately NOT including a full `Content-Security-Policy` here. A useful CSP
 * for this app needs per-request nonces for Next's inline bootstrap scripts,
 * which belongs in middleware, not in a static header list. Shipping a
 * permissive `script-src 'unsafe-inline'` policy would look like protection
 * while providing close to none, so the honest state is: not yet done, tracked
 * as B6 in docs/AUDIT-2026-07-27.md. `/media` already sets its own strict
 * sandbox policy, which is where untrusted bytes actually are.
 */
const permissionsPolicy = (camera: '()' | '(self)') => `camera=${camera}, microphone=(), geolocation=(), payment=()`;

const securityHeaders = [
  // No MIME sniffing anywhere, not just on /media.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Clickjacking: nothing here is meant to be framed by another origin.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Guest URLs are personal and contain a guest slug; never leak the full path
  // to third parties via Referer.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Denied everywhere; only the host's scanner gets the camera (below).
  { key: 'Permissions-Policy', value: permissionsPolicy('()') },
  // Force HTTPS once seen. Harmless on localhost, which browsers exempt.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/**
 * No `cacheComponents` (F-01, Next 16). Next 16 removed `experimental.ppr`; its successor, Cache Components, would give
 * every route a prerendered shell again, and a shell's 200 is flushed before a guest page can call notFound(), so a
 * wrong link would stop answering a real 404 (B-011, QA-003). Without it every dynamic page renders whole before its
 * first byte. Adopting Cache Components is a separate decision with its own 404 proof. The client segment cache that
 * `experimental.clientSegmentCache` enabled is the default router in Next 16.
 */
const nextConfig: NextConfig = {
  // `next dev` in Next 16 otherwise writes its own instruction block into AGENTS.md, which the owner authors and which
  // governs agents in this repository (seen in s27 at the first dev start). With `false` it also removes such a block.
  agentRules: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // B-024: the scanner reads QR passes through the camera, so its document allows it for this origin; a later entry
      // overrides the same header. The page is entered by a full load (a plain link), because a client-side navigation
      // keeps the previous document's policy, which denies the camera.
      { source: '/dashboard/invitations/:id/checkin', headers: [{ key: 'Permissions-Policy', value: permissionsPolicy('(self)') }] },
    ];
  },
};

export default nextConfig;
