import { readEventAnswers, type AskedEvent } from './rsvp-events';
import { answerCell, questionApplies, readStoredAnswers, type CustomQuestion } from './rsvp-questions';
import { RSVP_ANSWER_TEXT } from './rsvp-rules';

/**
 * E-036: the host's view of the answers to their questions, computed in application code from the guest list the page
 * already loads (D-034), by the same readers as the guest page and the export. Nothing is inferred: a guest without a
 * stored answer is never counted as choosing anything, and an unanswered question is never a "no".
 */

export type OptionCount = { option: string; count: number; /** Stored but no longer offered (the host edited the options). */ retired: boolean };

export type QuestionSummary = {
  id: string;
  label: string;
  type: CustomQuestion['type'];
  /** Guests with a stored answer. */
  answered: number;
  /** Guests who answered "hadir" or "mungkin", to whom the question applied, and who left it empty. */
  unanswered: number;
  /** D-035: the condition names a deleted question, so guests are not asked; answers stored earlier still count. */
  orphaned: boolean;
  /** Choice questions: every offered option (zero included) in the host's order, then stored values no longer offered. */
  options: OptionCount[];
  numbers?: { total: number; min: number; max: number };
};

type AnswerRow = { rsvpStatus: string; rsvpAnswers: unknown };

/** One summary per stored question, in the host's order, whatever the form switch says (answers collected stay visible). */
export function questionSummaries(rows: readonly AnswerRow[], questions: readonly CustomQuestion[]): QuestionSummary[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const guests = rows.map((row) => ({ status: row.rsvpStatus, answers: readStoredAnswers(row.rsvpAnswers) }));
  return questions.map((question) => {
    const orphaned = Boolean(question.conditional && !byId.has(question.conditional.questionId));
    const counts = new Map<string, number>((question.options ?? []).map((option) => [option, 0]));
    const numbers: number[] = [];
    let answered = 0;
    let unanswered = 0;
    for (const { status, answers } of guests) {
      const value = answers[question.id];
      if (value === undefined) {
        if (!orphaned && (status === 'CONFIRMED' || status === 'MAYBE') && questionApplies(question, answers, byId)) unanswered += 1;
        continue;
      }
      answered += 1;
      for (const part of Array.isArray(value) ? value : [value]) {
        if (typeof part === 'number') numbers.push(part);
        else if (question.options) counts.set(part, (counts.get(part) ?? 0) + 1);
      }
    }
    const offered = new Set(question.options ?? []);
    return {
      id: question.id,
      label: question.label,
      type: question.type,
      answered,
      unanswered,
      orphaned,
      options: [...counts].map(([option, count]) => ({ option, count, retired: !offered.has(option) })),
      numbers: numbers.length ? { total: numbers.reduce((sum, n) => sum + n, 0), min: Math.min(...numbers), max: Math.max(...numbers) } : undefined,
    };
  });
}

export type AnswerLine = { key: string; label: string; value: string };

/**
 * One guest's answers as readable lines for the operational list: per-event answers first (in the invitation's event
 * order), then each stored question answer in the host's order, as the export writes it. Only stored answers appear.
 */
export function guestAnswerLines(
  row: { rsvpAnswers: unknown; rsvpEventAnswers: unknown },
  questions: readonly CustomQuestion[],
  events: readonly AskedEvent[] = [],
): AnswerLine[] {
  const eventAnswers = readEventAnswers(row.rsvpEventAnswers);
  const answers = readStoredAnswers(row.rsvpAnswers);
  return [
    ...events.flatMap((event) => {
      const answer = eventAnswers[event.id];
      if (!answer) return [];
      const people = answer.status === 'CONFIRMED' && answer.attending !== null ? ` (${answer.attending} orang)` : '';
      return [{ key: `event:${event.id}`, label: event.title, value: `${RSVP_ANSWER_TEXT[answer.status]}${people}` }];
    }),
    ...questions.flatMap((question) =>
      answers[question.id] === undefined ? [] : [{ key: `question:${question.id}`, label: question.label, value: answerCell(answers[question.id]) }],
    ),
  ];
}
