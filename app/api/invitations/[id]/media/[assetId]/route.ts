import { getUser } from '@/lib/db/queries';
import { apiError, parseId, validationError } from '@/lib/api/respond';
import { deleteMedia, updateMedia, mediaUpdateSchema, OwnershipError } from '@/lib/invitation/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; assetId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const p = await params;
  const id = parseId(p.id);
  const assetId = parseId(p.assetId);
  if (!id || !assetId) return apiError(400, 'BAD_REQUEST', 'Invalid id');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Body must be valid JSON');
  }

  const parsed = mediaUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const asset = await updateMedia(id, user.id, assetId, parsed.data);
    return Response.json({ data: asset });
  } catch (err) {
    if (err instanceof OwnershipError) return apiError(404, 'NOT_FOUND', 'Not found');
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const p = await params;
  const id = parseId(p.id);
  const assetId = parseId(p.assetId);
  if (!id || !assetId) return apiError(400, 'BAD_REQUEST', 'Invalid id');

  try {
    await deleteMedia(id, user.id, assetId);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof OwnershipError) return apiError(404, 'NOT_FOUND', 'Not found');
    throw err;
  }
}
