import type { AnswerLine, QuestionSummary } from '@/lib/invitation/answer-summary';
import type { EventRsvpSummary } from '@/lib/invitation/rsvp-events';

/**
 * E-036 / D-036: what guests answered, for the host. Host and guest text (labels, options, typed answers) may be long,
 * hostile or right-to-left, so every such string wraps anywhere and resolves its own direction. Bars are decorative; the
 * counts beside them carry the information.
 */

const HOST_TEXT = '[overflow-wrap:anywhere]';
const TYPE_LABEL: Record<QuestionSummary['type'], string> = {
  text: 'Teks singkat',
  textarea: 'Teks panjang',
  select: 'Pilihan (dropdown)',
  radio: 'Pilihan tunggal',
  multiselect: 'Pilihan ganda',
  checkbox: 'Kotak centang',
  number: 'Angka',
};

function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function EventTable({ events }: { events: EventRsvpSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">Kehadiran per acara</caption>
        <thead className="text-xs text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-4 font-semibold">Acara</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Hadir</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Mungkin</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Tidak hadir</th>
            <th scope="col" className="py-2 font-semibold">Belum menjawab</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((event) => (
            <tr key={event.id}>
              <th scope="row" dir="auto" className={`py-2.5 pr-4 font-semibold text-slate-900 ${HOST_TEXT}`}>
                {event.title}
                {event.inviteOnly && <span className="block text-xs font-normal text-slate-500">Khusus {event.invited} tamu undangan</span>}
              </th>
              <td className="py-2.5 pr-4">
                {event.counts.CONFIRMED} <span className="text-xs text-slate-500">({event.seats} orang)</span>
              </td>
              <td className="py-2.5 pr-4">{event.counts.MAYBE}</td>
              <td className="py-2.5 pr-4">{event.counts.DECLINED}</td>
              <td className="py-2.5">{event.counts.PENDING}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionRow({ question }: { question: QuestionSummary }) {
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-1">
        <h4 dir="auto" className={`text-sm font-semibold text-slate-900 ${HOST_TEXT}`}>
          {question.label}
        </h4>
        <p className="text-xs text-slate-500">
          {TYPE_LABEL[question.type]} · Dijawab {question.answered} · Belum dijawab {question.unanswered}
        </p>
        {question.orphaned && (
          <p className="text-xs text-amber-700">
            Tidak ditanyakan ke tamu: syaratnya merujuk pertanyaan yang sudah dihapus. Jawaban yang sudah masuk tetap ditampilkan.
          </p>
        )}
      </div>
      {question.options.length > 0 && (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => (
            <li key={option.option} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span dir="auto" className={HOST_TEXT}>
                  {option.option}
                  {option.retired && <span className="text-xs text-slate-500"> (pilihan lama)</span>}
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">
                  {option.count} ({share(option.count, question.answered)}%)
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${share(option.count, question.answered)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {question.numbers && (
        <p className="text-sm text-slate-700">
          Total {question.numbers.total} · terkecil {question.numbers.min} · terbesar {question.numbers.max}
        </p>
      )}
      {(question.type === 'text' || question.type === 'textarea') && question.answered > 0 && (
        <p className="text-xs text-slate-500">Jawaban teks tampil per tamu di daftar operasional.</p>
      )}
    </li>
  );
}

/** The summary card: per-event attendance (when collected), then one row per question. Nothing when neither exists. */
export function AnswerOverview({ questions, events }: { questions: QuestionSummary[]; events: EventRsvpSummary[] }) {
  if (!questions.length && !events.length) return null;
  return (
    <section aria-labelledby="answer-overview" className="rounded-xl border bg-white p-5">
      <h2 id="answer-overview" className="font-bold">Ringkasan jawaban</h2>
      <p className="mt-1 text-sm text-slate-500">Dihitung dari jawaban yang tersimpan. Tamu yang belum menjawab tidak dihitung sebagai jawaban apa pun.</p>
      {events.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Kehadiran per acara</h3>
          <EventTable events={events} />
        </div>
      )}
      {questions.length > 0 && (
        <div className="mt-5 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-900">Pertanyaan tambahan</h3>
          <ul className="divide-y">
            {questions.map((question) => (
              <QuestionRow key={question.id} question={question} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One guest's stored answers in the operational list, folded so a long list stays scannable. */
export function GuestAnswers({ lines }: { lines: AnswerLine[] }) {
  if (!lines.length) return null;
  return (
    <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">Jawaban tamu ({lines.length})</summary>
      <dl className="mt-2 flex flex-col gap-2 text-sm">
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-0.5">
            <dt dir="auto" className={`text-xs text-slate-500 ${HOST_TEXT}`}>
              {line.label}
            </dt>
            <dd dir="auto" className={`whitespace-pre-line text-slate-900 ${HOST_TEXT}`}>
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
