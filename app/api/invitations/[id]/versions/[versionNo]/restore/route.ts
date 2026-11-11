import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { apiError, parseId } from '@/lib/api/respond';
import { isFlagOn } from '@/lib/flags';
import { restoreInvitationVersion } from '@/lib/invitation/content';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; versionNo: string }> };

/**
 * G-046: restores the owner's saved version as a new version. The body is `{ expectedVersion }`, the version the history
 * page showed as current: a restore prepared from a stale page answers 409 and writes nothing. The selected content writer
 * stores it under every save rule (`restoreInvitationVersion`); it changes the config only. Flag off: 404.
 */
export async function POST(req: Request, { params }: Ctx) {
  if (!isFlagOn('VERSION_HISTORY')) return apiError(404, 'NOT_FOUND', 'Not found');
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const route = await params;
  const id = parseId(route.id);
  const versionNo = parseId(route.versionNo);
  if (!id || !versionNo) return apiError(400, 'BAD_REQUEST', 'Invalid invitation or version');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Body must be valid JSON');
  }
  const expectedVersion = (body as { expectedVersion?: unknown } | null)?.expectedVersion;
  if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 0) {
    return apiError(400, 'BAD_REQUEST', 'expectedVersion must be a non-negative integer');
  }

  const outcome = await restoreInvitationVersion(
    { userId: user.id, ownerToken: ownerSessionToken },
    { invitationId: id, versionNo, expectedVersion: expectedVersion as number },
  );
  switch (outcome.kind) {
    case 'saved':
      return Response.json({ data: outcome.config, version: outcome.version, restoredFrom: versionNo });
    case 'conflict':
      return apiError(409, 'VERSION_CONFLICT', 'Invitation changed in another tab or device', { currentVersion: outcome.currentVersion });
    case 'current':
      return apiError(409, 'ALREADY_CURRENT', 'This version is the current one');
    case 'notfound':
      return apiError(404, 'NOT_FOUND', 'Version not found');
    case 'unrestorable':
      return apiError(422, 'UNRESTORABLE', 'This version no longer fits the invitation format');
    // D-040: field paths only, never the stored values.
    case 'media':
      return apiError(400, 'INVALID_MEDIA', `Image not allowed here: ${outcome.issues.map((issue) => issue.path).join(', ')}`);
    // B-041: the package decides, never the version.
    case 'theme':
      return apiError(403, 'THEME_NOT_ENTITLED', 'Theme not included in this invitation', outcome.issues);
    case 'signin':
      return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
    case 'unconfirmed':
      return apiError(503, 'SAVE_UNCONFIRMED', 'The restore could not be confirmed; reload to see the current version');
  }
}
