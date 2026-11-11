/**
 * HTTP acceptance of the children's-photo access contract (E-047 / D-040) against a running build and its database.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/invitesion UPLOAD_ROOT=<the server's upload root> \
 *     BASE_URL=http://127.0.0.1:3100 npx tsx scripts/verify-child-photo-access.ts
 *
 * Synthetic `s23r-acc-*` invitations, guests and objects are created and removed again; never point this at production.
 * What it cannot prove: a signed-in owner reading `/media/protected/*` (needs real Clerk keys and the middleware build,
 * P-INV-010). It does prove the fail-closed side: with no session (and, on a D-012 build, no middleware) that URL is a
 * private 404.
 */
import { createHash, randomBytes } from 'node:crypto';
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

async function main() {
  const base = process.env.BASE_URL;
  if (!base || !process.env.UPLOAD_ROOT) throw new Error('BASE_URL and UPLOAD_ROOT (the server\u2019s upload root) are required');
  const { client: sql } = await import('../lib/db/drizzle');
  const { LocalStorageDriver } = await import('../lib/storage/local-driver');
  const storage = new LocalStorageDriver(process.env.UPLOAD_ROOT);
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const hex = () => randomBytes(12).toString('hex');
  const get = (path: string, headers: Record<string, string> = {}) => fetch(new URL(path, base), { headers, redirect: 'manual' });
  // Next answers a bare `RSC: 1` request with a 307 to the same URL carrying its `_rsc` cache-busting hash; follow it
  // (same origin, headers kept) and insist on a Flight payload, so an empty redirect body can never pass as "clean".
  const getRsc = async (path: string) => {
    const res = await fetch(new URL(path, base), { headers: { RSC: '1' }, redirect: 'follow' });
    const text = await res.text();
    const flight = res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/x-component') && text.length > 500;
    return { res, text, flight };
  };

  const [owner] = await sql<{ id: number }[]>`SELECT id FROM users ORDER BY id LIMIT 1`;
  if (!owner) throw new Error('No user in this database');
  const tag = `s23r-acc-${Date.now().toString(36)}`;
  const inv: Record<string, { id: number; slug: string }> = {};
  const events = [{ id: 'ev-acc-1', title: 'Acara', startAt: '2027-03-01T10:00:00+07:00' }];
  for (const [name, type, status] of [['P', 'aqiqah', 'PUBLISHED'], ['Q', 'aqiqah', 'DRAFT'], ['R', 'birthday', 'PUBLISHED'], ['S', 'aqiqah', 'PUBLISHED'], ['T', 'aqiqah', 'PUBLISHED'], ['U', 'aqiqah', 'PUBLISHED']] as const) {
    const slug = `${tag}-${name.toLowerCase()}`;
    const [row] = await sql<{ id: number }[]>`INSERT INTO invitations (user_id, slug, event_type, status, config) VALUES (${owner.id}, ${slug}, ${type}, ${status}, '{}'::jsonb) RETURNING id`;
    inv[name] = { id: row.id, slug };
  }
  const bytes = { P: randomBytes(4096), R: randomBytes(3072), T: randomBytes(2048) };
  const paths = {
    P: `/media/protected/${inv.P.id}/${hex()}.jpg`,
    R: `/media/protected/${inv.R.id}/${hex()}.jpg`,
    T: `/media/${inv.T.id}/${hex()}.jpg`,
    Q: `/media/protected/${inv.Q.id}/${hex()}.jpg`,
  };
  await storage.put(paths.P.slice(7), bytes.P, 'image/jpeg');
  await storage.put(paths.R.slice(7), bytes.R, 'image/jpeg');
  await storage.put(paths.T.slice(7), bytes.T, 'image/jpeg');
  await storage.put(paths.Q.slice(7), bytes.P, 'image/jpeg');
  const honouree = (photoUrl: string, showPhoto = true) => JSON.stringify({ ceremonyProfile: { honoureeName: 'Ananda Contoh', photoUrl, showPhoto }, events });
  const setConfig = (id: number, text: string) => sql`UPDATE invitations SET config = ${text}::text::jsonb WHERE id = ${id}`;
  await setConfig(inv.P.id, honouree(paths.P));
  await setConfig(inv.Q.id, honouree(paths.Q));
  await setConfig(inv.R.id, JSON.stringify({ birthdayPerson: { fullName: 'Rara Contoh', photoUrl: paths.R, showPhoto: true }, events }));
  await setConfig(inv.S.id, honouree(paths.P));
  await setConfig(inv.T.id, honouree(paths.T));
  await setConfig(inv.U.id, honouree('https://cdn.contoh.test/anak.jpg'));
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
  for (const name of ['Q', 'R', 'S', 'T', 'U'] as const) await addGuest(inv[name].id, 'tamu-satu');
  const photo = (name: keyof typeof inv, segment: string, slot = 'honouree') => `/i/${inv[name].slug}/${segment}/photo/${slot}`;
  const privateNoStore = (res: Response) => res.headers.get('cache-control') === 'private, no-store';
  const body = async (res: Response) => Buffer.from(await res.arrayBuffer());

  try {
    // Personal link: served, private, the exact bytes.
    let res = await get(photo('P', 'tamu-satu'));
    check('P slug link: 200 with the stored bytes', res.status === 200 && sha(await body(res)) === sha(bytes.P), String(res.status));
    check('P slug link: private, no-store, noindex, nosniff', privateNoStore(res) && res.headers.get('x-robots-tag') === 'noindex' && res.headers.get('x-content-type-options') === 'nosniff');
    res = await get(photo('P', token));
    check('B-011: token link served', res.status === 200, String(res.status));
    await body(res);
    res = await get(photo('P', 'tamu-dua'));
    check('B-011: a tokened guest is not reachable by slug', res.status === 404 && privateNoStore(res), String(res.status));
    res = await get(photo('P', 'tidak-ada'));
    check('unknown guest: private 404', res.status === 404 && privateNoStore(res));
    res = await get(photo('P', 'tamu-satu', 'celebrant'));
    check('wrong slot for aqiqah: 404', res.status === 404);
    res = await get(photo('P', 'tamu-satu', 'bride'));
    check('unknown slot: 404', res.status === 404);

    // Host switch, deletion, rotation take effect on the next request.
    await setConfig(inv.P.id, honouree(paths.P, false));
    res = await get(photo('P', 'tamu-satu'));
    check('host switched off: 404 at once', res.status === 404);
    await setConfig(inv.P.id, honouree(paths.P));
    res = await get(photo('P', 'tamu-tiga'));
    check('guest before deletion: 200', res.status === 200);
    await body(res);
    await sql`DELETE FROM analytics_events WHERE guest_id = ${guests.doomed}`;
    await sql`DELETE FROM guests WHERE id = ${guests.doomed}`;
    res = await get(photo('P', 'tamu-tiga'));
    check('guest deleted: 404 at once', res.status === 404);
    const newToken = `tk${hex()}`;
    await sql`UPDATE guests SET link_token = ${newToken} WHERE id = ${guests.rotating}`;
    check('link rotated: old link 404', (await get(photo('P', rotatingToken))).status === 404);
    res = await get(photo('P', newToken));
    check('link rotated: new link 200', res.status === 200);
    await body(res);

    // Other invitations.
    check('draft invitation: 404', (await get(photo('Q', 'tamu-satu'))).status === 404);
    res = await get(photo('R', 'tamu-satu', 'celebrant'));
    check('birthday celebrant: 200 with its bytes', res.status === 200 && sha(await body(res)) === sha(bytes.R));
    check('birthday honouree slot: 404', (await get(photo('R', 'tamu-satu'))).status === 404);
    check('cross-invitation upload (S names P\u2019s photo): 404', (await get(photo('S', 'tamu-satu'))).status === 404);
    res = await get(photo('T', 'tamu-satu'));
    check('pre-D-040 public upload of its own: 200 through the route', res.status === 200 && sha(await body(res)) === sha(bytes.T));
    check('external URL: 404, never proxied', (await get(photo('U', 'tamu-satu'))).status === 404);

    // /media.
    res = await get(paths.P);
    check('/media/protected without a session: private 404 (fail closed)', res.status === 404 && privateNoStore(res), `${res.status} ${res.headers.get('cache-control')}`);
    res = await get(`/media/protected%2F${inv.P.id}%2F${paths.P.split('/').pop()}`);
    check('/media/protected with encoded slashes: 404, never the public branch', res.status === 404 && res.headers.get('cache-control') !== 'public, max-age=31536000, immutable', `${res.status} ${res.headers.get('cache-control')}`);
    res = await get(`/media/protected/0${inv.P.id}/${paths.P.split('/').pop()}`);
    check('/media/protected malformed id: 404', res.status === 404);
    res = await get(paths.T);
    check('/media public upload unchanged: 200, public year-long cache', res.status === 200 && res.headers.get('cache-control') === 'public, max-age=31536000, immutable');
    await body(res);

    // Pages: HTML and RSC.
    const storageMarks = [paths.P.split('/').pop()!.split('.')[0], '/media/protected'];
    const routeP = photo('P', 'tamu-satu');
    res = await get(`/i/${inv.P.slug}/tamu-satu`);
    const personal = await res.text();
    check('personal page HTML: the photo route', res.status === 200 && personal.includes(`src="${routeP}"`), String(res.status));
    check('personal page HTML: no storage path', storageMarks.every((m) => !personal.includes(m)));
    const rsc = await getRsc(`/i/${inv.P.slug}/tamu-satu`);
    check('personal page RSC: a Flight payload with the route and no storage path', rsc.flight && storageMarks.every((m) => !rsc.text.includes(m)) && rsc.text.includes(routeP), `${rsc.res.status} ${rsc.res.headers.get('content-type')} ${rsc.text.length}`);
    res = await get(`/i/${inv.P.slug}`);
    const publicHtml = await res.text();
    check('public page HTML: no photo, no route, no storage path', res.status === 200 && !publicHtml.includes('/photo/') && storageMarks.every((m) => !publicHtml.includes(m)), String(res.status));
    const publicRsc = await getRsc(`/i/${inv.P.slug}`);
    check('public page RSC: a Flight payload with no photo, no route, no storage path', publicRsc.flight && !publicRsc.text.includes('/photo/') && storageMarks.every((m) => !publicRsc.text.includes(m)), `${publicRsc.res.status} ${publicRsc.text.length}`);
    res = await get(`/i/${inv.S.slug}/tamu-satu`);
    const cross = await res.text();
    check('cross-invitation personal page: no photo at all', res.status === 200 && !cross.includes('/photo/') && storageMarks.every((m) => !cross.includes(m)));
    res = await get(`/i/${inv.U.slug}/tamu-satu`);
    check('external URL personal page: the URL as typed (no proxy)', (await res.text()).includes('src="https://cdn.contoh.test/anak.jpg"'));
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
    for (const path of Object.values(paths)) await storage.remove(path.slice(7));
    await sql.end({ timeout: 5 });
  }
  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll child-photo access checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
