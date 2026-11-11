import { inviteField } from '@/lib/invitation/event-eligibility';
import type { EventAnswer } from '@/lib/invitation/rsvp-events';
import { RSVP_ANSWER_TEXT } from '@/lib/invitation/rsvp-rules';
import { setCategoryInvitation, setGuestInvitedEvents, updateGuestOperation } from './actions';

/**
 * D-037: invite-only events on the host's guest page. Event titles, categories and guest names are host text and may be
 * long, hostile or right-to-left, so they wrap anywhere and resolve their own direction.
 */

const HOST_TEXT = '[overflow-wrap:anywhere]';
type InviteOnlyEvent = { id: string; title: string; invited: number };

/** Invite-only events with how many guests are invited, and inviting a whole category at once. */
export function InviteOnlyPanel({ invitationId, events, categories }: { invitationId: number; events: InviteOnlyEvent[]; categories: string[] }) {
  if (!events.length) return null;
  return (
    <section aria-labelledby="invite-only" className="rounded-xl border bg-white p-5">
      <h2 id="invite-only" className="font-bold">Acara khusus tamu tertentu</h2>
      <p className="mt-1 text-sm text-slate-500">Hanya tamu yang diundang ke acara ini yang melihatnya di undangan. Acara lain tetap terlihat oleh semua tamu.</p>
      <ul className="mt-4 divide-y rounded-lg border">
        {events.map((event) => (
          <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
            <span dir="auto" className={`font-semibold text-slate-900 ${HOST_TEXT}`}>{event.title}</span>
            <span className="tabular-nums text-slate-600">{event.invited} tamu diundang</span>
          </li>
        ))}
      </ul>
      <form action={setCategoryInvitation} className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <input type="hidden" name="invitationId" value={invitationId} />
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Kategori tamu</span>
          <select name="category" className="h-10 rounded-lg border bg-white px-3 text-sm">
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
            <option value="">Tanpa kategori</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-700">Acara</span>
          <select name="eventId" className="h-10 rounded-lg border bg-white px-3 text-sm">
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button name="mode" value="add" className="min-h-10 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Undang kategori</button>
          <button name="mode" value="remove" className="min-h-10 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Batalkan undangan</button>
        </div>
      </form>
    </section>
  );
}

/** Checkboxes for the invite-only events, inside the add-guest form. */
export function AddGuestInvites({ events }: { events: InviteOnlyEvent[] }) {
  if (!events.length) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-semibold text-slate-700">Undang juga ke acara khusus</legend>
      {events.map((event) => (
        <label key={event.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={inviteField(event.id)} className="mt-0.5 h-4 w-4 shrink-0" />
          <span dir="auto" className={HOST_TEXT}>{event.title}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** One guest's invitations to invite-only events: what is set, and a folded form to change it. */
export function GuestInvites({ invitationId, guestId, guestName, events, invited }: {
  invitationId: number; guestId: number; guestName: string; events: InviteOnlyEvent[]; invited: ReadonlySet<string>;
}) {
  if (!events.length) return null;
  const names = events.filter((event) => invited.has(event.id)).map((event) => event.title);
  return (
    <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
        Acara khusus: <span dir="auto" className={`font-normal ${HOST_TEXT}`}>{names.length ? names.join(', ') : 'tidak diundang'}</span>
      </summary>
      <form action={setGuestInvitedEvents} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="guestId" value={guestId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Acara khusus untuk {guestName}</legend>
          {events.map((event) => (
            <label key={event.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={inviteField(event.id)} defaultChecked={invited.has(event.id)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span dir="auto" className={HOST_TEXT}>{event.title}</span>
            </label>
          ))}
        </fieldset>
        <button className="min-h-10 w-fit rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Simpan undangan acara</button>
      </form>
    </details>
  );
}

const EVENT_CHOICES = [
  ['CONFIRMED', 'Hadir'],
  ['DECLINED', 'Tidak'],
  ['MAYBE', 'Mungkin'],
] as const;

/** Per-event answers the host can set for one guest (per-event RSVP with two or more events asked of this guest). */
export function GuestEventAnswers({ invitationId, guestId, events, answers, maybe }: {
  invitationId: number; guestId: number; events: Array<{ id: string; title: string }>; answers: Record<string, EventAnswer>; maybe: boolean;
}) {
  if (events.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-col divide-y rounded-lg border border-slate-200">
      {events.map((event) => {
        const answer = answers[event.id];
        return (
          <li key={event.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-sm">
              <span dir="auto" className={`font-semibold text-slate-900 ${HOST_TEXT}`}>{event.title}</span>
              <span className="text-slate-500"> · {answer ? RSVP_ANSWER_TEXT[answer.status] : 'belum menjawab'}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {EVENT_CHOICES.filter(([value]) => maybe || value !== 'MAYBE').map(([value, label]) => (
                <form key={value} action={updateGuestOperation}>
                  <input type="hidden" name="invitationId" value={invitationId} />
                  <input type="hidden" name="guestId" value={guestId} />
                  <input type="hidden" name="operation" value={`event:${event.id}:${value}`} />
                  <button aria-pressed={answer?.status === value} aria-label={`${label}: ${event.title}`} className="min-h-10 rounded-lg border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 aria-pressed:border-brand-600 aria-pressed:bg-brand-50 aria-pressed:text-brand-700">
                    {label}
                  </button>
                </form>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
