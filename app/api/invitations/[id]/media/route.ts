import { getUser } from '@/lib/db/queries';
import { apiError, parseId, validationError } from '@/lib/api/respond';
import {
  addMedia,
  listMedia,
  mediaCreateSchema,
  DuplicateSequenceError,
  OwnershipError,
} from '@/lib/invitation/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const id = parseId((await params).id);
  if (!id) return apiError(400, 'BAD_REQUEST', 'Invalid invitation id');

  try {
    const media = await listMedia(id, user.id);
    return Response.json({ data: media });
  } catch (err) {
    if (err instanceof OwnershipError) return apiError(404, 'NOT_FOUND', 'Invitation not found');
    throw err;
  }
}

export async function POST(req: Request, { params }: Ctx) {
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

  const parsed = mediaCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const asset = await addMedia(id, user.id, parsed.data);
    return Response.json({ data: asset }, { status: 201 });
  } catch (err) {
    if (err instanceof OwnershipError) return apiError(404, 'NOT_FOUND', 'Invitation not found');
    if (err instanceof DuplicateSequenceError)
      return apiError(409, 'DUPLICATE_SEQUENCE', 'uploadSequence already used for this invitation');
    throw err;
  }
}
