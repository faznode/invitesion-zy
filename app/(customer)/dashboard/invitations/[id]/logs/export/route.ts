import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { giftsCsv, parseId, seatingCsv, sideLabels } from '@/lib/invitation/host-logs';
import { loadHostLogs } from '@/lib/invitation/host-logs-db';
import { accessFor } from '@/lib/invitation/members-db';

/**
 * G-045 (D-058): the owner's day-of exports, `?kind=seating` (one row per guest: table, seat, souvenir, arrival) or
 * `?kind=gifts` (the gift log). Owner only (`manage`), behind `FLAG_HOST_LOGS`; an administrator is refused before the
 * invitation is read, and anyone else gets the same 404 as a missing invitation. Cells are neutralised (B-006).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (user.role === 'ADMIN') return new Response('Forbidden', { status: 403 });
  if (!isFlagOn('HOST_LOGS')) return new Response('Not found', { status: 404 });
  const id = parseId((await params).id);
  const access = id === null ? null : await accessFor(user.id, id, 'manage');
  if (!access || id === null) return new Response('Not found', { status: 404 });
  const kind = new URL(req.url).searchParams.get('kind');
  if (kind !== 'seating' && kind !== 'gifts') return new Response('Unknown export', { status: 400 });
  const logs = await loadHostLogs(id);
  const body = kind === 'seating' ? seatingCsv(logs.guests, logs.tables) : giftsCsv(logs.gifts, sideLabels(access.invitation.config));
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${access.invitation.slug}-${kind === 'seating' ? 'meja-suvenir' : 'kado'}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
