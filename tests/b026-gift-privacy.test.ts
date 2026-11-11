// B-026 / G-021 (D-047): the gift block's copy control, the host's static QRIS image and gift details kept to personal
// guest links, as the guest receives the page (server HTML, before any script) and as the loaders and routes decide. The
// served-route half (HTML, RSC payload, metadata, the link-preview image, the calendar file and both QRIS routes on a
// production build) is `scripts/verify-gift-privacy.ts`. Fictional data only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins that `guest-blocks` (through the guest
// actions) and `lib/storage` need at import time.
import { fixtureGuest, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';
import { writeClipboard } from '../components/invitation/gift-copy';
import { GIFT_WITHHELD_TEXT } from '../components/invitation/guest-blocks';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { configForAudience, giftPersonalOnly, ownQrisUpload, withNewInvitationGiftDefaults, type GiftAudience } from '../lib/invitation/gift-privacy';
import { serveGiftQris } from '../lib/invitation/gift-qris-delivery';
import { mediaReferenceIssues } from '../lib/invitation/media-ownership';
import { paletteHex, paletteIds } from '../lib/invitation/palettes';
import { InvalidKeyError } from '../lib/storage/driver';

// The fixture invitation is id 1 with slug `budi-sari`; the fixture guest's link segment is `budi-hartono`.
const QRIS = '/media/protected/1/0123456789abcdef01234567.png';
const FOREIGN_QRIS = '/media/protected/2/0123456789abcdef01234567.png';
const NUMBER = '7351 0482 9916';
const EWALLET = '0812-5550-1234';
const HOLDER = 'Sari Pemilik Fiktif';
const NOTE = 'Catatan hadiah fiktif';
const digits = (value: string) => value.replace(/\D/g, '');

// A past event: no countdown, so two renders of one config are byte-identical.
const base: DetailConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
  gift: {
    enabled: true,
    accounts: [
      { kind: 'bank', label: 'Bank Contoh', number: NUMBER, holder: HOLDER, note: NOTE },
      { kind: 'ewallet', label: 'Dompet Contoh', number: EWALLET },
    ],
    qrisImageUrl: QRIS,
  },
};
const personalOnly: DetailConfig = { ...base, gift: { ...base.gift!, personalOnly: true } };

/** Every restricted detail, in each shape a page could carry it. */
const leaks = (html: string) =>
  [NUMBER, EWALLET, digits(NUMBER), digits(EWALLET), HOLDER, NOTE, QRIS, '/media/protected/', 'gift-qris.img', '/gift/qris', 'hadiah-nomor-'].filter((marker) =>
    html.includes(marker),
  );

const forAudience = (config: DetailConfig, audience: GiftAudience) => configForAudience(config, audience);

test('B-026: an invitation link carries no gift detail the host keeps to personal links, on every layout', () => {
  const { config, giftWithheld } = forAudience(personalOnly, 'link');
  assert.equal(giftWithheld, true);
  assert.deepEqual(config.gift, { enabled: true, personalOnly: true }, 'accounts and the QRIS reference are gone before rendering');
  assert.deepEqual(personalOnly.gift?.accounts?.length, 2, 'the stored config is not mutated');
  for (const { label, familyId } of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(config, familyId), giftWithheld });
    assert.deepEqual(leaks(html), [], `${label}: nothing restricted in the HTML`);
    assert.ok(html.includes(GIFT_WITHHELD_TEXT), `${label}: the page says where the details are`);
  }
});

test('B-026: query-free audiences: a personal link and the host preview keep every detail; the setting is off by default', () => {
  assert.deepEqual(forAudience(personalOnly, 'personal'), { config: personalOnly, giftWithheld: false });
  assert.deepEqual(forAudience(personalOnly, 'owner'), { config: personalOnly, giftWithheld: false });
  assert.deepEqual(forAudience(base, 'link'), { config: base, giftWithheld: false }, 'an invitation without the setting keeps today\u2019s visibility');
  const off = { ...personalOnly, gift: { ...personalOnly.gift!, enabled: false } };
  assert.equal(forAudience(off, 'link').giftWithheld, false, 'a switched-off section announces nothing');
  assert.equal(forAudience(off, 'link').config.gift?.accounts, undefined, 'and still carries no detail');
  assert.equal(giftPersonalOnly({}), false);
  assert.equal(giftPersonalOnly({ gift: { enabled: true } }), false);
});

test('B-026: a personal link shows the accounts, the families\u2019 copy row and the QRIS through its own route', () => {
  for (const { label, familyId } of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(personalOnly, familyId), guest: fixtureGuest() });
    assert.ok(html.includes(NUMBER) && html.includes(EWALLET) && html.includes(HOLDER), `${label}: the details`);
    assert.match(html, /<img src="\/i\/budi-sari\/budi-hartono\/gift\/qris" alt="Kode QRIS untuk tanda kasih"/, `${label}: the personal QRIS route`);
    assert.ok(!html.includes('/media/protected/'), `${label}: the storage path never reaches a guest`);
    assert.ok(!html.includes(GIFT_WITHHELD_TEXT), `${label}: no notice`);
    assert.doesNotMatch(html, />Salin</, `${label}: the copy button appears only once it can work (after hydration)`);
    if (familyId) {
      assert.match(html, new RegExp(`id="hadiah-nomor-0"[^>]*>${NUMBER}</p>`), `${label}: the number the fallback selects`);
      assert.equal(html.match(/<div class="mt-3 flex min-h-11 flex-wrap/g)?.length, 2, `${label}: one reserved copy row per number`);
    } else {
      assert.ok(!html.includes('hadiah-nomor-') && !html.includes('min-h-11 flex-wrap'), 'legacy: frozen account markup, no copy row (D-041)');
    }
  }
  const tokened = renderGuestPage({ config: withFamily(personalOnly, 'kartu'), guest: fixtureGuest({ linkToken: 'Tk9pQ2xx_-AbCdEfGh1234' }) });
  assert.match(tokened, /src="\/i\/budi-sari\/Tk9pQ2xx_-AbCdEfGh1234\/gift\/qris"/, 'an opaque link names its token, never the guest slug');
});

test('B-026: with the setting off the invitation link shows the details and the QRIS through the link route', () => {
  for (const { label, familyId } of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(base, familyId) });
    assert.ok(html.includes(NUMBER) && html.includes(HOLDER), label);
    assert.match(html, /src="\/i\/budi-sari\/gift-qris\.img"/, `${label}: the link route`);
    assert.ok(!html.includes('/media/protected/'), label);
  }
});

test('B-026: the host\u2019s preview shows every detail and the owner-only stored QRIS path', () => {
  for (const { label, familyId } of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(personalOnly, familyId), preview: true });
    assert.ok(html.includes(NUMBER), label);
    assert.ok(html.includes(`src="${QRIS}"`), `${label}: /media/protected/* answers the owner's session only (D-040)`);
  }
});

// Hashes of the pre-B-026 legacy renderer for this config (captured in s29 before any change; log
// /vercel/share/work/logs/s29-legacy-gift-hashes-before.json). D-041 freezes legacy: only a host's own choice may change it.
test('B-026 / D-041: a legacy page with gift accounts and no new setting renders byte-identically', () => {
  const legacy: DetailConfig = {
    couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
    events: [{ title: 'Resepsi', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
    gift: {
      enabled: true,
      accounts: [
        { kind: 'bank', label: 'Bank Contoh', number: '1234 5678 90', holder: 'Sari Contoh', note: 'Catatan fiktif' },
        { kind: 'ewallet', label: 'Dompet Contoh', number: '0812-0000-1111' },
        { kind: 'address', label: 'Alamat kirim kado', holder: 'Keluarga Contoh', note: 'Jl. Fiktif No. 7' },
      ],
    },
  };
  const sha = (html: string) => createHash('sha256').update(html).digest('hex');
  assert.equal(sha(renderGuestPage({ config: legacy, guest: fixtureGuest() })), '0c70a9790ee2c49ee74d0e3442c2a077975ae7623d36d05a207d13e0260bc5b7');
  assert.equal(sha(renderGuestPage({ config: legacy })), '363644024e061e52c1d9d635a386fb60b199bcbdbce93b7cdfd3506ee32a7c00');
  assert.equal(sha(renderGuestPage({ config: legacy, preview: true })), '363644024e061e52c1d9d635a386fb60b199bcbdbce93b7cdfd3506ee32a7c00');
});

test('B-026: only this invitation\u2019s protected upload renders or is delivered as its QRIS', () => {
  assert.equal(ownQrisUpload(QRIS, 1), QRIS);
  for (const value of [FOREIGN_QRIS, '/media/1/0123456789abcdef01234567.png', '', 'https://cdn.example.test/qris.png', 'javascript:alert(1)', undefined]) {
    assert.equal(ownQrisUpload(value, 1), undefined, String(value));
  }
  const foreign: DetailConfig = { ...base, gift: { enabled: true, qrisImageUrl: FOREIGN_QRIS } };
  for (const { label, familyId } of LAYOUTS) {
    assert.ok(!renderGuestPage({ config: withFamily(foreign, familyId), guest: fixtureGuest() }).includes('qris'), `${label}: another invitation's upload renders nothing`);
    const switchedOff = renderGuestPage({ config: withFamily({ ...base, gift: { ...base.gift!, enabled: false } }, familyId), guest: fixtureGuest() });
    assert.deepEqual(leaks(switchedOff), [], `${label}: a switched-off section shows nothing`);
  }
});

test('B-026: the QRIS sits on the palette\u2019s lightest surface on every palette, light or dark (B-016)', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const paletteId of paletteIds) {
    const tokens = paletteHex(paletteId);
    const [plateClass, plateHex] = tokens.scheme === 'dark' ? ['bg-(--inv-ink)', tokens.ink] : ['bg-(--inv-field)', tokens.field];
    assert.ok(luminance(plateHex) >= 0.75, `${paletteId}: ${plateHex} is a light field for dark modules`);
    const html = renderGuestPage({ config: { ...personalOnly, theme: { paletteId, familyId: 'kartu' } }, guest: fixtureGuest() });
    assert.match(html, new RegExp(`<div class="rounded-2xl ${plateClass.replace(/[()-]/g, '\\$&')} p-3 shadow-sm"><img src="/i/budi-sari/budi-hartono/gift/qris"`), `${paletteId}: the plate`);
  }
});

test('B-026: the schema takes the setting and a protected QRIS upload only', () => {
  const parse = (gift: Record<string, unknown>) => detailConfigSchema.partial().safeParse({ gift: { enabled: true, ...gift } }).success;
  assert.ok(parse({ qrisImageUrl: QRIS }));
  assert.ok(parse({ qrisImageUrl: '' }), 'the editor\u2019s "removed"');
  for (const value of ['/media/1/0123456789abcdef01234567.png', 'https://cdn.example.test/qris.png', 'javascript:alert(1)', '/media/protected/1/../x.png']) {
    assert.equal(parse({ qrisImageUrl: value }), false, value);
  }
  assert.ok(parse({ personalOnly: true }) && parse({ personalOnly: false }));
  assert.equal(parse({ personalOnly: 'yes' }), false);
});

test('B-026: save time: the QRIS must be this invitation\u2019s upload, and protected paths stay out of every other field', () => {
  const context = { invitationId: 1, eventType: 'wedding' };
  assert.deepEqual(mediaReferenceIssues({ gift: { qrisImageUrl: QRIS } }, context), []);
  assert.deepEqual(mediaReferenceIssues({ gift: { qrisImageUrl: FOREIGN_QRIS } }, context), [{ path: 'gift.qrisImageUrl', reason: 'not-this-invitation' }]);
  assert.deepEqual(mediaReferenceIssues({ theme: { cover: { imageUrl: QRIS } } }, context), [{ path: 'theme.cover.imageUrl', reason: 'protected-outside-child-photo' }]);
});

test('B-026: new invitations start with details on personal links; stored invitations keep theirs', () => {
  assert.deepEqual(withNewInvitationGiftDefaults({}), { gift: { personalOnly: true } });
  assert.deepEqual(withNewInvitationGiftDefaults({ gift: { enabled: true, accounts: [] }, music: { enabled: true } }), {
    gift: { enabled: true, accounts: [], personalOnly: true },
    music: { enabled: true },
  });
  assert.ok(detailConfigSchema.safeParse(withNewInvitationGiftDefaults({})).success, 'the default is a valid config');
});

test('B-026: the QRIS routes deliver only what the audience\u2019s config holds, never cached by a shared cache', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const stored: Record<string, DetailConfig> = {
    private: personalOnly,
    open: base,
    off: { ...base, gift: { ...base.gift!, enabled: false } },
    foreign: { ...base, gift: { ...base.gift!, qrisImageUrl: FOREIGN_QRIS } },
  };
  const objects = new Map([[QRIS.slice('/media/'.length), { contentType: 'image/png' }]]);
  const deps = (overrides: { read?: (key: string) => Promise<unknown> } = {}) => ({
    loadForAudience: async (slug: string, guestSegment?: string) => {
      const config = stored[slug];
      if (!config || (guestSegment !== undefined && guestSegment !== 'budi-hartono')) return null;
      return { invitation: { id: 1 }, config: configForAudience(config, guestSegment ? 'personal' : 'link').config };
    },
    storage: {
      read:
        (overrides.read as never) ??
        (async (key: string) => {
          const object = objects.get(key);
          return object ? { body: new Response(png).body!, size: png.length, contentType: object.contentType } : null;
        }),
    },
  });
  const status = async (params: { slug: string; guestSlug?: string }, d = deps()) => (await serveGiftQris(params, d)).status;

  const served = await serveGiftQris({ slug: 'private', guestSlug: 'budi-hartono' }, deps());
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('cache-control'), 'private, no-store');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(served.headers.get('x-robots-tag'), 'noindex');
  assert.match(served.headers.get('content-security-policy') ?? '', /\bsandbox\b/);
  // The site-wide policy (next.config.ts) is the single source; a route value never reaches the served response (s29).
  assert.equal(served.headers.get('referrer-policy'), null);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);

  assert.equal(await status({ slug: 'private' }), 404, 'the invitation link, while details stay on personal links');
  assert.equal(await status({ slug: 'open' }), 200, 'the invitation link, setting off');
  assert.equal(await status({ slug: 'open', guestSlug: 'budi-hartono' }), 200);
  assert.equal(await status({ slug: 'private', guestSlug: 'no-such-guest' }), 404, 'an unknown link');
  assert.equal(await status({ slug: 'no-such-invitation' }), 404, 'an unknown or draft invitation');
  assert.equal(await status({ slug: 'off', guestSlug: 'budi-hartono' }), 404, 'a switched-off section');
  assert.equal(await status({ slug: 'foreign', guestSlug: 'budi-hartono' }), 404, 'another invitation\u2019s upload');
  assert.equal(await status({ slug: 'open' }, deps({ read: async () => null })), 404, 'a missing file');
  assert.equal(await status({ slug: 'open' }, deps({ read: async () => { throw new InvalidKeyError('bad'); } })), 404, 'a refused key');
  assert.equal(
    await status({ slug: 'open' }, deps({ read: async () => ({ body: new Response(png).body!, size: png.length, contentType: 'application/octet-stream' }) })),
    404,
    'bytes of no known image type',
  );
  const refused = await serveGiftQris({ slug: 'private' }, deps());
  assert.equal(refused.headers.get('cache-control'), 'private, no-store', 'a refusal is not cached either');
});

test('B-026: copy writes the number exactly as stored, and reports when the Clipboard API cannot', async () => {
  const written: string[] = [];
  const clipboard = { writeText: async (text: string) => void written.push(text) };
  assert.equal(await writeClipboard(NUMBER, clipboard), true);
  assert.equal(await writeClipboard(EWALLET, clipboard), true);
  assert.deepEqual(written, [NUMBER, EWALLET], 'spaces and dashes as the host typed them');
  assert.equal(await writeClipboard(NUMBER, undefined), false, 'no Clipboard API');
  assert.equal(await writeClipboard(NUMBER, { writeText: async () => Promise.reject(new Error('NotAllowedError')) }), false, 'refused');
});

test('B-026: a QRIS upload is a PNG, JPG or WEBP by its bytes, within its size, under the protected namespace', async () => {
  const { protectedInvitationMediaKey, saveImage, setStorageDriver } = await import('../lib/storage');
  const puts: string[] = [];
  setStorageDriver({ put: async (key: string) => void puts.push(key), read: async () => null, delete: async () => {} } as never);
  try {
    const QRIS_EXT = ['png', 'jpg', 'webp'] as const;
    const file = (bytes: number[], type: string, pad = 0) => new File([Buffer.concat([Buffer.from(bytes), Buffer.alloc(pad)])], 'qris', { type });
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
    const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0];
    const save = (f: File, max = 1024 * 1024) => saveImage((ext) => protectedInvitationMediaKey(1, ext), f, max, QRIS_EXT);
    const url = await save(file(png, 'image/png', 64));
    assert.match(url ?? '', /^\/media\/protected\/1\/[0-9a-f]{24}\.png$/);
    assert.equal(await save(file(gif, 'image/gif', 64)), null, 'no GIF');
    assert.equal(await save(file(gif, 'image/png', 64)), null, 'bytes that disagree with the declared type');
    assert.equal(await save(file(png, 'image/png', 2048), 1024), null, 'over the size limit');
    assert.equal(puts.length, 1, 'only the valid image was stored');
  } finally {
    setStorageDriver(null);
  }
});
