import { asc, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BarChart3, CheckCircle2, ChevronLeft, FileUp, MessageCircle, ScanLine, UserPlus } from 'lucide-react';
import { RegistrationPanel } from '@/components/dashboard/registration-panel';
import { RosterBanners } from '@/components/dashboard/roster-banners';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { guestRegistrationLinks, guestRegistrations, guests } from '@/lib/db/schema';
import { accessFor } from '@/lib/invitation/members-db';
import { rosterErrorMessage } from '@/lib/invitation/roster-notices';
import { isFlagOn } from '@/lib/flags';
import { guestAnswerLines, questionSummaries } from '@/lib/invitation/answer-summary';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { eventVisibleTo, guestAudience, inviteeCounts, inviteOnlyEvents, readInvitedEventIds, visibleEvents } from '@/lib/invitation/event-eligibility';
import { eventRsvpSummary, exportedEvents, perEventRsvpEvents, readEventAnswers } from '@/lib/invitation/rsvp-events';
import { rsvpCounts } from '@/lib/invitation/rsvp-rules';
import { guestLinkSegment } from '@/lib/invitation/guest-link';
import { getPublicOrigin, guestPath } from '@/lib/invitation/public-url';
import { guestWhatsApp } from '@/lib/invitation/whatsapp';
import { GuestWhatsAppAction } from '@/components/dashboard/guest-whatsapp-action';
import { addScopedGuest, updateGuestOperation } from './actions';
import { undoGuestImport } from './import/actions';
import { registrationDecisionAction, registrationLinkAction } from './registration-actions';
import { AnswerOverview, GuestAnswers } from './answer-summary';
import { AddGuestInvites, GuestEventAnswers, GuestInvites, InviteOnlyPanel } from './event-access';
export const dynamic='force-dynamic';
type Query={added?:string;error?:string;invites?:string;imported?:string;skipped?:string;batch?:string;undone?:string;kept?:string;registration?:string;approved?:string;rejected?:string};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>,searchParams:Promise<Query>}){
 const user=await getUser();if(!user||user.role==='ADMIN')redirect('/sign-in');const id=Number((await params).id);if(!Number.isInteger(id))notFound();
 // G-044 (D-057): the owner or a co-host (`guests`); a co-host's way back is the dashboard, not the owner's control centre.
 const access=await accessFor(user.id,id,'guests');if(!access)notFound();const inv=access.invitation;const owner=access.role==='owner';
 const rows=await db.select().from(guests).where(eq(guests.invitationId,id)).orderBy(desc(guests.id));const q=await searchParams;
 // B-033: the import entry and the self-registration panel, each behind its flag (reads only; writes go through the roster writer).
 const importOn=isFlagOn('GUEST_IMPORT');const registrationOn=isFlagOn('SELF_REGISTRATION');
 // B-024: the scanner's entry, behind its flag (the scanner page itself refuses an invitation that has not opted in).
 const guestPassOn=isFlagOn('GUEST_PASS');
 const [registrationLink]=registrationOn?await db.select({token:guestRegistrationLinks.token}).from(guestRegistrationLinks).where(eq(guestRegistrationLinks.invitationId,id)).limit(1):[];
 const pendingRegistrations=registrationOn?await db.select().from(guestRegistrations).where(eq(guestRegistrations.invitationId,id)).orderBy(asc(guestRegistrations.createdAt)):[];
 const rsvp=rsvpCounts(rows);
 // B-018: each guest's WhatsApp action carries the host's message and that guest's personal link (lib/invitation/whatsapp.ts).
 const origin=await getPublicOrigin();
 // E-036 / D-036: answers summarised from the loaded list with the export's readers; every stored question, and the events the export lists.
 const {config}=normalizeStoredConfig(inv.config??{});const questions=config.registrationForm?.customQuestions??[];const answerEvents=exportedEvents(config,rows);
 // D-037: invite-only events count only their invited guests; each guest's per-event answers and controls cover the events their page shows.
 const inviteOnlyOn=isFlagOn('INVITE_ONLY_EVENTS');const maybeOn=isFlagOn('RSVP_MAYBE');const listed=perEventRsvpEvents({perEvent:config.rsvp?.perEvent,events:config.events},isFlagOn('RSVP_PER_EVENT'));
 const invitees=new Map(inviteeCounts(config.events,rows).map(x=>[x.id,x.invited]));const inviteOnly=inviteOnlyOn?inviteOnlyEvents(config.events).map(e=>({id:e.id,title:e.title,invited:invitees.get(e.id)??0})):[];
 const categories=[...new Set(rows.flatMap(r=>r.category?.trim()?[r.category.trim()]:[]))].sort((a,b)=>a.localeCompare(b,'id'));
 const questionSummary=questionSummaries(rows,questions);const eventSummary=eventRsvpSummary(rows,answerEvents,inviteOnlyOn);
 const metrics=[['Total tamu',rows.length],['Hadir',rsvp.CONFIRMED],['Mungkin',rsvp.MAYBE],['Check-in',rows.filter(x=>x.checkedInAt).length],['Undangan dibuka',rows.reduce((n,x)=>n+x.openedCount,0)]];
 return <section className="min-h-full bg-slate-50 p-4 lg:p-8"><div className="mx-auto max-w-7xl space-y-6"><header><Link href={owner?`/dashboard/invitations/${id}/manage`:'/dashboard'} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><ChevronLeft className="h-4 w-4"/>{owner?'Control center':'Dasbor'}</Link><p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">/{inv.slug}</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Tamu, RSVP & Check-in</h1><p className="mt-2 text-sm text-slate-500">Operasional tamu khusus untuk event ini—tidak tercampur dengan undangan lain.</p><div className="mt-3 flex flex-wrap gap-2"><Link href={`/dashboard/invitations/${id}/insights`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold text-slate-700"><BarChart3 className="h-4 w-4 text-brand-600"/>Analitik & tindak lanjut</Link>{importOn&&<Link href={`/dashboard/invitations/${id}/guests/import`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold text-slate-700"><FileUp className="h-4 w-4 text-brand-600"/>Impor tamu</Link>}{/* B-024: a full page load, so the scanner's own Permissions-Policy (camera) applies; next/link would keep this page's. */}{guestPassOn&&<a href={`/dashboard/invitations/${id}/checkin`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold text-slate-700"><ScanLine className="h-4 w-4 text-brand-600"/>Meja check-in (QR)</a>}</div></header>
 {q.added&&<p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Tamu berhasil ditambahkan.</p>}{q.error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rosterErrorMessage(q.error)}</p>}<RosterBanners q={q} invitationId={id} undo={undoGuestImport}/>{q.invites!==undefined&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Undangan acara khusus diperbarui{/^\d+$/.test(q.invites)&&q.invites!=='1'?` (${q.invites} tamu)`:''}.</p>}
 <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{metrics.map(([l,v])=><div key={l} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{l}</p><p className="mt-2 text-2xl font-bold">{v}</p></div>)}</div>
 <AnswerOverview questions={questionSummary} events={eventSummary}/>
 <InviteOnlyPanel invitationId={id} events={inviteOnly} categories={categories}/>
 {registrationOn&&<RegistrationPanel invitationId={id} url={registrationLink?`${origin}/daftar/${registrationLink.token}`:null} pending={pendingRegistrations} linkAction={registrationLinkAction} decisionAction={registrationDecisionAction}/>}
 <div className="grid gap-5 lg:grid-cols-[320px_1fr]"><form action={addScopedGuest} className="h-fit rounded-xl border bg-white p-5"><input type="hidden" name="invitationId" value={id}/><h2 className="flex items-center gap-2 font-bold"><UserPlus className="h-5 w-5 text-brand-600"/>Tambah tamu</h2><div className="mt-4 space-y-3"><Field name="name" label="Nama" required/><Field name="phone" label="WhatsApp"/><Field name="category" label="Kategori / tag"/><Field name="guestCount" label="Jumlah tamu" type="number" value="1"/><AddGuestInvites events={inviteOnly}/></div><button className="mt-4 min-h-11 w-full rounded-lg bg-brand-600 px-4 text-sm font-bold text-white">Simpan tamu</button></form>
 <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><h2 className="font-bold">Daftar operasional</h2><p className="mt-1 text-sm text-slate-500">Ubah RSVP, tandai pengiriman, dan check-in manual.</p></div>{rows.length?<div className="divide-y">{rows.map(g=><article key={g.id} className="p-4 sm:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><h3 className="font-bold text-slate-900">{g.name}</h3><p className="mt-1 text-xs text-slate-500">{g.phone||'Tanpa nomor'} · {g.category||'Tanpa tag'} · {g.guestCount} orang</p></div><span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{g.rsvpStatus}</span><div className="flex flex-wrap gap-2"><Op id={id} guest={g.id} value="CONFIRMED" label="Hadir"/><Op id={id} guest={g.id} value="DECLINED" label="Tidak hadir"/><Op id={id} guest={g.id} value="MAYBE" label="Mungkin"/><Op id={id} guest={g.id} value={g.checkedInAt?'undo-checkin':'checkin'} label={g.checkedInAt?'Batalkan check-in':'Check-in'}/><Op id={id} guest={g.id} value="sent" label={g.sentAt?'Kirim ulang':'Tandai dikirim'}/><GuestWhatsAppAction action={guestWhatsApp({phone:g.phone,name:g.name,link:`${origin}${guestPath(inv.slug,guestLinkSegment(g))}`,template:config.whatsappTemplate})} en={false} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-700"><MessageCircle className="h-3.5 w-3.5"/>WhatsApp</GuestWhatsAppAction></div></div>{g.checkedInAt&&<p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Check-in {g.checkedInAt.toLocaleString('id-ID')}</p>}<GuestEventAnswers invitationId={id} guestId={g.id} events={visibleEvents(listed,guestAudience(g),inviteOnlyOn)} answers={readEventAnswers(g.rsvpEventAnswers)} maybe={maybeOn}/><GuestInvites invitationId={id} guestId={g.id} guestName={g.name} events={inviteOnly} invited={readInvitedEventIds(g.invitedEventIds)}/><GuestAnswers lines={guestAnswerLines(g,questions,answerEvents.filter(e=>eventVisibleTo(e,guestAudience(g),inviteOnlyOn)))}/></article>)}</div>:<div className="p-12 text-center text-sm text-slate-500"><ScanLine className="mx-auto mb-3 h-7 w-7"/>Belum ada tamu.</div>}</div></div></div></section>}
function Field({name,label,type='text',required,value}:{name:string;label:string;type?:string;required?:boolean;value?:string}){return <label className="block"><span className="text-xs font-semibold text-slate-700">{label}</span><input name={name} type={type} required={required} defaultValue={value} min={type==='number'?1:undefined} max={type==='number'?50:undefined} className="mt-1.5 h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-brand-600"/></label>}
function Op({id,guest,value,label}:{id:number;guest:number;value:string;label:string}){return <form action={updateGuestOperation}><input type="hidden" name="invitationId" value={id}/><input type="hidden" name="guestId" value={guest}/><input type="hidden" name="operation" value={value}/><button className="min-h-10 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">{label}</button></form>}
