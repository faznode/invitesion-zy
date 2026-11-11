// E-036: answers reach the host on the invitation's guest page, not only through the CSV. Counts come from stored answers
// only; an unanswered question is never a "no"; D-035's deleted-source questions keep their answers; host and guest text
// stays inert and direction-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerOverview, GuestAnswers } from '../app/(customer)/dashboard/invitations/[id]/guests/answer-summary';
import { guestAnswerLines, questionSummaries } from '../lib/invitation/answer-summary';
import type { CustomQuestion } from '../lib/invitation/rsvp-questions';

const menu: CustomQuestion = { id: 'menu', label: 'Pilihan menu', type: 'radio', required: true, options: ['Ayam', 'Ikan', 'Vegetarian'] };
const alergi: CustomQuestion = { id: 'alergi', label: 'Alergi apa?', type: 'text', required: false, conditional: { questionId: 'menu', equals: 'Vegetarian' } };
const bantuan: CustomQuestion = { id: 'bantuan', label: 'Bantuan', type: 'checkbox', required: false, options: ['Parkir', 'Kursi roda'] };
const anak: CustomQuestion = { id: 'anak', label: 'Jumlah anak', type: 'number', required: false };
const yatim: CustomQuestion = { id: 'yatim', label: 'Catatan', type: 'text', required: false, conditional: { questionId: 'dihapus', equals: 'Ya' } };
const questions = [menu, alergi, bantuan, anak, yatim];
const rows = [
  { rsvpStatus: 'CONFIRMED', rsvpAnswers: { menu: 'Vegetarian', alergi: 'Kacang', bantuan: ['Parkir', 'Kursi roda'], anak: 2 } },
  { rsvpStatus: 'CONFIRMED', rsvpAnswers: { menu: 'Vegetarian', bantuan: ['Parkir'] } },
  { rsvpStatus: 'MAYBE', rsvpAnswers: { menu: 'Sapi', anak: 0, yatim: 'lama' } },
  { rsvpStatus: 'CONFIRMED', rsvpAnswers: null },
  { rsvpStatus: 'DECLINED', rsvpAnswers: null },
  { rsvpStatus: 'PENDING', rsvpAnswers: null },
];

test('choice counts list every offered option, then stored values no longer offered; multi-choice counts each pick', () => {
  const [menuSummary, , bantuanSummary] = questionSummaries(rows, questions);
  assert.deepEqual(menuSummary.options, [
    { option: 'Ayam', count: 0, retired: false },
    { option: 'Ikan', count: 0, retired: false },
    { option: 'Vegetarian', count: 2, retired: false },
    { option: 'Sapi', count: 1, retired: true },
  ]);
  assert.deepEqual([menuSummary.answered, menuSummary.unanswered], [3, 1], 'the hadir guest without answers is unanswered, never a choice');
  assert.deepEqual(bantuanSummary.options.map((option) => option.count), [2, 1]);
});

test('unanswered counts only hadir / mungkin guests the question applied to; declines and pending are not asked', () => {
  const summary = questionSummaries(rows, questions);
  const alergiSummary = summary[1];
  // Applies only to the two Vegetarian guests; one answered, one left it empty.
  assert.deepEqual([alergiSummary.answered, alergiSummary.unanswered], [1, 1]);
  assert.deepEqual(summary[3].numbers, { total: 2, min: 0, max: 2 });
  assert.equal(summary[3].options.length, 0);
});

test('D-035: a question whose condition names a deleted question is never asked but keeps its stored answers', () => {
  const yatimSummary = questionSummaries(rows, questions)[4];
  assert.equal(yatimSummary.orphaned, true);
  assert.deepEqual([yatimSummary.answered, yatimSummary.unanswered], [1, 0]);
});

test('a guest\u2019s lines: per-event answers in event order, then stored question answers as the export writes them', () => {
  const events = [{ id: 'ev-2', title: 'Resepsi' }, { id: 'ev-1', title: 'Akad' }];
  const lines = guestAnswerLines(
    { rsvpAnswers: { bantuan: ['Parkir', 'Kursi roda'], menu: 'Ikan', hilang: 'x' }, rsvpEventAnswers: { 'ev-1': { status: 'DECLINED', attending: 0 }, 'ev-2': { status: 'CONFIRMED', attending: 3 } } },
    questions,
    events,
  );
  assert.deepEqual(lines, [
    { key: 'event:ev-2', label: 'Resepsi', value: 'hadir (3 orang)' },
    { key: 'event:ev-1', label: 'Akad', value: 'tidak hadir' },
    { key: 'question:menu', label: 'Pilihan menu', value: 'Ikan' },
    { key: 'question:bantuan', label: 'Bantuan', value: 'Parkir; Kursi roda' },
  ]);
  assert.deepEqual(guestAnswerLines({ rsvpAnswers: null, rsvpEventAnswers: null }, questions), []);
});

test('rendered summary: hostile text stays inert, RTL text resolves its own direction, nothing renders without answers', () => {
  const hostile: CustomQuestion = { id: 'h', label: '<img src=x onerror=alert(1)>', type: 'radio', required: false, options: ['حلال', '=CMD()'] };
  const html = renderToStaticMarkup(
    createElement(AnswerOverview, {
      questions: questionSummaries([{ rsvpStatus: 'CONFIRMED', rsvpAnswers: { h: 'حلال' } }], [hostile]),
      events: [{ id: 'ev-1', title: 'حفل', counts: { PENDING: 1, CONFIRMED: 2, DECLINED: 0, MAYBE: 1 }, seats: 5, invited: 4, inviteOnly: false }],
    }),
  );
  assert.ok(!html.includes('<img'), 'markup in a label is text');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(html, /<span dir="auto"[^>]*>حلال<\/span>/);
  assert.match(html, /<th scope="row" dir="auto"[^>]*>حفل<\/th>/);
  assert.match(html, /2 <span[^>]*>\(5 orang\)<\/span>/);
  assert.match(html, /1 \(100%\)/);
  assert.equal(renderToStaticMarkup(createElement(AnswerOverview, { questions: [], events: [] })), '');
  const guest = renderToStaticMarkup(createElement(GuestAnswers, { lines: [{ key: 'q', label: 'Catatan', value: 'baris 1\nbaris 2 <b>' }] }));
  assert.match(guest, /<summary[^>]*>Jawaban tamu \(1\)<\/summary>/);
  assert.ok(guest.includes('baris 1\nbaris 2 &lt;b&gt;'));
  assert.equal(renderToStaticMarkup(createElement(GuestAnswers, { lines: [] })), '');
});

test('the guest page summarises for its owner only, with the export\u2019s readers, and logs nothing', () => {
  const page = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/invitations/[id]/guests/page.tsx'), 'utf8');
  // G-044 (D-057): the owner or a co-host (`guests`), administrators refused, before any read.
  assert.match(page, /if\(!user\|\|user\.role==='ADMIN'\)redirect\('\/sign-in'\);/);
  assert.match(page, /const access=await accessFor\(user\.id,id,'guests'\);if\(!access\)notFound\(\);const inv=access\.invitation;/, 'access before any read');
  assert.match(page, /normalizeStoredConfig\(inv\.config\?\?\{\}\)/);
  assert.match(page, /exportedEvents\(config,rows\)/, 'the same events as the CSV');
  // D-037: each guest's lines cover the events their page shows.
  assert.match(page, /<GuestAnswers lines=\{guestAnswerLines\(g,questions,answerEvents\.filter\(e=>eventVisibleTo\(e,guestAudience\(g\),inviteOnlyOn\)\)\)\}\/>/);
  for (const path of ['app/(customer)/dashboard/invitations/[id]/guests/page.tsx', 'app/(customer)/dashboard/invitations/[id]/guests/answer-summary.tsx', 'lib/invitation/answer-summary.ts']) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), path), 'utf8'), /console\./, `${path}: no answer reaches a log`);
  }
});
