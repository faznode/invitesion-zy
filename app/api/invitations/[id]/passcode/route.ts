import { apiError, parseId } from '@/lib/api/respond';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { hashPasscode, normalizePasscode, PASSCODE_MAX_LENGTH, PASSCODE_MIN_LENGTH } from '@/lib/invitation/guest-passcode';
import { clearGuestPasscode, setGuestPasscode } from '@/lib/invitation/guest-passcode-db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Flag, session, role, id, in the restore route's order: the caller and invitation, or the refusal to answer. */
async function owner(params: Ctx['params']): Promise<{ userId: number; id: number } | Response> {
  if (!isFlagOn('GUEST_PASSCODE')) return apiError(404, 'NOT_FOUND', 'Not found');
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');
  const id = parseId((await params).id);
  if (!id) return apiError(400, 'BAD_REQUEST', 'Invalid invitation');
  return { userId: user.id, id };
}

/**
 * G-047 (D-069): the host sets or changes the guest passcode. Body `{ passcode }`, 6–32 letters or digits (compared
 * without case or surrounding spaces); only its scrypt hash is stored, by `guest-passcode-db.ts`, and nothing of it is
 * answered back. Another customer's invitation: 404. Flag off: 404 (the stored hash is kept).
 */
export async function PUT(req: Request, { params }: Ctx) {
  const who = await owner(params);
  if (who instanceof Response) return who;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Body must be valid JSON');
  }
  const code = normalizePasscode((body as { passcode?: unknown } | null)?.passcode);
  if (!code) return apiError(422, 'INVALID_PASSCODE', `The passcode must be ${PASSCODE_MIN_LENGTH}–${PASSCODE_MAX_LENGTH} letters or digits`);
  const state = await setGuestPasscode(who.id, who.userId, await hashPasscode(code));
  if (!state) return apiError(404, 'NOT_FOUND', 'Invitation not found');
  return Response.json({ data: state });
}

/** G-047: the host removes the passcode; the invitation is public to its link again. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await owner(params);
  if (who instanceof Response) return who;
  if (!(await clearGuestPasscode(who.id, who.userId))) return apiError(404, 'NOT_FOUND', 'Invitation not found');
  return Response.json({ data: { enabled: false, setAt: null } });
}
