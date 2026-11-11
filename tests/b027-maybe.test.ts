// B-027 slice 2a (s17, E-025): "maybe" as an RSVP answer behind the RSVP_MAYBE flag; counted separately, never as people
// attending, exported under its own status with B-006 neutralisation kept.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Guest } from '../lib/db/schema';
import { isFlagOn } from '../lib/flags';
import { guestExportCsv } from '../lib/invitation/guest-export';
import { isRsvpStatus, RSVP_ANSWER_TEXT, rsvpAttendance, rsvpCounts } from '../lib/invitation/rsvp-rules';
import { rsvpStatusLabel } from '../lib/i18n';
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const config = { couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } }, events: [{ title: 'Resepsi', startAt: '2099-03-10T19:00:00+08:00' }] };
// React orders a server-action button's attributes its own way, so read each tag whole.
const statusValues = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('name="status"'))
    .map((tag) => /\bvalue="([A-Z]+)"/.exec(tag)?.[1]);
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function withFlag<T>(value: 'on' | 'off', run: () => T): T {
  const before = process.env.FLAG_RSVP_MAYBE;
  process.env.FLAG_RSVP_MAYBE = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.FLAG_RSVP_MAYBE;
    else process.env.FLAG_RSVP_MAYBE = before;
  }
}

test('B-027: "maybe" is a valid answer only while its flag is on; the flag ships on and can be switched off', () => {
  assert.equal(isFlagOn('RSVP_MAYBE', {}), true);
  assert.equal(isFlagOn('RSVP_MAYBE', { FLAG_RSVP_MAYBE: 'off' }), false);
  assert.equal(isRsvpStatus('MAYBE', { maybe: true }), true);
  assert.equal(isRsvpStatus('MAYBE', { maybe: false }), false);
  assert.equal(isRsvpStatus('MAYBE'), false);
  for (const value of ['CONFIRMED', 'DECLINED']) assert.equal(isRsvpStatus(value, { maybe: false }), true, value);
  for (const value of ['PENDING', 'maybe', '', 'MAYBE '] as const) assert.equal(isRsvpStatus(value, { maybe: true }), false, value);
});

test('B-027: a "maybe" never enters a headcount and is counted on its own', () => {
  assert.equal(rsvpAttendance('MAYBE', 3, 4), null);
  assert.equal(rsvpAttendance('DECLINED', 3, 4), 0);
  assert.equal(rsvpAttendance('CONFIRMED', 3, 4), 3);
  const rows = ['CONFIRMED', 'MAYBE', 'MAYBE', 'DECLINED', 'PENDING', 'LEGACY?'].map((rsvpStatus) => ({ rsvpStatus }));
  assert.deepEqual(rsvpCounts(rows), { PENDING: 1, CONFIRMED: 1, DECLINED: 1, MAYBE: 2 });
  assert.equal(rsvpStatusLabel('MAYBE', 'id'), 'Mungkin');
  assert.equal(rsvpStatusLabel('MAYBE', 'en'), 'Maybe');
});

test('B-027: every layout offers "Mungkin hadir" while the flag is on and only the two answers when it is off', () => {
  for (const { label, familyId } of LAYOUTS) {
    const on = withFlag('on', () => renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() }));
    assert.deepEqual(statusValues(on), ['CONFIRMED', 'DECLINED', 'MAYBE'], `${label}: on`);
    assert.ok(on.includes('Mungkin hadir'), label);
    const off = withFlag('off', () => renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() }));
    assert.deepEqual(statusValues(off), ['CONFIRMED', 'DECLINED'], `${label}: off`);
  }
});

test('B-027: a stored "maybe" reads back as "mungkin hadir", also after the flag is switched off', () => {
  for (const flag of ['on', 'off'] as const) {
    const page = withFlag(flag, () => renderGuestPage({ config, guest: fixtureGuest({ rsvpStatus: 'MAYBE', attendingCount: null }) }));
    assert.ok(page.includes(`Jawaban terakhirmu: ${RSVP_ANSWER_TEXT.MAYBE}.`), flag);
  }
  const unknown = renderGuestPage({ config, guest: fixtureGuest({ rsvpStatus: 'SOMETHING' }) });
  assert.ok(!unknown.includes('Jawaban terakhirmu'), 'an unknown stored value is not described as a decline');
});

test('B-027: the action checks the flag before any write; the dashboard counts and sets "maybe"', () => {
  const action = source('app/i/[slug]/actions.ts');
  // R-03: the flag is read once per request (`rsvpFlags`) and handed to the decision, which runs before the one write and
  // passes it to both the single answer and the per-event answers (s19, D-036). The vectors run it with the flag on and off.
  const write = action.indexOf('db.update(guests)');
  const decide = action.indexOf('decideGuestRsvp({');
  assert.ok(action.indexOf("maybe: isFlagOn('RSVP_MAYBE')") > 0, 'the action reads the flag');
  assert.ok(decide > 0 && decide < write, 'the decision runs before the write');
  const decision = source('lib/invitation/rsvp-decision.ts');
  const flag = decision.indexOf('const maybe = input.flags.maybe;');
  for (const use of ['isRsvpStatus(submitted, { maybe })', 'parseEventAnswers(form, events, guest.guestCount, { maybe })']) {
    assert.ok(flag > 0 && decision.indexOf(use) > flag, `${use}: passes the flag`);
  }
  const page = source('app/(customer)/dashboard/invitations/[id]/guests/page.tsx');
  assert.match(page, /\['Mungkin',rsvp\.MAYBE\]/);
  assert.match(page, /value="MAYBE" label="Mungkin"/);
  // D-037: the dashboard's statuses go through `decideHostRsvp` (R-03, shared with the Rust writer); "mungkin" is one of them.
  assert.match(source('app/(customer)/dashboard/invitations/[id]/guests/actions.ts'), /isHostRsvpStatus\(status\)/);
  assert.match(source('lib/invitation/rsvp-decision.ts'), /\['PENDING', 'CONFIRMED', 'DECLINED', 'MAYBE'\]/);
});

test('B-027: the export keeps "maybe" apart with an empty headcount and still neutralises formulas', () => {
  const rows = [
    fixtureGuest({ name: 'Budi Hartono', rsvpStatus: 'MAYBE', attendingCount: null }),
    fixtureGuest({ id: 8, name: '=HYPERLINK("http://x.test")', rsvpStatus: 'CONFIRMED', attendingCount: 2 }),
  ] as Guest[];
  const [header, maybe, confirmed] = guestExportCsv(rows).split('\n');
  assert.equal(header, 'name,phone,category,guest_count,rsvp_status,sent_at,opened_count,checked_in_at,attending_count');
  assert.equal(maybe, '"Budi Hartono","","","2","MAYBE","","0","",""');
  assert.ok(confirmed.startsWith(`"'=HYPERLINK(""http://x.test"")"`), confirmed);
  assert.ok(confirmed.endsWith('"CONFIRMED","","0","","2"'), confirmed);
});
