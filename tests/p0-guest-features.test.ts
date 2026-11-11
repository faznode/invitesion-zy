// Regression tests for the masterplan's sprint-2 P0 guest-page items (invitation-research/09-masterplan/06-backlog.md, B-008 …).
process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { isFlagOn } from '../lib/flags';
import {
  buildIcs,
  calendarEventsFromConfig,
  countdownParts,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  icsDateTimeUtc,
} from '../lib/invitation/calendar';
import { GUEST_LINK_TOKEN_PATTERN, guestLinkSegment, newGuestLinkToken, pickGuestForSegment } from '../lib/invitation/guest-link';
import { invitationDisplayName, invitationHeadline } from '../lib/invitation/headline';
import { palette, paletteHex, paletteIds } from '../lib/invitation/palettes';
import { invitationShareMetadata, previewImageModel, previewImageVersion } from '../lib/invitation/preview-image';
import { invitationCalendarPath, invitationPreviewImagePath } from '../lib/invitation/public-path';
import { slugify } from '../lib/invitation/slug';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { fixtureGuest, fixtureInvitation, formCount, hiddenInputValues, LAYOUTS, linkHrefs, renderGuestPage, withFamily } from './support/render-guest-page';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const LAYOUT_FILES = ['components/invitation/public-renderer.tsx', 'components/invitation/families/gapura.tsx', 'components/invitation/families/kartu.tsx', 'components/invitation/families/riang.tsx'];
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

// ── Flags ─────────────────────────────────────────────────────────────────────

test('flags: defaults hold and FLAG_<NAME> overrides them', () => {
  assert.equal(isFlagOn('GUEST_CALENDAR', {}), true);
  assert.equal(isFlagOn('OPAQUE_GUEST_LINKS', {}), false);
  assert.equal(isFlagOn('GUEST_CALENDAR', { FLAG_GUEST_CALENDAR: 'off' }), false);
  assert.equal(isFlagOn('GUEST_CALENDAR', { FLAG_GUEST_CALENDAR: ' 0 ' }), false);
  assert.equal(isFlagOn('OPAQUE_GUEST_LINKS', { FLAG_OPAQUE_GUEST_LINKS: 'ON' }), true);
  assert.equal(isFlagOn('OPAQUE_GUEST_LINKS', { FLAG_OPAQUE_GUEST_LINKS: 'maybe' }), false);
});

// ── B-008: add-to-calendar and countdown ──────────────────────────────────────

const fixtureEvents = [
  { title: 'Akad Nikah', startAt: '2026-12-20T08:00:00+07:00', endAt: '2026-12-20T09:30:00+07:00', venueName: 'Masjid Raya', address: 'Jl. Merdeka 1, Bandung' },
  { title: 'Resepsi', startAt: '2026-12-27T19:00:00+08:00', venueName: 'Gedung Makassar' },
  { title: 'Tanpa waktu' },
];

test('B-008: DTSTART is the UTC instant of the event-local time (WIB and WITA)', () => {
  assert.equal(icsDateTimeUtc(new Date('2026-12-20T08:00:00+07:00')), '20261220T010000Z');
  assert.equal(icsDateTimeUtc(new Date('2026-12-27T19:00:00+08:00')), '20261227T110000Z');
});

test('B-008: the calendar file has the RFC 5545 frame, one VEVENT per timed event, CRLF line ends', () => {
  const events = calendarEventsFromConfig({ slug: 'budi-sari', displayName: 'Sari & Budi', events: fixtureEvents, publicUrl: 'https://example.test/i/budi-sari' });
  assert.equal(events.length, 2, 'the event without a start is skipped');
  const ics = buildIcs(events, new Date('2026-11-03T12:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF');
  const text = unfold(ics);
  assert.equal(text.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.match(text, /UID:budi-sari\.0@invitesion\r\nDTSTAMP:20261103T120000Z\r\nDTSTART:20261220T010000Z\r\nDTEND:20261220T023000Z\r\n/);
  assert.match(text, /DTSTART:20261227T110000Z\r\nSUMMARY:Resepsi · Sari & Budi\r\n/, 'no DTEND without an end time');
  assert.match(text, /SUMMARY:Akad Nikah · Sari & Budi/);
  assert.match(text, /LOCATION:Masjid Raya\\, Jl. Merdeka 1\\, Bandung/);
  assert.match(text, /URL:https:\/\/example.test\/i\/budi-sari/);
});

test('B-008: a non-increasing end is dropped instead of producing an invalid range', () => {
  const [event] = calendarEventsFromConfig({ slug: 's', displayName: 'X', events: [{ title: 'A', startAt: '2026-12-20T08:00:00+07:00', endAt: '2026-12-20T07:00:00+07:00' }] });
  assert.equal(buildIcs([event]).includes('DTEND'), false);
  assert.match(googleCalendarUrl(event), /dates=20261220T010000Z%2F20261220T010000Z/);
});

test('B-008: TEXT escaping and 75-octet folding never split a character', () => {
  assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = `SUMMARY:${'Resepsi 🎉 حفل الزفاف '.repeat(8)}`;
  const folded = foldIcsLine(long);
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line over 75 octets: ${line}`);
  assert.equal(folded.replace(/\r\n /g, ''), long, 'unfolding restores the original');
  assert.equal(folded.includes('\uFFFD'), false);
});

test('B-008: hostile event text stays inert in the file', () => {
  const [event] = calendarEventsFromConfig({ slug: 's', displayName: '<script>alert(1)</script>', events: [{ title: 'X\r\nBEGIN:VEVENT', startAt: '2026-12-20T08:00:00+07:00' }] });
  const ics = buildIcs([event]);
  assert.equal(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 1, 'a newline in a title cannot open a second event');
  assert.match(unfold(ics), /SUMMARY:X\\nBEGIN:VEVENT · <script>alert\(1\)<\/script>/);
});

test('B-008: Google Calendar link carries the same instant and location', () => {
  const [event] = calendarEventsFromConfig({ slug: 'budi-sari', displayName: 'Sari & Budi', events: fixtureEvents });
  const url = new URL(googleCalendarUrl(event));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261220T010000Z/20261220T023000Z');
  assert.equal(url.searchParams.get('location'), 'Masjid Raya, Jl. Merdeka 1, Bandung');
});

test('B-008: countdown arithmetic and disappearance after the event', () => {
  const target = Date.parse('2026-12-20T01:00:00Z');
  assert.deepEqual(countdownParts(target, target - (2 * 86_400 + 3 * 3_600 + 4 * 60 + 5) * 1000), { days: 2, hours: 3, minutes: 4, seconds: 5 });
  assert.equal(countdownParts(target, target), null);
  assert.equal(countdownParts(target, target + 1), null);
  assert.equal(countdownParts(Number.NaN, 0), null);
});

test('B-008: headline names are shared by renderer, calendar and preview image', () => {
  const config = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } } } as Parameters<typeof invitationHeadline>[1];
  assert.deepEqual(invitationHeadline('wedding', config), ['Sari', 'Budi']);
  assert.equal(invitationDisplayName('wedding', { ...config, couple: { ...config.couple, displayOrder: 'groom-first' } } as typeof config), 'Budi & Sari');
  assert.equal(invitationDisplayName('wedding', {}), 'Undangan');
});

const calendarConfig = (startAt: string, endAt?: string): DetailConfig => ({
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt, endAt, venueName: 'Gedung Makassar' }],
});
const googleLink = (html: string) => linkHrefs(html).find((href) => href.startsWith('https://calendar.google.com/'));
const icsLink = (html: string) => linkHrefs(html).find((href) => href.endsWith('/calendar.ics'));

test('B-008: every layout shows the countdown and calendar links for a future event of a published invitation only, behind the flag', () => {
  const future = calendarConfig('2099-12-27T19:00:00+08:00', '2099-12-27T21:00:00+08:00');
  const previousFlag = process.env.FLAG_GUEST_CALENDAR;
  try {
    for (const { label, familyId } of LAYOUTS) {
      delete process.env.FLAG_GUEST_CALENDAR;
      const published = renderGuestPage({ config: withFamily(future, familyId) });
      assert.match(published, /role="timer"/, `${label}: countdown`);
      assert.equal(icsLink(published), '/i/budi-sari/calendar.ics', `${label}: calendar file of this invitation`);
      const google = new URL(googleLink(published) ?? 'about:blank');
      assert.equal(google.searchParams.get('dates'), '20991227T110000Z/20991227T130000Z', `${label}: 19.00–21.00 WITA as UTC instants`);
      assert.equal(google.searchParams.get('location'), 'Gedung Makassar', label);

      const draft = renderGuestPage({ config: withFamily(future, familyId), invitation: fixtureInvitation({ status: 'DRAFT' }) });
      assert.equal(icsLink(draft) ?? googleLink(draft), undefined, `${label}: a draft has no calendar file, so no calendar links`);

      const past = renderGuestPage({ config: withFamily(calendarConfig('2020-12-27T19:00:00+08:00'), familyId) });
      assert.doesNotMatch(past, /role="timer"/, `${label}: no countdown after the event`);
      assert.equal(icsLink(past) ?? googleLink(past), undefined, `${label}: no save-the-date after the event`);

      process.env.FLAG_GUEST_CALENDAR = 'off';
      const flagOff = renderGuestPage({ config: withFamily(future, familyId) });
      assert.doesNotMatch(flagOff, /role="timer"/, `${label}: flag off removes the countdown`);
      assert.equal(icsLink(flagOff) ?? googleLink(flagOff), undefined, `${label}: flag off removes the calendar links`);
    }
  } finally {
    if (previousFlag === undefined) delete process.env.FLAG_GUEST_CALENDAR;
    else process.env.FLAG_GUEST_CALENDAR = previousFlag;
  }
});

test('B-008 / B-030: layouts take the flag, publish and calendar rules from the one shared guest view', () => {
  const view = source('components/invitation/guest-view.ts');
  assert.match(view, /isFlagOn\('GUEST_CALENDAR'\)/);
  assert.match(view, /invitation\.status === 'PUBLISHED'/);
  for (const file of LAYOUT_FILES) {
    assert.doesNotMatch(source(file), /isFlagOn\(|calendarEventsFromConfig\(|invitation\.status/, `${file} re-derives a rule the guest view owns`);
    assert.match(source(file), /<Countdown\b/, file);
  }
});

test('B-008: wiring — the calendar route is flag-gated, skips drafts and never reads guest rows', () => {
  const route = source('app/i/[slug]/calendar.ics/route.ts');
  assert.match(route, /isFlagOn\('GUEST_CALENDAR'\)/);
  assert.match(route, /loadPublishedInvitationSummary\(slug\)/);
  assert.doesNotMatch(route, /\bguests\b|guestSlug/, 'the calendar route never touches guest rows');
  const loader = source('lib/invitation/public.ts');
  assert.match(loader, /export async function loadPublishedInvitationSummary[\s\S]*?status === 'DRAFT'\) return null/);
});

test('side routes can never shadow a guest page: their segment has a dot, guest slugs never do', () => {
  assert.equal(invitationCalendarPath('budi-sari'), '/i/budi-sari/calendar.ics');
  assert.equal(invitationPreviewImagePath('budi-sari'), '/i/budi-sari/og.png');
  for (const name of ['calendar.ics', 'og.png', 'Calendar', 'Ög . Png', '...']) assert.equal(slugify(name).includes('.'), false, name);
});

// ── B-011: opaque guest links behind a flag; legacy links keep working; real 404 ──

test('B-011: tokens are 128-bit, URL-safe, fixed-length and unique', () => {
  const tokens = Array.from({ length: 2000 }, () => newGuestLinkToken());
  for (const token of tokens.slice(0, 50)) {
    assert.match(token, GUEST_LINK_TOKEN_PATTERN);
    assert.equal(encodeURIComponent(token), token);
    assert.equal(Buffer.from(token, 'base64url').length, 16);
  }
  assert.equal(new Set(tokens).size, tokens.length);
});

test('B-011: resolution — token first, legacy slug only for guests without a token, else nothing', () => {
  const legacy = { id: 1, slug: 'budi-hartono', linkToken: null };
  const tokenized = { id: 2, slug: 'sari-wulan', linkToken: 'AbCdEfGhIjKlMnOpQrStUv' };
  const rows = [legacy, tokenized];
  assert.equal(pickGuestForSegment(rows, 'budi-hartono')?.id, 1, 'legacy link keeps working');
  assert.equal(pickGuestForSegment(rows, 'AbCdEfGhIjKlMnOpQrStUv')?.id, 2);
  assert.equal(pickGuestForSegment(rows, 'sari-wulan'), null, 'a tokenized guest is not reachable by the guessable slug');
  assert.equal(pickGuestForSegment(rows, 'abcdefghijklmnopqrstuv'), null, 'tokens are case-sensitive');
  assert.equal(pickGuestForSegment(rows, ''), null);
  const clash = [{ id: 3, slug: 'AbCdEfGhIjKlMnOpQrStUv', linkToken: null }, tokenized];
  assert.equal(pickGuestForSegment(clash, 'AbCdEfGhIjKlMnOpQrStUv')?.id, 2, 'a token match wins over a slug match');
  assert.equal(guestLinkSegment(tokenized), 'AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(guestLinkSegment(legacy), 'budi-hartono');
});

test('B-011: wiring — one lookup rule for page and actions, flag-gated minting, additive migration, real 404', () => {
  const loader = source('lib/invitation/public.ts');
  assert.match(loader, /findGuestByLinkSegment\(invitation\.id, guestSlug\)/);
  assert.match(loader, /or\(eq\(guests\.linkToken, segment\), and\(isNull\(guests\.linkToken\), eq\(guests\.slug, segment\)\)\)/);
  assert.match(source('app/i/[slug]/actions.ts'), /findGuestByLinkSegment\(invitation\.id, guestSlug\)/);
  assert.doesNotMatch(source('app/i/[slug]/actions.ts'), /eq\(guests\.slug/);
  // B-033 moved minting into the roster writers: the flag is read once per write (`rosterFlags`), and every insert of a
  // guest in both writers (an add, an import, an approved self-registration) gates the token on it.
  assert.match(source('lib/invitation/roster.ts'), /opaqueLinks: isFlagOn\('OPAQUE_GUEST_LINKS', env\)/);
  assert.equal(source('lib/invitation/roster-next.ts').match(/linkToken: input\.flags\.opaqueLinks \? newGuestLinkToken\(\) : null/g)?.length, 3);
  assert.equal(source('services/api/src/roster/http.rs').match(/request\.flags\.opaque_links\.then\(new_link_token\)/g)?.length, 3);
  for (const file of ['app/(customer)/dashboard/guests/actions.ts', 'app/(customer)/dashboard/invitations/[id]/guests/actions.ts']) {
    assert.match(source(file), /addRosterGuest\(/, file);
    assert.doesNotMatch(source(file), /insert\(guests\)|newGuestLinkToken/, file);
  }
  assert.match(source('app/(customer)/dashboard/guests/page.tsx'), /guestPath\(invitationSlug, guestLinkSegment\(guest\)\)/);
  assert.equal(source('components/invitation/guest-blocks.tsx').match(/name="guestSlug" value=\{guestLinkSegment\(guest\)\}/g)?.length, 2, 'both shared forms post the link identity');
  for (const file of LAYOUT_FILES) assert.doesNotMatch(source(file), /name="guestSlug"/, `${file} builds its own guest form`);
  assert.equal(
    source('lib/db/migrations/0010_guest_link_token.sql').trim(),
    'ALTER TABLE "guests" ADD COLUMN "link_token" varchar(32);--> statement-breakpoint\nCREATE UNIQUE INDEX "guests_link_token_unique" ON "guests" USING btree ("link_token");',
  );
  // F-01 (Next 16): `experimental.ppr` is gone, and its successor (Cache Components) would flush a prerendered shell's
  // 200 before a guest page can call notFound(). The real 404 rests on the facts below; CI's product-gates job also
  // requests wrong links over HTTP against a production build.
  assert.doesNotMatch(source('next.config.ts'), /^\s*(cacheComponents|ppr)\s*:/m, 'no prerendered shell');
  assert.doesNotMatch(source('app/layout.tsx'), /experimental_ppr|<Suspense/);
  for (const page of ['app/i/[slug]/page.tsx', 'app/i/[slug]/[guestSlug]/page.tsx']) {
    assert.match(source(page), /^export const dynamic = 'force-dynamic';$/m, page);
    assert.match(source(page), /if \(!data\) notFound\(\);/, page);
    assert.doesNotMatch(source(page), /experimental_ppr|<Suspense/, page);
  }
  for (const boundary of ['app/loading.tsx', 'app/i/loading.tsx', 'app/i/[slug]/loading.tsx', 'app/i/[slug]/[guestSlug]/loading.tsx']) {
    assert.equal(existsSync(join(process.cwd(), boundary)), false, `${boundary} would stream a 200 before notFound()`);
  }
});

test('B-011: every layout posts the link identity from both forms (the token, or the slug of a legacy guest) and only while responses are open', () => {
  const config: DetailConfig = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } } };
  const token = 'AbCdEfGhIjKlMnOpQrStUv';
  const tokenized = fixtureGuest({ name: 'Sari Wulan', slug: 'sari-wulan', linkToken: token });
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), guest: tokenized });
    assert.equal(formCount(page), 2, `${label}: RSVP and guestbook`);
    assert.deepEqual(hiddenInputValues(page, 'guestSlug'), [token, token], `${label}: the opaque token`);
    assert.deepEqual(hiddenInputValues(page, 'slug'), ['budi-sari', 'budi-sari'], label);
    assert.equal(page.includes('sari-wulan'), false, `${label}: a tokenized guest's guessable slug never reaches the page`);

    const legacyPage = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
    assert.deepEqual(hiddenInputValues(legacyPage, 'guestSlug'), ['budi-hartono', 'budi-hartono'], `${label}: legacy link keeps working`);

    const expired = renderGuestPage({ config: withFamily(config, familyId), guest: tokenized, readOnly: true });
    assert.equal(formCount(expired), 0, `${label}: an expired invitation takes no responses`);
    assert.ok(expired.includes('RSVP untuk undangan ini sudah ditutup.') && expired.includes('sudah melewati masa aktif'), `${label}: read-only notices`);

    const anonymous = renderGuestPage({ config: withFamily(config, familyId), guest: null });
    assert.equal(formCount(anonymous), 0, `${label}: no personal link, no form`);
    assert.ok(anonymous.includes('tautan undangan personal'), `${label}: explains where to respond`);
  }
});

// ── B-010: link-preview image ─────────────────────────────────────────────────

const weddingConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt: '2026-12-27T19:00:00+08:00' }],
  settings: { openingCopy: 'Kami mengundang Anda.' },
  theme: { paletteId: 'sage' },
} as Parameters<typeof previewImageModel>[1];

test('B-010: the preview image uses the page palette, names and the event-zone date', () => {
  for (const id of paletteIds) {
    const hex = paletteHex(id);
    const style = palette(id).style as Record<string, string>;
    assert.ok(style['--inv-bg'] === hex.bg && style['--inv-ink'] === hex.ink && style['--inv-accent'] === hex.accent, id);
  }
  assert.deepEqual(paletteHex('unknown'), paletteHex('ivory'));
  const model = previewImageModel('wedding', weddingConfig);
  assert.equal(model.label, 'Undangan Pernikahan');
  assert.equal(model.name, 'Sari & Budi');
  assert.equal(model.date, 'Minggu, 27 Desember 2026');
  assert.equal(model.colors.bg, '#f5f8f4');
});

test('B-010: long or hostile names are clipped text, and edits change the image URL', () => {
  const hostile = { ...weddingConfig, couple: { bride: { nickName: '<img src=x onerror=alert(1)>'.repeat(4) }, groom: { nickName: 'Budi' } } } as typeof weddingConfig;
  const model = previewImageModel('wedding', hostile);
  assert.equal([...model.name].length, 48);
  assert.ok(model.name.endsWith('…'));
  assert.equal(model.imageName, model.name, 'ASCII markup is drawn as literal text');
  const rtl = previewImageModel('wedding', { ...weddingConfig, couple: { bride: { nickName: 'ليلى 🎉' }, groom: { nickName: 'Budi' } } } as typeof weddingConfig);
  assert.equal(rtl.imageName, null, 'glyphs outside the bundled font would be fetched from a third party');
  assert.equal(rtl.name, 'ليلى 🎉 & Budi', 'metadata text keeps the real name');
  assert.match(source('app/i/[slug]/og.png/route.tsx'), /\{imageName \?/);
  const v1 = previewImageVersion(previewImageModel('wedding', weddingConfig));
  assert.equal(v1, previewImageVersion(previewImageModel('wedding', weddingConfig)), 'stable for the same content');
  assert.notEqual(v1, previewImageVersion(model));
});

test('B-010: share metadata points at the 1200×630 image and the opening copy, never at a guest', () => {
  const meta = invitationShareMetadata({ slug: 'budi-sari', eventType: 'wedding' }, weddingConfig);
  const [image] = meta.openGraph.images;
  assert.match(image.url, /^\/i\/budi-sari\/og\.png\?v=[0-9a-z]+$/);
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.equal(meta.openGraph.description, 'Kami mengundang Anda.');
  assert.equal(meta.openGraph.locale, 'id_ID');
  assert.equal(meta.twitter.card, 'summary_large_image');
  // G-047 (D-069): a passcode-protected invitation's preview is its cover for everyone (`coverOnly`), still per invitation.
  for (const page of ['app/i/[slug]/page.tsx', 'app/i/[slug]/[guestSlug]/page.tsx']) {
    assert.match(source(page), /\.\.\.invitationShareMetadata\(data\.invitation, data\.config, \{ coverOnly: gate\?\.passcode === true \}\)/, page);
  }
  const route = source('app/i/[slug]/og.png/route.tsx');
  assert.match(route, /loadPublishedInvitationSummary\(slug\)/);
  assert.doesNotMatch(route, /\bguests\b|guestSlug/);
  assert.match(source('components/invitation/guest-view.ts'), /import \{ palette \} from '@\/lib\/invitation\/palettes'/);
});
