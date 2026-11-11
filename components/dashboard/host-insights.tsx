import Link from 'next/link';
import { ChevronLeft, Download, MessageCircle, Send } from 'lucide-react';
import { GuestWhatsAppAction } from '@/components/dashboard/guest-whatsapp-action';
import { INDONESIAN_ZONES, type IndonesianZone } from '@/lib/invitation/event-time';
import type { AnalyticsTotals, DailyOpens, FollowUpItem, FollowUpKind, GroupRow } from '@/lib/invitation/host-analytics';
import type { EventRsvpSummary } from '@/lib/invitation/rsvp-events';

export type HostInsightsProps = {
  invitationId: number;
  slug: string;
  zone: IndonesianZone;
  totals: AnalyticsTotals;
  groups: readonly GroupRow[];
  events: readonly EventRsvpSummary[];
  daily: readonly DailyOpens[];
  views: { opens: number; guestOpens: number; anonymousOpens: number };
  lists: Record<FollowUpKind, readonly FollowUpItem[]>;
  digest: { text: string; href: string };
};

const SHORT_DAY = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const moments = new Map<string, Intl.DateTimeFormat>();

function shortDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return SHORT_DAY.format(new Date(Date.UTC(year, month - 1, date)));
}

function moment(at: Date, zone: IndonesianZone): string {
  let format = moments.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('id-ID', { timeZone: zone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    moments.set(zone, format);
  }
  return `${format.format(at)} ${INDONESIAN_ZONES[zone]}`;
}

const LIST_COPY: Record<FollowUpKind, { title: string; description: string; empty: string; file: string }> = {
  unopened: {
    title: 'Belum membuka',
    description: 'Belum menjawab dan tautan personalnya belum pernah dibuka.',
    empty: 'Semua tamu yang belum menjawab sudah membuka undangannya.',
    file: 'unopened',
  },
  unanswered: {
    title: 'Belum menjawab',
    description: 'Sudah membuka undangan, tetapi belum mengisi RSVP.',
    empty: 'Tidak ada tamu yang membuka undangan tanpa menjawab.',
    file: 'unanswered',
  },
};

/**
 * B-034: the host's analytics and follow-up page for one invitation (I-06 lists with B-018 reminders, I-29 digest).
 * Pure: the page loads the data owner-scoped and builds the links; this only renders.
 */
export function HostInsights(props: HostInsightsProps) {
  const { invitationId, slug, zone, totals, groups, events, daily, views, lists, digest } = props;
  const zoneLabel = INDONESIAN_ZONES[zone];
  const peakOpens = Math.max(1, ...daily.map((day) => day.opens));
  const metrics: [string, string, string?][] = [
    ['Tamu', String(totals.guests)],
    ['Sudah membuka', String(totals.opened)],
    ['Sudah menjawab', String(totals.answered)],
    ['Hadir', `${totals.rsvp.seats} orang`, `${totals.rsvp.counts.CONFIRMED} tamu${totals.rsvp.seatsUnknown ? `, ${totals.rsvp.seatsUnknown} tanpa jumlah` : ''}`],
    ['Belum menjawab', String(totals.unanswered), 'sudah membuka'],
    ['Belum membuka', String(totals.unopened)],
  ];
  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <Link href={`/dashboard/invitations/${invitationId}/guests`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Tamu, RSVP & Check-in
          </Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">/{slug}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 text-balance">Analitik & tindak lanjut</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 text-pretty">
            Angka dari daftar tamu dan kunjungan undangan ini saja. Kunjungan berulang dari tautan yang sama dalam 30 menit dihitung sekali; hari dihitung dalam {zoneLabel}.
          </p>
        </header>

        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map(([label, value, note]) => (
            <div key={label} className="rounded-xl border bg-white p-4">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-2 text-2xl font-bold text-slate-950">{value}</dd>
              {note && <dd className="mt-1 text-xs text-slate-500">{note}</dd>}
            </div>
          ))}
        </dl>

        <section aria-labelledby="follow-up" className="space-y-3">
          <h2 id="follow-up" className="text-lg font-bold text-slate-950">Tindak lanjut</h2>
          <p className="text-sm leading-6 text-slate-500">Kirim pengingat lewat WhatsApp dengan pesan undangan Anda dan tautan personal tiap tamu.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {(['unopened', 'unanswered'] as const).map((kind) => (
              <FollowUpList key={kind} kind={kind} items={lists[kind]} invitationId={invitationId} zone={zone} />
            ))}
          </div>
        </section>

        <section aria-labelledby="daily-opens" className="rounded-xl border bg-white p-5">
          <h2 id="daily-opens" className="font-bold text-slate-950">Kunjungan {daily.length} hari terakhir</h2>
          <p className="mt-1 text-sm text-slate-500">
            Total {views.opens} kunjungan: {views.guestOpens} dari tautan personal, {views.anonymousOpens} dari tautan umum.
          </p>
          <ol className="mt-4 grid gap-2">
            {daily.map((day) => (
              <li key={day.day} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-slate-600">{shortDay(day.day)}</span>
                <span className="h-2.5 rounded-full bg-slate-100" aria-hidden="true">
                  <span className="block h-2.5 rounded-full bg-brand-600" style={{ width: `${(day.opens / peakOpens) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-slate-700">
                  {day.opens} kunjungan · {day.guests} tamu
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="by-group" className="overflow-hidden rounded-xl border bg-white">
          <h2 id="by-group" className="border-b p-5 font-bold text-slate-950">Per kelompok tamu</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Jumlah tamu, kunjungan dan jawaban per kelompok</caption>
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="p-3 font-semibold">Kelompok</th>
                  <th scope="col" className="p-3 font-semibold">Tamu</th>
                  <th scope="col" className="p-3 font-semibold">Membuka</th>
                  <th scope="col" className="p-3 font-semibold">Hadir (orang)</th>
                  <th scope="col" className="p-3 font-semibold">Mungkin</th>
                  <th scope="col" className="p-3 font-semibold">Tidak hadir</th>
                  <th scope="col" className="p-3 font-semibold">Belum menjawab</th>
                  <th scope="col" className="p-3 font-semibold">Belum membuka</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {groups.map((row) => (
                  <tr key={row.group ?? ''}>
                    <th scope="row" className="p-3 font-semibold text-slate-900 [overflow-wrap:anywhere]" dir="auto">{row.group ?? 'Tanpa kelompok'}</th>
                    <td className="p-3 tabular-nums">{row.guests}</td>
                    <td className="p-3 tabular-nums">{row.opened}</td>
                    <td className="p-3 tabular-nums">{row.rsvp.counts.CONFIRMED} ({row.rsvp.seats})</td>
                    <td className="p-3 tabular-nums">{row.rsvp.counts.MAYBE}</td>
                    <td className="p-3 tabular-nums">{row.rsvp.counts.DECLINED}</td>
                    <td className="p-3 tabular-nums">{row.unanswered}</td>
                    <td className="p-3 tabular-nums">{row.unopened}</td>
                  </tr>
                ))}
                {!groups.length && (
                  <tr>
                    <td colSpan={8} className="p-5 text-sm text-slate-500">Belum ada tamu.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {events.length > 0 && (
          <section aria-labelledby="by-event" className="overflow-hidden rounded-xl border bg-white">
            <h2 id="by-event" className="border-b p-5 font-bold text-slate-950">Per acara</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">Jawaban per acara</caption>
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="p-3 font-semibold">Acara</th>
                    <th scope="col" className="p-3 font-semibold">Diundang</th>
                    <th scope="col" className="p-3 font-semibold">Hadir (orang)</th>
                    <th scope="col" className="p-3 font-semibold">Mungkin</th>
                    <th scope="col" className="p-3 font-semibold">Tidak hadir</th>
                    <th scope="col" className="p-3 font-semibold">Belum menjawab</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {events.map((event) => (
                    <tr key={event.id}>
                      <th scope="row" className="p-3 font-semibold text-slate-900 [overflow-wrap:anywhere]" dir="auto">{event.title}</th>
                      <td className="p-3 tabular-nums">{event.invited}</td>
                      <td className="p-3 tabular-nums">{event.counts.CONFIRMED} ({event.seats})</td>
                      <td className="p-3 tabular-nums">{event.counts.MAYBE}</td>
                      <td className="p-3 tabular-nums">{event.counts.DECLINED}</td>
                      <td className="p-3 tabular-nums">{event.counts.PENDING}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section aria-labelledby="digest" className="rounded-xl border bg-white p-5">
          <h2 id="digest" className="font-bold text-slate-950">Ringkasan harian untuk WhatsApp</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Teruskan ke keluarga atau panitia. Ringkasan hanya berisi angka, tanpa nama atau nomor tamu.</p>
          <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-800">{digest.text}</pre>
          <a href={digest.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">
            <Send className="h-4 w-4" aria-hidden="true" />
            Bagikan via WhatsApp
          </a>
        </section>
      </div>
    </section>
  );
}

function FollowUpList({ kind, items, invitationId, zone }: { kind: FollowUpKind; items: readonly FollowUpItem[]; invitationId: number; zone: IndonesianZone }) {
  const copy = LIST_COPY[kind];
  const headingId = `follow-up-${kind}`;
  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <h3 id={headingId} className="font-bold text-slate-950">
            {copy.title} <span className="font-normal text-slate-500">({items.length})</span>
          </h3>
          <p className="mt-1 text-sm text-slate-500">{copy.description}</p>
        </div>
        {items.length > 0 && (
          <a href={`/dashboard/invitations/${invitationId}/analytics?list=${copy.file}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold text-slate-700">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Unduh CSV
          </a>
        )}
      </div>
      {items.length ? (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]" dir="auto">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.category ?? 'Tanpa kelompok'} ·{' '}
                  {kind === 'unopened'
                    ? item.sentAt
                      ? `Ditandai dikirim ${moment(item.sentAt, zone)}`
                      : 'Belum ditandai dikirim'
                    : `Terakhir dibuka ${item.openedAt ? moment(item.openedAt, zone) : '—'} · ${item.openedCount}× dibuka`}
                </p>
              </div>
              <GuestWhatsAppAction action={item.whatsApp} en={false} className="inline-flex min-h-10 w-fit items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-700">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Ingatkan
              </GuestWhatsAppAction>
              {'hint' in item.whatsApp && item.whatsApp.hint === 'missing' && <span className="text-xs text-slate-500">Tanpa nomor WhatsApp</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-5 text-sm text-slate-500">{copy.empty}</p>
      )}
    </section>
  );
}
