// I-21 (D-070): the post-event memory. Pure rules (timing per audience, switches, uploads, reviews), the gated photo
// delivery with fake loaders, the section on every design family and never on the legacy layout, and source guards for
// the writers and the routes. The served behaviour is the browser acceptance recorded in E-097. Fictional data.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins some modules need at import time.
import { LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import { serveGuestPhoto, type GuestPhotoDeps } from '../lib/invitation/guest-photo-delivery';
import { receiveGuestPhoto, UPLOAD_FRAMING_BYTES, type GuestPhotoUploadDeps } from '../lib/invitation/guest-photo-upload';
import { GUEST_COPY } from '../lib/invitation/guest-copy';
import {
  EVENT_END_GRACE_MS,
  GUEST_PHOTO_EXT,
  GUEST_PHOTO_MAX_BYTES,
  guestPhotoLimit,
  guestPhotosOpen,
  invitationWritable,
  memoryOpensAt,
  memoryPhotoPath,
  memoryUploadPath,
  photoGuestIdOf,
  photoNoticeOf,
  photoNoticeQuery,
  photoReviewOf,
  photoVisibleTo,
  postEventSettings,
  postEventState,
  type PostEventMemoryView,
} from '../lib/invitation/post-event';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
function filesUnder(dir: string, pattern = /\.(ts|tsx)$/): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) return filesUnder(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

const ON = { FLAG_POST_EVENT_MEMORY: 'on' };
const AKAD = '2027-05-01T09:00:00+07:00';
const RESEPSI_END = '2027-05-01T21:00:00+07:00';
const config = (postEvent: object | undefined, extra: object = {}) =>
  ({
    theme: { familyId: 'gapura' },
    events: [
      { id: 'ev-akad', title: 'Akad (fiktif)', startAt: AKAD },
      { id: 'ev-resepsi', title: 'Resepsi (fiktif)', startAt: '2027-05-01T18:00:00+07:00', endAt: RESEPSI_END },
      { id: 'ev-keluarga', title: 'Makan keluarga (fiktif)', startAt: '2027-05-03T12:00:00+07:00', inviteOnly: true },
    ],
    postEvent,
    ...extra,
  }) as never;
const OPEN = config({ enabled: true, message: 'Terima kasih sudah hadir (fiktif)', photos: true });
const after = Date.parse(RESEPSI_END) + 1;
const published = { status: 'PUBLISHED', expiresAt: null };

test('I-21: the section is schema-checked, classified as rendered, and absent means off', () => {
  assert.ok(detailConfigSchema.safeParse({ postEvent: { enabled: true, message: 'Terima kasih', photos: true } }).success);
  assert.ok(!detailConfigSchema.safeParse({ postEvent: { enabled: true, message: 'x'.repeat(1001) } }).success, 'the message is capped at 1000');
  assert.ok(!detailConfigSchema.safeParse({ postEvent: { enabled: 'yes' } }).success, 'switches are booleans');
  // R-X7: a default would be applied to a partial save before the merge and switch off what the stored section has on.
  assert.deepEqual(detailConfigSchema.parse({ postEvent: { photos: false } }).postEvent, { photos: false }, 'no default fills a partial save');
  assert.deepEqual(RENDER_CAPABILITIES.postEvent, { rendered: ['enabled', 'message', 'photos'], storedOnly: [] });
  assert.deepEqual(postEventSettings({}), { enabled: false, message: null, photos: false });
  assert.deepEqual(postEventSettings({ postEvent: { enabled: false, photos: true } as never }), { enabled: false, message: null, photos: false }, 'photos need the memory');
  assert.deepEqual(postEventSettings({ postEvent: { enabled: true, message: '  Terima kasih  ', photos: true } as never }), { enabled: true, message: 'Terima kasih', photos: true });
});

test('I-21: the memory opens after the last event this audience may see (endAt, else start + grace), per audience (D-037)', () => {
  assert.equal(memoryOpensAt(OPEN, null, ON), Date.parse(RESEPSI_END), 'the link sees akad and resepsi; resepsi ends last');
  const invited = { invitedEventIds: ['ev-keluarga'] };
  assert.equal(memoryOpensAt(OPEN, invited, ON), Date.parse('2027-05-03T12:00:00+07:00') + EVENT_END_GRACE_MS, 'an invited guest waits for their own last event');
  assert.equal(memoryOpensAt(config({ enabled: true }, { events: [{ title: 'Tanpa tanggal' }] }), null, ON), null, 'no dated event: never opens');
  assert.equal(postEventState(OPEN, null, Date.parse(RESEPSI_END) - 1, ON), 'before');
  assert.equal(postEventState(OPEN, null, after, ON), 'open');
  assert.equal(postEventState(OPEN, invited, after, ON), 'before', 'not before the invite-only event is over for its guests');
});

test('I-21: off with the flag off (the default), the switch off, or the legacy layout (D-041)', () => {
  assert.equal(postEventState(OPEN, null, after, {}), 'off', 'FLAG_POST_EVENT_MEMORY is off by default');
  assert.equal(postEventState(OPEN, null, after, { FLAG_POST_EVENT_MEMORY: 'off' }), 'off');
  assert.equal(postEventState(config({ enabled: false, message: 'x', photos: true }), null, after, ON), 'off');
  assert.equal(postEventState(config(undefined), null, after, ON), 'off', 'an invitation from before I-21');
  assert.equal(postEventState(withFamily(OPEN, undefined), null, after, ON), 'off', 'the frozen legacy layout never shows it');
  assert.equal(postEventState(withFamily(OPEN, 'retired-family'), null, after, ON), 'off', 'a retired family reads as legacy');
});

test('I-21: a guest shares only while the memory is open, photos are on and the invitation still takes writes', () => {
  const guest = {};
  assert.equal(guestPhotosOpen({ invitation: published, config: OPEN, guest, now: after, env: ON }), true);
  assert.equal(guestPhotosOpen({ invitation: published, config: OPEN, guest, now: after - 2, env: ON }), false, 'before the event');
  assert.equal(guestPhotosOpen({ invitation: published, config: config({ enabled: true, photos: false }), guest, now: after, env: ON }), false, 'photos off');
  assert.equal(guestPhotosOpen({ invitation: { status: 'EXPIRED' }, config: OPEN, guest, now: after, env: ON }), false, 'expired');
  assert.equal(guestPhotosOpen({ invitation: { status: 'PUBLISHED', expiresAt: new Date(after - 1) }, config: OPEN, guest, now: after, env: ON }), false, 'past its expiry');
  assert.equal(invitationWritable({ status: 'DRAFT' }), false);
  assert.deepEqual(guestPhotoLimit({}), { max: 10, windowSeconds: 3600 });
  assert.deepEqual([...GUEST_PHOTO_EXT], ['jpg', 'png', 'webp'], 'still images only: no GIF, never SVG');
});

test('I-21: reviews, ownership and notices', () => {
  assert.equal(photoReviewOf({ review: 'visible' }), 'visible');
  assert.equal(photoReviewOf({ review: 'nonsense' }), 'pending', 'anything unknown is pending (shown to nobody else)');
  assert.equal(photoReviewOf(null), 'pending');
  assert.equal(photoGuestIdOf({ guestId: 7 }), 7);
  assert.equal(photoGuestIdOf({ guestId: '7' }), null);
  assert.equal(photoVisibleTo({ review: 'visible', guestId: 3 }, null), true);
  assert.equal(photoVisibleTo({ review: 'pending', guestId: 3 }, null), false, 'the link never sees a pending photo');
  assert.equal(photoVisibleTo({ review: 'hidden', guestId: 3 }, 4), false, "another guest never sees a hidden one");
  assert.equal(photoVisibleTo({ review: 'hidden', guestId: 3 }, 3), true, 'its own guest sees it, to follow and remove it');
  assert.equal(memoryPhotoPath('laras-dimas', null, 12), '/i/laras-dimas/kenangan/12');
  assert.equal(memoryPhotoPath('laras-dimas', 'budi', 12), '/i/laras-dimas/budi/kenangan/12');
  assert.equal(memoryUploadPath('laras-dimas', 'budi'), '/i/laras-dimas/budi/kenangan', 'R-X8: the upload posts to the personal link');
  assert.equal(photoNoticeQuery('sent'), 'foto=terkirim');
  assert.equal(photoNoticeOf({ foto: 'penuh' }), 'full');
  assert.equal(photoNoticeOf({ foto: '<script>' }), null);
});

function deps(overrides: Partial<GuestPhotoDeps> = {}): GuestPhotoDeps & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    locked: async () => false,
    loadPublished: async (slug) => (slug === 'laras-dimas' ? { invitation: { id: 41 }, config: OPEN } : null),
    findGuest: async (_id, segment) => (segment === 'budi' ? { id: 3 } : segment === 'sari' ? { id: 4 } : null),
    loadPhoto: async (_id, photoId) =>
      photoId === 1 ? { url: '/media/protected/41/aaaaaaaaaaaaaaaaaaaaaaaa.jpg', review: 'visible', guestId: 4 }
        : photoId === 2 ? { url: '/media/protected/41/bbbbbbbbbbbbbbbbbbbbbbbb.png', review: 'pending', guestId: 3 }
          : photoId === 3 ? { url: '/media/41/cccccccccccccccccccccccc.jpg', review: 'visible', guestId: 3 }
            : null,
    storage: { read: async (key: string) => { reads.push(key); return { body: new ReadableStream(), size: 3, contentType: key.endsWith('.png') ? 'image/png' : 'image/jpeg' }; } },
    now: after,
    env: ON,
    ...overrides,
  };
}

test('I-21: the photo route serves visible photos to the link and a guest their own, privately; everything else is 404', async () => {
  const d = deps();
  const visible = await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, d);
  assert.equal(visible.status, 200);
  assert.equal(visible.headers.get('cache-control'), 'private, no-store');
  assert.equal(visible.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(d.reads, ['protected/41/aaaaaaaaaaaaaaaaaaaaaaaa.jpg']);
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '2' }, deps())).status, 404, 'a pending photo on the link');
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', guestSlug: 'budi', photoId: '2' }, deps())).status, 200, 'its own guest sees it');
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', guestSlug: 'sari', photoId: '2' }, deps())).status, 404, 'another guest does not');
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', guestSlug: 'nobody', photoId: '1' }, deps())).status, 404, 'an unknown guest link');
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '3' }, deps())).status, 404, 'only from the protected prefix of this invitation');
  for (const photoId of ['0', 'x', '1.5', '-1', '9999999999999', '99']) assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId }, deps())).status, 404, photoId);
  assert.equal((await serveGuestPhoto({ slug: 'other', photoId: '1' }, deps())).status, 404, 'another or a deleted invitation');
  const lockedDeps = deps({ locked: async () => true });
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, lockedDeps)).status, 404, 'G-047: a locked request reads nothing');
  assert.deepEqual(lockedDeps.reads, []);
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, deps({ env: {} }))).status, 404, 'flag off');
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, deps({ now: after - 2 }))).status, 404, 'before the event');
  const photosOff = deps({ loadPublished: async () => ({ invitation: { id: 41 }, config: config({ enabled: true, photos: false }) }) });
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, photosOff)).status, 404, 'the host switched photos off');
  const legacy = deps({ loadPublished: async () => ({ invitation: { id: 41 }, config: withFamily(OPEN, undefined) }) });
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, legacy)).status, 404, 'the legacy layout (D-041)');
  const svg = deps({ storage: { read: async () => ({ body: new ReadableStream(), size: 3, contentType: 'image/svg+xml' }) } });
  assert.equal((await serveGuestPhoto({ slug: 'laras-dimas', photoId: '1' }, svg)).status, 404, 'nothing but a still image is ever served');
});

const memory = (overrides: Partial<PostEventMemoryView> = {}): PostEventMemoryView => ({
  message: 'Terima kasih sudah hadir (fiktif)',
  photosOn: true,
  photos: [
    { id: 1, src: '/i/x/budi/kenangan/1', mine: false, review: 'visible' },
    { id: 2, src: '/i/x/budi/kenangan/2', mine: true, review: 'pending' },
  ],
  upload: { action: '/i/x/budi/kenangan', remaining: 4 },
  owner: { slug: 'x', guestSlug: 'budi' },
  notice: 'sent',
  ...overrides,
});

test('I-21: every design family renders the memory in its language; the legacy layout never does', () => {
  for (const { label, familyId } of LAYOUTS) {
    for (const language of ['id', 'en'] as const) {
      const copy = GUEST_COPY[language].memory;
      const cfg = withFamily({ ...(OPEN as object), settings: { language } } as never, familyId);
      const html = renderGuestPage({ config: cfg, memory: memory() });
      if (!familyId) {
        assert.ok(!html.includes('id="kenangan"') && !html.includes(copy.heading + '<'), `${label}: nothing (D-041)`);
        continue;
      }
      assert.match(html, /<section id="kenangan" aria-labelledby="kenangan-heading"/, `${label} ${language}`);
      assert.ok(html.includes('Terima kasih sudah hadir (fiktif)'), `${label}: the host's words`);
      assert.ok(html.includes(copy.photosHeading) && html.includes(copy.pending) && html.includes(copy.remove), `${label} ${language}: photos, review, removal`);
      assert.ok(html.includes('src="/i/x/budi/kenangan/2"') && html.includes('loading="lazy"'), `${label}: photos through their route, lazily`);
      assert.match(html, /<input[^>]*name="photo"[^>]*>/, `${label}: the upload field`);
      assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
      // R-X8: a native multipart post to the route (no server action, so no 1 MB cap), with no identity in the form.
      const uploadForm = /<form[^>]*>(?:(?!<\/form>)[\s\S])*name="photo"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '';
      const formTag = /^<form[^>]*>/.exec(uploadForm)?.[0] ?? '';
      for (const attribute of [/\saction="\/i\/x\/budi\/kenangan"/, /\smethod="post"/, /\senctype="multipart\/form-data"/i]) {
        assert.match(formTag, attribute, `${label}: the upload form`);
      }
      assert.doesNotMatch(uploadForm, /type="hidden"|\$ACTION_ID_/, `${label}: the link is the identity`);
      assert.match(html, /role="status"/, `${label}: the outcome is announced`);
    }
  }
});

test('I-21: without a memory (before the event, switched off, the link of a closed invitation) the page is unchanged', () => {
  for (const { label, familyId } of LAYOUTS) {
    const cfg = withFamily(OPEN, familyId);
    assert.equal(renderGuestPage({ config: cfg }), renderGuestPage({ config: cfg, memory: null }), label);
    assert.ok(!renderGuestPage({ config: cfg }).includes('Terima kasih sudah hadir (fiktif)'), `${label}: the message never travels before it opens`);
  }
  const viewOnly = renderGuestPage({ config: withFamily(OPEN, 'kartu'), memory: memory({ upload: null, owner: null, notice: null, photos: [{ id: 1, src: '/i/x/kenangan/1', mine: false, review: 'visible' }] }) });
  assert.doesNotMatch(viewOnly, /name="photo"/, 'the invitation link only views');
  assert.ok(!viewOnly.includes(GUEST_COPY.id.memory.remove));
});

test('I-21: one writer for guest photos; the gallery, the editor and the media library never list them; the routes gate first', () => {
  const files = [...filesUnder('app'), ...filesUnder('lib'), ...filesUnder('components')];
  const writers = files.filter((path) => /type: GUEST_PHOTO_TYPE/.test(source(path)) && /\.insert\(mediaAssets\)/.test(source(path)));
  assert.deepEqual(writers, ['lib/invitation/guest-photos-db.ts']);
  for (const path of ['lib/invitation/public.ts', 'lib/invitation/service.ts', 'app/(customer)/dashboard/invitations/[id]/edit/page.tsx']) {
    assert.match(source(path), /ne\(mediaAssets\.type, GUEST_PHOTO_TYPE\)/, `${path} excludes guest photos`);
  }
  const db = source('lib/invitation/guest-photos-db.ts');
  assert.match(db, /const guestPhotosOf = \(invitationId: number\) => and\(eq\(mediaAssets\.invitationId, invitationId\), eq\(mediaAssets\.type, GUEST_PHOTO_TYPE\)\);/);
  for (const fn of ['loadGuestPhoto', 'countGuestPhotosBy', 'removeOwnGuestPhoto', 'reviewGuestPhoto', 'removeGuestPhoto', 'listGuestPhotos']) {
    const body = db.slice(db.indexOf(`export async function ${fn}(`));
    assert.match(body.slice(0, body.indexOf('\n}')), /guestPhotosOf\(invitationId\)/, `${fn} is scoped to one invitation's guest photos`);
  }
  assert.match(db.slice(db.indexOf('export async function removeOwnGuestPhoto(')), /byGuest\(guestId\)/, 'a guest deletes only their own');
  for (const path of ['app/i/[slug]/kenangan/[photoId]/route.ts', 'app/i/[slug]/[guestSlug]/kenangan/[photoId]/route.ts']) {
    assert.match(source(path), /locked: guestAccessLocked, loadPublished: loadPublishedInvitationSummary, findGuest: findGuestByLinkSegment, loadPhoto: loadGuestPhoto/, path);
  }
  assert.ok(source('lib/invitation/guest-photo-delivery.ts').indexOf('await deps.locked(') < source('lib/invitation/guest-photo-delivery.ts').indexOf('deps.loadPublished('), 'G-047 first');
});

const SAME_ORIGIN = { 'sec-fetch-site': 'same-origin', origin: 'http://app.test', host: 'app.test' };
const photoFile = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'foto.jpg', { type: 'image/jpeg' });

/** A request whose body is a FormData, or unreadable; `reads` records whether the body was ever parsed. */
function uploadRequest(headers: Record<string, string> = SAME_ORIGIN, fields: Record<string, string | File> | null = { photo: photoFile() }) {
  const reads: string[] = [];
  const request = {
    headers: new Headers(headers),
    formData: async () => {
      reads.push('body');
      if (!fields) throw new TypeError('not multipart');
      const form = new FormData();
      for (const [name, value] of Object.entries(fields)) form.append(name, value);
      return form;
    },
  } as unknown as Request;
  return { request, reads };
}

function uploadDeps(overrides: Partial<GuestPhotoUploadDeps> = {}): GuestPhotoUploadDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    locked: async (slug) => (calls.push(`locked:${slug}`), false),
    openLink: async (slug, guestSlug) => {
      calls.push(`open:${slug}/${guestSlug}`);
      return slug === 'laras-dimas' && guestSlug === 'budi' ? { invitation: { ...published, id: 41 }, guest: { id: 3 }, config: OPEN } : null;
    },
    allow: async (invitationId, guestId) => (calls.push(`allow:${invitationId}:${guestId}`), true),
    countBy: async (invitationId, guestId) => (calls.push(`count:${invitationId}:${guestId}`), 0),
    save: async (invitationId, file) => (calls.push(`save:${invitationId}:${file.name}`), `/media/protected/${invitationId}/${'a'.repeat(24)}.jpg`),
    insert: async (invitationId, guestId, url) => (calls.push(`insert:${invitationId}:${guestId}:${url}`), 9),
    revalidate: (path) => void calls.push(`revalidate:${path}`),
    now: after,
    env: ON,
    ...overrides,
  };
}
const BUDI = { slug: 'laras-dimas', guestSlug: 'budi' };
const backTo = (notice: string) => `/i/laras-dimas/budi?foto=${notice}#kenangan`;

test('I-21 (R-X8): the upload route checks origin, gate, link, opening, limit and cap before the body, then stores and returns', async () => {
  const d = uploadDeps();
  const { request, reads } = uploadRequest();
  const sent = await receiveGuestPhoto(request, BUDI, d);
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.get('location'), backTo('terkirim'));
  assert.equal(sent.headers.get('cache-control'), 'private, no-store');
  const stored = `/media/protected/41/${'a'.repeat(24)}.jpg`;
  assert.deepEqual(d.calls, ['locked:laras-dimas', 'open:laras-dimas/budi', 'allow:41:3', 'count:41:3', 'save:41:foto.jpg', `insert:41:3:${stored}`, 'revalidate:/i/laras-dimas/budi']);
  assert.deepEqual(reads, ['body'], 'the body is read once, after every check that needs only the link');

  const forged = uploadDeps();
  const fields = { photo: photoFile(), slug: 'other', guestSlug: 'sari', guestId: '4', invitationId: '99', back: 'https://evil.test' };
  const forgedAnswer = await receiveGuestPhoto(uploadRequest(SAME_ORIGIN, fields).request, BUDI, forged);
  assert.equal(forgedAnswer.headers.get('location'), backTo('terkirim'), 'the return path is the link');
  assert.ok(forged.calls.includes(`insert:41:3:${stored}`), 'identity comes from the link, never the form');
});

test('I-21 (R-X8): every refusal writes nothing, and those decided by the link never read the body', async () => {
  const refuse = async (label: string, d: GuestPhotoUploadDeps & { calls: string[] }, expected: { status: number; location?: string | null }, req = uploadRequest(), bodyRead = false) => {
    const answer = await receiveGuestPhoto(req.request, BUDI, d);
    assert.equal(answer.status, expected.status, label);
    if (expected.location !== undefined) assert.equal(answer.headers.get('location'), expected.location, label);
    assert.ok(!d.calls.some((call) => /^(save|insert|revalidate):/.test(call)), `${label}: nothing stored`);
    assert.deepEqual(req.reads, bodyRead ? ['body'] : [], `${label}: body ${bodyRead ? 'read' : 'unread'}`);
    return d.calls;
  };
  const crossSite = await refuse('another site', uploadDeps(), { status: 403, location: null }, uploadRequest({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.test', host: 'app.test' }));
  assert.deepEqual(crossSite, [], 'refused before the gate or any lookup');
  await refuse('a foreign Origin without Sec-Fetch-Site', uploadDeps(), { status: 403 }, uploadRequest({ origin: 'https://evil.test', host: 'app.test' }));
  await refuse('neither header', uploadDeps(), { status: 403 }, uploadRequest({ host: 'app.test' }));
  assert.deepEqual(await refuse('G-047 locked', uploadDeps({ locked: async () => true }), { status: 303, location: '/i/laras-dimas/budi' }), []);
  const unknown = uploadDeps();
  await receiveGuestPhoto(uploadRequest().request, { slug: 'laras-dimas', guestSlug: 'nobody' }, unknown).then((answer) => assert.equal(answer.headers.get('location'), '/i/laras-dimas/nobody?foto=tutup#kenangan'));
  assert.ok(!unknown.calls.some((call) => call.startsWith('allow:')), 'an unknown link spends no limit');
  const openWith = (config: unknown, invitation: object = published) => async () => ({ invitation: { ...invitation, id: 41 } as never, guest: { id: 3 }, config: config as never });
  await refuse('before the event', uploadDeps({ now: after - 2 }), { status: 303, location: backTo('tutup') });
  await refuse('flag off (the default)', uploadDeps({ env: {} }), { status: 303, location: backTo('tutup') });
  await refuse('photos switched off', uploadDeps({ openLink: openWith(config({ enabled: true, photos: false })) }), { status: 303, location: backTo('tutup') });
  await refuse('the legacy layout (D-041)', uploadDeps({ openLink: openWith(withFamily(OPEN, undefined)) }), { status: 303, location: backTo('tutup') });
  await refuse('an expired invitation', uploadDeps({ openLink: openWith(OPEN, { status: 'EXPIRED' }) }), { status: 303, location: backTo('tutup') });
  await refuse('past its expiry', uploadDeps({ openLink: openWith(OPEN, { status: 'PUBLISHED', expiresAt: new Date(after - 1) }) }), { status: 303, location: backTo('tutup') });
  const limited = await refuse('the upload limit', uploadDeps({ allow: async () => false }), { status: 303, location: backTo('tunggu') });
  assert.ok(!limited.some((call) => call.startsWith('count:')));
  await refuse('the photo cap', uploadDeps({ countBy: async () => 5 }), { status: 303, location: backTo('penuh') });
  const tooBig = String(GUEST_PHOTO_MAX_BYTES + UPLOAD_FRAMING_BYTES + 1);
  await refuse('a declared body larger than one photo', uploadDeps(), { status: 303, location: backTo('ditolak') }, uploadRequest({ ...SAME_ORIGIN, 'content-length': tooBig }));
  await refuse('not multipart', uploadDeps(), { status: 303, location: backTo('ditolak') }, uploadRequest(SAME_ORIGIN, null), true);
  await refuse('no file', uploadDeps(), { status: 303, location: backTo('ditolak') }, uploadRequest(SAME_ORIGIN, { photo: 'not a file' }), true);
  await refuse('a file the store refuses (type, bytes or size)', uploadDeps({ save: async () => null }), { status: 303, location: backTo('ditolak') }, uploadRequest(), true);
});

test('I-21: the upload route wires the real loaders; no server action takes a file; the removal and host actions gate first', () => {
  const route = source('app/i/[slug]/[guestSlug]/kenangan/route.ts');
  assert.match(route, /locked: guestAccessLocked,\n\s+openLink: openGuestPhotoLink,/);
  assert.match(route, /hit\(guestPhotoBucket\(invitationId, guestId\), guestPhotoLimit\(\)\)\)\.allowed/);
  assert.match(route, /saveImage\(\(ext\) => protectedInvitationMediaKey\(invitationId, ext\), file, GUEST_PHOTO_MAX_BYTES, GUEST_PHOTO_EXT\)/, 'D-040: the protected prefix');
  assert.match(route, /insert: insertGuestPhoto,/);
  const server = source('lib/invitation/post-event-server.ts');
  const open = server.slice(server.indexOf('export async function openGuestPhotoLink('));
  assert.match(open.slice(0, open.indexOf('\n}')), /eq\(invitations\.slug, slug\), liveInvitation[\s\S]*status === 'DRAFT'[\s\S]*findGuestByLinkSegment\(invitation\.id, guestSlug\)/);
  const actions = source('app/i/[slug]/actions.ts');
  assert.doesNotMatch(actions, /saveImage\(|formData\.get\('photo'\)/, 'R-X8: a server action never receives a photo (1 MB cap)');
  const remove = actions.slice(actions.indexOf('export async function removeGuestPhoto('));
  assert.ok(remove.indexOf('guestAccessLocked(slug)') < remove.indexOf('removeOwnGuestPhoto('));
  assert.match(remove, /removeOwnGuestPhoto\(invitation\.id, guest\.id, photoId\)/);
  const host = source('app/(customer)/dashboard/invitations/[id]/kenangan/actions.ts');
  assert.match(host, /eq\(invitations\.userId, user\.id\), liveInvitation/);
  assert.match(host, /if \(!user \|\| user\.role === 'ADMIN'\) redirect\('\/sign-in'\);/);
  const page = source('app/(customer)/dashboard/invitations/[id]/kenangan/page.tsx');
  assert.match(page, /if \(!isFlagOn\('POST_EVENT_MEMORY'\)\) notFound\(\);/);
  assert.match(page, /eq\(invitations\.userId, user\.id\), liveInvitation/);
});
