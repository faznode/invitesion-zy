// B-029 (s16, review finding S16-L6): the corporate logo and event category, render-when-filled above the headline in
// every layout. Only uploads (`/media/<key>`) and http(s) logos ever reach a guest page; the category uses the editor's
// words.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { corporateMarkOf, EVENT_CATEGORY_LABELS } from '../lib/invitation/corporate-mark';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { safeImageSrc } from '../lib/invitation/image-url';
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';

const corporate = fixtureInvitation({ eventType: 'corporate', slug: 'konferensi-contoh' });
const LOGO = 'https://cdn.contoh.test/logo-nusantara.png';
const UPLOAD = '/media/12/0123456789abcdef01234567.png';
const profile = (extra: NonNullable<DetailConfig['corporateProfile']> = {}): DetailConfig => ({
  corporateProfile: { organizationName: 'PT Contoh Nusantara', eventName: 'Konferensi Tahunan Contoh', ...extra },
  events: [{ title: 'Konferensi', startAt: '2099-03-10T09:00:00+07:00' }],
});
// s20 (M1): the frame is 240 × 64 (was 160 × 64), so wide wordmarks keep a legible height.
const logoTag = (html: string) => /<img src="([^"]*)" alt="([^"]*)" width="240" height="64"/.exec(html);

test('B-029: a logo renders from an upload path or an http(s) URL, nothing else', () => {
  assert.equal(safeImageSrc(LOGO), LOGO);
  assert.equal(safeImageSrc('http://127.0.0.1:3100/review/logo.png'), 'http://127.0.0.1:3100/review/logo.png');
  assert.equal(safeImageSrc(UPLOAD), UPLOAD);
  for (const hostile of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'blob:https://x.test/1', 'ftp://x.test/l.png', 'file:///etc/passwd', 'logo.png', '/media/../api/x', '//evil.test/l.png', '', undefined]) {
    assert.equal(safeImageSrc(hostile), undefined, String(hostile));
  }
});

/** Where the category label's element starts: its own paragraph (legacy) or a span in the cover eyebrow (families). */
const categoryAt = (page: string, text: string) => page.search(new RegExp(`>${text}</(?:p|span)>`));

test('B-029: the guest page names a category with the words the editor shows the host; "other" names nothing', () => {
  const editor = readFileSync(join(process.cwd(), 'app/(customer)/dashboard/invitations/[id]/edit/editor.tsx'), 'utf8');
  const list = /const cats:\[string,string\]\[\]=(\[[^;]*\]);/.exec(editor);
  assert.ok(list, 'the editor still lists its categories in one array');
  const editorLabels = Object.fromEntries(JSON.parse(list[1].replace(/'/g, '"')) as [string, string][]);
  const { other, ...named } = editorLabels;
  assert.ok(other, 'the editor offers "other"');
  assert.deepEqual(EVENT_CATEGORY_LABELS, named);
});

test('B-029: the mark is render-when-filled; the alt text names the organiser', () => {
  assert.equal(corporateMarkOf({}), null);
  assert.equal(corporateMarkOf({ eventCategory: 'other' }), null);
  assert.equal(corporateMarkOf({ logoUrl: 'javascript:alert(1)' }), null);
  assert.deepEqual(corporateMarkOf({ logoUrl: LOGO, eventCategory: 'seminar', organisation: ' PT Contoh ' }), {
    logo: { src: LOGO, alt: 'Logo PT Contoh' },
    category: 'Seminar',
  });
  assert.deepEqual(corporateMarkOf({ logoUrl: LOGO }), { logo: { src: LOGO, alt: 'Logo penyelenggara' }, category: undefined });
  assert.deepEqual(corporateMarkOf({ logoUrl: 'data:image/png;base64,AAAA', eventCategory: 'rups' }), { logo: undefined, category: 'RUPS' });
});

test('B-029: every layout shows the logo in its fixed frame and the category above the corporate headline', () => {
  for (const { label, familyId } of LAYOUTS) {
    const page = renderGuestPage({ config: withFamily(profile({ logoUrl: LOGO, eventCategory: 'seminar' }), familyId), invitation: corporate, guest: fixtureGuest() });
    const tag = logoTag(page);
    assert.ok(tag, `${label}: logo with intrinsic 240 × 64 size`);
    assert.equal(tag[1], LOGO, label);
    assert.equal(tag[2], 'Logo PT Contoh Nusantara', `${label}: alt names the organiser`);
    const headline = page.indexOf('<h1');
    // S22-K2 (s23r): the four families set the category in the cover's eyebrow (a span); legacy keeps its own paragraph.
    const category = categoryAt(page, 'Seminar');
    assert.ok(page.indexOf(LOGO) < headline && category > 0 && category < headline, `${label}: logo and category precede the headline`);

    const uploaded = logoTag(renderGuestPage({ config: withFamily(profile({ logoUrl: UPLOAD }), familyId), invitation: corporate }));
    assert.equal(uploaded?.[1], UPLOAD, `${label}: an uploaded logo renders from its /media path`);
  }
});

test('B-029: no mark for other event types, hostile logo URLs or the "other" category', () => {
  for (const { label, familyId } of LAYOUTS) {
    const wedding = renderGuestPage({ config: withFamily(profile({ logoUrl: LOGO, eventCategory: 'seminar' }), familyId), guest: fixtureGuest() });
    assert.equal(wedding.includes(LOGO) || categoryAt(wedding, 'Seminar') >= 0, false, `${label}: a profile left from another event type stays off the page`);

    const hostile = renderGuestPage({ config: withFamily(profile({ logoUrl: 'javascript:alert(1)', eventCategory: 'webinar' }), familyId), invitation: corporate });
    assert.equal(hostile.includes('javascript:'), false, `${label}: the hostile URL never reaches the markup`);
    assert.equal(logoTag(hostile), null, `${label}: no logo image`);
    assert.ok(categoryAt(hostile, 'Webinar') > 0, `${label}: the category still shows`);

    const other = renderGuestPage({ config: withFamily(profile({ eventCategory: 'other' }), familyId), invitation: corporate });
    assert.equal(other.includes('Lainnya') || logoTag(other) !== null, false, `${label}: nothing for "other" without a logo`);
  }
});

test('B-029: over a cover photo, legacy puts the category on the page-colour chip; Gapura sets it below its framed photo', () => {
  const withPhoto: DetailConfig = { ...profile({ eventCategory: 'seminar' }), theme: { cover: { imageUrl: 'https://cdn.contoh.test/cover.jpg' } } };
  for (const familyId of [undefined, 'gapura'] as const) {
    const page = renderGuestPage({ config: withFamily(withPhoto, familyId), invitation: corporate });
    const label = /<(?:p|span) class="([^"]*)">Seminar<\/(?:p|span)>/.exec(page);
    assert.ok(label, `${familyId ?? 'legacy'}: category shown`);
    const chip = /\bw-fit\b/.test(label[1]) && /\brounded-2xl\b/.test(label[1]);
    // Gapura no longer sets text on the photo (s17 revision, S16-X1), so its label needs no chip.
    assert.equal(chip, familyId === undefined, `${familyId ?? 'legacy'}: chip classes only where the label meets the photo`);
  }
});
