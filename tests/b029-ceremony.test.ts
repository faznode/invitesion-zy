// B-029 slice 3 (G-033, s17): the ceremony profile (aqiqah, khitanan, tasyakuran) and the wedding hashtag render when
// filled, in every layout; each ceremony type shows only the fields its editor tab offers; blank values, other event
// types and a switched-off hashtag render nothing; host text stays text, isolated and wrapping; the filter link is
// offered only as an http(s) URL.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ceremonyProfileOf, formatPlainDate, THANKSGIVING_LABELS } from '../lib/invitation/ceremony-profile';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { hashtagsOf, httpLinkHref, shareOf } from '../lib/invitation/share';
import { fixtureGuest, fixtureInvitation, formCount, LAYOUTS, linkHrefs, renderGuestPage, withFamily } from './support/render-guest-page';

type Profile = NonNullable<DetailConfig['ceremonyProfile']>;

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
// A past event: no countdown, whose markup depends on the render instant, so equal configs render byte-equal pages.
const event = { title: 'Syukuran Keluarga Contoh', startAt: '2020-12-27T09:00:00+08:00', venueName: 'Rumah Keluarga Contoh' };
const RSVP_HEADING = 'Konfirmasi Kehadiran';
const LONG = 'NamaTempatYangSangatPanjangSekaliTanpaSpasiUntukMengujiPembungkusanTeksDiLayarSempit';

// Each profile also carries values another ceremony type's tab would have stored ("stale"), which must not render.
const aqiqah: Profile = {
  honoureeName: 'Arka Contoh Pratama',
  gender: 'male',
  childOrder: 2,
  birthDate: '2026-10-03',
  birthPlace: 'Makassar',
  birthWeight: '3,2 kg',
  birthLength: '49 cm',
  fatherName: 'Budi Hartono',
  motherName: 'Sari Lestari',
  nameMeaning: 'Arka berarti matahari; Pratama berarti yang pertama.',
  prayer: 'Semoga tumbuh sehat, ceria, dan penuh kasih.',
  school: 'Sekolah Basi',
  thanksgivingTitle: 'Judul Basi',
  ceremonyNote: 'Catatan Basi',
  recoveryNote: 'Pemulihan Basi',
  age: 7,
};
const khitanan: Profile = {
  honoureeName: 'Raka Contoh Wijaya',
  nickName: 'Raka',
  age: 10,
  school: 'SD Negeri Contoh 1',
  circumcisionDate: '2026-12-20',
  fatherName: 'Dimas Contoh',
  motherName: 'Laras Contoh',
  prayer: 'Semoga lekas pulih dan kembali bermain.',
  recoveryNote: 'Raka belum menerima tamu pada hari pertama.',
  gender: 'female',
  birthWeight: 'Berat Basi',
  nameMeaning: 'Arti Basi',
  thanksgivingCategory: 'promotion',
};
const tasyakuran: Profile = {
  honoureeName: 'Keluarga Hartono',
  thanksgivingCategory: 'housewarming',
  thanksgivingTitle: 'Syukuran Rumah Baru',
  achievement: 'Jl. Contoh Raya No. 1, Makassar',
  ceremonyNote: 'Terima kasih atas dukungan selama pindahan.',
  fatherName: 'Ayah Basi',
  prayer: 'Harapan Basi',
  birthPlace: 'Tempat Basi',
};
const STALE = ['Basi'];

const CASES = [
  {
    type: 'aqiqah',
    profile: aqiqah,
    heading: 'Tentang Ananda',
    shown: ['Laki-laki', 'Anak ke-2', 'Makassar, 3 Oktober 2026', '3,2 kg', '49 cm', 'Budi Hartono &amp; Sari Lestari', 'Arti nama', aqiqah.nameMeaning!, 'Doa &amp; harapan', aqiqah.prayer!],
  },
  {
    type: 'khitanan',
    profile: khitanan,
    heading: 'Tentang Ananda',
    shown: ['Nama lengkap', 'Raka Contoh Wijaya', '10 tahun', 'SD Negeri Contoh 1', '20 Desember 2026', 'Dimas Contoh &amp; Laras Contoh', khitanan.prayer!, 'Catatan', khitanan.recoveryNote!],
  },
  {
    type: 'tasyakuran',
    profile: tasyakuran,
    heading: 'Tentang Syukuran',
    shown: ['Syukuran Rumah Baru', 'Rumah baru', 'Alamat rumah baru', 'Jl. Contoh Raya No. 1, Makassar', 'Pesan syukur', tasyakuran.ceremonyNote!],
  },
] as const;

/** The opening tag of the innermost element whose text starts with `text`. */
const tagBefore = (page: string, text: string) => {
  const at = page.indexOf(`>${text}`);
  assert.ok(at > 0, `rendered: ${text}`);
  return page.slice(page.lastIndexOf('<', at), at + 1);
};

test('B-029: plain calendar dates are shown as written, never shifted by a zone', () => {
  assert.equal(formatPlainDate('2026-10-03'), '3 Oktober 2026');
  assert.equal(formatPlainDate(' 2026-01-31 '), '31 Januari 2026');
  for (const value of ['2026-02-30', '2026-13-01', '2026-10-03T00:00:00Z', '03-10-2026', '', undefined]) {
    assert.equal(formatPlainDate(value), undefined, String(value));
  }
});

test('B-029: each ceremony type keeps exactly the fields its editor tab offers', () => {
  const a = ceremonyProfileOf('aqiqah', aqiqah);
  assert.equal(a?.heading, 'Tentang Ananda');
  assert.deepEqual(a?.rows, [
    { label: 'Jenis kelamin', value: 'Laki-laki' },
    { label: 'Urutan', value: 'Anak ke-2' },
    { label: 'Lahir', value: 'Makassar, 3 Oktober 2026' },
    { label: 'Berat lahir', value: '3,2 kg' },
    { label: 'Panjang lahir', value: '49 cm' },
    { label: 'Orang tua', value: 'Budi Hartono & Sari Lestari' },
  ]);
  assert.deepEqual(a?.texts.map((t) => t.label), ['Arti nama', 'Doa & harapan']);

  const k = ceremonyProfileOf('khitanan', khitanan);
  assert.deepEqual(k?.rows.map((r) => r.label), ['Nama lengkap', 'Usia', 'Sekolah', 'Tanggal khitan', 'Orang tua']);
  assert.deepEqual(k?.texts.map((t) => t.label), ['Doa & harapan', 'Catatan']);

  const t = ceremonyProfileOf('tasyakuran', tasyakuran);
  assert.equal(t?.heading, 'Tentang Syukuran');
  assert.deepEqual(t?.rows, [
    { label: 'Acara', value: 'Syukuran Rumah Baru' },
    { label: 'Jenis syukuran', value: 'Rumah baru' },
    { label: 'Alamat rumah baru', value: 'Jl. Contoh Raya No. 1, Makassar' },
  ]);
  assert.deepEqual(t?.texts.map((x) => x.label), ['Pesan syukur']);

  for (const profile of [a, k, t]) assert.ok(!JSON.stringify(profile).includes('Basi'), 'no value from another ceremony type');
});

test('B-029: other event types, missing input and blank values give no profile; small rules hold', () => {
  for (const type of ['wedding', 'birthday', 'corporate', 'unknown']) assert.equal(ceremonyProfileOf(type, aqiqah), null, type);
  assert.equal(ceremonyProfileOf('aqiqah', undefined), null);
  assert.equal(ceremonyProfileOf('aqiqah', { honoureeName: 'Arka', birthPlace: ' ', prayer: '  ', fatherName: '' }), null, 'the headline name alone adds no section');
  assert.equal(ceremonyProfileOf('khitanan', { age: 0 }), null, 'an age of 0 is not shown');
  assert.equal(ceremonyProfileOf('khitanan', { honoureeName: 'Raka', nickName: 'Raka', school: 'SD' })?.rows[0].label, 'Sekolah', 'no full-name row when it equals the headline');
  assert.deepEqual(ceremonyProfileOf('aqiqah', { parents: ' Keluarga Hartono ' })?.rows, [{ label: 'Orang tua', value: 'Keluarga Hartono' }], 'parents text as the fallback');
  assert.equal(ceremonyProfileOf('aqiqah', { parents: 'X', fatherName: 'Budi' })?.rows[0].value, 'Budi', 'named parents win over the fallback');
  assert.equal(ceremonyProfileOf('aqiqah', { birthTime: '08.15 WITA' })?.rows[0].value, 'Pukul 08.15 WITA');
  assert.equal(ceremonyProfileOf('aqiqah', { birthDate: '2026-10-03', birthTime: '08.15' })?.rows[0].value, '3 Oktober 2026, pukul 08.15');
  for (const [category, label] of [['promotion', 'Jabatan & instansi'], ['graduation', 'Institusi & gelar'], ['new_business', 'Nama / jenis usaha'], ['hajj_umrah', 'Pencapaian'], [undefined, 'Pencapaian']] as const) {
    const rows = ceremonyProfileOf('tasyakuran', { thanksgivingCategory: category, achievement: 'X' })?.rows ?? [];
    assert.equal(rows.at(-1)?.label, label, String(category));
    if (category) assert.equal(rows[0].value, THANKSGIVING_LABELS[category]);
  }
});

test('B-029: hashtags get one leading #, no blanks or repeats, at most five; links only http(s)', () => {
  assert.deepEqual(hashtagsOf('#BudiSari2026 #budisari2026, SariBudi ##Dua'), ['#BudiSari2026', '#SariBudi', '#Dua']);
  assert.deepEqual(hashtagsOf(' , # ## '), []);
  assert.equal(hashtagsOf('a b c d e f g').length, 5);
  assert.equal(httpLinkHref(' https://www.instagram.com/ar/123/ '), 'https://www.instagram.com/ar/123/');
  assert.equal(httpLinkHref('http://contoh.test/filter'), 'http://contoh.test/filter');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'ftp://contoh.test/x', '/relatif', 'bukan url', undefined]) {
    assert.equal(httpLinkHref(value), undefined, String(value));
  }
  assert.equal(shareOf(undefined), null);
  assert.equal(shareOf({ hashtag: '#BudiSari' }), null, 'switched off by default');
  assert.equal(shareOf({ enabled: false, hashtag: '#BudiSari' }), null);
  assert.equal(shareOf({ enabled: true, hashtag: ' ', filterUrl: 'javascript:alert(1)' }), null);
  assert.deepEqual(shareOf({ enabled: true, filterUrl: 'https://contoh.test/f' }), { tags: [], filterUrl: 'https://contoh.test/f' });
});

test('B-029: the contract marks the ceremony fields and the hashtag rendered; s20 (D-038) renders the photo too', () => {
  assert.deepEqual([...RENDER_CAPABILITIES.ceremonyProfile.storedOnly], []);
  for (const field of ['photoUrl', 'showPhoto']) assert.ok((RENDER_CAPABILITIES.ceremonyProfile.rendered as readonly string[]).includes(field), field);
  for (const field of ['gender', 'childOrder', 'birthDate', 'nameMeaning', 'prayer', 'school', 'circumcisionDate', 'recoveryNote', 'thanksgivingCategory', 'achievement', 'ceremonyNote']) {
    assert.ok((RENDER_CAPABILITIES.ceremonyProfile.rendered as readonly string[]).includes(field), field);
  }
  assert.deepEqual([...RENDER_CAPABILITIES.instagramStory.rendered], ['enabled', 'hashtag', 'filterUrl']);
});

test('B-029: every layout renders each ceremony profile in the programme slot, without another type\'s values', () => {
  for (const { type, profile, heading, shown } of CASES) {
    const invitation = fixtureInvitation({ eventType: type, slug: `${type}-contoh` });
    for (const { label, familyId } of LAYOUTS) {
      const page = renderGuestPage({ config: withFamily({ ceremonyProfile: profile, events: [event] }, familyId), invitation, guest: fixtureGuest() });
      for (const text of [heading, ...shown]) assert.ok(page.includes(text), `${label} ${type}: ${text}`);
      for (const stale of STALE) assert.equal(page.includes(stale), false, `${label} ${type}: no value from another ceremony type`);
      const at = page.indexOf(heading);
      const eventAt = page.indexOf(event.title);
      // Lontar is programme-led (the programme precedes the events); every other layout puts it after them.
      assert.ok(familyId === 'lontar' ? at < eventAt : eventAt < at, `${label} ${type}: profile in the programme slot`);
      assert.ok(at < page.indexOf(RSVP_HEADING), `${label} ${type}: profile before RSVP`);
    }
  }
});

test('B-029: blank profiles add no markup; other event types ignore a stored profile; read-only keeps it', () => {
  const blank: Profile = { honoureeName: 'Arka', birthPlace: ' ', prayer: ' ', thanksgivingTitle: '', achievement: '  ' };
  const couple = { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } };
  for (const { label, familyId } of LAYOUTS) {
    for (const type of ['aqiqah', 'khitanan', 'tasyakuran']) {
      const invitation = fixtureInvitation({ eventType: type });
      const bare = renderGuestPage({ config: withFamily({ ceremonyProfile: { honoureeName: 'Arka' }, events: [event] }, familyId), invitation });
      assert.equal(renderGuestPage({ config: withFamily({ ceremonyProfile: blank, events: [event] }, familyId), invitation }), bare, `${label} ${type}: blank values add no markup`);
      assert.equal(bare.includes('Tentang '), false, `${label} ${type}: no empty profile section`);
    }
    for (const [type, base] of [['wedding', { couple }], ['birthday', { birthdayPerson: { nickName: 'Arka' } }], ['corporate', { corporateProfile: { eventName: 'Temu Mitra' } }]] as const) {
      const invitation = fixtureInvitation({ eventType: type });
      const plain = renderGuestPage({ config: withFamily({ ...base, events: [event] }, familyId), invitation });
      const stale = renderGuestPage({ config: withFamily({ ...base, events: [event], ceremonyProfile: aqiqah }, familyId), invitation });
      assert.equal(stale, plain, `${label}: a ${type} ignores a stored ceremony profile`);
    }
    const expired = renderGuestPage({ config: withFamily({ ceremonyProfile: aqiqah, events: [event] }, familyId), invitation: fixtureInvitation({ eventType: 'aqiqah' }), guest: fixtureGuest(), readOnly: true });
    assert.ok(expired.includes('Tentang Ananda') && expired.includes('Anak ke-2'), `${label}: read-only keeps the profile`);
    assert.equal(formCount(expired), 0, `${label}: read-only still takes no responses`);
  }
});

test('B-029: hostile, RTL and long profile values are text, isolated and wrapping', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const profile: Profile = { ...aqiqah, nameMeaning: `${hostile} arti`, fatherName: 'سامي', motherName: 'ليلى', birthPlace: LONG };
  const invitation = fixtureInvitation({ eventType: 'aqiqah' });
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily({ ceremonyProfile: profile, events: [event] }, familyId), invitation });
    assert.equal(page.includes('<img src=x'), false, `${label}: host text is never markup`);
    assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt; arti'), `${label}: hostile text shown as text`);
    const parents = tagBefore(page, 'سامي &amp; ليلى');
    assert.match(parents, /dir="auto"/, `${label}: RTL parents isolated`);
    const born = tagBefore(page, `${LONG}, 3 Oktober 2026`);
    assert.match(born, /\[overflow-wrap:anywhere\]/, `${label}: long value wraps`);
    assert.match(tagBefore(page, '&lt;img src=x'), /whitespace-pre-line/, `${label}: multi-line host text keeps its breaks`);
  }
});

test('B-029: a wedding shows its hashtag and filter link after streaming and before the gift; off or elsewhere, nothing', () => {
  const couple = { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } };
  const gift = { enabled: true, accounts: [{ kind: 'bank' as const, label: 'Bank Contoh', number: '0000 0000', holder: 'Sari' }] };
  const streaming = { enabled: true, url: 'https://contoh.test/siaran' };
  const instagramStory = { enabled: true, hashtag: '#BudiSari2026 #budisari2026, SariBudi', filterUrl: 'https://www.instagram.com/ar/123456789/' };
  const wedding = fixtureInvitation({ eventType: 'wedding' });
  for (const { label, familyId } of LAYOUTS) {
    const base: DetailConfig = { couple, events: [event], gift, streaming };
    const page = renderGuestPage({ config: withFamily({ ...base, instagramStory }, familyId), invitation: wedding, guest: fixtureGuest() });
    for (const text of ['Bagikan Momen', 'Unggah momenmu dengan tagar:', '#BudiSari2026', '#SariBudi', 'Coba filter Instagram']) assert.ok(page.includes(text), `${label}: ${text}`);
    assert.equal(page.includes('#budisari2026'), false, `${label}: a repeated tag shows once`);
    assert.ok(linkHrefs(page).includes('https://www.instagram.com/ar/123456789/'), `${label}: filter link`);
    const at = page.indexOf('Bagikan Momen');
    assert.ok(page.indexOf('Tonton siaran') < at && at < page.indexOf('Bank Contoh') && at < page.indexOf(RSVP_HEADING), `${label}: after streaming, before gift and RSVP`);
    assert.match(tagBefore(page, '#SariBudi'), /select-all/, `${label}: a tag is selected in one tap`);

    const plain = renderGuestPage({ config: withFamily(base, familyId), invitation: wedding, guest: fixtureGuest() });
    const off = renderGuestPage({ config: withFamily({ ...base, instagramStory: { ...instagramStory, enabled: false } }, familyId), invitation: wedding, guest: fixtureGuest() });
    assert.equal(off, plain, `${label}: switched off renders nothing`);
    const birthday = fixtureInvitation({ eventType: 'birthday' });
    const birthdayBase: DetailConfig = { birthdayPerson: { nickName: 'Arka' }, events: [event] };
    assert.equal(
      renderGuestPage({ config: withFamily({ ...birthdayBase, instagramStory }, familyId), invitation: birthday }),
      renderGuestPage({ config: withFamily(birthdayBase, familyId), invitation: birthday }),
      `${label}: only weddings show the hashtag, as only their editor offers it`,
    );
    const unsafe = renderGuestPage({ config: withFamily({ ...base, instagramStory: { ...instagramStory, filterUrl: 'javascript:alert(1)' } }, familyId), invitation: wedding });
    assert.ok(unsafe.includes('#SariBudi') && !unsafe.includes('Coba filter Instagram'), `${label}: tags without an unsafe link`);
    assert.equal(linkHrefs(unsafe).some((href) => /^javascript:/i.test(href)), false, `${label}: no javascript: link`);
    const rtl = renderGuestPage({ config: withFamily({ ...base, instagramStory: { enabled: true, hashtag: '#عرس_سامي <b>x</b>' } }, familyId), invitation: wedding });
    assert.match(tagBefore(rtl, '#عرس_سامي'), /dir="auto"/, `${label}: RTL tag isolated`);
    assert.ok(rtl.includes('#&lt;b&gt;x&lt;/b&gt;') && !rtl.includes('<b>x</b>'), `${label}: tag text is never markup`);
  }
});

test('B-029: layouts take the profile and the hashtag from the guest view and the shared blocks', () => {
  const layouts = ['components/invitation/public-renderer.tsx', ...readdirSync(join(process.cwd(), 'components/invitation/families')).map((file) => `components/invitation/families/${file}`)];
  for (const file of layouts) {
    assert.doesNotMatch(source(file), /config\??\.ceremonyProfile|instagramStory/, `${file}: the event-type gates live in buildGuestView()`);
    assert.match(source(file), /<CeremonyProfileBody\b/, `${file}: profile rows come from the shared block`);
    assert.match(source(file), /<ShareBody\b/, `${file}: tags come from the shared block`);
  }
});

test('s17 R2: the headcount hint says the number only counts with "hadir", in every layout', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily({ couple: { bride: { nickName: 'Sari' } }, events: [event] }, familyId), guest: fixtureGuest() });
    assert.ok(page.includes('Maksimal 2 orang untuk undangan ini. Jumlah ini dicatat untuk jawaban hadir.'), label);
  }
});
