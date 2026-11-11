// SPIKE ONLY (08-backend-rust-plan, session 09). Copied by run-spike.sh into the local-stack snapshot
// ($WORK/app/app/spike-min/...), never into the product's app/. It is the "next-min" arm: the product's own
// loadPublicInvitation() called ONCE + trackInvitationView() in after(), rendered as the same minimal HTML the
// Rust spike writes. Comparing it with the full page (two loader calls + React SSR) and with Rust separates
// rendering/duplicate-load cost from runtime cost.
import { after } from 'next/server';
import { loadPublicInvitation, trackInvitationView } from '@/lib/invitation/public';

export const dynamic = 'force-dynamic';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escape(text: string) {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; guestSlug: string }> }) {
  const { slug, guestSlug } = await params;
  const data = await loadPublicInvitation(slug, guestSlug);
  if (!data || !data.guest) return new Response('Undangan tidak ditemukan', { status: 404 });

  const allowance = Math.max(1, data.guest.guestCount ?? 1);
  const title = data.config.settings?.title || 'Undangan';
  const parts: string[] = [
    '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="robots" content="noindex, nofollow"><title>${escape(title)}</title></head><body><main>`,
    `<section><p>Kepada Yth.</p><h1>${escape(data.guest.name)}</h1></section><section><h2>Galeri</h2>`,
  ];
  for (const asset of data.media) {
    if (asset.type === 'photo') parts.push(`<img loading="lazy" alt="" src="${escape(asset.url)}">`);
  }
  parts.push('</section>');
  if (!data.expired) {
    parts.push(
      `<section><h2>Konfirmasi Kehadiran</h2><form method="post" action="${escape(`/spike-min/i/${slug}/${guestSlug}`)}/rsvp">` +
        `<input name="guestCount" type="number" min="1" max="${allowance}" value="${allowance}">` +
        '<button name="status" value="CONFIRMED">Hadir</button><button name="status" value="DECLINED">Tidak hadir</button></form></section>',
    );
  }
  parts.push(`<section><h2>Ucapan &amp; Doa (${data.totalMessages})</h2><ol>`);
  for (const message of data.messages) parts.push(`<li><b>${escape(message.name)}</b> ${escape(message.message)}</li>`);
  parts.push('</ol></section></main></body></html>');

  const invitationId = data.invitation.id;
  const guestId = data.guest.id;
  after(() => trackInvitationView(invitationId, guestId));

  return new Response(parts.join(''), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}
