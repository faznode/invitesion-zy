// B-023 (G-026, D-049): the couple's full profiles on the design families (full name, parents line with the child order,
// photo; each when filled, a photo no longer required); the legacy layout stays byte-identical (D-041). Fictional people.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily, withoutReadingToggle, withoutSectionMarkers, withoutShareActions } from './support/render-guest-page';
import { buildGuestView } from '../components/invitation/guest-view';
import type { Guest } from '../lib/db/schema';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS } from '../lib/invitation/families';
import { coupleProfiles, couplePortraits } from '../lib/invitation/portraits';

const BRIDE = '/media/1/0123456789abcdef0123456a.png';
const GROOM = '/media/1/0123456789abcdef0123456b.png';
const events: DetailConfig['events'] = [{ title: 'Resepsi', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }];
const bride = { fullName: 'Sari Lestari', nickName: 'Sari', parents: 'Bapak Contoh & Ibu Sampel', order: 2 };
const groom = { fullName: 'Budi Hartono', nickName: 'Budi', parents: 'Bapak Rekaan & Ibu Fiktif', order: 1 };
const configs = {
  noPhoto: { couple: { bride, groom }, events },
  onePhoto: { couple: { bride: { ...bride, photoUrl: BRIDE }, groom }, events },
  bothPhotos: { couple: { bride: { ...bride, photoUrl: BRIDE }, groom: { ...groom, photoUrl: GROOM }, displayOrder: 'groom-first' }, events },
  nicknamesOnly: { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }, events },
} satisfies Record<string, DetailConfig>;
const sha = (html: string) => createHash('sha256').update(html).digest('hex');
const families = LAYOUTS.filter((layout) => layout.familyId);
const view = (config: DetailConfig, eventType = 'wedding', guest: Guest | null = fixtureGuest()) =>
  buildGuestView({ invitation: fixtureInvitation({ eventType }), config, guest, media: [], messages: [], readOnly: false, status: {} });

test('B-023: the section opens only for what the headline does not already say', () => {
  assert.equal(coupleProfiles({ bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }), null, 'nicknames: the headline says it');
  assert.equal(coupleProfiles({ bride: { fullName: 'Sari Lestari' }, groom: { fullName: 'Budi Hartono' } }), null, 'full names without nicknames: the headline shows them');
  assert.equal(coupleProfiles({ bride: { fullName: 'Sari', nickName: ' Sari ' } }), null, 'the same name twice');
  assert.equal(coupleProfiles({ bride: { order: 2 }, groom: { order: 1 } }), null, 'a child order without parents has no line');
  assert.equal(coupleProfiles({}), null);
  assert.deepEqual(coupleProfiles({ bride: { fullName: 'Sari Lestari', nickName: 'Sari' } })?.people, [{ key: 'bride', name: 'Sari Lestari', caption: undefined }]);
  assert.deepEqual(coupleProfiles({ groom: { nickName: 'Budi', parents: 'Bapak Rekaan', order: 3 } })?.people, [{ key: 'groom', name: 'Budi', caption: 'Putra ketiga dari Bapak Rekaan' }]);
  assert.equal(coupleProfiles({ bride: { photoUrl: BRIDE } })?.people[0].alt, 'Foto mempelai wanita');
});

test('B-023: both sides with a name or a photo, in the host\u2019s order; a side with neither renders nothing', () => {
  const profiles = coupleProfiles({ bride: { ...bride, photoUrl: BRIDE }, groom: { nickName: 'Budi' }, displayOrder: 'groom-first' });
  assert.equal(profiles?.heading, 'Mempelai');
  assert.deepEqual(profiles?.people.map((p) => [p.key, p.name, p.caption, p.src]), [
    ['groom', 'Budi', undefined, undefined],
    ['bride', 'Sari Lestari', 'Putri kedua dari Bapak Contoh & Ibu Sampel', BRIDE],
  ]);
  // A parents line with no name and no photo describes no one.
  assert.deepEqual(coupleProfiles({ bride, groom: { parents: 'Bapak Rekaan' } })?.people.map((p) => p.key), ['bride']);
  // An unusable photo URL is dropped and the side stays as text.
  assert.deepEqual(coupleProfiles({ bride: { ...bride, photoUrl: 'javascript:alert(1)' } })?.people, [
    { key: 'bride', name: 'Sari Lestari', caption: 'Putri kedua dari Bapak Contoh & Ibu Sampel' },
  ]);
  // With both photos the profiles are the D-038 portraits.
  const both = { bride: { ...bride, photoUrl: BRIDE }, groom: { ...groom, photoUrl: GROOM } };
  const fields = (people: { key: string; src?: string; alt?: string; name?: string; caption?: string }[] = []) => people.map(({ key, src, alt, name, caption }) => ({ key, src, alt, name, caption }));
  assert.deepEqual(fields(coupleProfiles(both)?.people), fields(couplePortraits(both)?.people));
});

test('B-023: every family renders filled profiles without a photo, and nothing for nicknames alone', () => {
  for (const { label, familyId } of families) {
    for (const guest of [fixtureGuest(), null]) {
      const html = renderGuestPage({ config: withFamily(configs.noPhoto, familyId), guest });
      assert.ok(html.includes('>Mempelai<'), `${label}: section heading`);
      for (const text of ['Sari Lestari', 'Budi Hartono', 'Putri kedua dari Bapak Contoh &amp; Ibu Sampel', 'Putra pertama dari Bapak Rekaan &amp; Ibu Fiktif']) {
        assert.ok(html.includes(`>${text}</p>`), `${label}: ${text}`);
      }
      assert.ok(!/<img[^>]*alt="Foto (Sari|Budi)/.test(html), `${label}: no photo element without a photo`);
      // The groom's fictional full name is also the fixture guest's name (on the cover), so the order is read after the heading.
      const section = html.indexOf('>Mempelai<');
      assert.ok(html.indexOf('>Sari Lestari</p>', section) < html.indexOf('>Budi Hartono</p>', section), `${label}: bride first by default`);
    }
    const one = renderGuestPage({ config: withFamily(configs.onePhoto, familyId), guest: fixtureGuest() });
    assert.match(one, new RegExp(`<img[^>]*src="${BRIDE}"[^>]*alt="Foto Sari Lestari"`), `${label}: the photo stays`);
    assert.ok(one.includes('>Budi Hartono</p>') && one.includes('>Putra pertama dari Bapak Rekaan &amp; Ibu Fiktif</p>'), `${label}: the groom beside it, as text`);
    assert.ok(!renderGuestPage({ config: withFamily(configs.nicknamesOnly, familyId) }).includes('>Mempelai<'), `${label}: nothing new, no section`);
  }
});

test('B-023: long, hostile, RTL and emoji names wrap, stay text and keep their direction', () => {
  const hostile = '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>';
  const stress: DetailConfig = {
    couple: {
      bride: { nickName: 'Putri', fullName: `${'Anindya Maharani Kusumawardhani '.repeat(5).trim()}`, parents: hostile },
      groom: { nickName: 'Ahmad', fullName: 'عبد الله بن أحمد', parents: 'Keluarga 💐 Contoh 👨‍👩‍👧', order: 4 },
    },
    events,
  };
  for (const { label, familyId } of families) {
    const html = renderGuestPage({ config: withFamily(stress, familyId), guest: fixtureGuest() });
    assert.ok(!html.includes('<script>alert(2)') && !html.includes('<img src=x'), `${label}: hostile text is escaped`);
    assert.ok(html.includes('Putri dari &lt;img src=x onerror=alert(1)&gt;'), `${label}: and still shown as typed`);
    assert.ok(html.includes('>عبد الله بن أحمد</p>'), `${label}: RTL name`);
    assert.ok(html.includes('Putra keempat dari Keluarga 💐 Contoh 👨‍👩‍👧'), `${label}: emoji kept`);
    const paragraphs = [...html.matchAll(/<p dir="auto" class="([^"]*)">([^<]*)<\/p>/g)].filter(([, , text]) => /^(Anindya|عبد الله|Putri dari &lt;|Putra keempat)/.test(text));
    assert.equal(paragraphs.length, 4, `${label}: both names and both lines as host text`);
    for (const [, classes, text] of paragraphs) assert.ok(classes.includes('[overflow-wrap:anywhere]'), `${label}: ${text.slice(0, 20)} wraps anywhere`);
  }
});

// Hashes of the pre-B-023 renderer (captured in s29 before the change; /vercel/share/work/logs/s29-b023-hashes-before.json).
test('B-023 / D-041: the legacy layout renders every couple byte-identically', () => {
  const before = {
    noPhoto: ['932db0d1f4f6cfa2d787931863e205f6507fc30ffffe6930de3af21b72a87486', 'e09b2a7ec034d8a755d57a91274b67364a69a5f3812b13e2f4e5cafd3cc2c913'],
    onePhoto: ['55a34bd8f7c4af7a8907275051f4ebf85a767edf0032ab5e58557d85cca867ab', '620c14ed67bcecf57c6f88c08e77146d2198aeb2dc572db505b2eda2f9f37ca4'],
    bothPhotos: ['49251c62eb68632d59a322642a0f5c0d274bc3ebcc15f2c664b30bad64fb3e06', '255bcc949ad6ba1080b294c49d2b5e37166dbecd9514e938b663cfbd850f2b88'],
  } as const;
  for (const [name, [personal, link]] of Object.entries(before)) {
    const config = configs[name as keyof typeof before];
    assert.equal(sha(renderGuestPage({ config, guest: fixtureGuest() })), personal, `${name}: personal link`);
    assert.equal(sha(renderGuestPage({ config })), link, `${name}: invitation link`);
  }
  assert.ok(!renderGuestPage({ config: configs.noPhoto }).includes('>Mempelai<'), 'legacy keeps its photo-only section');
});

test('B-023: family pages with both photos or nicknames alone are unchanged', () => {
  // B-030's section markers and G-035's share actions are the only markup added since; the digests pin the pages without them.
  const digest = (config: DetailConfig) =>
    sha(
      FAMILY_IDS.flatMap((familyId) => [renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() }), renderGuestPage({ config: withFamily(config, familyId) })])
        .map((page) => sha(withoutReadingToggle(withoutShareActions(withoutSectionMarkers(page)))))
        .join('\n'),
    );
  assert.equal(digest(configs.bothPhotos), '0ba9afcbaf27e375cb75201d159d6d3e4cc25f86fd09ca5d6a88545a29387065');
  assert.equal(digest(configs.nicknamesOnly), '0599f4f5bfa9cf6dbec91b1000704a591ced0923604b9052c2336e5474e0557c');
});

test('B-023: the view keeps one source per section; birthdays are unchanged; the contract lists the fields', () => {
  assert.deepEqual(view(configs.noPhoto).portraits, null, 'legacy: still photo-only');
  assert.equal(view(configs.noPhoto).profiles?.people.length, 2);
  const birthday: DetailConfig = { birthdayPerson: { fullName: 'Rara Contoh', nickName: 'Rara', photoUrl: BRIDE, showPhoto: true }, events };
  for (const guest of [fixtureGuest(), null]) {
    const v = view(birthday, 'birthday', guest);
    assert.strictEqual(v.profiles, v.portraits, 'a birthday\u2019s people section is the celebrant (D-038 / D-040), as before');
  }
  assert.equal(view({ ...configs.noPhoto }, 'corporate').profiles, null, 'a couple stored on another event type renders nothing');
  for (const field of ['bride.fullName', 'bride.parents', 'bride.order', 'bride.photoUrl', 'groom.fullName', 'groom.parents', 'groom.order', 'groom.photoUrl']) {
    assert.ok((RENDER_CAPABILITIES.couple.rendered as readonly string[]).includes(field), field);
  }
});
