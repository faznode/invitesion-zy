// D-038: person photos (couple, birthday celebrant, ceremony honouree) with the children's privacy rule; s20 M1 / M2
// (logo frame and broken-logo cover) and S18-G2 (Gapura's desktop window). Fictional people only; no photo is loaded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { guestLinkSegment } from '../lib/invitation/guest-link';
import { guestChildPhotoPath } from '../lib/invitation/public-path';
import { birthdayPortrait, ceremonyPortrait, childPhotoAllowed, couplePortraits, parentsLine } from '../lib/invitation/portraits';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const guestLink = { personalLink: true, preview: false };
const publicPage = { personalLink: false, preview: false };
const BRIDE = '/media/1/0123456789abcdef0123456a.png';
const GROOM = '/media/1/0123456789abcdef0123456b.png';
const BABY = '/media/1/0123456789abcdef0123456c.jpg';
const MISSING_LOGO = '/media/1/0123456789abcdef0123456d.png';

test('parents line: the host\u2019s parents with the child\u2019s rank in words, nothing without parents', () => {
  assert.equal(parentsLine('putri', 'Bapak Contoh & Ibu Sampel', 2), 'Putri kedua dari Bapak Contoh & Ibu Sampel');
  assert.equal(parentsLine('putra', 'Bapak Rekaan', undefined), 'Putra dari Bapak Rekaan');
  assert.equal(parentsLine('putra', 'Bapak Rekaan', 12), 'Putra ke-12 dari Bapak Rekaan');
  assert.equal(parentsLine('putri', '   ', 1), undefined);
});

test('parents line (s20 acceptance): a relation the host typed is kept, never doubled; their own rank wins', () => {
  assert.equal(parentsLine('putri', 'Putri dari Bapak Fiktif & Ibu Contoh', 2), 'Putri kedua dari Bapak Fiktif & Ibu Contoh');
  assert.equal(parentsLine('putri', 'Putri dari Bapak Fiktif & Ibu Contoh', undefined), 'Putri dari Bapak Fiktif & Ibu Contoh');
  assert.equal(parentsLine('putri', 'Putri sulung dari Bapak Fiktif', 2), 'Putri sulung dari Bapak Fiktif');
  assert.equal(parentsLine('putra', 'Putra ketiga Bapak Rekaan & Ibu Sampel', 1), 'Putra ketiga Bapak Rekaan & Ibu Sampel');
  assert.equal(parentsLine('putra', 'putra bapak rekaan', 2), 'putra kedua bapak rekaan');
  assert.equal(parentsLine('putra', 'Anak dari Keluarga Sampel', 3), 'Anak ketiga dari Keluarga Sampel');
  // A name that merely starts like a relation word is a name, not a typed relation.
  assert.equal(parentsLine('putri', 'Putriani & Bapak Sampel', 1), 'Putri pertama dari Putriani & Bapak Sampel');
  assert.equal(parentsLine('putra', 'Anak Agung Gede Contoh & Ibu Sampel', 1), 'Putra pertama dari Anak Agung Gede Contoh & Ibu Sampel');
});

test('couple: only sides with a usable photo, in the host\u2019s order, named in the alt text; nothing without a photo', () => {
  assert.equal(couplePortraits({ bride: { fullName: 'Sari' }, groom: { fullName: 'Budi' } }), null);
  const both = couplePortraits({
    bride: { fullName: 'Sari Lestari', parents: 'Bapak Contoh', order: 1, photoUrl: BRIDE },
    groom: { nickName: 'Budi', photoUrl: GROOM },
    displayOrder: 'groom-first',
  });
  assert.deepEqual(both?.people.map((p) => [p.key, p.alt, p.caption]), [
    ['groom', 'Foto Budi', undefined],
    ['bride', 'Foto Sari Lestari', 'Putri pertama dari Bapak Contoh'],
  ]);
  assert.equal(both?.heading, 'Mempelai');
  assert.deepEqual(couplePortraits({ bride: { photoUrl: 'javascript:alert(1)' }, groom: { photoUrl: GROOM } })?.people.map((p) => [p.key, p.alt]), [['groom', 'Foto mempelai pria']]);
});

test('children\u2019s privacy: a child\u2019s photo needs the host\u2019s switch and a personal link (or the host preview)', () => {
  assert.equal(childPhotoAllowed(true, guestLink), true);
  assert.equal(childPhotoAllowed(true, { personalLink: false, preview: true }), true);
  assert.equal(childPhotoAllowed(true, publicPage), false);
  assert.equal(childPhotoAllowed(undefined, guestLink), false);
  for (const type of ['aqiqah', 'khitanan']) {
    assert.equal(ceremonyPortrait(type, { honoureeName: 'Ananda Contoh', photoUrl: BABY }, guestLink), null, `${type}: off by default`);
    assert.equal(ceremonyPortrait(type, { photoUrl: BABY, showPhoto: true }, publicPage), null, `${type}: never without a guest link`);
    assert.equal(ceremonyPortrait(type, { honoureeName: 'Ananda Contoh', photoUrl: BABY, showPhoto: true }, guestLink)?.alt, 'Foto Ananda Contoh');
  }
  assert.equal(ceremonyPortrait('tasyakuran', { photoUrl: BABY }, publicPage)?.alt, 'Foto', 'an adult\u2019s thanksgiving shows once uploaded');
  assert.equal(ceremonyPortrait('wedding', { photoUrl: BABY, showPhoto: true }, guestLink), null);
  assert.equal(birthdayPortrait({ fullName: 'Rara', photoUrl: BABY }, guestLink), null);
  assert.equal(birthdayPortrait({ fullName: 'Rara', photoUrl: BABY, showPhoto: true }, publicPage), null);
  assert.equal(birthdayPortrait({ fullName: 'Rara', photoUrl: BABY, showPhoto: true }, guestLink)?.people[0].alt, 'Foto Rara');
});

const wedding: DetailConfig = {
  couple: {
    bride: { fullName: 'Sari Lestari', nickName: 'Sari', parents: 'Bapak Contoh & Ibu Sampel', order: 2, photoUrl: BRIDE },
    groom: { fullName: 'Budi Hartono', nickName: 'Budi', parents: 'Bapak Rekaan', photoUrl: GROOM },
  },
  events: [{ id: 'ev-1', title: 'Resepsi', startAt: '2027-01-04T19:00:00+08:00' }],
};
const aqiqah: DetailConfig = { ceremonyProfile: { honoureeName: 'Ananda Contoh', photoUrl: BABY, showPhoto: true }, events: wedding.events };

test('every layout: the couple section with framed, named, fixed-size photos; none without photos', () => {
  for (const layout of LAYOUTS) {
    const html = renderGuestPage({ config: withFamily(wedding, layout.familyId), guest: null });
    assert.ok(html.includes('Mempelai'), `${layout.label}: section heading`);
    for (const [src, alt] of [[BRIDE, 'Foto Sari Lestari'], [GROOM, 'Foto Budi Hartono']]) {
      const tag = html.match(new RegExp(`<img[^>]*src="${src}"[^>]*>`))?.[0] ?? '';
      assert.ok(tag.includes(`alt="${alt}"`) && /width="\d+"/.test(tag) && /height="\d+"/.test(tag) && tag.includes('loading="lazy"'), `${layout.label}: ${tag}`);
    }
    assert.ok(html.includes('Putri kedua dari Bapak Contoh &amp; Ibu Sampel'), `${layout.label}: parents line`);
    const plain = renderGuestPage({ config: withFamily({ ...wedding, couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } } }, layout.familyId) });
    assert.ok(!plain.includes('Mempelai') && !plain.includes('/media/'), `${layout.label}: no photo, no section`);
  }
});

test('every layout: an aqiqah photo the host switched on reaches personal links and the preview, never the public page', () => {
  const invitation = fixtureInvitation({ eventType: 'aqiqah' });
  // E-047 / D-040: a personal link reaches the photo through its own route, and the storage path never reaches its page.
  const guestRoute = guestChildPhotoPath(invitation.slug, guestLinkSegment(fixtureGuest()), 'honouree');
  for (const layout of LAYOUTS) {
    const cfg = withFamily(aqiqah, layout.familyId);
    const personal = renderGuestPage({ config: cfg, invitation, guest: fixtureGuest() });
    assert.ok(personal.includes(`src="${guestRoute}"`), `${layout.label}: guest link`);
    assert.ok(!personal.includes(BABY), `${layout.label}: guest link never carries the storage path`);
    assert.ok(renderGuestPage({ config: cfg, invitation, guest: null, preview: true }).includes(`src="${BABY}"`), `${layout.label}: preview`);
    assert.ok(!renderGuestPage({ config: cfg, invitation, guest: null }).includes(BABY), `${layout.label}: public page`);
    const off = withFamily({ ...aqiqah, ceremonyProfile: { ...aqiqah.ceremonyProfile, showPhoto: undefined } }, layout.familyId);
    assert.ok(!renderGuestPage({ config: off, invitation, guest: fixtureGuest() }).includes(BABY), `${layout.label}: switched off`);
  }
});

test('M1 / M2: a 240 \u00d7 64 logo frame, aligned with its layout, and a broken logo covered in the frame\u2019s colour', () => {
  const blocks = read('components/invitation/guest-blocks.tsx');
  assert.match(blocks, /flex h-16 w-60 max-w-full/);
  assert.match(blocks, /width=\{240\}\s+height=\{64\}/);
  assert.match(blocks, /after:absolute after:inset-0 after:bg-\[var\(--inv-logo-bg,var\(--inv-bg\)\)\] after:content-\[''\]/);
  assert.match(blocks, /align === 'center' \? 'object-center' : 'object-left'/);
  assert.match(read('components/invitation/families/kartu.tsx'), /\[--inv-logo-bg:var\(--inv-card\)\]/, 'Kartu\u2019s mark sits on its card');
  // s20 acceptance: Riang draws its cover on the soft tone; the page colour left a white box on a lost logo.
  assert.match(read('components/invitation/families/riang.tsx'), /\[--inv-logo-bg:var\(--inv-soft\)\]/, 'Riang\u2019s mark sits on the soft tone');
  const corporate = renderGuestPage({
    config: { corporateProfile: { organizationName: 'PT Contoh', eventName: 'Gathering Sampel', logoUrl: MISSING_LOGO } },
    invitation: fixtureInvitation({ eventType: 'corporate' }),
  });
  assert.match(corporate, /<img[^>]*alt="Logo PT Contoh"[^>]*class="[^"]*after:content-\[&#x27;&#x27;\][^"]*"/);
});

test('S18-G2: from 640 px Gapura\u2019s window takes the height the viewport leaves, between 11rem and the full square', () => {
  const gapura = read('components/invitation/families/gapura.tsx');
  // 36.5rem, not 34.5rem: the s20 browser check found a two-line guest name 4 px below the fold at four desktop sizes.
  assert.match(gapura, /aspect-\[4\/3\] w-full object-cover sm:aspect-auto sm:h-\[clamp\(11rem,calc\(100svh_-_36\.5rem\),22\.75rem\)\]/);
  assert.match(gapura, /sm:pt-10/);
});
