import { and, desc, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { guests, invitations } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { rsvpStatusLabel } from '@/lib/i18n';
import { guestLinkSegment } from '@/lib/invitation/guest-link';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { getPublicOrigin, guestPath } from '@/lib/invitation/public-url';
import { rsvpSummary } from '@/lib/invitation/rsvp-rules';
import { guestWhatsApp } from '@/lib/invitation/whatsapp';
import { GuestWhatsAppAction } from '@/components/dashboard/guest-whatsapp-action';
import { rosterErrorMessage } from '@/lib/invitation/roster-notices';
import { addGuest, markGuestSent } from './actions';

export const dynamic = 'force-dynamic';

/**
 * B-018: one guest's WhatsApp action with the host's message (`whatsappTemplate`). The personal link's last segment
 * identifies the guest (handoff 1.5): the opaque token when the guest has one, else the legacy slug (B-011,
 * `lib/invitation/guest-link.ts`).
 */
function waAction(origin: string, invitationSlug: string, template: string | undefined, guest: { phone: string | null; name: string; slug: string; linkToken: string | null }, en: boolean) {
  const link = `${origin}${guestPath(invitationSlug, guestLinkSegment(guest))}`;
  return guestWhatsApp({ phone: guest.phone, name: guest.name, link, template, locale: en ? 'en' : 'id' });
}

export default async function CustomerGuests({ searchParams }: { searchParams: Promise<{ added?: string; error?: string; invitation?: string }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');
  const en = (await getLocale()) === 'en';
  const query = await searchParams;
  // B-031: a deleted invitation's guest list is gone with it (restore it from the invitations page first).
  const invites = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.userId, user.id), isNull(invitations.deletedAt)))
    .orderBy(desc(invitations.createdAt));
  // Explicit context: which invitation is being managed comes from the URL
  // (?invitation=<id>), never implicitly from "the newest one". Picking
  // invites[0] silently attached guests to whichever invitation happened to be
  // created last — with more than one invitation that is the wrong list to
  // read and the wrong list to write to. The list is already scoped to this
  // user, so an id that is not theirs simply falls back to the default.
  const requestedId = Number(query.invitation);
  const invitation = invites.find((inv) => inv.id === requestedId) ?? invites[0];
  const rows = invitation ? await db.select().from(guests).where(eq(guests.invitationId, invitation.id)).orderBy(desc(guests.id)) : [];
  const summary = rsvpSummary(rows);
  const people = en ? `${summary.seats} ${summary.seats === 1 ? 'person' : 'people'}` : `${summary.seats} orang`;
  const seatsHint = summary.seatsUnknown ? `${people} · ${summary.seatsUnknown} ${en ? 'without a count' : 'tanpa jumlah'}` : people;
  const origin = await getPublicOrigin();
  // B-018: the host's own WhatsApp message (editor, WhatsApp tab) for every guest of this invitation.
  const template = invitation ? normalizeStoredConfig(invitation.config ?? {}).config.whatsappTemplate : undefined;

  return <section className="min-h-full bg-slate-50/70 p-4 lg:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-brand-700">{en ? 'Guest management' : 'Manajemen tamu'}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{en ? 'Guests & RSVP' : 'Tamu & RSVP'}</h1><p className="mt-2 text-sm text-slate-500">{en ? 'Add guests, send each invitation through WhatsApp, and monitor responses.' : 'Tambah tamu, kirim undangan personal lewat WhatsApp, lalu pantau responsnya.'}</p></header>
    {invites.length > 1 && invitation && <nav aria-label={en ? 'Choose invitation' : 'Pilih undangan'} className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{en ? 'Invitation:' : 'Undangan:'}</span>{invites.map((inv) => <Link key={inv.id} href={`/dashboard/guests?invitation=${inv.id}`} aria-current={inv.id === invitation.id ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${inv.id === invitation.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>/{inv.slug}</Link>)}</nav>}
    {query.added && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{en ? 'Guest added.' : 'Tamu berhasil ditambahkan.'}</p>}
    {query.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{en ? 'Could not save guest. Check the entered details.' : rosterErrorMessage(query.error)}</p>}
    {!invitation ? <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">{en ? 'Create an invitation first before adding guests.' : 'Buat undangan terlebih dahulu sebelum menambah tamu.'}</div> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"><Metric label={en ? 'Total guests' : 'Total tamu'} value={summary.total}/><Metric label={en ? 'Attending' : 'Hadir'} value={summary.counts.CONFIRMED} hint={seatsHint}/><Metric label={en ? 'Maybe' : 'Mungkin'} value={summary.counts.MAYBE}/><Metric label={en ? 'No reply yet' : 'Belum menjawab'} value={summary.counts.PENDING}/><Metric label={en ? 'Sent' : 'Terkirim'} value={rows.filter((x) => x.sentAt).length}/></div>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"><form action={addGuest} className="h-fit rounded-xl border bg-white p-5 shadow-sm"><input type="hidden" name="invitationId" value={invitation.id}/><h2 className="font-bold text-slate-900">{en ? 'Add guest' : 'Tambah tamu'}</h2><p className="mt-1 text-sm text-slate-500">/{invitation.slug}</p><div className="mt-5 space-y-4"><Field name="name" label={en ? 'Guest name' : 'Nama tamu'} required/><Field name="phone" label="WhatsApp" placeholder="0812xxxx"/><Field name="category" label={en ? 'Category' : 'Kategori'} placeholder={en ? 'Family, friend, colleague' : 'Keluarga, teman, kolega'}/><Field name="guestCount" label={en ? 'Number of guests' : 'Jumlah tamu'} type="number" defaultValue="1" required/></div><button className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">{en ? 'Save guest' : 'Simpan tamu'}</button></form>
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-bold text-slate-900">{en ? 'Guest list' : 'Daftar tamu'}</h2><p className="mt-1 text-sm text-slate-500">{en ? 'Each guest gets a personalised WhatsApp action.' : 'Setiap tamu punya aksi WhatsApp personal.'}</p></div>{rows.length ? <div className="divide-y">{rows.map((g) => { const wa = waAction(origin, invitation.slug, template, g, en); return <article key={g.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900">{g.name}</h3><p className="mt-1 text-xs text-slate-500">{g.phone || (en ? 'No WhatsApp number' : 'Belum ada nomor WhatsApp')} · {g.category || '—'} · {g.guestCount} {en ? 'guest(s)' : 'tamu'}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-400">{guestPath(invitation.slug, guestLinkSegment(g))}</p></div><span className="text-xs font-medium text-slate-500">{rsvpStatusLabel(g.rsvpStatus, en ? 'en' : 'id')}</span><div className="flex gap-2"><GuestWhatsAppAction action={wa} en={en} className="inline-flex min-h-10 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100">WhatsApp</GuestWhatsAppAction><form action={markGuestSent}><input type="hidden" name="guestId" value={g.id}/><input type="hidden" name="invitationId" value={invitation.id}/><button className="rounded-lg border px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{g.sentAt ? (en ? 'Sent' : 'Terkirim') : (en ? 'Mark sent' : 'Tandai kirim')}</button></form></div></article> })}</div> : <div className="p-10 text-center text-sm text-slate-500">{en ? 'No guests yet. Add the first one from the form.' : 'Belum ada tamu. Tambahkan tamu pertama dari formulir.'}</div>}</section></div>
    </>}
  </div></section>;
}
function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) { return <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>{hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}</div>; }
function Field({ name, label, type = 'text', required, placeholder, defaultValue }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string }) { return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span><input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 50 : undefined} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label>; }
