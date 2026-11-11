import { z } from 'zod';
import { ownerSessionToken } from '@/lib/auth/clerk-user';
import { getUser } from '@/lib/db/queries';
import { apiError, parseId, validationError } from '@/lib/api/respond';
import { loadEditorContent, saveInvitationContent } from '@/lib/invitation/content';
import { detailConfigSchema } from '@/lib/invitation/detail-config';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const id = parseId((await params).id);
  if (!id) return apiError(400, 'BAD_REQUEST', 'Invalid invitation id');

  const content = await loadEditorContent(id, user.id);
  if (!content) return apiError(404, 'NOT_FOUND', 'Invitation not found');
  return Response.json({ data: content.config, version: content.version });
}

/**
 * B-035: the editor's save, manual or automatic. The body is the sections to save plus `expectedVersion`, the version the
 * editor loaded or last saved; a save prepared from another version answers 409 with the stored one and writes nothing.
 * A body without it (a page loaded before B-035) is still checked against the version read here.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const id = parseId((await params).id);
  if (!id) return apiError(400, 'BAD_REQUEST', 'Invalid invitation id');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Body must be valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(400, 'BAD_REQUEST', 'Body must be a JSON object');

  const { expectedVersion, ...sections } = body as Record<string, unknown>;
  if (expectedVersion !== undefined && expectedVersion !== null && !(Number.isInteger(expectedVersion) && (expectedVersion as number) >= 0)) {
    return apiError(400, 'BAD_REQUEST', 'expectedVersion must be a non-negative integer');
  }

  const parsed = detailConfigSchema.partial().safeParse(sections);
  if (!parsed.success) return validationError(parsed.error);

  let outcome;
  try {
    outcome = await saveInvitationContent(
      { userId: user.id, ownerToken: ownerSessionToken },
      { invitationId: id, patch: parsed.data, expectedVersion: (expectedVersion as number | null | undefined) ?? null },
    );
  } catch (err) {
    // The sections passed alone but the merged whole does not (a cross-section rule): the same 422 as above.
    if (err instanceof z.ZodError) return validationError(err);
    throw err;
  }

  switch (outcome.kind) {
    case 'saved':
      return Response.json({ data: outcome.config, version: outcome.version });
    case 'conflict':
      return apiError(409, 'VERSION_CONFLICT', 'Invitation changed in another tab or device', { currentVersion: outcome.currentVersion });
    case 'notfound':
      return apiError(404, 'NOT_FOUND', 'Invitation not found');
    // D-040: field paths only, never the stored values.
    case 'media':
      return apiError(400, 'INVALID_MEDIA', `Image not allowed here: ${outcome.issues.map((issue) => issue.path).join(', ')}`);
    // B-041: paths and reasons only; the package decides, never the request.
    case 'theme':
      return apiError(403, 'THEME_NOT_ENTITLED', 'Theme not included in this invitation', outcome.issues);
    case 'signin':
      return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
    case 'unconfirmed':
      return apiError(503, 'SAVE_UNCONFIRMED', 'The save could not be confirmed; your changes are kept, try again');
  }
}
