// B-027 2b (s18, E-031): the host's question editor. The authoring rules keep every edited list ordered (a condition names
// only an earlier choice question, so no cycle can be authored), say what an edit changed elsewhere, and agree with the
// detail API's schema and the guest page; the panel checks the list before it leaves the browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionEditor } from '../app/(customer)/dashboard/invitations/[id]/manage/question-editor';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import {
  addOption,
  addQuestion,
  type AuthoringResult,
  canMove,
  isChoiceType,
  isOrdered,
  moveQuestion,
  OFFERED_TYPES,
  QUESTION_LIMITS,
  removeOption,
  removeQuestion,
  renameOption,
  setCondition,
  setType,
  sourceCandidates,
  storedRegistrationForm,
  toStoredQuestions,
  updateQuestion,
  validateQuestions,
} from '../lib/invitation/question-authoring';
import { askableQuestions, type CustomQuestion } from '../lib/invitation/rsvp-questions';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const MENU: CustomQuestion = { id: 'menu', label: 'Pilihan menu', type: 'radio', required: true, options: ['Daging', 'Ikan', 'Vegetarian'] };
const LAGU: CustomQuestion = { id: 'lagu', label: 'Lagu permintaan', type: 'text', required: false };
const BUS: CustomQuestion = { id: 'bus', label: 'Naik bus rombongan?', type: 'select', required: false, options: ['Ya', 'Tidak'] };
const JENIS: CustomQuestion = { id: 'jenis', label: 'Jenis vegetarian', type: 'select', required: true, options: ['Lakto-ovo', 'Vegan'] };
const LIST = [MENU, LAGU, BUS, JENIS];
const CONDITIONED = setCondition(LIST, 3, 'menu', ['Vegetarian']).questions;

test('E-031: a new question gets an id the schema accepts and no other question has; the list stops at the limit', () => {
  const tick = 1_700_000_000_000;
  const one = addQuestion([], tick);
  const two = addQuestion(one.questions, tick);
  assert.match(two.questions[0].id, /^[a-zA-Z0-9_-]{1,80}$/);
  assert.notEqual(two.questions[1].id, two.questions[0].id, 'same clock tick, different id');
  assert.deepEqual(two.questions[1], { id: two.questions[1].id, label: '', type: 'text', required: false });
  const full = Array.from({ length: QUESTION_LIMITS.questions }, (_, index) => ({ ...LAGU, id: `q${index}` }));
  assert.deepEqual(addQuestion(full), { questions: full, notes: [`Maksimal ${QUESTION_LIMITS.questions} pertanyaan.`] });
});

test('E-031: a condition can name only an earlier choice question with a written option, so a cycle cannot be authored', () => {
  const withBlankChoice = [MENU, LAGU, { ...BUS, options: [''] }, JENIS];
  assert.deepEqual(sourceCandidates(withBlankChoice, 3).map((question) => question.id), ['menu'], 'not text, not a choice without options');
  assert.deepEqual(sourceCandidates(LIST, 0), []);
  const result = setCondition(LIST, 3, 'menu', ['Vegetarian', 'Vegetarian', 'Ayam']);
  assert.deepEqual(result.questions[3].conditional, { questionId: 'menu', in: ['Vegetarian'] }, 'only what the source offers, once');
  const backwards = setCondition(CONDITIONED, 0, 'jenis', ['Vegan']);
  assert.deepEqual(backwards, { questions: CONDITIONED, notes: ['Syarat hanya bisa merujuk pertanyaan pilihan yang berada di atasnya.'] });
  assert.deepEqual(setCondition(LIST, 3, 'lagu', ['x']).questions, LIST, 'a text question is no source');
  assert.equal(setCondition(CONDITIONED, 3, null).questions[3].conditional, undefined);
});

test('E-031: moving keeps every condition below its source', () => {
  assert.equal(isOrdered(CONDITIONED), true);
  const up = moveQuestion(moveQuestion(CONDITIONED, 3, -1).questions, 2, -1).questions;
  assert.deepEqual(up.map((question) => question.id), ['menu', 'jenis', 'lagu', 'bus']);
  assert.equal(canMove(up, 1, -1), false, 'not above its source');
  assert.deepEqual(moveQuestion(up, 1, -1), { questions: up, notes: ['Pertanyaan bersyarat harus tetap berada di bawah pertanyaan yang menjadi syaratnya.'] });
  assert.equal(canMove(up, 0, 1), false, 'a source not below its dependant');
  assert.equal(canMove(up, 0, -1), false, 'not past the top');
  assert.equal(canMove(up, up.length - 1, 1), false, 'not past the bottom');
  assert.equal(canMove(up, 2, 1), true);
});

test('E-031: deleting or retyping a source, or removing the chosen option, removes the condition and says so', () => {
  const removed = removeQuestion(CONDITIONED, 0);
  assert.equal(removed.questions.find((question) => question.id === 'jenis')?.conditional, undefined);
  assert.deepEqual(removed.notes, ['Syarat pada “Jenis vegetarian” dihapus karena pertanyaan sumbernya (“Pilihan menu”) dihapus; pertanyaan itu kini ditanyakan kepada semua tamu.']);
  const retyped = setType(CONDITIONED, 0, 'text');
  assert.equal(retyped.questions[0].options, undefined, 'a text question carries no options');
  assert.equal(retyped.questions[3].conditional, undefined);
  assert.deepEqual(retyped.notes, ['Syarat pada “Jenis vegetarian” dihapus karena “Pilihan menu” tidak lagi berupa pilihan; pertanyaan itu kini ditanyakan kepada semua tamu.']);
  assert.deepEqual(setType(LIST, 1, 'radio'), { questions: [MENU, { ...LAGU, type: 'radio', options: [''] }, BUS, JENIS], notes: [] });
  const two = setCondition(LIST, 3, 'menu', ['Ikan', 'Vegetarian']).questions;
  const lessOne = removeOption(two, 0, 1);
  assert.deepEqual(lessOne, { questions: [{ ...MENU, options: ['Daging', 'Vegetarian'] }, LAGU, BUS, { ...JENIS, conditional: { questionId: 'menu', in: ['Vegetarian'] } }], notes: [] });
  const none = removeOption(lessOne.questions, 0, 1);
  assert.equal(none.questions[3].conditional, undefined);
  assert.deepEqual(none.notes, ['Syarat pada “Jenis vegetarian” dihapus karena pilihan “Vegetarian” yang menjadi syaratnya dihapus; pertanyaan itu kini ditanyakan kepada semua tamu.']);
});

test('E-031: renaming an option renames it in the conditions; clearing it never silently re-points one', () => {
  const renamed = renameOption(CONDITIONED, 0, 2, 'Vegetarian (tanpa daging)');
  assert.deepEqual(renamed.questions[3].conditional, { questionId: 'menu', in: ['Vegetarian (tanpa daging)'] });
  assert.deepEqual(validateQuestions(renamed.questions), []);
  const retypedAfterClearing = renameOption(renameOption(CONDITIONED, 0, 2, '').questions, 0, 2, 'Nabati');
  assert.deepEqual(validateQuestions(retypedAfterClearing.questions), [{ index: 3, field: 'conditional', message: 'Jawaban syarat tidak ada lagi di pilihan sumbernya.' }], 'the host is asked to choose again');
});

test('E-031: what blocks saving is named per field; a clear list is stored trimmed and accepted by the detail API', () => {
  const draft: CustomQuestion[] = [
    { id: 'a', label: '   ', type: 'text', required: false },
    { id: 'b', label: 'Menu', type: 'radio', required: false, options: ['Ikan', ' Ikan '] },
    { id: 'c', label: 'Tanpa pilihan', type: 'checkbox', required: false, options: [] },
    { id: 'd', label: 'x'.repeat(201), type: 'text', required: false },
    { id: 'e', label: 'Syarat tanpa jawaban', type: 'text', required: false, conditional: { questionId: 'b', in: [] } },
  ];
  assert.deepEqual(
    validateQuestions(draft).map(({ index, field, message }) => [index, field, message]),
    [
      [0, 'label', 'Tulis pertanyaannya.'],
      [1, 'options', 'Dua pilihan tidak boleh sama.'],
      [2, 'options', 'Tambahkan minimal satu pilihan.'],
      [3, 'label', 'Maksimal 200 karakter.'],
      [4, 'conditional', 'Pilih minimal satu jawaban untuk syaratnya.'],
    ],
  );
  const many = { ...MENU, options: Array.from({ length: 25 }, (_, index) => `Pilihan ${index + 1}`) };
  const tooMany = setCondition([many, LAGU], 1, 'menu', many.options).questions;
  assert.deepEqual(validateQuestions(tooMany), [{ index: 1, field: 'conditional', message: 'Maksimal 20 jawaban untuk syaratnya.' }], 'the schema allows 20 condition values');
  const clear: CustomQuestion[] = [
    { ...MENU, label: '  Pilihan menu ', options: [' Ikan', 'Vegetarian '] },
    { ...JENIS, conditional: { questionId: 'menu', equals: 'Vegetarian ' } },
    { ...LAGU, options: ['sisa dari pilihan'] },
  ];
  assert.deepEqual(validateQuestions(clear), []);
  const { value, valid } = storedRegistrationForm({ enabled: true, allowPlusOne: false }, clear);
  assert.equal(valid, true);
  assert.deepEqual(value.customQuestions, [
    { ...MENU, options: ['Ikan', 'Vegetarian'] },
    { ...JENIS, conditional: { questionId: 'menu', in: ['Vegetarian'] } },
    LAGU,
  ]);
  assert.equal(detailConfigSchema.safeParse({ registrationForm: value }).success, true);
  assert.equal(storedRegistrationForm({ enabled: true, capacity: 0 }, clear).valid, false, 'the rest of the form is checked too');
});

/** Deterministic PRNG (mulberry32), so a failing sequence can be replayed from its seed. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['Ya', 'Tidak', 'Mungkin', 'Daging', 'Ikan', 'Vegetarian', 'Pagi', 'Malam', ' Sore ', ''];

function randomEdit(questions: CustomQuestion[], next: () => number, tick: number): AuthoringResult {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const index = Math.floor(next() * Math.max(questions.length, 1));
  const optionIndex = Math.floor(next() * Math.max(questions[index]?.options?.length ?? 1, 1));
  switch (Math.floor(next() * 10)) {
    case 0:
    case 1:
      return addQuestion(questions, tick);
    case 2:
      return updateQuestion(questions, index, { label: next() < 0.15 ? '' : `Pertanyaan ${tick % 97}`, required: next() < 0.5 });
    case 3:
      return removeQuestion(questions, index);
    case 4:
      return moveQuestion(questions, index, next() < 0.5 ? -1 : 1);
    case 5:
      return setType(questions, index, pick(OFFERED_TYPES));
    case 6:
      return addOption(questions, index);
    case 7:
      return renameOption(questions, index, optionIndex, pick(WORDS));
    case 8:
      return removeOption(questions, index, optionIndex);
    default: {
      const candidate = next() < 0.2 ? undefined : pick(sourceCandidates(questions, index));
      const values = (candidate?.options ?? []).filter(() => next() < 0.6);
      return setCondition(questions, index, candidate?.id ?? null, values);
    }
  }
}

test('E-031 property: any edit sequence stays ordered and acyclic; a clear list is what the API accepts and the guest page asks in full', () => {
  let clearStates = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const next = random(seed);
    let questions: CustomQuestion[] = [];
    for (let step = 0; step < 80; step += 1) {
      questions = randomEdit(questions, next, seed * 1000 + step).questions;
      const where = `seed ${seed}, step ${step}`;
      assert.equal(isOrdered(questions), true, `${where}: every condition names an earlier question`);
      assert.equal(new Set(questions.map((question) => question.id)).size, questions.length, `${where}: unique ids`);
      for (const question of questions) {
        const sourceQuestion = questions.find((candidate) => candidate.id === question.conditional?.questionId);
        if (question.conditional) assert.ok(sourceQuestion && isChoiceType(sourceQuestion.type), `${where}: ${question.id} names a choice question`);
        if (!isChoiceType(question.type)) assert.equal(question.options, undefined, `${where}: ${question.id} has no stray options`);
      }
      if (validateQuestions(questions).length) continue;
      clearStates += 1;
      const stored = storedRegistrationForm({ enabled: true }, questions);
      assert.equal(stored.valid, true, `${where}: the detail API accepts what validation lets through`);
      assert.equal(askableQuestions(toStoredQuestions(questions)).length, questions.length, `${where}: the guest page asks every saved question`);
    }
  }
  assert.ok(clearStates >= 300, `the property was exercised on ${clearStates} saveable lists`);
});

test('E-031: the editor labels every control, ties each issue to its field, and offers only valid moves and sources', () => {
  const draft: CustomQuestion[] = [MENU, { ...LAGU, label: '' }, BUS, { ...JENIS, conditional: { questionId: 'menu', in: ['Vegetarian'] } }];
  const render = (showIssues: boolean) => renderToStaticMarkup(createElement(QuestionEditor, { questions: draft, onChange: () => {}, showIssues }));
  const html = render(true);
  const tag = (pattern: RegExp) => html.match(pattern)?.[0] ?? '';
  const labelInput = [...html.matchAll(/<input[^>]*>/g)].map(([input]) => input).find((input) => input.includes('aria-invalid="true"') && input.includes('placeholder=')) ?? '';
  const describedBy = /aria-describedby="([^"]+)"/.exec(labelInput)?.[1];
  assert.ok(describedBy, 'the blank wording is marked invalid and described');
  assert.match(html, new RegExp(`id="${describedBy}"[^>]*>Tulis pertanyaannya\\.<`));
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 1, 'only the field with an issue');
  assert.match(tag(/<button[^>]*aria-label="Naikkan pertanyaan 1"[^>]*>/), /disabled=""/, 'the first cannot move up');
  assert.match(tag(/<button[^>]*aria-label="Turunkan pertanyaan 4"[^>]*>/), /disabled=""/, 'the last cannot move down');
  assert.doesNotMatch(tag(/<button[^>]*aria-label="Naikkan pertanyaan 4"[^>]*>/), /disabled=""/, 'a dependant may move up while its source stays above');
  assert.ok(html.includes('aria-label="Pilihan 1 untuk pertanyaan 1"') && html.includes('aria-label="Hapus pilihan 2 dari pertanyaan 3"'));
  assert.ok(html.includes('Tamu yang menjawab “Pilihan menu”') && html.includes('Tamu yang menjawab “Naik bus rombongan?”'), 'earlier choice questions are offered');
  assert.ok(!html.includes('Tamu yang menjawab “Lagu permintaan”') && !html.includes('Tamu yang menjawab “”'), 'a text question is not');
  assert.equal((html.match(/role="group"/g) ?? []).length, draft.length);
  assert.match(html, /aria-live="polite"/);
  assert.ok(html.includes('4<!-- --> dari <!-- -->50<!-- --> pertanyaan') || html.includes('4 dari 50 pertanyaan'));
  const quiet = render(false);
  assert.ok(!quiet.includes('aria-invalid') && !quiet.includes('Tulis pertanyaannya.'), 'no issue is shown before a save attempt');
});

test('E-031 / D-035: a stored condition naming a deleted question reaches the host, who chooses again before saving', () => {
  const stored: CustomQuestion[] = [MENU, { ...LAGU, conditional: { questionId: 'dihapus', equals: 'x' } }];
  assert.deepEqual(validateQuestions(stored), [{ index: 1, field: 'conditional', message: 'Syarat harus merujuk pertanyaan pilihan yang berada di atasnya.' }]);
  assert.equal(storedRegistrationForm({ enabled: true }, stored).valid, false, 'the detail API refuses it as well');
  const html = renderToStaticMarkup(createElement(QuestionEditor, { questions: stored, onChange: () => {}, showIssues: true }));
  assert.ok(html.includes('Syarat lama tidak berlaku lagi, pilih ulang'), 'the old condition is named, not hidden');
  assert.match(html, /<select[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]*-condition-issue"/);
  assert.equal(setCondition(stored, 1, null).questions[1].conditional, undefined, '"Semua tamu" resolves it');
  assert.deepEqual(validateQuestions(setCondition(stored, 1, 'menu', ['Ikan']).questions), [], 'so does a source above it');
});

test('E-031 wiring: the panel checks the list with the API schema before the PATCH and is honest about stored-only fields', () => {
  const panel = source('app/(customer)/dashboard/invitations/[id]/manage/module-config-panel.tsx');
  const save = panel.slice(panel.indexOf('async function save'), panel.indexOf('const wrap='));
  for (const marker of ['validateQuestions(', 'storedRegistrationForm(', 'setShowIssues(true)']) {
    assert.ok(save.indexOf(marker) >= 0 && save.indexOf(marker) < save.indexOf('fetch('), `${marker} before the request`);
  }
  assert.match(panel, /<QuestionEditor questions=\{x\.customQuestions\?\?\[\]\}/);
  assert.match(panel, /storedOnlyNotice\('registrationForm','id'\)/);
  assert.match(panel, /role="alert"/, 'a refused save is announced');
  assert.doesNotMatch(panel, /allowPlusOne\?\?true/, 'the panel shows the schema default');
});
