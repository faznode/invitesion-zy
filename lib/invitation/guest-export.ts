import { csvCell, csvRow } from '@/lib/csv';
import type { Guest } from '@/lib/db/schema';
import { readInvitedEventIds } from '@/lib/invitation/event-eligibility';
import { eventAnswerCells, readEventAnswers } from '@/lib/invitation/rsvp-events';
import { answerCell, readStoredAnswers, type CustomQuestion } from '@/lib/invitation/rsvp-questions';

export const GUEST_EXPORT_HEADER = ['name', 'phone', 'category', 'guest_count', 'rsvp_status', 'sent_at', 'opened_count', 'checked_in_at', 'attending_count'];

/**
 * The owner's guest list as CSV. Cells go through `csvRow`, which neutralises values a spreadsheet would run as formulas
 * (B-006): guest names come from host imports and must open as text. `guest_count` is the host's allowance;
 * `attending_count` (last column, B-007) is what the guest answered: 0 for a decline, empty while unknown, including a
 * "maybe" (B-027), which is exported under its own status and never as people attending.
 *
 * B-027 (D-034): one more column per custom question, in the host's order, headed by its label (host text, so it goes
 * through `csvCell` too). Pass the stored questions whatever the registration switch or flag says: a host who closes the
 * form after the event still exports what was collected. Answers to deleted questions stay stored but are not listed.
 *
 * B-027 slice 2c (D-036): then two columns per exported event (`exportedEvents`), "<title> - rsvp_status" and
 * "<title> - attending_count", read by event id, so a reorder or rename never moves an answer to another event's column.
 *
 * D-037: then one "<title> - invited" column per invite-only event (`yes` / `no`), only while some listed event is
 * invite-only, so an export without one keeps its shape. A guest's status cell for an event they are not invited to
 * shows what is stored (usually nothing), and the invited column says why.
 */
export function guestExportCsv(
  rows: readonly Guest[],
  questions: readonly CustomQuestion[] = [],
  events: readonly { id: string; title: string }[] = [],
  inviteOnly: readonly { id: string; title: string }[] = [],
): string {
  const header = [
    GUEST_EXPORT_HEADER.join(','),
    ...questions.map((question) => csvCell(question.label)),
    ...events.flatMap((event) => [csvCell(`${event.title} - rsvp_status`), csvCell(`${event.title} - attending_count`)]),
    ...inviteOnly.map((event) => csvCell(`${event.title} - invited`)),
  ].join(',');
  const body = rows.map((g) => {
    const answers = readStoredAnswers(g.rsvpAnswers);
    const eventAnswers = readEventAnswers(g.rsvpEventAnswers);
    const invited = readInvitedEventIds(g.invitedEventIds);
    return csvRow([
      g.name, g.phone, g.category, g.guestCount, g.rsvpStatus, g.sentAt?.toISOString(), g.openedCount, g.checkedInAt?.toISOString(), g.attendingCount,
      ...questions.map((question) => answerCell(answers[question.id])),
      ...events.flatMap((event) => eventAnswerCells(eventAnswers[event.id])),
      ...inviteOnly.map((event) => (invited.has(event.id) ? 'yes' : 'no')),
    ]);
  });
  return [header, ...body].join('\n');
}
