/**
 * Database-backed acceptance of B-034 (the host's analytics and follow-up lists) on a scratch database.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/scratch npx tsx scripts/verify-host-analytics.ts
 *
 * Two fictional hosts each own one invitation. Opens go through the B-017a writer (`recordInvitationView`) at chosen
 * instants: repeats inside the 30-minute window, concurrent first opens, anonymous opens, an open one second before
 * midnight WIB and one at midnight, and one before the 14-day window. `loadHostAnalytics` is then compared with
 * independent SQL over the same rows: guest and status counts, seats, the opened guests, every VIEW, the local-day
 * buckets (and a second, JavaScript recomputation of them), both follow-up lists in order, the groups, the owner scope
 * (another host, another invitation, a missing id), the follow-up export and the rendered page. The dedupe consistency
 * check (`opened_count` equals the guest's VIEW rows) is shown to catch a duplicate written around the writer.
 * Temporary rows are removed at the end.
 */
import Module from 'node:module';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { and, eq, inArray, sql } = await import('drizzle-orm');
  const { client, db } = await import('../lib/db/drizzle');
  const { analyticsEvents, guests, invitations, users } = await import('../lib/db/schema');
  const { recordInvitationView } = await import('../lib/invitation/view-tracking');
  const { loadHostAnalytics } = await import('../lib/invitation/host-analytics-query');
  const { followUpCsv, followUpItems, localDate, rsvpDigest } = await import('../lib/invitation/host-analytics');
  const { guestWhatsApp, whatsAppShareLink } = await import('../lib/invitation/whatsapp');
  const { HostInsights } = await import('../components/dashboard/host-insights');

  const suffix = `${Date.now()}`;
  const ORIGIN = 'https://invitesion.example';
  const TEMPLATE = 'Halo {nama}, mohon konfirmasi kehadiran: {link}';
  const TOKEN = `b034${suffix}`.padEnd(22, 'x').slice(0, 22);
  const createdUsers: number[] = [];
  const createdInvitations: number[] = [];

  try {
    const [hostA, hostB] = await db
      .insert(users)
      .values([
        { email: `b034-a-${suffix}@example.com`, name: 'Host Budi' },
        { email: `b034-b-${suffix}@example.com`, name: 'Host Lain' },
      ])
      .returning({ id: users.id });
    createdUsers.push(hostA.id, hostB.id);
    const config = {
      settings: { title: 'Budi & Sari' },
      eventOperations: { timezone: 'Asia/Jakarta' },
      events: [{ title: 'Resepsi', startAt: '2026-12-12T19:00:00+07:00' }],
      whatsappTemplate: TEMPLATE,
    };
    const [mine, theirs] = await db
      .insert(invitations)
      .values([
        { userId: hostA.id, slug: `b034-mine-${suffix}`, eventType: 'wedding', status: 'PUBLISHED', config },
        { userId: hostB.id, slug: `b034-theirs-${suffix}`, eventType: 'wedding', status: 'PUBLISHED', config: { settings: { title: 'Lain' } } },
      ])
      .returning({ id: invitations.id, slug: invitations.slug });
    createdInvitations.push(mine.id, theirs.id);

    const people = [
      { name: 'Budi Hartono', category: 'Keluarga', phone: '0812-1111-0001' },
      { name: 'Sari Wulandari', category: ' Keluarga ', phone: '+62 812 1111 0002' },
      { name: 'Dewi Lestari', category: 'Kantor', phone: '0812 1111 0003' },
      { name: 'Agus Salim', category: 'Kantor', phone: '021 555 1234' },
      { name: 'Rina Kartika', category: 'Kantor', phone: '0812-1111-0005', sentAt: new Date('2026-11-01T02:00:00Z'), linkToken: TOKEN },
      { name: 'Joko Susilo', category: 'Teman', phone: '0812-1111-0006', sentAt: new Date('2026-11-01T02:00:00Z') },
      { name: 'Wati Rahayu', category: 'Teman', phone: '0812-1111-0007', sentAt: new Date('2026-11-03T02:00:00Z') },
      { name: '=HYPERLINK("https://evil.example","klik")', category: '', phone: null, sentAt: new Date('2026-11-01T02:00:00Z') },
      { name: 'Bayu Nugroho', category: null, phone: '0812-1111-0009' },
      { name: 'Citra Ayu', category: 'Teman', phone: '0812-1111-0010' },
    ];
    const rows = await db
      .insert(guests)
      .values(people.map((p, i) => ({ invitationId: mine.id, slug: `b034-${i}-${suffix}`, ...p })))
      .returning({ id: guests.id, name: guests.name });
    const id = Object.fromEntries(rows.map((r, i) => [['budi', 'sari', 'dewi', 'agus', 'rina', 'joko', 'wati', 'hostile', 'bayu', 'citra'][i], r.id])) as Record<string, number>;
    const [stranger] = await db
      .insert(guests)
      .values({ invitationId: theirs.id, slug: `b034-stranger-${suffix}`, name: 'Rahasia Tamu Lain', phone: '0812-9999-0000' })
      .returning({ id: guests.id });

    // Per link in time order, as real opens arrive: the B-017a lookup treats any later row as inside the window.
    const open = (guestId: number | null, iso: string, invitationId = mine.id) => recordInvitationView(db, invitationId, guestId, new Date(iso));
    await open(null, '2026-11-04T03:00:00Z');
    await open(id.budi, '2026-11-05T03:00:00Z');
    await open(id.budi, '2026-11-05T03:10:00Z'); // inside the window: not counted
    await open(id.budi, '2026-11-06T04:00:00Z');
    await open(id.rina, '2026-11-02T10:00:00Z');
    await open(id.rina, '2026-11-02T10:45:00Z'); // after the window: counted
    await open(id.rina, '2026-11-06T16:59:59Z'); // 23:59:59 WIB on 6 November
    await open(id.joko, '2026-11-06T17:00:00Z'); // 00:00:00 WIB on 7 November
    await open(id.dewi, '2026-11-07T01:00:00Z');
    await open(id.agus, '2026-10-01T03:00:00Z'); // before the 14-day window
    await open(id.agus, '2026-11-07T02:00:00Z');
    await open(id.agus, '2026-11-07T02:20:00Z'); // inside the window: not counted
    await Promise.all(Array.from({ length: 10 }, () => open(id.sari, '2026-11-07T05:00:00Z'))); // concurrent first opens
    await Promise.all(Array.from({ length: 3 }, () => open(null, '2026-11-07T03:00:00Z'))); // anonymous, concurrent
    await open(stranger.id, '2026-11-07T04:00:00Z', theirs.id);

    const answers: [number, string, number | null][] = [
      [id.budi, 'CONFIRMED', 3],
      [id.sari, 'CONFIRMED', null],
      [id.dewi, 'MAYBE', null],
      [id.agus, 'DECLINED', 0],
      [id.citra, 'ARCHIVED', null],
    ];
    for (const [guestId, status, attending] of answers) {
      await db.update(guests).set({ rsvpStatus: status, attendingCount: attending }).where(eq(guests.id, guestId));
    }

    const now = new Date('2026-11-07T10:00:00Z');
    const data = await loadHostAnalytics(db, { userId: hostA.id, invitationId: mine.id }, { now });
    check('the owner loads their invitation', data !== null);
    if (!data) throw new Error('no analytics for the owner');

    const one = async <T>(query: Promise<T[]>) => (await query)[0];
    const sqlCounts = await one(
      db.execute<{ guests: number; opened: number; confirmed: number; maybe: number; declined: number; pending: number; seats: number; seats_unknown: number }>(sql`
        select count(*)::int as guests, count(*) filter (where opened_count > 0)::int as opened,
          count(*) filter (where rsvp_status = 'CONFIRMED')::int as confirmed, count(*) filter (where rsvp_status = 'MAYBE')::int as maybe,
          count(*) filter (where rsvp_status = 'DECLINED')::int as declined, count(*) filter (where rsvp_status = 'PENDING')::int as pending,
          coalesce(sum(attending_count) filter (where rsvp_status = 'CONFIRMED'), 0)::int as seats,
          count(*) filter (where rsvp_status = 'CONFIRMED' and attending_count is null)::int as seats_unknown
        from guests where invitation_id = ${mine.id}`) as unknown as Promise<{ guests: number; opened: number; confirmed: number; maybe: number; declined: number; pending: number; seats: number; seats_unknown: number }[]>,
    );
    const { totals } = data;
    check('guests equal the rows', totals.guests === sqlCounts.guests && totals.guests === 10, `${totals.guests} / ${sqlCounts.guests}`);
    check('answers per status equal the rows', same(
      [totals.rsvp.counts.CONFIRMED, totals.rsvp.counts.MAYBE, totals.rsvp.counts.DECLINED, totals.rsvp.counts.PENDING],
      [sqlCounts.confirmed, sqlCounts.maybe, sqlCounts.declined, sqlCounts.pending],
    ), JSON.stringify(totals.rsvp.counts));
    check('seats and unknown headcounts equal the rows', totals.rsvp.seats === sqlCounts.seats && totals.rsvp.seatsUnknown === sqlCounts.seats_unknown && totals.rsvp.seats === 3,
      `${totals.rsvp.seats} + ${totals.rsvp.seatsUnknown} unknown`);
    const viewers = await one(db.execute(sql`select count(distinct guest_id)::int as n from analytics_events where invitation_id = ${mine.id} and event_type = 'VIEW'`) as unknown as Promise<{ n: number }[]>);
    check('opened guests equal the distinct guests with a VIEW (B-017a)', totals.opened === sqlCounts.opened && totals.opened === viewers.n && totals.opened === 6,
      `${totals.opened} / ${sqlCounts.opened} / ${viewers.n}`);

    const consistency = async () =>
      (await one(db.execute(sql`
        select count(*)::int as n from guests g where g.invitation_id = ${mine.id}
          and g.opened_count <> (select count(*) from analytics_events e where e.guest_id = g.id and e.event_type = 'VIEW')`) as unknown as Promise<{ n: number }[]>)).n;
    check('dedupe consistency: every opened_count equals that guest\u2019s VIEW rows', (await consistency()) === 0);
    const sqlViews = await one(db.execute(sql`
      select count(*)::int as opens, count(guest_id)::int as guest_opens from analytics_events where invitation_id = ${mine.id} and event_type = 'VIEW'`) as unknown as Promise<{ opens: number; guest_opens: number }[]>);
    check('every counted VIEW: deduped, concurrent and anonymous opens as written', data.views.opens === sqlViews.opens && data.views.guestOpens === sqlViews.guest_opens && data.views.opens === 12 && data.views.anonymousOpens === 2,
      JSON.stringify(data.views));

    const rawViews = await db
      .select({ guestId: analyticsEvents.guestId, createdAt: analyticsEvents.createdAt })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.invitationId, mine.id), eq(analyticsEvents.eventType, 'VIEW')));
    const jsDaily = new Map<string, { opens: number; guests: Set<number> }>();
    for (const view of rawViews) {
      const day = localDate(view.createdAt, 'Asia/Jakarta');
      const entry = jsDaily.get(day) ?? { opens: 0, guests: new Set<number>() };
      entry.opens += 1;
      if (view.guestId) entry.guests.add(view.guestId);
      jsDaily.set(day, entry);
    }
    const sqlDaily = (await db.execute(sql`
      select to_char(((created_at at time zone 'UTC') at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') as day, count(*)::int as opens,
        count(distinct guest_id)::int as guests
      from analytics_events where invitation_id = ${mine.id} and event_type = 'VIEW' group by 1`)) as unknown as { day: string; opens: number; guests: number }[];
    const loaded = new Map(data.daily.map((d) => [d.day, d]));
    const mismatchedDays = data.daily.filter((d) => {
      const s = sqlDaily.find((row) => row.day === d.day) ?? { opens: 0, guests: 0 };
      const j = jsDaily.get(d.day);
      return d.opens !== s.opens || d.guests !== s.guests || d.opens !== (j?.opens ?? 0) || d.guests !== (j?.guests.size ?? 0);
    });
    check('local days equal SQL and a JavaScript recount over the 14-day window', mismatchedDays.length === 0 && data.daily.length === 14 && data.daily[13].day === '2026-11-07',
      mismatchedDays.map((d) => d.day).join(', '));
    check('one second before midnight WIB is 6 November, midnight is 7 November', same(loaded.get('2026-11-06'), { day: '2026-11-06', opens: 2, guests: 2 }) && same(loaded.get('2026-11-07'), { day: '2026-11-07', opens: 5, guests: 4 }),
      `${JSON.stringify(loaded.get('2026-11-06'))} ${JSON.stringify(loaded.get('2026-11-07'))}`);
    check('an open before the window counts in the totals, not in the days', !loaded.has('2026-10-01') && data.daily.reduce((n, d) => n + d.opens, 0) === data.views.opens - 1);
    check('opened today is the distinct guests today', data.openedToday === 4, String(data.openedToday));

    const order = async (where: ReturnType<typeof sql>, orderBy: ReturnType<typeof sql>) =>
      ((await db.execute(sql`select id from guests where invitation_id = ${mine.id} and ${where} order by ${orderBy}`)) as unknown as { id: number }[]).map((r) => r.id);
    const unopened = await order(sql`rsvp_status = 'PENDING' and opened_count = 0`, sql`sent_at asc nulls last, name collate "C", id`);
    const unanswered = await order(sql`rsvp_status = 'PENDING' and opened_count > 0`, sql`opened_at asc, name collate "C", id`);
    check('unopened list: unanswered guests never opened, longest-sent first', same(data.lists.unopened.map((g) => g.id), unopened) && same(unopened, [id.hostile, id.wati, id.bayu]),
      data.lists.unopened.map((g) => g.name).join(' | '));
    check('unanswered list: opened without an answer, opened longest ago first', same(data.lists.unanswered.map((g) => g.id), unanswered) && same(unanswered, [id.rina, id.joko]),
      data.lists.unanswered.map((g) => g.name).join(' | '));
    check('totals agree with the lists', totals.unopened === unopened.length && totals.unanswered === unanswered.length && totals.answered === 4);

    const sqlGroups = (await db.execute(sql`
      select nullif(btrim(category), '') as grp, count(*)::int as n from guests where invitation_id = ${mine.id} group by 1`)) as unknown as { grp: string | null; n: number }[];
    const groupsMatch = sqlGroups.length === data.groups.length && sqlGroups.every((s) => data.groups.find((g) => g.group === s.grp)?.guests === s.n);
    check('groups equal the trimmed categories, blank ones together', groupsMatch && same(data.groups.map((g) => g.group), ['Kantor', 'Keluarga', 'Teman', null]),
      data.groups.map((g) => `${g.group}:${g.guests}`).join(', '));

    check('another host gets nothing for this invitation', (await loadHostAnalytics(db, { userId: hostB.id, invitationId: mine.id }, { now })) === null);
    check('this host gets nothing for another host\u2019s invitation', (await loadHostAnalytics(db, { userId: hostA.id, invitationId: theirs.id }, { now })) === null);
    check('a missing or malformed id gets nothing', (await loadHostAnalytics(db, { userId: hostA.id, invitationId: 2147483646 }, { now })) === null &&
      (await loadHostAnalytics(db, { userId: hostA.id, invitationId: Number.NaN }, { now })) === null);
    const exists = await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.id, mine.id));
    check('control: the invitation exists, so the null above is the owner scope', exists.length === 1);
    const theirsData = await loadHostAnalytics(db, { userId: hostB.id, invitationId: theirs.id }, { now });
    check('the other host sees only their own guest and open', theirsData?.totals.guests === 1 && theirsData.views.opens === 1);

    const context = { origin: ORIGIN, slug: mine.slug, template: data.whatsappTemplate };
    const items = { unopened: followUpItems(data.lists.unopened, context), unanswered: followUpItems(data.lists.unanswered, context) };
    const csv = followUpCsv(data.lists.unanswered, items.unanswered);
    const csvLines = csv.split('\n');
    check('the unanswered export lists both guests with their personal links', csvLines.length === 3 && csvLines[1].includes(`/i/${mine.slug}/${TOKEN}`) && csvLines[2].includes(`/i/${mine.slug}/b034-5-${suffix}`),
      `${csvLines.length - 1} rows`);
    const hostileCsv = followUpCsv(data.lists.unopened, items.unopened);
    check('the unopened export neutralises a formula name', hostileCsv.includes(`"'=HYPERLINK(""https://evil.example"",""klik"")"`));

    const text = rsvpDigest({ title: data.invitation.title, today: data.today, zone: data.zone, totals, openedToday: data.openedToday });
    const html = renderToStaticMarkup(
      createElement(HostInsights, {
        invitationId: mine.id,
        slug: mine.slug,
        zone: data.zone,
        totals,
        groups: data.groups,
        events: data.events,
        daily: data.daily,
        views: data.views,
        lists: items,
        digest: { text, href: whatsAppShareLink(text) },
      }),
    );
    const rina = guestWhatsApp({ phone: '0812-1111-0005', name: 'Rina Kartika', link: `${ORIGIN}/i/${mine.slug}/${TOKEN}`, template: TEMPLATE });
    check('the page renders Rina\u2019s reminder exactly as the B-018 builder makes it', 'href' in rina && html.includes(`href="${rina.href.replace(/&/g, '&amp;')}"`));
    check('the page renders no guest of another invitation', !html.includes('Rahasia Tamu Lain') && !csv.includes('Rahasia') && !hostileCsv.includes('Rahasia'));
    check('the digest is counts only', text.includes('Tamu: 10') && text.includes('Hadir: 2 tamu · 3 orang') && !rows.some((r) => text.includes(r.name)), text.split('\n')[1]);

    // Negative control: a duplicate VIEW written around the writer must be caught by the consistency check.
    const [stray] = await db.insert(analyticsEvents).values({ invitationId: mine.id, guestId: id.budi, eventType: 'VIEW', createdAt: new Date('2026-11-05T03:05:00Z') }).returning({ id: analyticsEvents.id });
    const caught = await consistency();
    await db.delete(analyticsEvents).where(eq(analyticsEvents.id, stray.id));
    check('negative control: a VIEW written around the writer is caught, and clean again once removed', caught === 1 && (await consistency()) === 0, `mismatches ${caught}`);
  } finally {
    if (createdInvitations.length) {
      await db.delete(analyticsEvents).where(inArray(analyticsEvents.invitationId, createdInvitations));
      await db.delete(guests).where(inArray(guests.invitationId, createdInvitations));
      await db.delete(invitations).where(inArray(invitations.id, createdInvitations));
    }
    if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
    await client.end();
  }
  console.log(failures ? `verify-host-analytics: ${failures} FAILED` : 'verify-host-analytics: all checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
