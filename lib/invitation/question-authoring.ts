import { detailConfigSchema } from './detail-config';
import type { CustomQuestion } from './rsvp-questions';

/**
 * E-031 (s18): the host's question editor as pure rules, so every edit keeps the list valid for the schema and the guest
 * form. A condition may name only an earlier choice question, so cycles cannot be authored and the form reads top-down;
 * deleting, retyping or renaming a source keeps its dependants consistent and says what it changed (`notes`).
 */

export type QuestionType = CustomQuestion['type'];
export type AuthoringResult = { questions: CustomQuestion[]; notes: string[] };
export type QuestionIssue = { index: number; field: 'label' | 'options' | 'conditional' | 'list'; message: string };

export const QUESTION_LIMITS = { questions: 50, label: 200, options: 50, option: 120, conditionValues: 20 } as const;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Teks singkat',
  textarea: 'Teks panjang',
  number: 'Angka',
  select: 'Daftar pilihan (satu jawaban)',
  radio: 'Pilihan tunggal',
  checkbox: 'Kotak centang (boleh lebih dari satu)',
  multiselect: 'Pilihan ganda (boleh lebih dari satu)',
};

/** What a host picks from. `multiselect` renders exactly like `checkbox` on the guest page, so it is listed only for a stored one. */
export const OFFERED_TYPES: readonly QuestionType[] = ['text', 'textarea', 'number', 'select', 'radio', 'checkbox'];

const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set(['select', 'radio', 'checkbox', 'multiselect']);
export const isChoiceType = (type: QuestionType) => CHOICE_TYPES.has(type);

export const questionName = (question: Pick<CustomQuestion, 'label'>) => `“${question.label.trim() || 'Pertanyaan tanpa judul'}”`;

/** Every value a condition accepts, `equals` and `in` together. */
export function conditionValuesOf(question: CustomQuestion): string[] {
  const condition = question.conditional;
  if (!condition) return [];
  return [...new Set([...(condition.equals !== undefined ? [condition.equals] : []), ...(condition.in ?? [])])];
}

const withoutCondition = ({ conditional: _removed, ...rest }: CustomQuestion): CustomQuestion => rest;

/** A new id the schema accepts (`[a-zA-Z0-9_-]`, ≤ 80 characters) that no question in the list has. */
export function newQuestionId(existing: readonly CustomQuestion[], now = Date.now()): string {
  const ids = new Set(existing.map((question) => question.id));
  for (let n = 0; ; n += 1) {
    const id = `q-${now.toString(36)}${n ? `-${n}` : ''}`;
    if (!ids.has(id)) return id;
  }
}

export function addQuestion(questions: readonly CustomQuestion[], now?: number): AuthoringResult {
  if (questions.length >= QUESTION_LIMITS.questions) return { questions: [...questions], notes: [`Maksimal ${QUESTION_LIMITS.questions} pertanyaan.`] };
  return { questions: [...questions, { id: newQuestionId(questions, now), label: '', type: 'text', required: false }], notes: [] };
}

export function updateQuestion(questions: readonly CustomQuestion[], index: number, patch: Partial<Pick<CustomQuestion, 'label' | 'required'>>): AuthoringResult {
  return { questions: questions.map((question, i) => (i === index ? { ...question, ...patch } : question)), notes: [] };
}

/** Drops the conditions that `stale` matches and names each question it changed. */
function dropConditions(questions: CustomQuestion[], stale: (question: CustomQuestion) => boolean, reason: string): AuthoringResult {
  const notes: string[] = [];
  const next = questions.map((question) => {
    if (!question.conditional || !stale(question)) return question;
    notes.push(`Syarat pada ${questionName(question)} dihapus karena ${reason}; pertanyaan itu kini ditanyakan kepada semua tamu.`);
    return withoutCondition(question);
  });
  return { questions: next, notes };
}

export function removeQuestion(questions: readonly CustomQuestion[], index: number): AuthoringResult {
  const removed = questions[index];
  if (!removed) return { questions: [...questions], notes: [] };
  const rest = questions.filter((_, i) => i !== index);
  return dropConditions(rest, (question) => question.conditional?.questionId === removed.id, `pertanyaan sumbernya (${questionName(removed)}) dihapus`);
}

/** True when every condition names a question above it. */
export function isOrdered(questions: readonly CustomQuestion[]): boolean {
  const before = new Set<string>();
  for (const question of questions) {
    if (question.conditional && !before.has(question.conditional.questionId)) return false;
    before.add(question.id);
  }
  return true;
}

export function canMove(questions: readonly CustomQuestion[], index: number, delta: -1 | 1): boolean {
  const target = index + delta;
  if (target < 0 || target >= questions.length) return false;
  const next = [...questions];
  [next[index], next[target]] = [next[target], next[index]];
  return isOrdered(next);
}

export function moveQuestion(questions: readonly CustomQuestion[], index: number, delta: -1 | 1): AuthoringResult {
  if (!canMove(questions, index, delta)) {
    return { questions: [...questions], notes: ['Pertanyaan bersyarat harus tetap berada di bawah pertanyaan yang menjadi syaratnya.'] };
  }
  const next = [...questions];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return { questions: next, notes: [] };
}

export function setType(questions: readonly CustomQuestion[], index: number, type: QuestionType): AuthoringResult {
  const current = questions[index];
  if (!current || current.type === type) return { questions: [...questions], notes: [] };
  const changed: CustomQuestion = isChoiceType(type)
    ? { ...current, type, options: current.options?.length ? current.options : [''] }
    : (({ options: _options, ...rest }) => ({ ...rest, type }))(current);
  const next = questions.map((question, i) => (i === index ? changed : question));
  if (isChoiceType(type)) return { questions: next, notes: [] };
  return dropConditions(next, (question) => question.conditional?.questionId === current.id, `${questionName(current)} tidak lagi berupa pilihan`);
}

export function addOption(questions: readonly CustomQuestion[], index: number): AuthoringResult {
  const current = questions[index];
  if (!current || !isChoiceType(current.type)) return { questions: [...questions], notes: [] };
  if ((current.options ?? []).length >= QUESTION_LIMITS.options) return { questions: [...questions], notes: [`Maksimal ${QUESTION_LIMITS.options} pilihan.`] };
  return { questions: questions.map((question, i) => (i === index ? { ...question, options: [...(question.options ?? []), ''] } : question)), notes: [] };
}

/** Renaming an option renames it inside every condition that names it, so the condition keeps meaning the same choice. */
export function renameOption(questions: readonly CustomQuestion[], index: number, optionIndex: number, text: string): AuthoringResult {
  const current = questions[index];
  const previous = current?.options?.[optionIndex];
  if (!current || previous === undefined) return { questions: [...questions], notes: [] };
  const rename = (value: string) => (previous !== '' && value === previous ? text : value);
  const next = questions.map((question, i) => {
    if (i === index) return { ...question, options: (question.options ?? []).map((option, o) => (o === optionIndex ? text : option)) };
    if (question.conditional?.questionId !== current.id) return question;
    return { ...question, conditional: { questionId: current.id, in: conditionValuesOf(question).map(rename) } };
  });
  return { questions: next, notes: [] };
}

export function removeOption(questions: readonly CustomQuestion[], index: number, optionIndex: number): AuthoringResult {
  const current = questions[index];
  const removed = current?.options?.[optionIndex];
  if (!current || removed === undefined) return { questions: [...questions], notes: [] };
  const next = questions.map((question, i) => {
    if (i === index) return { ...question, options: (question.options ?? []).filter((_, o) => o !== optionIndex) };
    if (question.conditional?.questionId !== current.id) return question;
    return { ...question, conditional: { questionId: current.id, in: conditionValuesOf(question).filter((value) => value !== removed) } };
  });
  return dropConditions(next, (question) => question.conditional?.questionId === current.id && conditionValuesOf(question).length === 0, `pilihan “${removed}” yang menjadi syaratnya dihapus`);
}

/** Questions a condition on `index` may name: earlier choice questions with at least one written option. */
export function sourceCandidates(questions: readonly CustomQuestion[], index: number): CustomQuestion[] {
  return questions.slice(0, index).filter((question) => isChoiceType(question.type) && (question.options ?? []).some((option) => option.trim()));
}

/** `questionId` null removes the condition; values are kept only where the source offers them. */
export function setCondition(questions: readonly CustomQuestion[], index: number, questionId: string | null, values: readonly string[] = []): AuthoringResult {
  const current = questions[index];
  if (!current) return { questions: [...questions], notes: [] };
  if (questionId === null) return { questions: questions.map((question, i) => (i === index ? withoutCondition(question) : question)), notes: [] };
  const source = sourceCandidates(questions, index).find((question) => question.id === questionId);
  if (!source) return { questions: [...questions], notes: ['Syarat hanya bisa merujuk pertanyaan pilihan yang berada di atasnya.'] };
  const kept = [...new Set(values)].filter((value) => source.options?.includes(value));
  return { questions: questions.map((question, i) => (i === index ? { ...question, conditional: { questionId, in: kept } } : question)), notes: [] };
}

/** What the host still has to fix, per question and field, in the host's words. */
export function validateQuestions(questions: readonly CustomQuestion[]): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  if (questions.length > QUESTION_LIMITS.questions) issues.push({ index: -1, field: 'list', message: `Maksimal ${QUESTION_LIMITS.questions} pertanyaan.` });
  questions.forEach((question, index) => {
    const label = question.label.trim();
    if (!label) issues.push({ index, field: 'label', message: 'Tulis pertanyaannya.' });
    else if (label.length > QUESTION_LIMITS.label) issues.push({ index, field: 'label', message: `Maksimal ${QUESTION_LIMITS.label} karakter.` });
    if (isChoiceType(question.type)) {
      const options = (question.options ?? []).map((option) => option.trim());
      if (!options.length) issues.push({ index, field: 'options', message: 'Tambahkan minimal satu pilihan.' });
      else if (options.some((option) => !option)) issues.push({ index, field: 'options', message: 'Pilihan tidak boleh kosong.' });
      else if (new Set(options).size !== options.length) issues.push({ index, field: 'options', message: 'Dua pilihan tidak boleh sama.' });
      else if (options.some((option) => option.length > QUESTION_LIMITS.option)) issues.push({ index, field: 'options', message: `Setiap pilihan maksimal ${QUESTION_LIMITS.option} karakter.` });
      else if (options.length > QUESTION_LIMITS.options) issues.push({ index, field: 'options', message: `Maksimal ${QUESTION_LIMITS.options} pilihan.` });
    }
    if (question.conditional) {
      const source = sourceCandidates(questions, index).find((candidate) => candidate.id === question.conditional?.questionId);
      const values = conditionValuesOf(question);
      if (!source) issues.push({ index, field: 'conditional', message: 'Syarat harus merujuk pertanyaan pilihan yang berada di atasnya.' });
      else if (!values.length) issues.push({ index, field: 'conditional', message: 'Pilih minimal satu jawaban untuk syaratnya.' });
      else if (!values.every((value) => source.options?.includes(value))) issues.push({ index, field: 'conditional', message: 'Jawaban syarat tidak ada lagi di pilihan sumbernya.' });
      else if (values.length > QUESTION_LIMITS.conditionValues) issues.push({ index, field: 'conditional', message: `Maksimal ${QUESTION_LIMITS.conditionValues} jawaban untuk syaratnya.` });
    }
  });
  return issues;
}

/** The list as it is saved: trimmed text, options only on choice questions, conditions as `in`. */
export function toStoredQuestions(questions: readonly CustomQuestion[]): CustomQuestion[] {
  return questions.map((question) => {
    const stored: CustomQuestion = { id: question.id, label: question.label.trim(), type: question.type, required: question.required };
    if (isChoiceType(question.type)) stored.options = (question.options ?? []).map((option) => option.trim());
    const values = [...new Set(conditionValuesOf(question).map((value) => value.trim()))];
    if (question.conditional && values.length) stored.conditional = { questionId: question.conditional.questionId, in: values };
    return stored;
  });
}

/** The registration form the save sends, checked by the same schema as the detail API before it leaves the browser. */
export function storedRegistrationForm(form: Record<string, unknown>, questions: readonly CustomQuestion[]) {
  const value = { ...form, customQuestions: toStoredQuestions(questions) };
  return { value, valid: detailConfigSchema.shape.registrationForm.safeParse(value).success };
}
