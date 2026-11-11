import { z } from 'zod';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { apiError, parseId, validationError } from '@/lib/api/respond';
import { sameOrigin } from '@/lib/api/same-origin';
import { isFlagOn } from '@/lib/flags';
import { MAX_SCANS_PER_BATCH, MAX_TOKEN_CHARS } from '@/lib/invitation/guest-pass';
import { accessFor } from '@/lib/invitation/members-db';
import { checkInWithPasses } from '@/lib/invitation/roster';
import { hit, parseLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * A pass is ASCII, and so is a scan time. Admitting printable ASCII only also keeps the batch's canonical JSON the same
 * bytes in both writers (`passCheckinCanonical`), so a resent batch replays through either.
 */
const PRINTABLE = /^[\x20-\x7e]*$/;

const bodySchema = z
  .object({
    /** The scanner's key for this batch: a resend after a lost answer carries the same one. */
    key: z.string().regex(/^[\x21-\x7e]{8,100}$/),
    scans: z
      .array(
        z
          .object({ token: z.string().max(MAX_TOKEN_CHARS).regex(PRINTABLE), scannedAt: z.string().max(40).regex(PRINTABLE).optional() })
          .strict(),
      )
      .min(1)
      .max(MAX_SCANS_PER_BATCH),
  })
  .strict();

/** Per host and invitation; a batch counts once. `RATE_LIMIT_CHECKIN` (`<count>/<seconds>`) overrides it. */
const CHECKIN_LIMIT = { max: 120, windowSeconds: 60 };

/**
 * B-024 (D-056, ADR-A3): the scanner's only write. The browser never calls the Rust API: this route checks the origin,
 * the content type, the Clerk session and a rate limit, then hands the batch to the roster facade (`BACKEND_ROSTER`,
 * one writer). Flag off: 404, so every pass is inert. Answers carry no guest data beyond each pass's display name.
 */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req.headers)) return apiError(403, 'CROSS_SITE', 'Same-origin requests only');
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON only');
  }
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');
  const id = parseId((await params).id);
  if (!id) return apiError(400, 'BAD_REQUEST', 'Invalid invitation id');
  if (!isFlagOn('GUEST_PASS')) return apiError(404, 'NOT_FOUND', 'Not found');
  // G-044 (D-057, ADR-A3): the owner, a co-host or an usher (`checkin`); the writer checks the same grant again.
  if (!(await accessFor(user.id, id, 'checkin'))) return apiError(404, 'NOT_FOUND', 'Invitation not found');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const verdict = await hit(`checkin:${user.id}:${id}`, parseLimit(process.env.RATE_LIMIT_CHECKIN, CHECKIN_LIMIT));
  if (!verdict.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many check-ins', retryAfter: verdict.retryAfter } },
      { status: 429, headers: { 'retry-after': String(verdict.retryAfter) } },
    );
  }

  const outcome = await checkInWithPasses(
    { userId: user.id, ownerToken: ownerSessionToken },
    { invitationId: id, scans: parsed.data.scans, key: parsed.data.key },
  );
  switch (outcome.kind) {
    case 'checked':
      return Response.json({ results: outcome.results }, { headers: { 'cache-control': 'no-store' } });
    case 'disabled':
      return apiError(409, 'GUEST_PASS_OFF', 'Guest passes are not switched on for this invitation');
    case 'unconfigured':
      return apiError(503, 'GUEST_PASS_UNCONFIGURED', 'Guest passes are not configured');
    case 'key-reused':
      return apiError(422, 'KEY_REUSED', 'This key already answered another batch');
    case 'notfound':
      return apiError(404, 'NOT_FOUND', 'Invitation not found');
    case 'signin':
      return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
    case 'unconfirmed':
      return apiError(503, 'CHECKIN_UNCONFIRMED', 'Outcome unknown; resend the same batch');
  }
}
