import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { parseId } from '@/lib/invitation/host-logs';
import { accessFor } from '@/lib/invitation/members-db';
import { bookCover, bookFilename } from '@/lib/invitation/wishes-book';
import { loadWishesBook } from '@/lib/invitation/wishes-book-db';
import { renderWishesBook } from '@/lib/invitation/wishes-book-pdf';

/**
 * I-22 (D-060): the wishes book as a PDF attachment, made on each request and never stored. Owner only (`manage`; a co-host
 * moderates wishes but does not export them), behind `FLAG_WISHES_BOOK`. As G-045's exports: a signed-out request is 401,
 * an administrator is refused before the invitation is read, and anyone else, or the flag off, gets the same 404 as a
 * missing invitation. Every check runs again on each download, so a link rendered earlier stops working once access ends.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (user.role === 'ADMIN') return new Response('Forbidden', { status: 403 });
  if (!isFlagOn('WISHES_BOOK')) return new Response('Not found', { status: 404 });
  const id = parseId((await params).id);
  const access = id === null ? null : await accessFor(user.id, id, 'manage');
  if (!access || id === null) return new Response('Not found', { status: 404 });
  const { wishes, total } = await loadWishesBook(id);
  const book = await renderWishesBook({ ...bookCover(access.invitation.eventType, access.invitation.config), wishes, total, generatedAt: new Date() });
  return new Response(book.bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${bookFilename(access.invitation.slug, id)}"`,
      'content-length': String(book.bytes.byteLength),
      'cache-control': 'private, no-store',
    },
  });
}
