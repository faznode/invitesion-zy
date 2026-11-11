// D-037: invite-only events (who sees which event), the single answer of a guest invited to one listed event, and the
// host's dashboard RSVP override (status, people and per-event answers written together). Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import {
  eventVisibleTo,
  inviteeCounts,
  inviteField,
  invitedIdsFromForm,
  inviteOnlyEvents,
  readInvitedEventIds,
  visibleEvents,
} from '../lib/invitation/event-eligibility';
import { guestExportCsv } from '../lib/invitation/guest-export';
import { previewImageModel } from '../lib/invitation/preview-image';
import {
  eventRsvpSummary,
  hostRsvpUpdate,
  overallFromAskedAnswers,
  singleAnswerEventAnswers,
  type AskedEvent,
} from '../lib/invitation/rsvp-events';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const AKAD = { id: 'ev-1', title: 'Akad Khusus Keluarga', startAt: '2027-01-04T09:00:00+08:00', inviteOnly: true };
const RESEPSI = { id: 'ev-2', title: 'Resepsi Umum', startAt: '2027-01-05T19:00:00+08:00' };
const events: AskedEvent[] = [AKAD, RESEPSI];
const config: DetailConfig = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }, events, rsvp: { enabled: true, perEvent: true } };
const form = (fields: Record<string, string>) => ({ get: (name: string) => fields[name] ?? null });
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('stored invitations are read leniently: only usable event ids count', () => {
  assert.deepEqual([...readInvitedEventIds(['ev-1', 'ev-1', 7, 'bad id', null, 'ev-x9'])], ['ev-1', 'ev-x9']);
  assert.equal(readInvitedEventIds({ 'ev-1': true }).size, 0);
  assert.equal(readInvitedEventIds(null).size, 0);
});

test('who sees an invite-only event: invited guests and the host preview; never a page without a guest link', () => {
  const invited = { kind: 'guest', invited: new Set(['ev-1']) } as const;
  const other = { kind: 'guest', invited: new Set<string>() } as const;
  assert.deepEqual(visibleEvents(events, invited, true).map((e) => e.id), ['ev-1', 'ev-2']);
  assert.deepEqual(visibleEvents(events, other, true).map((e) => e.id), ['ev-2']);
  assert.deepEqual(visibleEvents(events, { kind: 'public' }, true).map((e) => e.id), ['ev-2']);
  assert.deepEqual(visibleEvents(events, { kind: 'owner' }, true).map((e) => e.id), ['ev-1', 'ev-2']);
  assert.deepEqual(visibleEvents(events, { kind: 'public' }, false).map((e) => e.id), ['ev-1', 'ev-2'], 'flag off: every event open, as before');
  assert.equal(eventVisibleTo({ inviteOnly: true }, invited, true), false, 'an invite-only event without an id is never shown to guests');
});

test('host form: ticked invite-only events are stored, ids the form cannot show are kept, foreign ids are ignored', () => {
  const stored = ['ev-deleted', 'ev-2'];
  const fields = form({ [inviteField('ev-1')]: 'on', [inviteField('ev-foreign')]: 'on' });
  assert.deepEqual(invitedIdsFromForm(fields, events, stored), ['ev-deleted', 'ev-2', 'ev-1']);
  assert.deepEqual(invitedIdsFromForm(form({}), events, ['ev-1', 'ev-deleted']), ['ev-deleted'], 'unticking removes only the shown event');
  assert.deepEqual(inviteOnlyEvents(events).map((e) => e.id), ['ev-1']);
  assert.deepEqual(inviteeCounts(events, [{ invitedEventIds: ['ev-1'] }, { invitedEventIds: null }, { invitedEventIds: ['ev-1', 'ev-2'] }]), [{ id: 'ev-1', invited: 2 }]);
});

test('every layout shows an invite-only event only to invited guests and to the host preview', () => {
  for (const layout of LAYOUTS) {
    const cfg = withFamily(config, layout.familyId);
    const invitedPage = renderGuestPage({ config: cfg, guest: fixtureGuest({ invitedEventIds: ['ev-1'] }) });
    const otherPage = renderGuestPage({ config: cfg, guest: fixtureGuest({ invitedEventIds: null }) });
    const publicPage = renderGuestPage({ config: cfg, guest: null });
    const previewPage = renderGuestPage({ config: cfg, guest: null, preview: true });
    assert.ok(invitedPage.includes(AKAD.title) && invitedPage.includes(RESEPSI.title), `${layout.label}: invited guest sees both`);
    assert.ok(!otherPage.includes(AKAD.title) && otherPage.includes(RESEPSI.title), `${layout.label}: other guest sees the open event only`);
    assert.ok(!publicPage.includes(AKAD.title) && publicPage.includes(RESEPSI.title), `${layout.label}: no guest link, open events only`);
    assert.ok(previewPage.includes(AKAD.title), `${layout.label}: the host preview shows every event`);
    // Per-event RSVP over the events the guest is invited to: two for the invited guest, the single form for the other.
    assert.equal((invitedPage.match(/name="ev:ev-[12]"/g) ?? []).length > 0, true, `${layout.label}: invited guest answers per event`);
    assert.ok(invitedPage.includes('name="ev:ev-1"') && invitedPage.includes('name="ev:ev-2"'));
    assert.ok(!otherPage.includes('name="ev:'), `${layout.label}: one visible event, the single answer stands for it`);
    assert.ok(!otherPage.includes('ev-1'), `${layout.label}: the invite-only event id never reaches the other guest's page`);
  }
});

test('a single answer: replaces per-event answers when per-event RSVP is off for the invitation, else answers the one event', () => {
  const stored = { 'ev-old': { status: 'CONFIRMED' as const, attending: 2 } };
  const answer = { status: 'DECLINED' as const, attending: 0 };
  assert.equal(singleAnswerEventAnswers({ flagOn: false, listed: events, asked: [RESEPSI], stored, answer }), undefined, 'flag off: column untouched');
  assert.equal(singleAnswerEventAnswers({ flagOn: true, listed: [], asked: [], stored, answer }), null, 'D-036 kept');
  assert.deepEqual(singleAnswerEventAnswers({ flagOn: true, listed: events, asked: [RESEPSI], stored, answer }), { ...stored, 'ev-2': answer });
  assert.equal(singleAnswerEventAnswers({ flagOn: true, listed: events, asked: [], stored, answer }), undefined, 'no event to record it for');
});

test('host override without per-event RSVP: people follow the guest rules, never a stale 0 or a guess', () => {
  const base = { flagOn: true, listed: [] as AskedEvent[], asked: [] as AskedEvent[], stored: {} };
  assert.deepEqual(hostRsvpUpdate({ ...base, status: 'CONFIRMED', previous: { rsvpStatus: 'DECLINED', attendingCount: 0 } }), { rsvpStatus: 'CONFIRMED', attendingCount: null, rsvpEventAnswers: null });
  assert.deepEqual(hostRsvpUpdate({ ...base, status: 'CONFIRMED', previous: { rsvpStatus: 'CONFIRMED', attendingCount: 3 } }), { rsvpStatus: 'CONFIRMED', attendingCount: 3, rsvpEventAnswers: null });
  assert.deepEqual(hostRsvpUpdate({ ...base, status: 'DECLINED', previous: { rsvpStatus: 'CONFIRMED', attendingCount: 3 } }), { rsvpStatus: 'DECLINED', attendingCount: 0, rsvpEventAnswers: null });
  assert.deepEqual(hostRsvpUpdate({ ...base, status: 'MAYBE', previous: { rsvpStatus: 'CONFIRMED', attendingCount: 3 } }), { rsvpStatus: 'MAYBE', attendingCount: null, rsvpEventAnswers: null });
  assert.deepEqual(hostRsvpUpdate({ ...base, flagOn: false, status: 'PENDING', previous: { rsvpStatus: 'CONFIRMED', attendingCount: 3 } }), { rsvpStatus: 'PENDING', attendingCount: null });
  assert.equal(hostRsvpUpdate({ ...base, status: 'CONFIRMED', eventId: 'ev-1', previous: { rsvpStatus: 'PENDING', attendingCount: null } }), null, 'no per-event answer without per-event RSVP');
});

test('host override with per-event RSVP: every asked event or one event, and the overall answer follows', () => {
  const stored = { 'ev-1': { status: 'CONFIRMED' as const, attending: 2 }, 'ev-9': { status: 'DECLINED' as const, attending: 0 } };
  const previous = { rsvpStatus: 'CONFIRMED', attendingCount: 2 };
  const all = hostRsvpUpdate({ status: 'DECLINED', flagOn: true, listed: events, asked: events, stored, previous });
  assert.deepEqual(all, { rsvpStatus: 'DECLINED', attendingCount: 0, rsvpEventAnswers: { 'ev-1': { status: 'DECLINED', attending: 0 }, 'ev-2': { status: 'DECLINED', attending: 0 }, 'ev-9': stored['ev-9'] } });
  const confirmAll = hostRsvpUpdate({ status: 'CONFIRMED', flagOn: true, listed: events, asked: events, stored, previous });
  assert.deepEqual(confirmAll?.rsvpEventAnswers?.['ev-1'], { status: 'CONFIRMED', attending: 2 }, 'a count the guest gave is kept');
  assert.deepEqual(confirmAll?.rsvpEventAnswers?.['ev-2'], { status: 'CONFIRMED', attending: null }, 'never guessed');
  assert.equal(confirmAll?.attendingCount, null, 'one unknown "hadir" makes the people unknown');
  const one = hostRsvpUpdate({ status: 'DECLINED', eventId: 'ev-1', flagOn: true, listed: events, asked: events, stored: {}, previous });
  assert.deepEqual(one, { rsvpStatus: 'PENDING', attendingCount: null, rsvpEventAnswers: { 'ev-1': { status: 'DECLINED', attending: 0 } } }, 'the other event is still unanswered');
  const cleared = hostRsvpUpdate({ status: 'PENDING', eventId: 'ev-1', flagOn: true, listed: events, asked: events, stored, previous });
  assert.deepEqual(cleared?.rsvpEventAnswers, { 'ev-9': stored['ev-9'] });
  assert.equal(hostRsvpUpdate({ status: 'CONFIRMED', eventId: 'ev-1', flagOn: true, listed: events, asked: [RESEPSI], stored, previous }), null, 'an event the guest is not asked about is refused');
  assert.deepEqual(overallFromAskedAnswers(events, { 'ev-1': { status: 'MAYBE', attending: null } }), { rsvpStatus: 'MAYBE', attendingCount: null });
  assert.deepEqual(overallFromAskedAnswers(events, { 'ev-1': { status: 'CONFIRMED', attending: 2 }, 'ev-2': { status: 'CONFIRMED', attending: 4 } }), { rsvpStatus: 'CONFIRMED', attendingCount: 4 });
});

test('host summary: an invite-only event counts its invited guests only; a kept answer of an uninvited guest is not counted', () => {
  const rows = [
    { rsvpEventAnswers: { 'ev-1': { status: 'CONFIRMED', attending: 2 }, 'ev-2': { status: 'CONFIRMED', attending: 2 } }, invitedEventIds: ['ev-1'] },
    { rsvpEventAnswers: { 'ev-1': { status: 'CONFIRMED', attending: 5 } }, invitedEventIds: null },
    { rsvpEventAnswers: null, invitedEventIds: null },
  ];
  const [akad, resepsi] = eventRsvpSummary(rows, events, true);
  assert.deepEqual({ invited: akad.invited, counts: akad.counts, seats: akad.seats, inviteOnly: akad.inviteOnly }, { invited: 1, counts: { PENDING: 0, CONFIRMED: 1, DECLINED: 0, MAYBE: 0 }, seats: 2, inviteOnly: true });
  assert.deepEqual({ invited: resepsi.invited, pending: resepsi.counts.PENDING, inviteOnly: resepsi.inviteOnly }, { invited: 3, pending: 2, inviteOnly: false });
  assert.equal(eventRsvpSummary(rows, events, false)[0].invited, 3, 'flag off: every guest counts, as before');
});

test('export: one invited column per invite-only event, only when one exists; link previews never date an invite-only event', () => {
  const guest = { ...fixtureGuest({ invitedEventIds: ['ev-1'] }), name: '=HYPERLINK("x")' };
  const csv = guestExportCsv([guest, fixtureGuest({ id: 8 })], [], [], inviteOnlyEvents(events));
  const [header, first, second] = csv.split('\n');
  assert.ok(header.endsWith(',"Akad Khusus Keluarga - invited"'), header);
  assert.ok(first.endsWith(',"yes"') && first.startsWith(`"'=`), 'still neutralised');
  assert.ok(second.endsWith(',"no"'));
  assert.equal(guestExportCsv([guest]).split('\n')[0].includes('invited'), false, 'no invite-only event, no new column');
  assert.equal(previewImageModel('wedding', config, true).date, previewImageModel('wedding', { ...config, events: [RESEPSI] }, true).date);
  assert.notEqual(previewImageModel('wedding', config, false).date, previewImageModel('wedding', config, true).date);
});

test('wiring: the action and the dashboard read the same rules, and every host write is scoped to the owner\u2019s invitation', () => {
  const action = read('app/i/[slug]/actions.ts');
  // R-03: the guest's and the host's rules live in the shared decision; each caller passes the flag its page used.
  const decision = read('lib/invitation/rsvp-decision.ts');
  assert.match(action, /inviteOnlyEvents: isFlagOn\('INVITE_ONLY_EVENTS'\)/);
  assert.match(decision, /visibleEvents\(listed, guestAudience\(guest\), input\.flags\.inviteOnlyEvents\)/);
  assert.match(decision, /singleAnswerEventAnswers\(/);
  assert.equal(action.match(/db\.update\(guests\)/g)?.length, 1, 'still one UPDATE per RSVP');
  const host = read('app/(customer)/dashboard/invitations/[id]/guests/actions.ts');
  // G-044 (D-057): the owner or a co-host (`guests`), through the flag-aware guard, before any write.
  assert.match(host, /const access = await accessFor\(user\.id, invitationId, 'guests'\);\s*if \(!access\) redirect\('\/dashboard\/invitations'\);/);
  for (const write of host.match(/await db\.update\(guests\)[\s\S]*?\.where\([^;]*/g) ?? []) {
    assert.match(write, /eq\(guests\.invitationId, ?invitationId\)|eq\(guests\.id,guestId\)/, write.slice(0, 80));
  }
  assert.match(host, /inviteOnlyEvents: isFlagOn\('INVITE_ONLY_EVENTS'\)/);
  assert.match(host, /decideHostRsvp\(\{ config, guest: owned, status, eventId, flags \}\)/);
  assert.match(decision, /const asked = visibleEvents\(listed, guestAudience\(guest\), flags\.inviteOnlyEvents\);\n\s*return hostRsvpUpdate\(/);
  assert.doesNotMatch(host, /meta:\{status:update\.rsvpStatus,source:'dashboard',/, 'no answer data in analytics');
  assert.match(read('app/i/[slug]/calendar.ics/route.ts'), /visibleEvents\(summary\.config\.events, \{ kind: 'public' \}/);
  assert.match(read('app/preview/[id]/page.tsx'), /guest=\{null\}\s+preview/);
});
