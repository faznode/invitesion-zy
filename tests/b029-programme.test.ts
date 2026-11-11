// B-029 (G-033): the programme a corporate host typed renders when filled, in one fixed order, in every layout;
// blank values render nothing; contact values become links only when they are a dialable number or a plain address.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { mailtoHref, programmeOf, telHref } from '../lib/invitation/programme';
import { fixtureGuest, fixtureInvitation, formCount, LAYOUTS, linkHrefs, renderGuestPage, withFamily } from './support/render-guest-page';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const corporate = fixtureInvitation({ eventType: 'corporate', slug: 'konferensi-contoh' });
const HEADINGS = ['Tentang Acara', 'Susunan Acara', 'Pembicara', 'Informasi Tamu'] as const;
const VENUE = 'Balai Sidang Contoh';
const LONG_ORG = 'PerseroanTerbatasContohNusantaraSejahteraAbadiMakmurSentosaGlobalIndonesia';

// A past event: no countdown, whose markup depends on the render instant, so equal configs render byte-equal pages.
const event = { title: 'Konferensi Tahunan', startAt: '2020-12-27T09:00:00+08:00', endAt: '2020-12-27T15:00:00+08:00', venueName: VENUE };
const profile = {
  organizationName: 'PT Contoh Nusantara',
  eventName: 'Konferensi Tahunan 2026',
  description: 'Pertemuan tahunan mitra dan karyawan.',
  agenda: [
    { time: '09.00 WITA', title: 'Registrasi' },
    { time: '10.00 WITA', title: 'Sambutan Direksi', speaker: 'Rina Wulandari' },
  ],
  speakers: [{ name: 'Rina Wulandari', role: 'Direktur Utama', org: LONG_ORG }],
  dressCode: 'Batik formal',
  contactName: 'Panitia Acara',
  contactPhone: '+62 812-3456-7890',
  contactEmail: 'panitia@contoh.co.id',
};
const filledConfig: DetailConfig = { corporateProfile: profile, events: [event] };
const bareConfig: DetailConfig = { corporateProfile: { organizationName: profile.organizationName, eventName: profile.eventName }, events: [event] };

/** The opening tag of the innermost element whose text starts with `text`. */
const tagBefore = (page: string, text: string) => {
  const at = page.indexOf(`>${text}`);
  assert.ok(at > 0, `rendered: ${text}`);
  return page.slice(page.lastIndexOf('<', at), at + 1);
};

test('B-029: programme values are trimmed, blank rows dropped, and nothing filled means no programme', () => {
  assert.equal(programmeOf(undefined), null);
  assert.equal(programmeOf({ agenda: [{ title: '  ', time: '09.00' }], speakers: [{ name: '' }], contactPhone: '   ', description: ' ' }), null);
  const programme = programmeOf({ agenda: [{ title: ' Registrasi ', time: ' ', speaker: '' }], contactName: ' Rina ' });
  assert.deepEqual(programme?.agenda, [{ title: 'Registrasi', time: undefined, speaker: undefined }]);
  assert.deepEqual(programme?.contact, { name: 'Rina', phone: undefined, email: undefined });
  assert.deepEqual(programme?.speakers, []);
});

test('B-029: contact links only for a dialable number or one plain address', () => {
  assert.equal(telHref('+62 812-3456-7890'), 'tel:+6281234567890');
  assert.equal(telHref('(0361) 123.456'), 'tel:0361123456');
  for (const value of ['hubungi panitia', '12345', 'javascript:alert(1)', '+62 812 3456 7890 ext 2', '1234567890123456', undefined]) {
    assert.equal(telHref(value), undefined, String(value));
  }
  assert.equal(mailtoHref(' panitia@contoh.co.id '), 'mailto:panitia@contoh.co.id');
  for (const value of ['javascript:alert(1)', 'a@b', 'panitia@contoh.co.id?bcc=x@y.z', 'dua alamat@contoh.id', 'x@y.z,w@v.u', '<a@b.cd>', undefined]) {
    assert.equal(mailtoHref(value), undefined, String(value));
  }
});

test('B-029: the contract marks every corporate field rendered, logo and category included (s16)', () => {
  const capability = RENDER_CAPABILITIES.corporateProfile;
  for (const field of ['description', 'agenda', 'speakers', 'dressCode', 'contactName', 'contactPhone', 'contactEmail', 'eventCategory', 'logoUrl']) {
    assert.ok((capability.rendered as readonly string[]).includes(field), field);
  }
  assert.deepEqual([...capability.storedOnly], []);
});

test('B-029: every layout renders the filled programme after the event, in the fixed order, with links and host text', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(filledConfig, familyId), invitation: corporate, guest: fixtureGuest() });
    const positions = [VENUE, ...HEADINGS, 'Konfirmasi Kehadiran'].map((text) => page.indexOf(text));
    assert.ok(positions.every((at) => at >= 0), `${label}: venue, every programme heading and the RSVP heading render`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${label}: event, then about → agenda → speakers → information, then RSVP`);
    for (const text of [profile.description, 'Registrasi', 'Sambutan Direksi', '10.00 WITA', 'Direktur Utama', 'Batik formal', 'Panitia Acara']) {
      assert.ok(page.includes(text), `${label}: ${text}`);
    }
    assert.ok(linkHrefs(page).includes('tel:+6281234567890'), `${label}: phone link`);
    assert.ok(linkHrefs(page).includes('mailto:panitia@contoh.co.id'), `${label}: email link`);
    const org = tagBefore(page, LONG_ORG);
    assert.match(org, /dir="auto"/, `${label}: host text is isolated for bidirectional scripts`);
    assert.match(org, /\[overflow-wrap:anywhere\]/, `${label}: long host text wraps instead of overflowing`);
  }
});

test('B-029: blank values render nothing, and a profile left on another event type never reaches the page', () => {
  const blank: DetailConfig = {
    ...bareConfig,
    corporateProfile: { ...bareConfig.corporateProfile, agenda: [{ title: '  ' }], speakers: [{ name: ' ' }], dressCode: ' ', contactEmail: '' },
  };
  const wedding = fixtureInvitation({ eventType: 'wedding' });
  const couple = { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } };
  for (const { label, familyId } of LAYOUTS) {
    const bare = renderGuestPage({ config: withFamily(bareConfig, familyId), invitation: corporate });
    assert.equal(renderGuestPage({ config: withFamily(blank, familyId), invitation: corporate }), bare, `${label}: blank rows add no markup`);
    for (const heading of HEADINGS) assert.equal(bare.includes(heading), false, `${label}: no empty "${heading}" section`);
    const plain = renderGuestPage({ config: withFamily({ couple, events: [event] }, familyId), invitation: wedding });
    const stale = renderGuestPage({ config: withFamily({ couple, events: [event], corporateProfile: profile }, familyId), invitation: wedding });
    assert.equal(stale, plain, `${label}: a wedding ignores a stored corporate profile`);
  }
});

test('B-029: each section stands alone: a contact without a dress code still shows the guest information', () => {
  const contactOnly: DetailConfig = { ...bareConfig, corporateProfile: { ...bareConfig.corporateProfile, contactName: 'Panitia Acara' } };
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(contactOnly, familyId), invitation: corporate });
    assert.ok(page.includes('Informasi Tamu') && page.includes('Narahubung') && page.includes('Panitia Acara'), `${label}: contact-only information renders`);
    assert.equal(page.includes('Dress code'), false, `${label}: no empty dress-code row`);
    for (const heading of HEADINGS.slice(0, 3)) assert.equal(page.includes(heading), false, `${label}: no empty "${heading}" section`);
  }
});

test('B-029: hostile, RTL and unlinkable contact values are text; an expired page still shows the programme', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const config: DetailConfig = {
    corporateProfile: {
      ...profile,
      agenda: [{ time: '09.00', title: `${hostile} Pembukaan`, speaker: 'جلسة افتتاحية' }],
      contactPhone: 'hubungi panitia di lokasi',
      contactEmail: 'javascript:alert(1)',
    },
    events: [event],
  };
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(config, familyId), invitation: corporate, guest: fixtureGuest() });
    assert.equal(page.includes('<img src=x'), false, `${label}: host text is never markup`);
    assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt; Pembukaan'), `${label}: hostile title shown as text`);
    assert.match(tagBefore(page, 'جلسة افتتاحية'), /dir="auto"/, `${label}: RTL speaker isolated`);
    assert.equal(linkHrefs(page).some((href) => /^(tel|mailto|javascript):/i.test(href)), false, `${label}: no link from unlinkable contact values`);
    assert.ok(page.includes('hubungi panitia di lokasi') && page.includes('javascript:alert(1)'), `${label}: unlinkable values shown as text`);

    const expired = renderGuestPage({ config: withFamily(filledConfig, familyId), invitation: corporate, guest: fixtureGuest(), readOnly: true });
    assert.ok(HEADINGS.every((heading) => expired.includes(heading)), `${label}: read-only keeps the programme`);
    assert.equal(formCount(expired), 0, `${label}: read-only still takes no responses`);
  }
});

test('B-029: the organisation shows once beside the event name in every layout; without an event name it is the headline', () => {
  const count = (page: string, text: string) => page.split(text).length - 1;
  const hostile = '<b>PT</b> عبد الله';
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(filledConfig, familyId), invitation: corporate });
    assert.equal(count(page, profile.organizationName), 1, `${label}: organisation shown once next to the event name`);
    assert.match(tagBefore(page, profile.organizationName), /dir="auto"/, `${label}: organisation isolated for bidirectional scripts`);
    assert.ok(page.indexOf(profile.eventName) < page.indexOf(profile.organizationName), `${label}: event name first, then who invites`);
    const alone = renderGuestPage({ config: withFamily({ corporateProfile: { organizationName: profile.organizationName }, events: [event] }, familyId), invitation: corporate });
    assert.equal(count(alone, profile.organizationName), 1, `${label}: an organisation without an event name is the headline, not repeated`);
    const same = renderGuestPage({ config: withFamily({ corporateProfile: { organizationName: 'Temu Mitra', eventName: 'Temu Mitra' }, events: [event] }, familyId), invitation: corporate });
    assert.equal(count(same, 'Temu Mitra'), 1, `${label}: equal names are not repeated`);
    const escaped = renderGuestPage({ config: withFamily({ ...filledConfig, corporateProfile: { ...profile, organizationName: hostile } }, familyId), invitation: corporate });
    assert.ok(escaped.includes('&lt;b&gt;PT&lt;/b&gt; عبد الله') && !escaped.includes('<b>PT</b>'), `${label}: organisation is text, never markup`);
  }
});

test('B-029: layouts take the programme from the guest view and its shared blocks, never from the stored profile', () => {
  const layouts = ['components/invitation/public-renderer.tsx', ...readdirSync(join(process.cwd(), 'components/invitation/families')).map((file) => `components/invitation/families/${file}`)];
  for (const file of layouts) {
    assert.doesNotMatch(source(file), /corporateProfile/, `${file}: the event-type gate lives in buildGuestView()`);
    assert.match(source(file), /<ProgrammeBody\b/, `${file}: programme rows come from the shared block`);
  }
});
