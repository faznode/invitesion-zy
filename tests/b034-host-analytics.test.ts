// B-034 (G-038, G-039; ideas I-06, I-29): the host's analytics and follow-up lists. Pure rules, the rendered view and
// the owner-scoped wiring; the database-backed counts are `scripts/verify-host-analytics.ts`. Fictional people only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HostInsights, type HostInsightsProps } from '../components/dashboard/host-insights';
import {
  analyticsTotals,
  FOLLOW_UP_EXPORT_HEADER,
  followUpCsv,
  followUpItems,
  followUpKind,
  followUpLists,
  groupBreakdown,
  hostTimeZone,
  isFollowUpKind,
  localDate,
  opensByDay,
  rsvpDigest,
  shiftDate,
  type AnalyticsGuest,
} from '../lib/invitation/host-analytics';
import { rsvpSummary } from '../lib/invitation/rsvp-rules';
import { whatsAppShareLink } from '../lib/invitation/whatsapp';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const ORIGIN = 'https://invitesion.example';
const TOKEN = 'tok3nOpaqueLink_123456';

let nextId = 1;
function guest(overrides: Partial<AnalyticsGuest> = {}): AnalyticsGuest {
  const id = nextId++;
  return {
    id,
    name: `Tamu ${id}`,
    slug: `tamu-${id}`,
    linkToken: null,
    phone: '0812-3456-7890',
    category: null,
    rsvpStatus: 'PENDING',
    attendingCount: null,
    openedCount: 0,
    openedAt: null,
    sentAt: null,
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);

function fixture(): AnalyticsGuest[] {
  return [
    guest({ name: 'Budi Hartono', category: 'Keluarga', rsvpStatus: 'CONFIRMED', attendingCount: 3, openedCount: 2, openedAt: at('2026-11-05T03:00:00Z') }),
    guest({ name: 'Sari Wulandari', category: ' Keluarga ', rsvpStatus: 'CONFIRMED', attendingCount: null, openedCount: 1, openedAt: at('2026-11-04T03:00:00Z') }),
    guest({ name: 'Dewi Lestari', category: 'Kantor', rsvpStatus: 'MAYBE', openedCount: 1, openedAt: at('2026-11-06T03:00:00Z') }),
    guest({ name: 'Agus Salim', category: 'Kantor', rsvpStatus: 'DECLINED', attendingCount: 0, openedCount: 4, openedAt: at('2026-11-06T05:00:00Z') }),
    guest({ name: 'Rina Kartika', category: 'Kantor', openedCount: 3, openedAt: at('2026-11-02T10:00:00Z'), sentAt: at('2026-11-01T02:00:00Z') }),
    guest({ name: 'Joko Susilo', category: 'Teman', openedCount: 1, openedAt: at('2026-11-06T09:00:00Z'), sentAt: at('2026-11-01T02:00:00Z') }),
    guest({ name: 'Wati Rahayu', category: 'Teman', sentAt: at('2026-11-03T02:00:00Z') }),
    guest({ name: 'Andi Pratama', category: '', sentAt: at('2026-11-01T02:00:00Z') }),
    guest({ name: 'Bayu Nugroho', category: null }),
    guest({ name: 'Citra Ayu', category: 'Teman', rsvpStatus: 'ARCHIVED', openedCount: 0 }),
  ];
}

test('B-034: only guests without an answer need a nudge, split by whether their link was ever opened', () => {
  assert.equal(followUpKind({ rsvpStatus: 'PENDING', openedCount: 0 }), 'unopened');
  assert.equal(followUpKind({ rsvpStatus: 'PENDING', openedCount: 1 }), 'unanswered');
  for (const status of ['CONFIRMED', 'MAYBE', 'DECLINED', 'ARCHIVED', 'pending', '']) {
    assert.equal(followUpKind({ rsvpStatus: status, openedCount: 0 }), null, status);
    assert.equal(followUpKind({ rsvpStatus: status, openedCount: 5 }), null, status);
  }
  assert.ok(isFollowUpKind('unopened') && isFollowUpKind('unanswered'));
  for (const value of ['', 'all', 'UNOPENED', null, undefined, 1]) assert.equal(isFollowUpKind(value), false, String(value));
});

test('B-034: the lists put the most overdue first: longest-sent unopened, longest-ago opened unanswered; never sent last', () => {
  const lists = followUpLists(fixture());
  assert.deepEqual(lists.unopened.map((g) => g.name), ['Andi Pratama', 'Wati Rahayu', 'Bayu Nugroho']);
  assert.deepEqual(lists.unanswered.map((g) => g.name), ['Rina Kartika', 'Joko Susilo']);
  const tied = followUpLists([guest({ name: 'Zaenal' }), guest({ name: 'Ahmad' }), guest({ name: 'ahmad' })]);
  assert.deepEqual(tied.unopened.map((g) => g.name.toLowerCase()), ['ahmad', 'ahmad', 'zaenal'], 'ties by name');
  const input = fixture();
  const before = input.map((g) => g.id);
  followUpLists(input);
  assert.deepEqual(input.map((g) => g.id), before, 'the input order is untouched');
});

test('B-034: totals reconcile with the RSVP summary, and an unknown status is neither answered nor followed up', () => {
  const rows = fixture();
  const totals = analyticsTotals(rows);
  assert.deepEqual(totals.rsvp, rsvpSummary(rows));
  assert.equal(totals.guests, 10);
  assert.equal(totals.opened, 6);
  assert.equal(totals.answered, 4);
  assert.equal(totals.unopened, 3);
  assert.equal(totals.unanswered, 2);
  assert.equal(totals.rsvp.seats, 3);
  assert.equal(totals.rsvp.seatsUnknown, 1);
  assert.equal(totals.answered + totals.unopened + totals.unanswered, totals.guests - 1, 'only the ARCHIVED row is in none');
  assert.deepEqual(analyticsTotals([]), { guests: 0, opened: 0, answered: 0, unopened: 0, unanswered: 0, rsvp: rsvpSummary([]) });
});

test('B-034: groups are the trimmed category, guests without one last; group totals add up to the invitation', () => {
  const rows = fixture();
  const groups = groupBreakdown(rows);
  assert.deepEqual(groups.map((g) => g.group), ['Kantor', 'Keluarga', 'Teman', null]);
  assert.deepEqual(groups.map((g) => g.guests), [3, 2, 3, 2]);
  const keluarga = groups.find((g) => g.group === 'Keluarga')!;
  assert.deepEqual([keluarga.rsvp.counts.CONFIRMED, keluarga.rsvp.seats, keluarga.rsvp.seatsUnknown], [2, 3, 1]);
  const total = analyticsTotals(rows);
  for (const key of ['guests', 'opened', 'answered', 'unopened', 'unanswered'] as const) {
    assert.equal(groups.reduce((sum, g) => sum + g[key], 0), total[key], key);
  }
});

test('B-034: days are the host\u2019s zone: the configured zone, else the first event\u2019s offset, else WIB', () => {
  assert.equal(hostTimeZone({ eventOperations: { timezone: 'Asia/Makassar' }, events: [{ startAt: '2026-12-01T10:00:00+09:00' }] }), 'Asia/Makassar');
  assert.equal(hostTimeZone({ eventOperations: { timezone: 'Europe/Paris' }, events: [{ startAt: '2026-12-01T10:00:00+09:00' }] }), 'Asia/Jayapura');
  assert.equal(hostTimeZone({ events: [{ startAt: 'not a date' }, { startAt: '2026-12-01T10:00:00+0800' }] }), 'Asia/Makassar');
  assert.equal(hostTimeZone({ events: [{ startAt: '2026-12-01T10:00:00Z' }, { startAt: '2026-12-01T10:00:00+05:30' }] }), 'Asia/Jakarta');
  assert.equal(hostTimeZone({}), 'Asia/Jakarta');
  // Midnight WIB is 17:00 UTC: the last second before it is still the earlier day.
  assert.equal(localDate(at('2026-11-06T16:59:59Z'), 'Asia/Jakarta'), '2026-11-06');
  assert.equal(localDate(at('2026-11-06T17:00:00Z'), 'Asia/Jakarta'), '2026-11-07');
  assert.equal(localDate(at('2026-11-06T15:00:00Z'), 'Asia/Jayapura'), '2026-11-07');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('B-034: opens over time fill every day of the window with zero where nothing was counted, oldest first', () => {
  const daily = opensByDay(
    [
      { day: '2026-11-07', opens: 5, guests: 4 },
      { day: '2026-11-03', opens: 2, guests: 2 },
      { day: '2026-10-01', opens: 9, guests: 9 },
      { day: '2026-11-08', opens: 1, guests: 1 },
    ],
    '2026-11-07',
    7,
  );
  assert.deepEqual(daily.map((d) => d.day), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  assert.deepEqual(daily.map((d) => d.opens), [0, 0, 2, 0, 0, 0, 5]);
  assert.deepEqual(daily.map((d) => d.guests), [0, 0, 2, 0, 0, 0, 4]);
  assert.equal(opensByDay([], '2026-11-07').length, 14, 'the default window');
});

test('I-29: the digest is counts only, dated in the host\u2019s zone, and names a headcount it cannot know', () => {
  const rows = fixture();
  const text = rsvpDigest({ title: 'Budi & Sari', today: '2026-11-07', zone: 'Asia/Jakarta', totals: analyticsTotals(rows), openedToday: 2 });
  assert.equal(
    text,
    [
      'Ringkasan RSVP · Budi & Sari',
      'Sabtu, 7 November 2026 (WIB)',
      '',
      'Tamu: 10',
      'Hadir: 2 tamu · 3 orang',
      '(1 jawaban hadir tanpa jumlah orang)',
      'Mungkin: 1',
      'Tidak hadir: 1',
      'Belum menjawab: 2 (sudah membuka undangan)',
      'Belum membuka: 3',
      'Dibuka hari ini: 2 tamu',
    ].join('\n'),
  );
  for (const row of rows) {
    assert.ok(!text.includes(row.name.split(' ')[1] ?? row.name), `no guest name (${row.name})`);
  }
  assert.ok(!/\d{8,}/.test(text) && !text.includes('0812'), 'no phone number');
  const known = rsvpDigest({ title: 'X', today: '2026-11-07', zone: 'Asia/Makassar', totals: analyticsTotals(rows.filter((r) => r.attendingCount !== null || r.rsvpStatus !== 'CONFIRMED')), openedToday: 0 });
  assert.ok(!known.includes('tanpa jumlah orang') && known.includes('(WITA)'));
  const share = new URL(whatsAppShareLink(text));
  assert.equal(share.origin + share.pathname, 'https://wa.me/', 'no recipient: WhatsApp asks whom to send it to');
  assert.equal(share.searchParams.get('text'), text);
});

test('B-034: each follow-up row carries the guest\u2019s personal link and the B-018 reminder in the host\u2019s message', () => {
  const rows = [
    guest({ name: 'Rina Kartika', slug: 'rina-kartika', linkToken: TOKEN, phone: '+62 812 1111 2222' }),
    guest({ name: 'Joko Susilo', slug: 'joko-susilo', phone: '021 555 1234' }),
    guest({ name: 'Wati Rahayu', slug: 'wati-rahayu', phone: null, category: ' Teman ' }),
  ];
  const items = followUpItems(rows, { origin: ORIGIN, slug: 'budi-sari', template: 'Halo {nama}, mohon konfirmasi: {link}' });
  assert.equal(items[0].link, `${ORIGIN}/i/budi-sari/${TOKEN}`, 'a tokened guest is reached by the token (B-011)');
  assert.equal(items[1].link, `${ORIGIN}/i/budi-sari/joko-susilo`);
  assert.ok('href' in items[0].whatsApp);
  const url = new URL(items[0].whatsApp.href);
  assert.equal(url.pathname, '/6281211112222');
  assert.equal(url.searchParams.get('text'), `Halo Rina Kartika, mohon konfirmasi: ${ORIGIN}/i/budi-sari/${TOKEN}`);
  assert.deepEqual(items[1].whatsApp, { hint: 'invalid' });
  assert.deepEqual(items[2].whatsApp, { hint: 'missing' });
  assert.equal(items[2].category, 'Teman');
});

test('B-034: a follow-up export is the owner\u2019s CSV with neutralised cells and the personal link', () => {
  const rows = [
    guest({ name: '=HYPERLINK("https://evil.example","klik")', slug: 'x', phone: '+62 812 1111 2222', category: '@Teman', sentAt: at('2026-11-01T02:00:00Z') }),
    guest({ name: 'Joko "JS" Susilo', slug: 'joko', openedCount: 2, openedAt: at('2026-11-06T09:00:00Z') }),
  ];
  const csv = followUpCsv(rows, followUpItems(rows, { origin: ORIGIN, slug: 'budi-sari' }));
  const lines = csv.split('\n');
  assert.equal(lines[0], FOLLOW_UP_EXPORT_HEADER.join(','));
  assert.equal(lines.length, 3);
  // B-006 neutralises every leading formula trigger, a phone's `+` included, as the full guest export does.
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""https://evil.example"",""klik"")","'+62 812 1111 2222","'@Teman","PENDING","2026-11-01T02:00:00.000Z","0","",`), lines[1]);
  assert.ok(lines[1].endsWith(`"${ORIGIN}/i/budi-sari/x"`));
  assert.ok(lines[2].includes('"Joko ""JS"" Susilo"') && lines[2].includes('"2026-11-06T09:00:00.000Z"'));
});

function props(overrides: Partial<HostInsightsProps> = {}): HostInsightsProps {
  const rows = fixture();
  const totals = analyticsTotals(rows);
  const lists = followUpLists(rows);
  const context = { origin: ORIGIN, slug: 'budi-sari', template: 'Halo {nama}: {link}' };
  const text = rsvpDigest({ title: 'Budi & Sari', today: '2026-11-07', zone: 'Asia/Jakarta', totals, openedToday: 2 });
  return {
    invitationId: 42,
    slug: 'budi-sari',
    zone: 'Asia/Jakarta',
    totals,
    groups: groupBreakdown(rows),
    events: [{ id: 'akad', title: 'Akad Nikah', counts: { PENDING: 3, CONFIRMED: 4, DECLINED: 1, MAYBE: 2 }, seats: 7, invited: 10, inviteOnly: false }],
    daily: opensByDay([{ day: '2026-11-07', opens: 6, guests: 5 }, { day: '2026-11-06', opens: 3, guests: 3 }], '2026-11-07'),
    views: { opens: 12, guestOpens: 10, anonymousOpens: 2 },
    lists: { unopened: followUpItems(lists.unopened, context), unanswered: followUpItems(lists.unanswered, context) },
    digest: { text, href: whatsAppShareLink(text) },
    ...overrides,
  };
}

test('B-034: the page shows the counts, both lists with one-tap reminders and their exports, and the digest', () => {
  const html = renderToStaticMarkup(createElement(HostInsights, props()));
  assert.match(html, /<h1[^>]*>Analitik &amp; tindak lanjut<\/h1>/);
  for (const [label, value] of [['Tamu', '10'], ['Sudah membuka', '6'], ['Sudah menjawab', '4'], ['Hadir', '3 orang'], ['Belum menjawab', '2'], ['Belum membuka', '3']]) {
    assert.match(html, new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${value}</dd>`), label);
  }
  assert.match(html, /Belum membuka <span[^>]*>\(3\)<\/span>/);
  assert.match(html, /Belum menjawab <span[^>]*>\(2\)<\/span>/);
  const reminders = [...html.matchAll(/<a href="(https:\/\/wa\.me\/[^"]+)"[^>]*>(?:(?!<\/a>).)*Ingatkan<\/a>/g)].map((m) => m[1]);
  assert.equal(reminders.length, 5, 'one reminder per follow-up guest with a usable number');
  assert.ok(reminders.every((href) => href.startsWith('https://wa.me/6281234567890?text=Halo%20')));
  assert.ok(html.includes('href="/dashboard/invitations/42/analytics?list=unopened"') && html.includes('href="/dashboard/invitations/42/analytics?list=unanswered"'));
  assert.ok(html.includes('Ditandai dikirim 1 Nov, 09.00 WIB') && html.includes('Belum ditandai dikirim'));
  assert.ok(html.includes('Terakhir dibuka 2 Nov, 17.00 WIB · 3× dibuka'), 'times in the host zone (10:00 UTC is 17.00 WIB)');
  assert.match(html, /Total 12 kunjungan: 10 dari tautan personal, 2 dari tautan umum\./);
  assert.match(html, /6 kunjungan · 5 tamu/);
  assert.match(html, /<th scope="row"[^>]*>Kantor<\/th>/);
  assert.match(html, /<th scope="row"[^>]*>Tanpa kelompok<\/th>/);
  assert.match(html, /<th scope="row"[^>]*>Akad Nikah<\/th><td[^>]*>10<\/td><td[^>]*>4 \(7\)<\/td>/);
  assert.ok(html.includes('Ringkasan RSVP · Budi &amp; Sari'));
  assert.ok(html.includes('href="https://wa.me/?text=Ringkasan%20RSVP'));
  assert.ok(html.includes('target="_blank" rel="noreferrer"'));
});

test('B-034: hostile names stay text, an impossible number shows the hint, a missing one says so, empty lists explain', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const rows = [guest({ name: hostile, phone: '123' }), guest({ name: 'ليلى', phone: null })];
  const items = followUpItems(rows, { origin: ORIGIN, slug: 'budi-sari' });
  const html = renderToStaticMarkup(createElement(HostInsights, props({ lists: { unopened: items, unanswered: [] } })));
  assert.ok(!html.includes('<img src=x') && html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('Nomor WhatsApp tidak valid'));
  assert.ok(html.includes('Tanpa nomor WhatsApp'));
  assert.match(html, /dir="auto">ليلى</);
  assert.ok(html.includes('Tidak ada tamu yang membuka undangan tanpa menjawab.'));
  assert.ok(!html.includes('analytics?list=unanswered'), 'no export link for an empty list');
  const empty = renderToStaticMarkup(createElement(HostInsights, props({ groups: [], events: [] })));
  assert.ok(empty.includes('Belum ada tamu.') && !empty.includes('Per acara'));
});

test('B-034: the page, the export and the loader are owner-scoped and reuse the B-018 builder', () => {
  const loader = source('lib/invitation/host-analytics-query.ts');
  assert.match(loader, /^import 'server-only';/);
  // B-031 (D-063) added the live-row guard to this query; the pin requires it beside the ownership (s39).
  assert.match(
    loader,
    /\.where\(and\(eq\(invitations\.id, owner\.invitationId\), eq\(invitations\.userId, owner\.userId\), isNull\(invitations\.deletedAt\)\)\)/,
    'ownership and the B-031 live-row guard are part of the invitation query',
  );
  assert.match(loader, /if \(!invitation\) return null;/);
  assert.equal((loader.match(/invitation\.id\)/g) ?? []).length, 2, 'guests and VIEW events keyed by the owned invitation only');
  assert.match(loader, /eq\(analyticsEvents\.eventType, 'VIEW'\)/);
  assert.doesNotMatch(loader, /\.(insert|update|delete)\(/, 'read-only');
  // G-044 (D-057): the owner or a co-host (`insights`), decided with the signed-in account; the loader keeps its owner
  // scope, with the owner that check resolved. Administrators are refused before the invitation is read.
  const page = source('app/(customer)/dashboard/invitations/[id]/insights/page.tsx');
  assert.match(page, /if \(!user \|\| user\.role === 'ADMIN'\) redirect\('\/sign-in'\);/);
  assert.match(page, /const access = await accessFor\(user\.id, id, 'insights'\);\s*if \(!access\) notFound\(\);/);
  assert.match(page, /loadHostAnalytics\(db, \{ userId: access\.invitation\.userId, invitationId: id \}\)/);
  assert.match(page, /if \(!data\) notFound\(\);/);
  assert.match(page, /followUpItems\(data\.lists\.unopened, context\)/);
  const route = source('app/(customer)/dashboard/invitations/[id]/analytics/route.ts');
  assert.match(route, /if \(user\.role === 'ADMIN'\) return new Response\('Forbidden', \{ status: 403 \}\);/);
  assert.match(route, /const access = await accessFor\(user\.id, id, 'insights'\);\s*if \(!access\) return new Response\('Not found', \{ status: 404 \}\);/);
  assert.match(route, /if \(list !== null\) return followUpExport\(access\.invitation\.userId, id, list\);/);
  assert.match(route, /if \(!isFollowUpKind\(list\)\) return new Response\('Unknown list', \{ status: 400 \}\);/);
  assert.match(route, /loadHostAnalytics\(db, \{ userId, invitationId: id \}\)/);
  assert.match(route, /guestExportCsv\(/, 'the full guest export is unchanged');
  const pure = source('lib/invitation/host-analytics.ts');
  assert.match(pure, /guestWhatsApp\(\{ phone: guest\.phone, name: guest\.name, link, template: context\.template \}\)/);
  assert.doesNotMatch(source('components/dashboard/host-insights.tsx'), /wa\.me/, 'the view only renders links the builders made');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/manage/manage-center.tsx'), /slug: 'analytics-export'[^}]*href: 'insights'/);
  assert.match(source('app/(customer)/dashboard/invitations/[id]/guests/page.tsx'), /href=\{`\/dashboard\/invitations\/\$\{id\}\/insights`\}/);
});
