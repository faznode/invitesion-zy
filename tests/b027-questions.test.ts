// B-027 slice 2b (s17, E-029, D-034): the host's custom questions in the RSVP form, answers stored on the guest row with
// the RSVP, "required" for "hadir" only, conditions applied on the server, exported with B-006 neutralisation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Guest } from '../lib/db/schema';
import { storedOnlyNotice } from '../lib/invitation/content-contract';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { GUEST_EXPORT_HEADER, guestExportCsv } from '../lib/invitation/guest-export';
import {
  answerCell,
  type CustomQuestion,
  parseRsvpAnswers,
  questionApplies,
  readStoredAnswers,
  rsvpQuestionsOf,
} from '../lib/invitation/rsvp-questions';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const QUESTIONS: CustomQuestion[] = [
  { id: 'menu', label: 'Pilihan menu', type: 'radio', required: true, options: ['Daging', 'Ikan', 'Vegetarian'] },
  { id: 'jenis', label: 'Jenis vegetarian', type: 'select', required: true, options: ['Lakto-ovo', 'Vegan'], conditional: { questionId: 'menu', equals: 'Vegetarian' } },
  { id: 'bantuan', label: 'Bantuan yang diperlukan', type: 'checkbox', required: false, options: ['Antar-jemput', 'Parkir', 'Kursi roda'] },
  { id: 'anak', label: 'Jumlah anak yang ikut', type: 'number', required: false },
  { id: 'lagu', label: 'Lagu permintaan', type: 'text', required: false },
  { id: 'catatan', label: 'Catatan untuk tuan rumah', type: 'textarea', required: false },
];
const config: DetailConfig = detailConfigSchema.parse({
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ title: 'Resepsi', startAt: '2099-03-10T19:00:00+08:00' }],
  registrationForm: { enabled: true, customQuestions: QUESTIONS },
});

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

function withFlag<T>(value: 'on' | 'off', run: () => T): T {
  const before = process.env.FLAG_RSVP_QUESTIONS;
  process.env.FLAG_RSVP_QUESTIONS = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.FLAG_RSVP_QUESTIONS;
    else process.env.FLAG_RSVP_QUESTIONS = before;
  }
}

const tagsNamed = (html: string, name: string) => [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map(([tag]) => tag).filter((tag) => tag.includes(` name="${name}"`));
const statusButton = (html: string, value: string) => [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes(`value="${value}"`)) ?? '';

test('B-027 2b: questions are asked only while the host has the registration form on', () => {
  assert.deepEqual(rsvpQuestionsOf({ enabled: false, customQuestions: QUESTIONS }), []);
  assert.deepEqual(rsvpQuestionsOf({ customQuestions: QUESTIONS }), []);
  assert.equal(rsvpQuestionsOf({ enabled: true, customQuestions: QUESTIONS }).length, 6);
  assert.deepEqual(rsvpQuestionsOf({ enabled: true }), []);
});

test('B-027 2b: answers are typed and bounded per question type', () => {
  const valid = parseRsvpAnswers(
    form([['q:menu', 'Vegetarian'], ['q:jenis', 'Vegan'], ['q:bantuan', 'Parkir'], ['q:bantuan', 'Parkir'], ['q:bantuan', 'Kursi roda'], ['q:anak', '2'], ['q:lagu', '  Bengawan Solo  '], ['q:catatan', 'Datang agak terlambat.'], ['q:unknown', 'ignored']]),
    QUESTIONS,
    'CONFIRMED',
  );
  assert.deepEqual(valid, { ok: true, answers: { menu: 'Vegetarian', jenis: 'Vegan', bantuan: ['Parkir', 'Kursi roda'], anak: 2, lagu: 'Bengawan Solo', catatan: 'Datang agak terlambat.' } });
  const refused = (entries: [string, string][]) => parseRsvpAnswers(form([['q:menu', 'Ikan'], ...entries]), QUESTIONS, 'CONFIRMED');
  assert.deepEqual(refused([['q:bantuan', 'Helikopter']]), { ok: false, questionId: 'bantuan' }, 'an option the host did not offer');
  assert.deepEqual(parseRsvpAnswers(form([['q:menu', 'Ikan'], ['q:menu', 'Daging']]), QUESTIONS, 'CONFIRMED'), { ok: false, questionId: 'menu' }, 'two answers to a single choice');
  for (const bad of ['-1', '2.5', '1e3', '100001', 'dua']) assert.deepEqual(refused([['q:anak', bad]]), { ok: false, questionId: 'anak' }, `number ${bad}`);
  assert.deepEqual(refused([['q:anak', '100000']]).ok, true);
  assert.deepEqual(refused([['q:lagu', 'x'.repeat(501)]]), { ok: false, questionId: 'lagu' }, 'text is at most 500 characters');
  assert.equal(refused([['q:catatan', 'x'.repeat(2000)]]).ok, true);
  assert.deepEqual(refused([['q:catatan', 'x'.repeat(2001)]]), { ok: false, questionId: 'catatan' }, 'long text is at most 2,000 characters');
});

test('B-027 2b: "required" holds for "hadir" only, and a decline clears every answer', () => {
  assert.deepEqual(parseRsvpAnswers(form([]), QUESTIONS, 'CONFIRMED'), { ok: false, questionId: 'menu' });
  assert.deepEqual(parseRsvpAnswers(form([]), QUESTIONS, 'MAYBE'), { ok: true, answers: null });
  assert.deepEqual(parseRsvpAnswers(form([['q:lagu', 'Gundul Pacul']]), QUESTIONS, 'MAYBE'), { ok: true, answers: { lagu: 'Gundul Pacul' } });
  assert.deepEqual(parseRsvpAnswers(form([['q:menu', 'Helikopter'], ['q:lagu', 'x']]), QUESTIONS, 'DECLINED'), { ok: true, answers: null });
});

test('B-027 2b: a conditional question counts only while its condition holds; cycles and missing sources never hold', () => {
  assert.deepEqual(parseRsvpAnswers(form([['q:menu', 'Vegetarian']]), QUESTIONS, 'CONFIRMED'), { ok: false, questionId: 'jenis' }, 'required once it applies');
  assert.deepEqual(
    parseRsvpAnswers(form([['q:menu', 'Ikan'], ['q:jenis', 'Bukan pilihan']]), QUESTIONS, 'CONFIRMED'),
    { ok: true, answers: { menu: 'Ikan' } },
    'an answer to a question that does not apply is dropped, valid or not',
  );
  const byId = (questions: CustomQuestion[]) => new Map(questions.map((question) => [question.id, question]));
  const a: CustomQuestion = { id: 'a', label: 'A', type: 'radio', required: false, options: ['x'], conditional: { questionId: 'b', equals: 'x' } };
  const b: CustomQuestion = { id: 'b', label: 'B', type: 'radio', required: false, options: ['x'], conditional: { questionId: 'a', equals: 'x' } };
  assert.equal(questionApplies(a, { a: 'x', b: 'x' }, byId([a, b])), false, 'a cycle');
  assert.equal(questionApplies({ ...a, conditional: { questionId: 'gone', equals: 'x' } }, { gone: 'x' }, byId([a])), false, 'a missing source');
  const multi: CustomQuestion = { id: 'm', label: 'M', type: 'text', required: false, conditional: { questionId: 'bantuan', in: ['Kursi roda', 'Parkir'] } };
  assert.equal(questionApplies(multi, { bantuan: ['Antar-jemput', 'Parkir'] }, byId([...QUESTIONS, multi])), true, 'any chosen option matches `in`');
  const chained: CustomQuestion = { id: 'c', label: 'C', type: 'text', required: true, conditional: { questionId: 'jenis', equals: 'Vegan' } };
  assert.equal(questionApplies(chained, { menu: 'Ikan', jenis: 'Vegan' }, byId([...QUESTIONS, chained])), false, 'not while its source does not apply');
});

test('B-027 2b: stored answers are read through the schema and exported as one cell each', () => {
  assert.deepEqual(readStoredAnswers(null), {});
  assert.deepEqual(readStoredAnswers('menu'), {});
  assert.deepEqual(readStoredAnswers({ menu: { nested: true } }), {});
  assert.deepEqual(readStoredAnswers({ menu: 'Ikan', bantuan: ['Parkir'], anak: 1 }), { menu: 'Ikan', bantuan: ['Parkir'], anak: 1 });
  assert.equal(answerCell(['Parkir', 'Kursi roda']), 'Parkir; Kursi roda');
  assert.equal(answerCell(3), '3');
  assert.equal(answerCell(undefined), '');
});

test('B-027 2b: every layout asks the questions inside the RSVP form, with native "required" only where HTML can say it', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
    for (const question of QUESTIONS) assert.ok(page.includes(question.label), `${label}: ${question.label}`);
    const formHtml = page.slice(page.indexOf('<form'), page.indexOf('</form>'));
    assert.ok(formHtml.includes('name="q:menu"') && formHtml.includes('name="q:catatan"'), `${label}: inside the RSVP form`);
    assert.ok(tagsNamed(page, 'q:menu').every((tag) => /\brequired=""/.test(tag)), `${label}: the required radio group`);
    assert.ok(tagsNamed(page, 'q:jenis').every((tag) => !/\brequired=""/.test(tag)), `${label}: a conditional question is checked by the action`);
    assert.ok(tagsNamed(page, 'q:bantuan').every((tag) => !/\brequired=""/.test(tag)), `${label}: optional checkboxes`);
    assert.match(tagsNamed(page, 'q:lagu')[0] ?? '', /maxLength="500"/i, `${label}: text limit`);
    assert.match(tagsNamed(page, 'q:catatan')[0] ?? '', /maxLength="2000"/i, `${label}: long-text limit`);
    assert.match(tagsNamed(page, 'q:anak')[0] ?? '', /type="number"[^>]*min="0"[^>]*max="100000"/, `${label}: number bounds`);
    assert.ok(page.includes('Isi jika jawaban untuk “Pilihan menu” adalah “Vegetarian”.'), `${label}: the condition in words`);
    assert.doesNotMatch(statusButton(page, 'CONFIRMED'), /formNoValidate/i, `${label}: "hadir" runs the browser check`);
    assert.match(statusButton(page, 'DECLINED'), /formNoValidate=""/i, `${label}: a decline skips it`);
    assert.match(statusButton(page, 'MAYBE'), /formNoValidate=""/i, `${label}: "mungkin" skips it`);
  }
});

test('B-027 2b: a returning guest sees the stored answers; a refused answer is named and marked', () => {
  const guest = fixtureGuest({ rsvpStatus: 'CONFIRMED', rsvpAnswers: { menu: 'Ikan', bantuan: ['Parkir'], anak: 2, lagu: 'Bengawan Solo', catatan: 'Terima kasih' } });
  const page = renderGuestPage({ config, guest });
  assert.ok(tagsNamed(page, 'q:menu').some((tag) => tag.includes('value="Ikan"') && /\bchecked=""/.test(tag)));
  assert.ok(tagsNamed(page, 'q:bantuan').some((tag) => tag.includes('value="Parkir"') && /\bchecked=""/.test(tag)));
  assert.ok(tagsNamed(page, 'q:bantuan').some((tag) => tag.includes('value="Antar-jemput"') && !/\bchecked=""/.test(tag)));
  assert.match(tagsNamed(page, 'q:anak')[0] ?? '', /value="2"/);
  assert.match(tagsNamed(page, 'q:lagu')[0] ?? '', /value="Bengawan Solo"/);
  assert.match(page, /<textarea[^>]*name="q:catatan"[^>]*>Terima kasih<\/textarea>/);
  const refused = renderGuestPage({ config, guest, status: { rsvp: 'answers', rsvpq: 'lagu' } });
  assert.match(refused, /role="alert"[^>]*>Konfirmasimu belum tersimpan\. Mohon periksa jawaban untuk “<bdi>Lagu permintaan<\/bdi>”\./);
  assert.match(tagsNamed(refused, 'q:lagu')[0] ?? '', /aria-invalid="true"[^>]*aria-describedby="rsvp-lagu-error"/);
  assert.ok(refused.includes('id="rsvp-lagu-error"'));
  const unknown = renderGuestPage({ config, guest, status: { rsvp: 'answers', rsvpq: 'not-a-question' } });
  assert.match(unknown, /role="alert"[^>]*>Konfirmasimu belum tersimpan\. Mohon periksa jawabanmu\./, 'never echoes the query');
});

test('B-027 2b: flag off or form off renders no questions and leaves the form markup as before', (t) => {
  // s20: the pages carry a live countdown; under load two renders straddled a second (22 vs 23 "Detik"), so the clock is
  // frozen for the byte comparison.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const plain = renderGuestPage({ config: { ...config, registrationForm: undefined }, guest: fixtureGuest() });
  const off = withFlag('off', () => renderGuestPage({ config, guest: fixtureGuest() }));
  const disabled = renderGuestPage({ config: { ...config, registrationForm: { ...config.registrationForm!, enabled: false } }, guest: fixtureGuest() });
  for (const [label, page] of [['flag off', off], ['form off', disabled]] as const) {
    assert.ok(!page.includes('name="q:'), label);
    assert.equal(page, plain, `${label}: identical to a page without questions`);
  }
  assert.ok(!plain.includes('formNoValidate'), 'no question, no attribute');
});

test('B-027 2b wiring: the action checks answers after every refusal and before the one write; flag off leaves the column alone', () => {
  const action = source('app/i/[slug]/actions.ts');
  const rsvp = action.slice(action.indexOf('export async function submitRsvp'), action.indexOf('export async function submitGuestMessage'));
  const write = rsvp.indexOf('db.update(guests)');
  // R-03: every refusal is decided before the one write, in the decision's order: closed, the answer, then the questions.
  const decide = rsvp.indexOf('decideGuestRsvp({');
  const refused = rsvp.indexOf("if (decision.kind !== 'write') redirect(");
  assert.ok(decide > 0 && refused > decide && refused < write, 'the decision and its refusals come before the write');
  assert.ok(action.indexOf("maybe: isFlagOn('RSVP_MAYBE')") > 0 && action.indexOf("questions: isFlagOn('RSVP_QUESTIONS')") > 0, 'both flags are read');
  assert.match(action, /rsvp=answers&rsvpq=\$\{encodeURIComponent\(refusal\.questionId\)\}/);
  const decision = source('lib/invitation/rsvp-decision.ts');
  const body = decision.slice(decision.indexOf('export function decideGuestRsvp'), decision.indexOf('export const HOST_RSVP_STATUSES'));
  const order = ['rsvpClosedReason(', 'isRsvpStatus(submitted, { maybe })', 'input.flags.questions ?', 'parseRsvpAnswers(form, questions, status)', "return { kind: 'answers', questionId: parsed.questionId }"].map((marker) => body.indexOf(marker));
  assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), `decision order ${order.join(', ')}`);
  assert.match(rsvp, /\.\.\.\(rsvpAnswers !== undefined && \{ rsvpAnswers \}\)/, 'undefined leaves stored answers untouched');
  assert.equal((rsvp.match(/db\.update\(guests\)/g) ?? []).length, 1, 'status, headcount and answers in one statement');
  assert.doesNotMatch(rsvp, /meta: \{[^}]*answers/i, 'answers never enter analytics events');
});

test('B-027 2b: the export adds one neutralised column per stored question and keeps the old header without questions', () => {
  const guests = [
    fixtureGuest({ name: 'Budi', rsvpStatus: 'CONFIRMED', rsvpAnswers: { menu: 'Ikan', bantuan: ['Parkir', 'Kursi roda'], lagu: '=HYPERLINK("http://example.test")' } }),
    fixtureGuest({ name: 'Sari', rsvpStatus: 'DECLINED', rsvpAnswers: null }),
  ] as Guest[];
  const questions: CustomQuestion[] = [...QUESTIONS, { id: 'rumus', label: '=SUM(1,1)', type: 'text', required: false }];
  const [header, budi, sari] = guestExportCsv(guests, questions).split('\n');
  assert.equal(header, `${GUEST_EXPORT_HEADER.join(',')},"Pilihan menu","Jenis vegetarian","Bantuan yang diperlukan","Jumlah anak yang ikut","Lagu permintaan","Catatan untuk tuan rumah","'=SUM(1,1)"`);
  assert.ok(budi.endsWith(`"Ikan","","Parkir; Kursi roda","","'=HYPERLINK(""http://example.test"")","",""`), budi);
  assert.ok(sari.endsWith(',"","","","","","",""'), sari);
  assert.equal(guestExportCsv(guests).split('\n')[0], GUEST_EXPORT_HEADER.join(','), 'unchanged without questions');
  const route = source('app/(customer)/dashboard/invitations/[id]/analytics/route.ts');
  assert.match(route, /registrationForm\?\.customQuestions \?\? \[\]/, 'every stored question, switched on or not');
});

test('B-027 2b: the editor names the registration fields the page still does not show; the migration is additive', () => {
  assert.deepEqual(storedOnlyNotice('registrationForm', 'id'), { wholeSection: false, fields: ['batas registrasi', 'kapasitas', 'pendamping', 'pesan konfirmasi'], caveat: undefined });
  assert.equal(storedOnlyNotice('rsvp', 'id')?.fields.includes('batas waktu RSVP'), false, 'the RSVP deadline is rendered, not stored-only');
  assert.equal(source('lib/db/migrations/0012_guest_rsvp_answers.sql').trim(), 'ALTER TABLE "guests" ADD COLUMN "rsvp_answers" jsonb;');
});
