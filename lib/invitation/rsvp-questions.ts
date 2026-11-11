import { z } from 'zod';
import type { customQuestionSchema, DetailConfig } from './detail-config';

/**
 * B-027 slice 2b (D-034): the host's custom questions in the guest's RSVP form and the answers stored on the guest row
 * (`guests.rsvp_answers`). One rule set for the form, the action and the export, so the page never asks for an answer
 * the action would refuse and the export never shows one the action would not have stored.
 */

export type CustomQuestion = z.infer<typeof customQuestionSchema>;
export type AnswerValue = string | string[] | number;
export type RsvpAnswers = Record<string, AnswerValue>;
export type AnswersResult = { ok: true; answers: RsvpAnswers | null } | { ok: false; questionId: string };

/** Limits the form sets as `maxLength` / `max` and the action enforces. Choices are bounded by the schema's options. */
export const ANSWER_LIMITS = { text: 500, textarea: 2000, numberMax: 100_000 } as const;

const MULTI_TYPES: ReadonlySet<CustomQuestion['type']> = new Set(['multiselect', 'checkbox']);

export const isMultiChoice = (question: CustomQuestion) => MULTI_TYPES.has(question.type);

/** The form field carrying a question's answer; the prefix keeps host ids clear of the form's own fields. */
export const answerField = (id: string) => `q:${id}`;

/** What a guest is asked: the host switched the registration form on and wrote at least one question. */
export function rsvpQuestionsOf(form: Pick<NonNullable<DetailConfig['registrationForm']>, 'customQuestions'> & { enabled?: boolean }): CustomQuestion[] {
  return form.enabled ? (form.customQuestions ?? []) : [];
}

const storedAnswersSchema = z.record(
  z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  z.union([
    z.string().max(ANSWER_LIMITS.textarea),
    z.array(z.string().max(120)).max(50),
    z.number().refine(Number.isFinite),
  ]),
);

/** Answers as `parseRsvpAnswers` stored them; null or anything malformed (a hand-edited row) reads as no answers. */
export function readStoredAnswers(raw: unknown): RsvpAnswers {
  const parsed = storedAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

type Parsed = { kind: 'empty' } | { kind: 'value'; value: AnswerValue } | { kind: 'invalid' };

function parseOne(question: CustomQuestion, raw: readonly string[]): Parsed {
  // S18-Q1: a form submits a textarea's line breaks as CRLF, but its `maxlength` counts each as one character; reading
  // them as LF keeps the limit the guest saw and stores one line-break form.
  const values = raw.map((value) => value.replace(/\r\n?/g, '\n').trim()).filter(Boolean);
  const options = question.options ?? [];
  if (isMultiChoice(question)) {
    const unique = [...new Set(values)];
    if (!unique.length) return { kind: 'empty' };
    return unique.every((value) => options.includes(value)) ? { kind: 'value', value: unique } : { kind: 'invalid' };
  }
  if (values.length > 1) return { kind: 'invalid' };
  const [value] = values;
  if (value === undefined) return { kind: 'empty' };
  switch (question.type) {
    case 'select':
    case 'radio':
      return options.includes(value) ? { kind: 'value', value } : { kind: 'invalid' };
    case 'number':
      return /^\d{1,6}$/.test(value) && Number(value) <= ANSWER_LIMITS.numberMax ? { kind: 'value', value: Number(value) } : { kind: 'invalid' };
    case 'textarea':
      return value.length <= ANSWER_LIMITS.textarea ? { kind: 'value', value } : { kind: 'invalid' };
    default:
      return value.length <= ANSWER_LIMITS.text ? { kind: 'value', value } : { kind: 'invalid' };
  }
}

function conditionValues(condition: NonNullable<CustomQuestion['conditional']>): string[] {
  return [...(condition.equals !== undefined ? [condition.equals] : []), ...(condition.in ?? [])];
}

/**
 * Whether a question applies to these answers: it has no condition, or the question it depends on applies and its answer
 * matches (any chosen option for a multiple choice). A missing source or a cycle never holds.
 */
export function questionApplies(
  question: CustomQuestion,
  answers: RsvpAnswers,
  byId: ReadonlyMap<string, CustomQuestion>,
  seen: Set<string> = new Set(),
): boolean {
  const condition = question.conditional;
  if (!condition) return true;
  const source = byId.get(condition.questionId);
  if (!source || seen.has(question.id)) return false;
  seen.add(question.id);
  if (!questionApplies(source, answers, byId, seen)) return false;
  const answer = answers[source.id];
  if (answer === undefined) return false;
  const given = Array.isArray(answer) ? answer : [String(answer)];
  const wanted = conditionValues(condition);
  return given.some((value) => wanted.includes(value));
}

/**
 * Whether any answers at all could make this question apply (S18-Q3): its condition chain ends at a question without a
 * condition, with no missing source, no cycle, and, where the source is a choice, at least one wanted value among the
 * source's options. A question that can never apply would only collect answers the action drops.
 */
export function canEverApply(question: CustomQuestion, byId: ReadonlyMap<string, CustomQuestion>): boolean {
  const seen = new Set<string>();
  for (let current: CustomQuestion | undefined = question; current; ) {
    const condition = current.conditional;
    if (!condition) return true;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    const source = byId.get(condition.questionId);
    if (!source) return false;
    if (source.options && !conditionValues(condition).some((value) => source.options?.includes(value))) return false;
    current = source;
  }
  return false;
}

/** The questions a guest is shown: the asked ones that can ever count, in the host's order (S18-Q3). */
export function askableQuestions(questions: readonly CustomQuestion[]): CustomQuestion[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return questions.filter((question) => canEverApply(question, byId));
}

/**
 * The answers to store with this RSVP, or the first question (in the host's order) the guest has to fix. A decline
 * stores none (null clears earlier answers); "required" holds for "hadir" only; the answer to a question whose condition
 * does not hold is dropped, valid or not.
 */
export function parseRsvpAnswers(
  form: { getAll(name: string): FormDataEntryValue[] },
  questions: readonly CustomQuestion[],
  status: string,
): AnswersResult {
  if (status === 'DECLINED') return { ok: true, answers: null };
  const parsed = new Map(
    questions.map((question) => [question.id, parseOne(question, form.getAll(answerField(question.id)).map((value) => (typeof value === 'string' ? value : '')))]),
  );
  const given: RsvpAnswers = {};
  for (const [id, result] of parsed) if (result.kind === 'value') given[id] = result.value;
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers: RsvpAnswers = {};
  for (const question of questions) {
    if (!questionApplies(question, given, byId)) continue;
    const result = parsed.get(question.id) ?? { kind: 'empty' };
    if (result.kind === 'invalid') return { ok: false, questionId: question.id };
    if (result.kind === 'empty') {
      if (question.required && status === 'CONFIRMED') return { ok: false, questionId: question.id };
      continue;
    }
    answers[question.id] = result.value;
  }
  return { ok: true, answers: Object.keys(answers).length ? answers : null };
}

/** `Isi jika jawaban untuk “Pilihan menu” adalah “Vegetarian”.` */
const indonesianCondition = (label: string, values: string[]) => `Isi jika jawaban untuk “${label}” adalah ${values.map((value) => `“${value}”`).join(' atau ')}.`;

/**
 * The condition in words for the form. G-018: the guest page passes its language's sentence (`guest-copy.ts`); this
 * module stays free of the guest dictionary because the host's question editor bundles it.
 */
export function conditionText(
  question: CustomQuestion,
  byId: ReadonlyMap<string, CustomQuestion>,
  sentence: (label: string, values: string[]) => string = indonesianCondition,
): string | undefined {
  const condition = question.conditional;
  const source = condition ? byId.get(condition.questionId) : undefined;
  if (!condition || !source) return undefined;
  return sentence(source.label, conditionValues(condition));
}

/** One export cell: a multiple choice joins with "; ", a number as written. `csvRow` neutralises formulas (B-006). */
export function answerCell(value: AnswerValue | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join('; ') : String(value);
}
