/**
 * HTTP acceptance of B-026 / G-021 (D-047) against a running build and its database: gift details a host keeps to personal
 * guest links never leave the server for any other audience, and the host's static QRIS image is delivered only through
 * the route for an audience that may see it.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/<scratch> UPLOAD_ROOT=<the server's upload root> \
 *     BASE_URL=http://127.0.0.1:3100 npx tsx scripts/verify-gift-privacy.ts
 *
 * The render half (every layout, the D-041 legacy bytes, the schema, the copy control) is `tests/b026-gift-privacy.test.ts`.
 * This half asks the served routes: page HTML and the RSC payload, the metadata in the HTML head, the calendar file, the
 * link-preview image, both QRIS routes and `/media/protected`, for personal, opaque-token, legacy, invalid and draft links,
 * with query parameters that try to impersonate a guest or the host. Synthetic `s29-gift-*` invitations, guests and
 * objects with fictional details are created and removed again; never point this at production.
 *
 * What it cannot prove: a signed-in host's preview and upload (real Clerk keys, DA-01). It proves the fail-closed side:
 * without a session the preview shows nothing and `/media/protected/*` is a private 404. The preview's render is unit-tested.
 */
import { createHash, randomBytes } from 'node:crypto';
import Module from 'node:module';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}

// The notice the invitation link shows instead of withheld details (components/invitation/guest-blocks.tsx).
const WITHHELD = 'Detail rekening dan QRIS hanya tampil di tautan undangan pribadi';
const NUMBER = '7351 0482 9916';
const EWALLET = '0812-5550-1234';
const HOLDER = 'Sari Pemilik Fiktif';
const NOTE = 'Catatan hadiah fiktif';
const LEGACY_NUMBER = '4410 2270 3385';
const digits = (value: string) => value.replace(/\D/g, '');

async function main() {
  const base = process.env.BASE_URL;
  if (!base || !process.env.UPLOAD_ROOT) throw new Error('BASE_URL and UPLOAD_ROOT (the server\u2019s upload root) are required');
  const { client: sql } = await import('../lib/db/drizzle');
  const { LocalStorageDriver } = await import('../lib/storage/local-driver');
  const storage = new LocalStorageDriver(process.env.UPLOAD_ROOT);
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const hex = () => randomBytes(12).toString('hex');
  const get = (path: string, headers: Record<string, string> = {}) => fetch(new URL(path, base), { headers, redirect: 'manual' });
  // Next answers a bare `RSC: 1` request with a 307 to the same URL carrying its `_rsc` hash; follow it and insist on a
  // Flight payload, so an empty redirect body can never pass as "clean" (s23r).
  const getRsc = async (path: string) => {
    const res = await fetch(new URL(path, base), { headers: { RSC: '1' }, redirect: 'follow' });
    const text = await res.text();
    const flight = res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/x-component') && text.length > 500;
    return { res, text, flight };
  };
  const body = async (res: Response) => Buffer.from(await res.arrayBuffer());
  const privateNoStore = (res: Response) => res.headers.get('cache-control') === 'private, no-store';

  const [owner] = await sql<{ id: number }[]>`SELECT id FROM users ORDER BY id LIMIT 1`;
  if (!owner) throw new Error('No user in this database');
  const tag = `s29-gift-${Date.now().toString(36)}`;
  const inv: Record<string, { id: number; slug: string }> = {};
  for (const [name, status] of [['P', 'PUBLISHED'], ['O', 'PUBLISHED'], ['L', 'PUBLISHED'], ['X', 'PUBLISHED'], ['D', 'DRAFT'], ['G', 'PUBLISHED']] as const) {
    const slug = `${tag}-${name.toLowerCase()}`;
    const [row] = await sql<{ id: number }[]>`INSERT INTO invitations (user_id, slug, event_type, status, config) VALUES (${owner.id}, ${slug}, 'wedding', ${status}, '{}'::jsonb) RETURNING id`;
    inv[name] = { id: row.id, slug };
  }
  const png = (size: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(size)]);
  const bytes = { P: png(3000), O: png(2000), D: png(1000), G: png(1500) };
  const file = { P: `${hex()}.png`, O: `${hex()}.png`, D: `${hex()}.png`, G: `${hex()}.png` };
  const paths = {
    P: `/media/protected/${inv.P.id}/${file.P}`,
    O: `/media/protected/${inv.O.id}/${file.O}`,
    D: `/media/protected/${inv.D.id}/${file.D}`,
    G: `/media/protected/${inv.G.id}/${file.G}`,
  };
  for (const name of ['P', 'O', 'D', 'G'] as const) await storage.put(paths[name].slice('/media/'.length), bytes[name], 'image/png');

  const events = [{ id: 'ev-gift-1', title: 'Resepsi', startAt: '2027-03-06T19:00:00+07:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }];
  const couple = { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } };
  const accounts = [
    { kind: 'bank', label: 'Bank Contoh', number: NUMBER, holder: HOLDER, note: NOTE },
    { kind: 'ewallet', label: 'Dompet Contoh', number: EWALLET },
  ];
  type Gift = { enabled: boolean; accounts?: unknown[]; personalOnly?: boolean; qrisImageUrl?: string };
  const config = (gift: Gift, familyId?: string) => JSON.stringify({ couple, events, gift, ...(familyId ? { theme: { familyId } } : {}) });
  const setConfig = (id: number, text: string) => sql`UPDATE invitations SET config = ${text}::text::jsonb WHERE id = ${id}`;
  const configs = {
    P: config({ enabled: true, personalOnly: true, accounts, qrisImageUrl: paths.P }, 'kartu'),
    O: config({ enabled: true, personalOnly: false, accounts, qrisImageUrl: paths.O }, 'gapura'),
    // Stored before B-026: accounts and no `personalOnly` key; the legacy layout.
    L: config({ enabled: true, accounts: [{ kind: 'bank', label: 'Bank Lama', number: LEGACY_NUMBER, holder: 'Pemilik Lama' }] }),
    // Names another invitation's upload as its QRIS.
    X: config({ enabled: true, personalOnly: false, accounts, qrisImageUrl: paths.P }, 'riang'),
    D: config({ enabled: true, personalOnly: false, accounts, qrisImageUrl: paths.D }, 'lontar'),
    // Personal-only on the legacy layout.
    G: config({ enabled: true, personalOnly: true, accounts, qrisImageUrl: paths.G }),
  };
  for (const name of Object.keys(configs) as (keyof typeof configs)[]) await setConfig(inv[name].id, configs[name]);

  const addGuest = async (invitationId: number, slug: string, linkToken: string | null = null) =>
    (await sql<{ id: number }[]>`INSERT INTO guests (invitation_id, name, slug, link_token) VALUES (${invitationId}, 'Tamu Contoh', ${slug}, ${linkToken}) RETURNING id`)[0].id;
  const token = `tk${hex()}`;
  const guests = {
    plain: await addGuest(inv.P.id, 'tamu-satu'),
    tokened: await addGuest(inv.P.id, 'tamu-dua', token),
    doomed: await addGuest(inv.P.id, 'tamu-tiga'),
    rotating: await addGuest(inv.P.id, 'tamu-empat', `tk${hex()}`),
  };
  const rotatingToken = (await sql<{ t: string }[]>`SELECT link_token AS t FROM guests WHERE id = ${guests.rotating}`)[0].t;
  for (const name of ['O', 'L', 'X', 'D', 'G'] as const) await addGuest(inv[name].id, 'tamu-satu');

  const page = (name: keyof typeof inv, segment?: string) => `/i/${inv[name].slug}${segment ? `/${segment}` : ''}`;
  const linkQris = (name: keyof typeof inv) => `/i/${inv[name].slug}/gift-qris.img`;
  const guestQris = (name: keyof typeof inv, segment: string) => `/i/${inv[name].slug}/${segment}/gift/qris`;
  /**
   * Every restricted detail of P / O / G in each shape a response could carry it. QRIS references are this invitation's
   * own routes: the bare segment names are public route structure, which Next's router tree lists on every guest page.
   */
  const restricted: (string | RegExp)[] = [
    NUMBER, EWALLET, digits(NUMBER), digits(EWALLET), HOLDER, NOTE, file.P, file.O, file.G, '/media/protected', 'hadiah-nomor-',
    ...(['P', 'O', 'G'] as const).flatMap((name) => [linkQris(name), new RegExp(`/i/${inv[name].slug}/[^/"\\\\\\s]+/gift/qris`)]),
  ];
  const findLeak = (text: string, marker: string | RegExp) => (typeof marker === 'string' ? text.indexOf(marker) : text.search(marker));
  const leaks = (text: string) => restricted.filter((marker) => findLeak(text, marker) >= 0).map(String);
  const clean = (text: string) => leaks(text).length === 0;
  /** The leaked markers, each with the text around its first occurrence, for a failing check's detail. */
  const leakContext = (text: string) =>
    restricted
      .filter((marker) => findLeak(text, marker) >= 0)
      .map((marker) => {
        const at = findLeak(text, marker);
        return `${String(marker)} in …${text.slice(Math.max(0, at - 90), at + 120).replace(/\s+/g, ' ')}…`;
      })
      .join(' | ');

  try {
    // 1. P keeps its details to personal links: the invitation link carries none of them, anywhere.
    let res = await get(page('P'));
    let html = await res.text();
    check('P invitation link HTML: no account, holder, note, QRIS route or storage path', res.status === 200 && clean(html), `${res.status} ${leaks(html).join(',')}`);
    check('P invitation link HTML: says where the details are', html.includes(WITHHELD));
    const head = html.slice(0, Math.max(0, html.indexOf('</head>')));
    check('P invitation link metadata (head): nothing restricted, preview image named', head.length > 0 && clean(head) && head.includes('/og.png'), `${head.length}`);
    let rsc = await getRsc(page('P'));
    check('P invitation link RSC: a Flight payload with nothing restricted', rsc.flight && clean(rsc.text), `${rsc.res.status} ${rsc.text.length} ${leaks(rsc.text).join(',')}`);
    res = await get(`${page('P')}/calendar.ics`);
    const ics = await res.text();
    check('P calendar file: served, nothing restricted', res.status === 200 && ics.includes('BEGIN:VCALENDAR') && clean(ics), `${res.status} ${leaks(ics).join(',')}`);
    res = await get(`${page('P')}/og.png`);
    const og = await body(res);
    check('P link-preview image: an image built from the invitation link\u2019s config', res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('image/png') && og.length > 1000 && clean(og.toString('latin1')), `${res.status} ${og.length}`);
    res = await get(linkQris('P'));
    check('P QRIS through the invitation link: private 404', res.status === 404 && privateNoStore(res), String(res.status));
    await body(res);

    // 2. Query parameters never change the audience.
    for (const query of [`guest=tamu-satu`, `to=tamu-satu`, `guestSlug=tamu-satu`, `token=${token}`, `preview=1`, `ownerPreview=true&owner=1`, `rsvp=saved&rsvpk=x`]) {
      res = await get(`${page('P')}?${query}`);
      html = await res.text();
      check(`P invitation link ?${query.split('=')[0]}: nothing restricted`, res.status === 200 && clean(html) && html.includes(WITHHELD), `${res.status} ${leaks(html).join(',')}`);
    }
    rsc = await getRsc(`${page('P')}?guest=tamu-satu&preview=1`);
    check('P invitation link RSC with impersonating query: nothing restricted', rsc.flight && clean(rsc.text), `${rsc.res.status} ${rsc.text.length}`);
    res = await get(`${linkQris('P')}?guest=tamu-satu&preview=1`);
    check('P QRIS through the invitation link with impersonating query: 404', res.status === 404, String(res.status));
    await body(res);
    res = await get(`${guestQris('P', 'tidak-ada')}?guest=tamu-satu`);
    check('QRIS for an unknown guest with impersonating query: 404', res.status === 404, String(res.status));
    await body(res);

    // 3. Personal links: the details, the copy rows and the QRIS through the guest's own route; never the storage path.
    res = await get(page('P', 'tamu-satu'));
    html = await res.text();
    check('P personal link HTML: accounts, holder and note', res.status === 200 && [NUMBER, EWALLET, HOLDER, NOTE].every((m) => html.includes(m)), String(res.status));
    check('P personal link HTML: the QRIS through its own route', html.includes(`src="${guestQris('P', 'tamu-satu')}"`));
    check('P personal link HTML: one copy row per number, no notice, no storage path', html.includes('id="hadiah-nomor-0"') && html.includes('id="hadiah-nomor-1"') && !html.includes(WITHHELD) && !html.includes('/media/protected'));
    rsc = await getRsc(page('P', 'tamu-satu'));
    check('P personal link RSC: the details and the route, no storage path', rsc.flight && rsc.text.includes(NUMBER) && rsc.text.includes(guestQris('P', 'tamu-satu')) && !rsc.text.includes('/media/protected'), `${rsc.res.status} ${rsc.text.length}`);
    res = await get(guestQris('P', 'tamu-satu'));
    check('P QRIS through the personal link: 200 with the stored bytes', res.status === 200 && sha(await body(res)) === sha(bytes.P), String(res.status));
    const qrisHeaders = ['content-type', 'cache-control', 'x-content-type-options', 'x-robots-tag', 'referrer-policy', 'content-security-policy'].map(
      (name) => `${name}=${res.headers.get(name)}`,
    );
    // The referrer policy is the site-wide one (next.config.ts), which replaces any route value on the served response.
    check(
      'P QRIS headers: image/png, private no-store, nosniff, noindex, sandboxed, the site-wide referrer policy',
      res.headers.get('content-type') === 'image/png' && privateNoStore(res) && res.headers.get('x-content-type-options') === 'nosniff' && res.headers.get('x-robots-tag') === 'noindex' && res.headers.get('referrer-policy') === 'strict-origin-when-cross-origin' && (res.headers.get('content-security-policy') ?? '').includes('sandbox'),
      qrisHeaders.join('; '),
    );
    res = await get(page('P', token));
    html = await res.text();
    check('B-011: the opaque-token link shows the details and its own QRIS route', res.status === 200 && html.includes(NUMBER) && html.includes(`src="${guestQris('P', token)}"`) && !html.includes('tamu-dua/gift'), String(res.status));
    res = await get(guestQris('P', token));
    check('B-011: QRIS through the token link: 200', res.status === 200 && sha(await body(res)) === sha(bytes.P), String(res.status));
    res = await get(page('P', 'tamu-dua'));
    check('B-011: a tokened guest is not reachable by slug (page 404)', res.status === 404, String(res.status));
    await body(res);
    res = await get(guestQris('P', 'tamu-dua'));
    check('B-011: nor their QRIS (private 404)', res.status === 404 && privateNoStore(res), String(res.status));
    await body(res);
    res = await get(page('P', 'tidak-ada'));
    check('unknown guest: page 404', res.status === 404, String(res.status));
    await body(res);
    res = await get(guestQris('P', 'tidak-ada'));
    check('unknown guest: QRIS private 404', res.status === 404 && privateNoStore(res), String(res.status));
    await body(res);

    // 4. G: the same setting on the legacy layout.
    res = await get(page('G'));
    html = await res.text();
    check('G legacy layout, invitation link: nothing restricted, the notice', res.status === 200 && clean(html) && html.includes(WITHHELD), `${res.status} ${leaks(html).join(',')}`);
    rsc = await getRsc(page('G'));
    check('G legacy layout, invitation link RSC: nothing restricted', rsc.flight && clean(rsc.text), `${rsc.res.status} ${rsc.text.length}`);
    res = await get(page('G', 'tamu-satu'));
    html = await res.text();
    check('G legacy layout, personal link: the details and the QRIS route, no copy row (D-041)', res.status === 200 && html.includes(NUMBER) && html.includes(`src="${guestQris('G', 'tamu-satu')}"`) && !html.includes('hadiah-nomor-'), String(res.status));
    res = await get(guestQris('G', 'tamu-satu'));
    check('G QRIS through the personal link: 200 with its bytes', res.status === 200 && sha(await body(res)) === sha(bytes.G), String(res.status));

    // 5. O: setting off, so the invitation link keeps today's visibility and its own QRIS route.
    res = await get(page('O'));
    html = await res.text();
    check('O setting off, invitation link: the details and the link QRIS route', res.status === 200 && html.includes(NUMBER) && html.includes(`src="${linkQris('O')}"`) && !html.includes(WITHHELD) && !html.includes('/media/protected'), String(res.status));
    res = await get(linkQris('O'));
    check('O QRIS through the invitation link: 200 with its bytes', res.status === 200 && sha(await body(res)) === sha(bytes.O) && privateNoStore(res), String(res.status));
    res = await get(guestQris('O', 'tamu-satu'));
    check('O QRIS through a personal link: 200', res.status === 200 && sha(await body(res)) === sha(bytes.O), String(res.status));

    // 6. L: stored before B-026 (no setting), legacy markup: today's visibility, no notice, no copy row.
    res = await get(page('L'));
    html = await res.text();
    check('L pre-B-026 invitation: the invitation link keeps its account (today\u2019s visibility)', res.status === 200 && html.includes(LEGACY_NUMBER) && !html.includes(WITHHELD) && !html.includes('hadiah-nomor-'), String(res.status));
    res = await get(linkQris('L'));
    check('L has no QRIS: 404', res.status === 404, String(res.status));
    await body(res);

    // 7. X names P's upload: nothing renders or is delivered, through either route.
    res = await get(page('X', 'tamu-satu'));
    html = await res.text();
    check('X cross-invitation QRIS: the personal page shows no QRIS and no storage path', res.status === 200 && !html.includes('/gift/qris') && !html.includes('/media/protected') && !html.includes(file.P), String(res.status));
    for (const path of [linkQris('X'), guestQris('X', 'tamu-satu')]) {
      res = await get(path);
      check(`X cross-invitation QRIS ${path.endsWith('.img') ? 'link' : 'personal'} route: 404`, res.status === 404, String(res.status));
      await body(res);
    }

    // 8. D is a draft: nothing is public.
    for (const [label, path] of [
      ['invitation link', page('D')],
      ['personal link', page('D', 'tamu-satu')],
      ['link QRIS', linkQris('D')],
      ['personal QRIS', guestQris('D', 'tamu-satu')],
    ] as const) {
      res = await get(path);
      check(`D draft ${label}: 404`, res.status === 404, String(res.status));
      await body(res);
    }

    // 9. The host's switches, a deleted guest and a rotated link take effect on the next request.
    const pGift = JSON.parse(configs.P).gift as Gift;
    await setConfig(inv.P.id, config({ ...pGift, enabled: false }, 'kartu'));
    res = await get(guestQris('P', 'tamu-satu'));
    check('host switched the gift section off: personal QRIS 404 at once', res.status === 404, String(res.status));
    await body(res);
    res = await get(page('P', 'tamu-satu'));
    html = await res.text();
    check('host switched the gift section off: the personal page shows nothing', res.status === 200 && clean(html), leakContext(html));
    await setConfig(inv.P.id, config({ ...pGift, qrisImageUrl: '' }, 'kartu'));
    res = await get(guestQris('P', 'tamu-satu'));
    check('host removed the QRIS: personal QRIS 404 at once', res.status === 404, String(res.status));
    await body(res);
    await setConfig(inv.P.id, configs.P);
    const oGift = JSON.parse(configs.O).gift as Gift;
    await setConfig(inv.O.id, config({ ...oGift, personalOnly: true }, 'gapura'));
    res = await get(linkQris('O'));
    check('host turned the setting on: the link QRIS 404 at once', res.status === 404, String(res.status));
    await body(res);
    res = await get(page('O'));
    html = await res.text();
    check('host turned the setting on: the invitation link loses the details at once', res.status === 200 && clean(html) && html.includes(WITHHELD), leaks(html).join(','));
    res = await get(guestQris('P', 'tamu-tiga'));
    check('guest before deletion: QRIS 200', res.status === 200, String(res.status));
    await body(res);
    await sql`DELETE FROM analytics_events WHERE guest_id = ${guests.doomed}`;
    await sql`DELETE FROM guests WHERE id = ${guests.doomed}`;
    res = await get(guestQris('P', 'tamu-tiga'));
    check('guest deleted: QRIS 404 at once', res.status === 404, String(res.status));
    await body(res);
    const newToken = `tk${hex()}`;
    await sql`UPDATE guests SET link_token = ${newToken} WHERE id = ${guests.rotating}`;
    res = await get(guestQris('P', rotatingToken));
    check('link rotated: the old link\u2019s QRIS 404', res.status === 404, String(res.status));
    await body(res);
    res = await get(guestQris('P', newToken));
    check('link rotated: the new link\u2019s QRIS 200', res.status === 200, String(res.status));
    await body(res);

    // 10. Direct media access and the host's preview, without a session: fail closed.
    res = await get(paths.P);
    check('/media/protected (the QRIS upload) without a session: private 404', res.status === 404 && privateNoStore(res), `${res.status} ${res.headers.get('cache-control')}`);
    await body(res);
    res = await get(`/media/protected%2F${inv.P.id}%2F${file.P}`);
    check('/media/protected with encoded slashes: 404, never the public branch', res.status === 404 && res.headers.get('cache-control') !== 'public, max-age=31536000, immutable', `${res.status}`);
    await body(res);
    res = await get(`/preview/${inv.P.id}`);
    const preview = await res.text();
    check('host preview without a session: no page and nothing restricted', res.status !== 200 && clean(preview), `${res.status} ${res.headers.get('location') ?? ''}`);
  } finally {
    const ids = Object.values(inv).map((i) => i.id);
    // Page views record their VIEW event after the response (best-effort tracking), so one may land after a first delete.
    for (let attempt = 0; ; attempt++) {
      await sql`DELETE FROM analytics_events WHERE invitation_id = ANY(${ids}) OR guest_id IN (SELECT id FROM guests WHERE invitation_id = ANY(${ids}))`;
      try {
        await sql`DELETE FROM guests WHERE invitation_id = ANY(${ids})`;
        break;
      } catch (error) {
        if (attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    await sql`DELETE FROM invitation_versions WHERE invitation_id = ANY(${ids})`;
    await sql`DELETE FROM invitations WHERE id = ANY(${ids})`;
    for (const path of Object.values(paths)) await storage.remove(path.slice('/media/'.length));
    await sql.end({ timeout: 5 });
  }
  console.log(failures ? `\n${failures} check(s) FAILED, ${passes} passed.` : `\nAll ${passes} gift-privacy checks passed.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
