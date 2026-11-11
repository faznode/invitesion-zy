// B-027 2b follow-up (s18, E-030): the defects the integrated acceptance of E-029 found. S18-Q1 line breaks counted twice
// against the browser's own limit; S18-Q2 the condition read after the control; S18-Q3 questions that can never apply
// shown anyway; S18-Q4 one broken stored question taking the whole form off the page, out of the export and the editors,
// and blocking every save.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Guest } from '../lib/db/schema';
import { carriedRegistrationForm, normalizeStoredConfig } from '../lib/invitation/content-read';
import { detailConfigSchema, mergeDetailConfig, type DetailConfig } from '../lib/invitation/detail-config';
import { guestExportCsv } from '../lib/invitation/guest-export';
import { publishBlockers } from '../lib/invitation/publish-rules';
import { askableQuestions, canEverApply, type CustomQuestion, parseRsvpAnswers } from '../lib/invitation/rsvp-questions';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

const BASE = {
  couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } },
  events: [{ title: 'Resepsi', startAt: '2099-03-10T19:00:00+08:00' }],
};
const MENU: CustomQuestion = { id: 'menu', label: 'Pilihan menu', type: 'radio', required: true, options: ['Daging', 'Ikan', 'Vegetarian'] };
const JENIS: CustomQuestion = { id: 'jenis', label: 'Jenis vegetarian', type: 'select', required: true, options: ['Lakto-ovo', 'Vegan'], conditional: { questionId: 'menu', equals: 'Vegetarian' } };
const configWith = (customQuestions: CustomQuestion[]): DetailConfig => detailConfigSchema.parse({ ...BASE, registrationForm: { enabled: true, customQuestions } });

/** The RSVP form's HTML: the form element that holds this question's control. */
function rsvpForm(page: string, questionId: string): string {
  const at = page.indexOf(`name="q:${questionId}"`);
  assert.ok(at > 0, `q:${questionId} is rendered`);
  return page.slice(page.lastIndexOf('<form', at), page.indexOf('</form>', at));
}

test('S18-Q1: a long answer at the browser limit is accepted whatever line breaks the form sent, and stored with LF', () => {
  const catatan: CustomQuestion = { id: 'catatan', label: 'Catatan untuk tuan rumah', type: 'textarea', required: false };
  const lines = Array.from({ length: 11 }, (_, index) => 'x'.repeat(index < 10 ? 180 : 190));
  const text = lines.join('\n');
  assert.equal(text.length, 2000, 'what the textarea maxlength counts');
  for (const [label, sent] of [['CRLF (what browsers submit)', lines.join('\r\n')], ['CR', lines.join('\r')], ['LF', text]] as const) {
    assert.deepEqual(parseRsvpAnswers(form([['q:catatan', sent]]), [catatan], 'CONFIRMED'), { ok: true, answers: { catatan: text } }, label);
  }
  assert.deepEqual(parseRsvpAnswers(form([['q:catatan', `${lines.join('\r\n')}x`]]), [catatan], 'CONFIRMED'), { ok: false, questionId: 'catatan' }, 'one character over is still refused');
});

test('S18-Q2: every layout reads label, then the condition and any refusal, then the control', () => {
  const porsi: CustomQuestion = { id: 'porsi', label: 'Ukuran porsi', type: 'radio', required: false, options: ['Kecil', 'Besar'], conditional: { questionId: 'menu', equals: 'Daging' } };
  const config = configWith([MENU, JENIS, porsi]);
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest(), status: { rsvp: 'answers', rsvpq: 'jenis' } });
    const html = rsvpForm(page, 'jenis');
    const order = (...markers: string[]) => {
      const positions = markers.map((marker) => html.indexOf(marker));
      assert.ok(positions.every((position) => position >= 0), `${label}: all of ${markers.join(' | ')}`);
      assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${label}: ${markers.join(' → ')}`);
    };
    order('>Jenis vegetarian<', 'id="rsvp-jenis-hint"', 'Isi jika jawaban untuk “Pilihan menu” adalah “Vegetarian”.', 'id="rsvp-jenis-error"', '<select');
    assert.match(html, /<select[^>]*aria-describedby="rsvp-jenis-hint rsvp-jenis-error"/, `${label}: both still described`);
    order('<legend', '>Ukuran porsi<', 'id="rsvp-porsi-hint"', 'name="q:porsi"');
  }
});

test('S18-Q3: a question that can never apply is not shown; one that can stays with its condition', () => {
  const questions: CustomQuestion[] = [
    MENU,
    JENIS,
    { id: 'susu', label: 'Masih minum susu?', type: 'radio', required: false, options: ['Ya', 'Tidak'], conditional: { questionId: 'jenis', equals: 'Lakto-ovo' } },
    { id: 'siklus-a', label: 'Siklus A', type: 'radio', required: true, options: ['x'], conditional: { questionId: 'siklus-b', equals: 'x' } },
    { id: 'siklus-b', label: 'Siklus B', type: 'radio', required: true, options: ['x'], conditional: { questionId: 'siklus-a', equals: 'x' } },
    { id: 'mustahil', label: 'Syarat tanpa pilihan', type: 'text', required: true, conditional: { questionId: 'menu', in: ['Ayam', 'Bebek'] } },
    { id: 'turunan', label: 'Di bawah syarat mustahil', type: 'text', required: false, conditional: { questionId: 'mustahil', equals: 'apa saja' } },
    { id: 'kode', label: 'Kode undangan', type: 'text', required: false },
    { id: 'vip', label: 'Nomor meja VIP', type: 'text', required: false, conditional: { questionId: 'kode', equals: 'VIP' } },
  ];
  assert.deepEqual(askableQuestions(questions).map((question) => question.id), ['menu', 'jenis', 'susu', 'kode', 'vip'], 'a free-text source can always be met');
  assert.equal(canEverApply(JENIS, new Map([[JENIS.id, JENIS]])), false, 'a missing source');
  assert.deepEqual(
    parseRsvpAnswers(form([['q:menu', 'Ikan'], ['q:siklus-a', 'x'], ['q:mustahil', 'apa']]), questions, 'CONFIRMED'),
    { ok: true, answers: { menu: 'Ikan' } },
    'hidden questions never require an answer and never store one',
  );
  const config = configWith(questions);
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
    for (const shown of ['Pilihan menu', 'Jenis vegetarian', 'Masih minum susu?', 'Kode undangan', 'Nomor meja VIP']) assert.ok(page.includes(shown), `${label}: ${shown}`);
    for (const hidden of ['siklus-a', 'siklus-b', 'mustahil', 'turunan']) assert.ok(!page.includes(`name="q:${hidden}"`), `${label}: ${hidden} hidden`);
    assert.ok(page.includes('Isi jika jawaban untuk “Jenis vegetarian” adalah “Lakto-ovo”.'), `${label}: the chained condition in words`);
  }
});

const BROKEN = {
  ...BASE,
  registrationForm: {
    enabled: true,
    customQuestions: [
      MENU,
      JENIS,
      { id: 'yatim', label: 'Sumbernya sudah dihapus', type: 'text', required: false, conditional: { questionId: 'dihapus', equals: 'x' } },
      { id: 'cucu', label: 'Bergantung pada yang yatim', type: 'text', required: false, conditional: { questionId: 'yatim', equals: 'x' } },
      { id: 'menu', label: 'Id kembar', type: 'text', required: false },
      { id: 'rusak', label: 'Pilihan tanpa opsi', type: 'radio', required: false },
      { id: 'lagu', label: 'Lagu permintaan', type: 'text', required: false },
    ],
  },
};

test('S18-Q4 / D-035: one inconsistent question no longer takes the form away; a deleted source keeps its dependants for the export, hidden from guests', () => {
  assert.equal(detailConfigSchema.safeParse(BROKEN).success, false, "today's strict rules refuse the stored form");
  const { config, dropped } = normalizeStoredConfig(BROKEN);
  const questions = config.registrationForm?.customQuestions ?? [];
  assert.deepEqual(questions.map((question) => question.id), ['menu', 'jenis', 'yatim', 'cucu', 'lagu'], 'only the unreadable question and the repeated id are left out');
  assert.equal(questions[0].label, 'Pilihan menu', 'the first of two equal ids stays');
  assert.deepEqual(questions[2].conditional, { questionId: 'dihapus', equals: 'x' }, 'the condition is kept as written, not rewritten');
  assert.equal(config.registrationForm?.enabled, true);
  assert.deepEqual(config.couple, BASE.couple, 'other sections untouched');
  assert.deepEqual(dropped, ['registrationForm.customQuestions'], 'names the path when questions were left out, never values');
  const page = renderGuestPage({ config, guest: fixtureGuest() });
  for (const name of ['q:menu', 'q:jenis', 'q:lagu']) assert.ok(page.includes(`name="${name}"`), name);
  for (const hidden of ['Sumbernya sudah dihapus', 'Bergantung pada yang yatim', 'Id kembar', 'Pilihan tanpa opsi']) assert.ok(!page.includes(hidden), hidden);
  assert.deepEqual(parseRsvpAnswers(form([['q:menu', 'Ikan'], ['q:yatim', 'baru'], ['q:cucu', 'baru']]), questions, 'CONFIRMED'), { ok: true, answers: { menu: 'Ikan' } }, 'the action stores nothing for them');
  const guests = [fixtureGuest({ rsvpStatus: 'CONFIRMED', rsvpAnswers: { menu: 'Ikan', yatim: 'jawaban sebelum sumbernya dihapus', lagu: 'Gundul Pacul' } })] as Guest[];
  const [header, row] = guestExportCsv(guests, questions).split('\n');
  assert.ok(header.endsWith(',"Pilihan menu","Jenis vegetarian","Sumbernya sudah dihapus","Bergantung pada yang yatim","Lagu permintaan"'), header);
  assert.ok(row.endsWith(',"Ikan","","jawaban sebelum sumbernya dihapus","","Gundul Pacul"'), `the host keeps the answers already collected: ${row}`);
  const danglingOnly = { ...BASE, registrationForm: { enabled: true, customQuestions: [MENU, { id: 'diri', label: 'Syarat pada dirinya', type: 'text', required: true, conditional: { questionId: 'diri', equals: 'x' } }, BROKEN.registrationForm.customQuestions[2]] } };
  const kept = normalizeStoredConfig(danglingOnly);
  assert.deepEqual(kept.config.registrationForm?.customQuestions?.map((question) => question.id), ['menu', 'diri', 'yatim']);
  assert.deepEqual(kept.dropped, [], 'nothing left out, nothing reported');
  assert.deepEqual(askableQuestions(kept.config.registrationForm?.customQuestions ?? []).map((question) => question.id), ['menu'], 'a self-reference never applies either');
});

test('S18-Q4: a form that fails for any other reason is still dropped whole, and named as the section', () => {
  for (const registrationForm of [{ enabled: 'ya' }, 'rusak', { enabled: true, customQuestions: 'semua' }, { enabled: true, capacity: -1, customQuestions: [MENU] }]) {
    const { config, dropped } = normalizeStoredConfig({ ...BASE, registrationForm });
    assert.equal(config.registrationForm, undefined, JSON.stringify(registrationForm));
    assert.deepEqual(dropped, ['registrationForm'], JSON.stringify(registrationForm));
    assert.deepEqual(config.events?.map((event) => event.title), ['Resepsi']);
  }
});

test('S18-Q4 / D-035 write path: another section saves past a stored inconsistent form, carried as readers see it; the form itself and other invalid sections still refuse', () => {
  const patch = { couple: { bride: { nickName: 'Larasati' } } };
  assert.equal(detailConfigSchema.safeParse(mergeDetailConfig(BROKEN, patch)).success, false, 'before E-030 this save failed');
  const carried = carriedRegistrationForm(BROKEN);
  assert.ok(carried);
  assert.equal('registrationForm' in carried.rest, false);
  const saved = detailConfigSchema.safeParse(mergeDetailConfig(carried.rest, patch));
  assert.ok(saved.success);
  assert.equal(saved.data.couple?.bride?.nickName, 'Larasati');
  assert.deepEqual(carried.form, normalizeStoredConfig(BROKEN).config.registrationForm, 'carried exactly as every reader sees it, dangling condition included');
  const ownSave = { registrationForm: { enabled: true, customQuestions: [MENU, BROKEN.registrationForm.customQuestions[2]] } };
  assert.equal(detailConfigSchema.safeParse(mergeDetailConfig(BROKEN, ownSave)).success, false, 'a save of the form itself is strict');
  const valid = { ...BASE, registrationForm: { enabled: true, customQuestions: [MENU, JENIS] } };
  assert.equal(carriedRegistrationForm(valid), undefined, 'a valid form is merged as stored');
  const otherBroken = { ...BASE, events: 'rusak', registrationForm: valid.registrationForm };
  assert.equal(carriedRegistrationForm(otherBroken), undefined);
  assert.equal(detailConfigSchema.safeParse(mergeDetailConfig(otherBroken, patch)).success, false, 'still refused');
  const unreadable = { ...BASE, registrationForm: { enabled: true, capacity: -1, customQuestions: [MENU] } };
  assert.equal(carriedRegistrationForm(unreadable), undefined, 'nothing is carried that the read rules refuse');
  assert.equal(carriedRegistrationForm(null), undefined);
});

test('D-035 publish: a stored condition naming a deleted question does not block publishing; anything a reader would drop still does', () => {
  const ready = { couple: { bride: { fullName: 'Larasati Putri' }, groom: { fullName: 'Dimas Pratama' } }, events: [{ title: 'Resepsi', startAt: '2099-03-10T19:00:00+08:00' }] };
  const dangling = { ...ready, registrationForm: { enabled: true, customQuestions: [MENU, BROKEN.registrationForm.customQuestions[2]] } };
  assert.equal(detailConfigSchema.safeParse(dangling).success, false);
  assert.deepEqual(publishBlockers('wedding', dangling), []);
  assert.deepEqual(publishBlockers('wedding', { ...ready, registrationForm: BROKEN.registrationForm }), ['Konfigurasi undangan tidak valid. Simpan ulang dari editor sebelum menerbitkan.'], 'unreadable questions still block');
  assert.deepEqual(publishBlockers('wedding', 'rusak'), ['Konfigurasi undangan tidak valid. Simpan ulang dari editor sebelum menerbitkan.']);
  assert.deepEqual(publishBlockers('wedding', ready), []);
});

test('S18-Q4 wiring: every owner page and the export read leniently; the save merges into the write repair; the guest view hides what never applies', () => {
  const pages = ['manage/page.tsx', 'edit/page.tsx', 'planner/page.tsx'].map((file) => `app/(customer)/dashboard/invitations/[id]/${file}`);
  for (const path of pages) {
    const file = source(path);
    assert.match(file, /normalizeStoredConfig\(invitation\.config \?\? \{\}\)/, path);
    assert.doesNotMatch(file, /detailConfigSchema\.safeParse/, `${path}: no strict read that empties the editor`);
  }
  const exportRoute = source('app/(customer)/dashboard/invitations/[id]/analytics/route.ts');
  assert.match(exportRoute, /const \{ config \} = normalizeStoredConfig\(inv\.config \?\? \{\}\);/);
  assert.match(exportRoute, /const questions = config\.registrationForm\?\.customQuestions \?\? \[\];/);
  const service = source('lib/invitation/service.ts');
  assert.match(service, /return normalizeStoredConfig\(inv\.config \?\? \{\}\)\.config;/, 'getDetailConfig');
  // s19 (D-036): the save's merge moved into `prepareConfigWrite` with the event-id step; the carried-form rule is unchanged.
  // s32 (B-035): every save goes through the content facade, which prepares the write once from the stored config.
  assert.match(source('lib/invitation/content.ts'), /const validated: DetailConfig = prepareConfigWrite\(state\.config, input\.patch\);/, 'the save stores what the write path prepares');
  assert.match(service, /saveInvitationContent\(/, 'updateDetailConfig is the facade');
  const write = source('lib/invitation/content-read.ts');
  assert.match(write, /patch\.registrationForm === undefined \? carriedRegistrationForm\(stored\) : undefined/, 'the save carries only when the form is not saved');
  assert.match(write, /const base = carried\?\.rest \?\? stored;/);
  assert.match(write, /mergeDetailConfig\(keyedBase, keyedPatch/);
  assert.match(write, /detailConfigSchema\.parse\(merged\)/, 'the merged rest is still strictly validated');
  assert.match(source('components/invitation/guest-view.ts'), /askableQuestions\(rsvpQuestionsOf\(/);
});
