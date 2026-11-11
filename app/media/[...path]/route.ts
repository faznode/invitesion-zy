import { getUser } from '@/lib/db/queries';
import { invitationMediaGone } from '@/lib/invitation/deletion-db';
import { OwnershipError, requireOwnedInvitation } from '@/lib/invitation/service';
import { getStorage } from '@/lib/storage';
import { serveMedia } from '@/lib/storage/serve-media';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Serves runtime-uploaded media from whichever storage driver is configured (local disk in development, S3-compatible
 * object storage in production). Key validation lives in the driver layer; the audience rule (public uploads versus a
 * child's photo under `protected/`, D-040) lives in `serveMedia`. The owner check below needs Clerk's middleware, which
 * `proxy.ts` runs for `/media/protected/*` explicitly (its general matcher skips image extensions).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const segments = (await params).path ?? [];
  return serveMedia(segments, {
    storage: getStorage(),
    ownerMayRead,
    invitationGone: invitationMediaGone,
    onAccessCheckError: (error) => console.error('[media] access check failed:', error instanceof Error ? error.name : 'unknown'),
  });
}

async function ownerMayRead(invitationId: number): Promise<boolean> {
  const user = await getUser();
  // The host's own photo: an administrator's session is not the owner's and gets nothing here.
  if (!user || user.role === 'ADMIN') return false;
  try {
    await requireOwnedInvitation(invitationId, user.id);
    return true;
  } catch (error) {
    if (error instanceof OwnershipError) return false;
    throw error;
  }
}
