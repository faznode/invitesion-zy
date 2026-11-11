// B-027 slice 1: the shared RSVP form in every layout. The guest name is wrapping text (s15 review F7), the host's
// deadline is shown in the event's wall clock and closes the form, and both actions refuse writes the page would not
// offer (a hidden form is not a closed one).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { rsvpClosedReason, rsvpDeadlinePassed } from '../lib/invitation/rsvp-rules';
import { fixtureGuest, formCount, hiddenInputValues, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const LONG_NAME = 'Muhammad Fadhlurrahman Al-Ghifari & Putri Anindya Maharani Kusumawardhani';
const RTL_NAME = 'عبد الله بن محمد';
const FUTURE = '2099-01-02T23:59:00+08:00';
const PAST = '2020-01-02T23:59:00+07:00';
const base: DetailConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt: '2099-01-04T19:00:00+08:00' }],
};
const withRsvp = (rsvp: NonNullable<DetailConfig['rsvp']>): DetailConfig => ({ ...base, rsvp });
const nameCell = (html: string) => /<dt class="text-sm font-semibold">Nama<\/dt><dd dir="auto" class="([^"]*)">([^<]*)<\/dd>/.exec(html);
const answerButtons = (html: string) => html.match(/<button\b[^>]*\bname="status"/g)?.length ?? 0;

test('B-027: the deadline is an instant, closed from that instant on; missing or unreadable never closes', () => {
  const at = Date.parse('2027-01-02T15:59:00Z');
  assert.equal(Date.parse('2027-01-02T23:59:00+08:00'), at);
  assert.equal(rsvpDeadlinePassed('2027-01-02T23:59:00+08:00', at - 1), false);
  assert.equal(rsvpDeadlinePassed('2027-01-02T23:59:00+08:00', at), true);
  assert.equal(rsvpDeadlinePassed('2027-01-02T23:59:00+08:00', at + 1), true);
  // The same wall clock in WIB (+07) is one hour later than in WITA (+08).
  assert.equal(rsvpDeadlinePassed('2027-01-02T23:59:00+07:00', at), false);
  assert.equal(rsvpDeadlinePassed('2027-01-02T23:59:00+07:00', at + 3_600_000), true);
  assert.equal(rsvpDeadlinePassed(undefined, at), false);
  assert.equal(rsvpDeadlinePassed('', at), false);
  assert.equal(rsvpDeadlinePassed('besok sore', at), false);
});

test('B-027: write rule — switched off beats the deadline, then the deadline, else open', () => {
  const now = Date.parse('2030-01-01T00:00:00Z');
  assert.equal(rsvpClosedReason(undefined, now), null);
  assert.equal(rsvpClosedReason({ enabled: true }, now), null);
  assert.equal(rsvpClosedReason({ enabled: true, deadline: FUTURE }, now), null);
  assert.equal(rsvpClosedReason({ deadline: PAST }, now), 'deadline');
  assert.equal(rsvpClosedReason({ enabled: false, deadline: FUTURE }, now), 'disabled');
  assert.equal(rsvpClosedReason({ enabled: false, deadline: PAST }, now), 'disabled');
});

test('B-027 / F7: every layout shows the guest name as wrapping, direction-isolated text, never a locked input', () => {
  for (const { label, familyId } of LAYOUTS) {
    for (const name of [LONG_NAME, RTL_NAME]) {
      const page = renderGuestPage({ config: withFamily(withRsvp({ enabled: true }), familyId), guest: fixtureGuest({ name }) });
      assert.equal(/<input\b[^>]*\bdisabled/.test(page), false, `${label}: no disabled control on the page`);
      const cell = nameCell(page);
      assert.ok(cell, `${label}: the name sits in the RSVP form's Nama cell`);
      assert.equal(cell[2], name.replace(/&/g, '&amp;'), `${label}: the full name, unclipped`);
      assert.match(cell[1], /\[overflow-wrap:anywhere\]/, `${label}: long words wrap`);
      assert.equal(formCount(page), 2, `${label}: RSVP and guestbook`);
    }
  }
});

test('B-027: an open deadline is announced in the event wall clock; a passed one closes RSVP only', () => {
  for (const { label, familyId } of LAYOUTS) {
    const open = renderGuestPage({ config: withFamily(withRsvp({ enabled: true, deadline: FUTURE }), familyId), guest: fixtureGuest() });
    // s17 (E-025): "maybe" joins the two answers while RSVP_MAYBE is on (its default); tests/b027-maybe.test.ts covers off.
    assert.equal(answerButtons(open), 3, `${label}: every answer offered before the deadline`);
    assert.match(open, /Mohon konfirmasi sebelum <span class="font-semibold">[^<]*2 Januari 2099, 23\.59 WITA<\/span>/, `${label}: deadline in WITA`);

    const closed = renderGuestPage({ config: withFamily(withRsvp({ enabled: true, deadline: PAST }), familyId), guest: fixtureGuest() });
    assert.equal(answerButtons(closed), 0, `${label}: no answer buttons after the deadline`);
    assert.match(closed, /Batas waktu konfirmasi kehadiran sudah lewat \([^)]*2 Januari 2020, 23\.59 WIB\)\./, `${label}: says why, with the deadline`);
    assert.equal(formCount(closed), 1, `${label}: the guestbook stays open`);
    assert.deepEqual(hiddenInputValues(closed, 'guestSlug'), ['budi-hartono'], `${label}: only the guestbook posts`);

    const expired = renderGuestPage({ config: withFamily(withRsvp({ enabled: true, deadline: PAST }), familyId), guest: fixtureGuest(), readOnly: true });
    assert.ok(expired.includes('RSVP untuk undangan ini sudah ditutup.'), `${label}: read-only explanation`);
    assert.equal(expired.includes('Batas waktu konfirmasi'), false, `${label}: read-only wins over the deadline`);

    const anonymous = renderGuestPage({ config: withFamily(withRsvp({ enabled: true, deadline: FUTURE }), familyId), guest: null });
    assert.ok(anonymous.includes('tautan undangan personal'), `${label}: explains where to respond`);
    assert.equal(anonymous.includes('Mohon konfirmasi sebelum'), false, `${label}: no form, no deadline line`);
  }
});

test('B-027: a refused write is announced as an alert in every layout', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({
      config: withFamily(withRsvp({ enabled: true }), familyId),
      guest: fixtureGuest(),
      status: { rsvp: 'closed', wish: 'closed' },
    });
    assert.match(page, /role="alert"[^>]*>Konfirmasimu belum tersimpan karena RSVP untuk undangan ini sudah ditutup\./, `${label}: RSVP refusal`);
    assert.match(page, /role="alert"[^>]*>Ucapanmu belum tersimpan karena buku tamu undangan ini sudah ditutup\./, `${label}: guestbook refusal`);
  }
});

test('B-027: wiring — both actions refuse before writing, with the page rule and the same lenient config read', () => {
  const actions = readFileSync(join(process.cwd(), 'app/i/[slug]/actions.ts'), 'utf8');
  const rsvp = actions.slice(actions.indexOf('export async function submitRsvp'), actions.indexOf('export async function submitGuestMessage'));
  const wish = actions.slice(actions.indexOf('export async function submitGuestMessage'));
  assert.match(actions, /normalizeStoredConfig\(invitation\.config/);
  // R-03: the shared decision checks the switch and the deadline first, at this request's clock, before the one write.
  const decidedAt = rsvp.indexOf('now: Date.now() })');
  assert.ok(decidedAt > 0 && decidedAt < rsvp.indexOf('db.update(guests)'), 'RSVP decides at the request clock before the write');
  const decision = readFileSync(join(process.cwd(), 'lib/invitation/rsvp-decision.ts'), 'utf8');
  assert.match(decision, /const closed = rsvpClosedReason\(config\.rsvp, input\.now\);\n\s*if \(closed\) return \{ kind: 'closed', reason: closed \};/, 'RSVP checks its switch and deadline');
  // R-04 (D-044): the switch is the first rule of the shared wish decision, which runs before the one write.
  const wishDecidedAt = wish.indexOf('decideGuestWish({ config: context.config, message })');
  assert.ok(wishDecidedAt > 0 && wishDecidedAt < wish.indexOf('db.insert(guestMessages)'), 'the guestbook refuses before the write');
  const wishRules = readFileSync(join(process.cwd(), 'lib/invitation/wish-decision.ts'), 'utf8');
  assert.match(wishRules, /enabled: section\?\.enabled !== false/, 'the guestbook checks its switch');
  assert.match(wishRules, /if \(!rules\.enabled\) return \{ kind: 'closed', reason: 'disabled' \};/, 'before judging the message');
  const view = readFileSync(join(process.cwd(), 'components/invitation/guest-view.ts'), 'utf8');
  assert.match(view, /rsvpDeadlinePassed\(rsvpDeadline, renderedAt\)/, 'the page closes the form with the same rule');
});
