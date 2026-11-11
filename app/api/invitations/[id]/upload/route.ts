import { getUser } from '@/lib/db/queries';
import { apiError } from '@/lib/api/respond';
import { requireOwnedInvitation, OwnershipError } from '@/lib/invitation/service';
import { enqueueImageVariants } from '@/lib/media/variant-jobs';
import { invitationMediaKey, protectedInvitationMediaKey, saveImage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
// Node runtime: the local driver writes to the filesystem, which Edge has not.
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
// B-026: a static QRIS exported from a bank or e-wallet app is a small flat image; 1 MB keeps it inside the guest page's
// byte budget (Q-D17 counts host uploads in the page total). No GIF: a code needs no animation.
const QRIS_MAX_BYTES = 1024 * 1024;
const QRIS_IMAGE_EXT = ['png', 'jpg', 'webp'] as const;

export async function POST(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'ADMIN') return apiError(403, 'FORBIDDEN', 'Customer session required');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError(400, 'BAD_REQUEST', 'Invalid invitation id');

  // Ownership is settled before any bytes are read or stored.
  try {
    await requireOwnedInvitation(id, user.id);
  } catch (err) {
    if (err instanceof OwnershipError) return apiError(404, 'NOT_FOUND', 'Invitation not found');
    throw err;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, 'BAD_REQUEST', 'Body must be multipart/form-data');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return apiError(400, 'NO_FILE', 'Field "file" is required');

  // D-040: a child's photo is stored under `protected/`, which `/media` serves to this invitation's owner only.
  // B-026 (D-047): so is the host's static QRIS image, which guests reach only through the route for their audience.
  const purpose = form.get('purpose');
  if (purpose !== null && purpose !== 'child-photo' && purpose !== 'gift-qris') return apiError(400, 'BAD_REQUEST', 'Unknown upload purpose');
  if (purpose === 'gift-qris') {
    if (file.size > QRIS_MAX_BYTES) return apiError(413, 'FILE_TOO_LARGE', 'Max QRIS image size is 1MB');
    const url = await saveImage((ext) => protectedInvitationMediaKey(id, ext), file, QRIS_MAX_BYTES, QRIS_IMAGE_EXT);
    if (!url) return apiError(415, 'UNSUPPORTED_TYPE', 'The QRIS image must be a PNG, JPG or WEBP up to 1MB');
    return Response.json({ data: { url } }, { status: 201 });
  }
  if (file.size > MAX_BYTES) return apiError(413, 'FILE_TOO_LARGE', 'Max file size is 5MB');
  const keyFor = purpose === 'child-photo' ? protectedInvitationMediaKey : invitationMediaKey;

  // Type allowlisting, size re-check and magic-byte sniffing all live in
  // `saveImage`, so every upload path applies the same rules.
  const url = await saveImage((ext) => keyFor(id, ext), file, MAX_BYTES);
  if (!url) {
    return apiError(415, 'UNSUPPORTED_TYPE', 'Only PNG, JPG, WEBP, or GIF images up to 5MB are allowed');
  }

  // B-019: a public upload queues its WebP variants (best-effort: guests get the original until they exist). Protected
  // uploads never get variants; they keep D-040's owner-only delivery.
  if (purpose === null) await enqueueImageVariants(url);

  return Response.json({ data: { url } }, { status: 201 });
}
