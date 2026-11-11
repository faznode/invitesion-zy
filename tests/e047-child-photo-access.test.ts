// E-047 completed under D-040 (s23r): children's photos behind an access contract, not only unrendered. Protected
// storage namespace, owner-only `/media/protected/*`, personal-link photo route, ownership at save / render / delivery.
// Fictional data and fake storage only; no network, database or Clerk.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { serveGuestChildPhoto, type GuestChildPhotoDeps } from '../lib/invitation/child-photo-delivery';
import { guestLinkSegment } from '../lib/invitation/guest-link';
import { isProtectedMediaPath, mediaPathInvitationId, safeChildPhotoSrc, safeImageSrc } from '../lib/invitation/image-url';
import { childPhotoField, mediaReferenceIssues } from '../lib/invitation/media-ownership';
import { childPhotoSrcFor, childPhotoUpload } from '../lib/invitation/portraits';
import { guestChildPhotoPath } from '../lib/invitation/public-path';
import { InvalidKeyError, assertSafeKey, type StoredObjectRead } from '../lib/storage/driver';
import { classifyMediaKey, serveMedia } from '../lib/storage/serve-media';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;

const HEX = '0123456789abcdef01234567';
const PROTECTED = `/media/protected/1/${HEX}.jpg`;
const LEGACY = `/media/1/${HEX}.png`;
const OTHER_INVITATION = `/media/protected/2/${HEX}.jpg`;
const OTHER_LEGACY = `/media/2/${HEX}.png`;
const AVATAR = `/media/avatars/1/${HEX}.png`;
const EXTERNAL = 'https://cdn.contoh.test/anak.jpg';
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** A storage driver over an in-memory map that records which keys were read. */
function fakeStorage(objects: Record<string, string> = {}) {
  const reads: string[] = [];
  return {
    reads,
    async read(key: string): Promise<StoredObjectRead | null> {
      assertSafeKey(key);
      reads.push(key);
      if (!(key in objects)) return null;
      const bytes = new TextEncoder().encode(objects[key]);
      return {
        body: new ReadableStream({ start: (c) => { c.enqueue(bytes); c.close(); } }),
        size: bytes.length,
        contentType: objects[key] === 'blob' ? 'application/octet-stream' : 'image/jpeg',
      };
    },
  };
}

// ── Paths ─────────────────────────────────────────────────────

test('D-040 paths: protected uploads are recognised exactly, carry their invitation, and are never a public image source', async () => {
  assert.ok(isProtectedMediaPath(PROTECTED));
  for (const bad of [
    `/media/protected/01/${HEX}.jpg`, `/media/protected/1/${HEX.toUpperCase()}.jpg`, `/media/protected/1/${HEX}0.jpg`,
    `/media/protected/1/${HEX}.svg`, `/media/protected/avatars/1/${HEX}.jpg`, `/media/protected/1/x/${HEX}.jpg`,
    `/media/protected/1/${HEX}.jpg?x=1`, `/media/protected//1/${HEX}.jpg`, `/media/protected/../1/${HEX}.jpg`,
  ]) assert.equal(isProtectedMediaPath(bad), false, bad);
  assert.equal(mediaPathInvitationId(PROTECTED), 1);
  assert.equal(mediaPathInvitationId(LEGACY), 1);
  assert.equal(mediaPathInvitationId(AVATAR), null, 'an avatar belongs to a user, not an invitation');
  assert.equal(mediaPathInvitationId(EXTERNAL), null);
  assert.equal(safeImageSrc(PROTECTED), undefined, 'no public field may render a protected path');
  assert.equal(safeChildPhotoSrc(PROTECTED), PROTECTED);
  assert.equal(safeChildPhotoSrc('javascript:alert(1)'), undefined);

  const { mediaUrl, protectedInvitationMediaKey, ALLOWED_IMAGE_EXT } = await import('../lib/storage');
  for (const ext of Object.values(ALLOWED_IMAGE_EXT)) {
    const url = mediaUrl(protectedInvitationMediaKey(42, ext));
    assert.ok(isProtectedMediaPath(url) && mediaPathInvitationId(url) === 42, url);
  }
});

// ── /media ────────────────────────────────────────────────────

test('/media audience: decided on the joined key, so an encoded slash cannot reach the public branch', () => {
  assert.deepEqual(classifyMediaKey(['1', `${HEX}.png`]), { kind: 'public', key: `1/${HEX}.png` });
  assert.deepEqual(classifyMediaKey(['protected', '1', `${HEX}.jpg`]), { kind: 'protected', key: `protected/1/${HEX}.jpg`, invitationId: 1 });
  assert.deepEqual(classifyMediaKey([`protected/1/${HEX}.jpg`]), { kind: 'protected', key: `protected/1/${HEX}.jpg`, invitationId: 1 }, '%2F decoded into one segment');
  for (const segments of [[], ['protected'], ['protected', '1'], ['protected', 'avatars', '1', `${HEX}.png`], ['protected', '1', 'notes.txt'], ['protected', '01', `${HEX}.jpg`]]) {
    assert.deepEqual(classifyMediaKey(segments), { kind: 'refused' }, segments.join('/'));
  }
});

test('/media public: unchanged, cacheable for a year, sandboxed; malformed keys 400, missing and unknown types 404', async () => {
  const storage = fakeStorage({ [`1/${HEX}.png`]: 'img', [`1/${'f'.repeat(24)}.png`]: 'blob' });
  const ownerMayRead = async () => { throw new Error('never consulted for public media'); };
  const ok = await serveMedia(['1', `${HEX}.png`], { storage, ownerMayRead });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.match(ok.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal((await serveMedia(['1', '..', 'x.png'], { storage, ownerMayRead })).status, 400);
  assert.equal((await serveMedia(['1', `${'a'.repeat(24)}.png`], { storage, ownerMayRead })).status, 404);
  assert.equal((await serveMedia(['1', `${'f'.repeat(24)}.png`], { storage, ownerMayRead })).status, 404);
});

test('/media protected: the owner gets it privately; anyone else, and every failed check, gets a 404 before any read', async () => {
  const key = `protected/1/${HEX}.jpg`;
  const owner = fakeStorage({ [key]: 'img' });
  const served = await serveMedia(['protected', '1', `${HEX}.jpg`], { storage: owner, ownerMayRead: async (id) => id === 1 });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('cache-control'), 'private, no-store');
  assert.equal(served.headers.get('x-robots-tag'), 'noindex');
  assert.equal(await served.text(), 'img');

  const asked: number[] = [];
  for (const [label, ownerMayRead] of [
    ['signed out / not the owner', async (id: number) => { asked.push(id); return false; }],
    ['no Clerk middleware (auth throws)', async () => { throw new Error('clerkMiddleware not detected'); }],
    ['database down', async () => { throw new Error('ECONNREFUSED'); }],
  ] as const) {
    const storage = fakeStorage({ [key]: 'img' });
    const errors: unknown[] = [];
    const refused = await serveMedia([`protected/1/${HEX}.jpg`], { storage, ownerMayRead, onAccessCheckError: (e) => errors.push(e) });
    assert.equal(refused.status, 404, label);
    assert.equal(refused.headers.get('cache-control'), 'private, no-store', label);
    assert.deepEqual(storage.reads, [], `${label}: nothing read`);
    if (label !== 'signed out / not the owner') assert.equal(errors.length, 1, `${label}: reported`);
  }
  assert.deepEqual(asked, [1]);
  const missing = await serveMedia(['protected', '1', `${'b'.repeat(24)}.jpg`], { storage: owner, ownerMayRead: async () => true });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'private, no-store');
});

// ── Personal-link photo route ────────────────────����────────────

type Summary = Awaited<ReturnType<GuestChildPhotoDeps['loadPublished']>>;
function guestDeps(config: DetailConfig, opts: { eventType?: string; draft?: boolean; guest?: boolean; objects?: Record<string, string> } = {}) {
  const storage = fakeStorage(opts.objects ?? { [`protected/1/${HEX}.jpg`]: 'child', [`1/${HEX}.png`]: 'legacy', [`2/${HEX}.png`]: 'other', [`protected/2/${HEX}.jpg`]: 'other', [`avatars/1/${HEX}.png`]: 'avatar' });
  const segments: string[] = [];
  const summary: Summary = opts.draft ? null : { invitation: { id: 1, eventType: opts.eventType ?? 'aqiqah' }, config };
  const deps: GuestChildPhotoDeps = {
    loadPublished: async (slug) => (slug === 'budi-sari' ? summary : null),
    findGuest: async (_id, segment) => { segments.push(segment); return opts.guest === false ? null : { id: 7 }; },
    storage,
  };
  return { deps, storage, segments };
}
const honouree = (photoUrl: string, showPhoto: boolean | undefined = true): DetailConfig => ({ ceremonyProfile: { photoUrl, showPhoto } });
const params = (slot = 'honouree') => ({ slug: 'budi-sari', guestSlug: 'budi-hartono', slot });

test('photo route: a valid personal link gets its protected or pre-D-040 photo, private and uncached', async () => {
  for (const [src, body] of [[PROTECTED, 'child'], [LEGACY, 'legacy']] as const) {
    const { deps, storage, segments } = guestDeps(honouree(src));
    const res = await serveGuestChildPhoto(params(), deps);
    assert.equal(res.status, 200, src);
    assert.equal(await res.text(), body);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.deepEqual(storage.reads, [src.slice('/media/'.length)]);
    assert.deepEqual(segments, ['budi-hartono'], 'the link segment goes to the B-011 lookup as given');
  }
  const birthday = guestDeps({ birthdayPerson: { photoUrl: PROTECTED, showPhoto: true } }, { eventType: 'birthday' });
  assert.equal((await serveGuestChildPhoto(params('celebrant'), birthday.deps)).status, 200);
});

test('photo route: every refusal is a private 404 and reads nothing it should not', async () => {
  const cases: [string, ReturnType<typeof guestDeps>, ReturnType<typeof params>][] = [
    ['unknown slot', guestDeps(honouree(PROTECTED)), params('bride')],
    ['draft or missing invitation', guestDeps(honouree(PROTECTED), { draft: true }), params()],
    ['unknown, deleted or rotated guest link', guestDeps(honouree(PROTECTED), { guest: false }), params()],
    ['host switched the photo off', guestDeps({ ceremonyProfile: { photoUrl: PROTECTED } }), params()],
    ['host switched the photo off explicitly', guestDeps(honouree(PROTECTED, false)), params()],
    ['slot of another event type (celebrant on aqiqah)', guestDeps(honouree(PROTECTED)), params('celebrant')],
    ['honouree on a tasyakuran (an adult, public)', guestDeps(honouree(PROTECTED), { eventType: 'tasyakuran' }), params()],
    ['honouree on a wedding', guestDeps(honouree(PROTECTED), { eventType: 'wedding' }), params()],
    ['another invitation\u2019s protected upload', guestDeps(honouree(OTHER_INVITATION)), params()],
    ['another invitation\u2019s public upload', guestDeps(honouree(OTHER_LEGACY)), params()],
    ['a user\u2019s avatar', guestDeps(honouree(AVATAR)), params()],
    ['an external URL (never proxied)', guestDeps(honouree(EXTERNAL)), params()],
    ['a malformed path', guestDeps(honouree('/media/protected/1/../2/x.jpg')), params()],
    ['a missing object', guestDeps(honouree(PROTECTED), { objects: {} }), params()],
  ];
  for (const [label, { deps, storage }, p] of cases) {
    const res = await serveGuestChildPhoto(p, deps);
    assert.equal(res.status, 404, label);
    assert.equal(res.headers.get('cache-control'), 'private, no-store', label);
    if (label !== 'a missing object') assert.deepEqual(storage.reads, [], `${label}: nothing read`);
  }
  const wrongSlug = guestDeps(honouree(PROTECTED));
  assert.equal((await serveGuestChildPhoto({ ...params(), slug: 'lain' }, wrongSlug.deps)).status, 404);
  assert.deepEqual(wrongSlug.segments, [], 'no guest lookup without a published invitation');
});

test('photo route: B-011 token links and legacy slug links both reach the lookup unchanged', async () => {
  const token = fixtureGuest({ linkToken: 'tkn-8f3a2c' });
  assert.equal(guestLinkSegment(token), 'tkn-8f3a2c');
  assert.equal(guestChildPhotoPath('budi-sari', guestLinkSegment(token), 'honouree'), '/i/budi-sari/tkn-8f3a2c/photo/honouree');
  const { deps, segments } = guestDeps(honouree(PROTECTED));
  await serveGuestChildPhoto({ slug: 'budi-sari', guestSlug: 'tkn-8f3a2c', slot: 'honouree' }, deps);
  assert.deepEqual(segments, ['tkn-8f3a2c']);
});

// ── Render ────────────────────────────────────────────────────

test('render rule: external URLs as typed; other invitations\u2019 uploads and avatars dropped; preview keeps the path', () => {
  const ctx = { invitationId: 1, preview: false, guestPhotoPath: '/i/budi-sari/budi-hartono/photo/honouree' };
  assert.equal(childPhotoSrcFor(PROTECTED, ctx), ctx.guestPhotoPath);
  assert.equal(childPhotoSrcFor(LEGACY, ctx), ctx.guestPhotoPath);
  assert.equal(childPhotoSrcFor(EXTERNAL, ctx), EXTERNAL);
  for (const foreign of [OTHER_INVITATION, OTHER_LEGACY, AVATAR]) {
    assert.equal(childPhotoSrcFor(foreign, ctx), undefined, foreign);
    assert.equal(childPhotoSrcFor(foreign, { ...ctx, preview: true }), undefined, `${foreign} (preview)`);
  }
  assert.equal(childPhotoSrcFor(PROTECTED, { invitationId: 1, preview: true }), PROTECTED);
  assert.equal(childPhotoSrcFor(PROTECTED, { invitationId: 1, preview: false }), undefined, 'no personal link, no photo');
  assert.equal(childPhotoUpload('aqiqah', honouree(PROTECTED), 'honouree', 1), PROTECTED);
  assert.equal(childPhotoUpload('aqiqah', honouree(PROTECTED), 'honouree', 2), undefined);
});

test('every layout and child type: personal pages carry only the photo route, public pages nothing, the preview the stored path', () => {
  const types: [string, 'celebrant' | 'honouree', DetailConfig][] = [
    ['aqiqah', 'honouree', { ceremonyProfile: { honoureeName: 'Ananda Contoh', photoUrl: PROTECTED, showPhoto: true } }],
    ['khitanan', 'honouree', { ceremonyProfile: { honoureeName: 'Ananda Contoh', photoUrl: PROTECTED, showPhoto: true } }],
    ['birthday', 'celebrant', { birthdayPerson: { fullName: 'Rara Contoh', photoUrl: PROTECTED, showPhoto: true } }],
  ];
  const events = [{ id: 'ev-1', title: 'Acara', startAt: '2027-01-04T19:00:00+08:00' }];
  for (const [eventType, slot, base] of types) {
    const invitation = fixtureInvitation({ eventType });
    const guest = fixtureGuest({ linkToken: 'tkn-8f3a2c' });
    const route = guestChildPhotoPath(invitation.slug, guestLinkSegment(guest), slot);
    for (const layout of LAYOUTS) {
      const cfg = withFamily({ ...base, events }, layout.familyId);
      const label = `${eventType} / ${layout.label}`;
      const personal = renderGuestPage({ config: cfg, invitation, guest });
      assert.ok(personal.includes(`src="${route}"`), `${label}: photo route`);
      assert.ok(!personal.includes('/media/protected') && !personal.includes(HEX), `${label}: no storage path on a personal page`);
      const publicPage = renderGuestPage({ config: cfg, invitation, guest: null });
      assert.ok(!publicPage.includes('/media/') && !publicPage.includes('/photo/') && !publicPage.includes(HEX), `${label}: public page`);
      assert.ok(renderGuestPage({ config: cfg, invitation, guest: null, preview: true }).includes(`src="${PROTECTED}"`), `${label}: preview`);
      const foreign = JSON.parse(JSON.stringify(cfg).replaceAll(PROTECTED, OTHER_INVITATION)) as DetailConfig;
      for (const page of [renderGuestPage({ config: foreign, invitation, guest }), renderGuestPage({ config: foreign, invitation, guest: null, preview: true })]) {
        assert.ok(!page.includes(HEX) && !page.includes('/photo/'), `${label}: another invitation\u2019s upload renders nothing`);
      }
    }
  }
  const tasyakuran = renderGuestPage({ config: { ceremonyProfile: { photoUrl: PROTECTED }, events }, invitation: fixtureInvitation({ eventType: 'tasyakuran' }) });
  assert.ok(!tasyakuran.includes(HEX), 'a protected path never renders on an adult\u2019s public profile');
});

// ── Save ──────────────────────────────────────────────────────

test('save: the schema takes a protected path in the child-photo fields only', () => {
  const parse = (config: Record<string, unknown>) => detailConfigSchema.partial().safeParse(config);
  assert.ok(parse({ birthdayPerson: { photoUrl: PROTECTED } }).success);
  assert.ok(parse({ ceremonyProfile: { photoUrl: PROTECTED } }).success);
  for (const config of [{ theme: { cover: { imageUrl: PROTECTED } } }, { corporateProfile: { logoUrl: PROTECTED } }, { couple: { bride: { photoUrl: PROTECTED } } }]) {
    assert.equal(parse(config).success, false, JSON.stringify(config));
  }
});

test('save: ownership and placement the schema cannot see, reported for touched sections only, by path not value', () => {
  assert.equal(childPhotoField('birthday'), 'birthdayPerson.photoUrl');
  assert.equal(childPhotoField('khitanan'), 'ceremonyProfile.photoUrl');
  assert.equal(childPhotoField('tasyakuran'), null);
  const at = (config: unknown, eventType: string, touchedSections?: string[]) =>
    mediaReferenceIssues(config, { invitationId: 1, eventType, touchedSections }).map((i) => `${i.path}:${i.reason}`);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: PROTECTED } }, 'aqiqah'), []);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: LEGACY } }, 'aqiqah'), []);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: EXTERNAL } }, 'aqiqah'), []);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: OTHER_INVITATION } }, 'aqiqah'), ['ceremonyProfile.photoUrl:not-this-invitation']);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: OTHER_LEGACY } }, 'khitanan'), ['ceremonyProfile.photoUrl:not-this-invitation']);
  assert.deepEqual(at({ birthdayPerson: { photoUrl: AVATAR } }, 'birthday'), ['birthdayPerson.photoUrl:not-this-invitation']);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: PROTECTED } }, 'tasyakuran'), ['ceremonyProfile.photoUrl:protected-outside-child-photo']);
  assert.deepEqual(at({ birthdayPerson: { photoUrl: PROTECTED } }, 'aqiqah'), ['birthdayPerson.photoUrl:protected-outside-child-photo']);
  assert.deepEqual(at({ theme: { cover: { imageUrl: PROTECTED } }, gallery: { items: [PROTECTED] } }, 'aqiqah'), [
    'theme.cover.imageUrl:protected-outside-child-photo', 'gallery.items.0:protected-outside-child-photo',
  ]);
  assert.deepEqual(at({ ceremonyProfile: { photoUrl: OTHER_LEGACY }, quote: { text: 'x' } }, 'aqiqah', ['quote']), [], 'an untouched legacy value never blocks another section');
  // s32 (B-035): the save-time check moved into the content writers' shared decision, judged on the locked row's event
  // type for the sections the save sent (the facade passes `Object.keys(patch)`); the Rust writer runs the same vectors.
  const rules = read('lib/invitation/content-rules.ts');
  assert.match(rules, /mediaReferenceIssues\(input\.config, \{\s*invitationId: input\.invitationId,\s*eventType: input\.eventType,\s*touchedSections: input\.touchedSections,\s*\}\)/);
  assert.match(read('lib/invitation/content.ts'), /touchedSections: Object\.keys\(input\.patch\)/);
  assert.match(read('lib/invitation/content-next.ts'), /eventType: row\.eventType,/);
  assert.match(read('app/api/invitations/[id]/detail/route.ts'), /case 'media':\s*return apiError\(400, 'INVALID_MEDIA'/);
});

// ── Wiring ────────────────────────────────────────────────────

test('wiring: the Clerk proxy covers /media/protected (its general matcher skips images), uploads pick the namespace by purpose', () => {
  // F-01: Next 16 names the file proxy.ts. Only one of the two conventions may exist, and a Proxy may not declare a
  // runtime (Next 16 refuses to build it).
  assert.equal(existsSync(join(process.cwd(), 'middleware.ts')), false, 'middleware.ts is gone');
  const proxy = read('proxy.ts');
  assert.ok(proxy.includes("'/media/protected/(.*)'"), 'explicit matcher');
  assert.match(proxy, /if \(pathname\.startsWith\('\/media\/protected\/'\)\) return NextResponse\.next\(\);/);
  assert.doesNotMatch(proxy, /^\s*runtime\s*:/m, 'no runtime key on a Proxy');
  const general = new RegExp('^/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js)$).*)$');
  assert.equal(general.test(`/media/protected/1/${HEX}.jpg`), false, 'the general pattern alone would never run Clerk here');
  const upload = read('app/api/invitations/[id]/upload/route.ts');
  assert.match(upload, /purpose === 'child-photo' \? protectedInvitationMediaKey : invitationMediaKey/);
  assert.match(upload, /purpose !== null && purpose !== 'child-photo'/);
  const editor = read('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.deepEqual(
    [...editor.matchAll(/<ImageUpload label="([^"]+)" purpose="child-photo".*?patch\('(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`),
    ['Foto bayi:ceremonyProfile', 'Foto anak:ceremonyProfile', 'Foto:birthdayPerson'],
    'aqiqah, khitanan and birthday fields',
  );
  // B-026 (D-047): the host's static QRIS image is the one other protected upload, on the gift tab, stored under the
  // protected namespace by its own branch of the upload route.
  assert.deepEqual(
    [...editor.matchAll(/<ImageUpload label="([^"]+)" purpose="gift-qris".*?patch\('(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`),
    ['Gambar QRIS statis (opsional):gift'],
    'the gift tab\u2019s QRIS field',
  );
  assert.match(upload, /if \(purpose === 'gift-qris'\) \{[\s\S]*?saveImage\(\(ext\) => protectedInvitationMediaKey\(id, ext\), file, QRIS_MAX_BYTES, QRIS_IMAGE_EXT\)/);
  assert.equal([...editor.matchAll(/<ImageUpload label="[^"]+" purpose=/g)].length, 4, 'no other upload field is protected');
  assert.equal([...editor.matchAll(/<ImageUpload /g)].length, 9, 'nine upload fields in all (B-032 added the memorial photo)');
  assert.ok(!/label="Foto \(opsional\)" purpose=/.test(editor), 'the tasyakuran and memorial (adult) photos stay public');
  assert.equal([...editor.matchAll(/<ImageUpload label="Foto \(opsional\)" invitationId=/g)].length, 2, 'both adult photos');
  assert.match(read('app/media/[...path]/route.ts'), /user\.role === 'ADMIN'\) return false/);
  assert.throws(() => assertSafeKey('protected/../1/x.png'), InvalidKeyError);
});
