// G-018 (I-31): the guest page speaks its invitation's language. One dictionary with the same keys in Indonesian and
// English; the design families follow `settings.language`, the classic layout stays Indonesian (D-041), unset and
// `FLAG_GUEST_LANGUAGE=off` read as Indonesian and render byte-identically to before. Host words are never translated.
// Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';
import { GuestLanguageChoice } from '../app/(customer)/dashboard/invitations/[id]/edit/editor-language';
import { familyReviewInvitations } from '../invitation-research/_tools/setup/seed-family-review';
import { RENDER_CAPABILITIES, storedOnlyNotice } from '../lib/invitation/content-contract';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { FAMILY_IDS } from '../lib/invitation/families';
import { GUEST_COPY, guestCopy, guestLanguageOf, guestPageLanguage, type GuestCopy } from '../lib/invitation/guest-copy';
import { GUEST_ROUTE_HEADER, guestRouteHeaderOf, parseGuestRoute } from '../lib/invitation/guest-route';
import { invitationDisplayName } from '../lib/invitation/headline';
import { invitationShareMetadata, previewImageModel, previewImageVersion } from '../lib/invitation/preview-image';
import { catalogDefaultConfig } from '../lib/invitation/template-defaults';
import { templateEventTypes } from '../lib/invitation/template-event-types';
import { invitationTemplates } from '../lib/invitation/templates';
import { EMPTY_TRIAL_INPUT, initialDraftConfig } from '../lib/invitation/trial';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const has = (html: string, text: string) => html.includes(escapeHtml(text));
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const withLanguage = (config: DetailConfig, language?: string): DetailConfig => ({ ...config, settings: { ...config.settings, language: language as 'id' | 'en' | undefined } });

/** Runs `render` with FLAG_GUEST_LANGUAGE set as given, restoring the environment afterwards. */
function withFlag<T>(value: string | undefined, render: () => T): T {
  const before = process.env.FLAG_GUEST_LANGUAGE;
  if (value === undefined) delete process.env.FLAG_GUEST_LANGUAGE;
  else process.env.FLAG_GUEST_LANGUAGE = value;
  try {
    return render();
  } finally {
    if (before === undefined) delete process.env.FLAG_GUEST_LANGUAGE;
    else process.env.FLAG_GUEST_LANGUAGE = before;
  }
}

/** Every leaf of a dictionary with functions called on fixed sample arguments, keyed by path. */
const SAMPLE_ARGS: Record<string, unknown[]> = {
  'retryIn': [5],
  'rsvp.deadlinePassed': ['Senin, 1 Desember 2026'],
  'rsvp.condition': ['Datang bersama?', ['Ya', 'Mungkin']],
  'gallery.swipe': [5],
  'people.photoOf': ['Laras'],
  'people.parentsLine': ['putri', 'Bapak Contoh & Ibu Fiktif', 2],
  'profile.childNumber': [2],
  'profile.bornAt': ['Makassar', '08.15'],
  'profile.atTime': ['08.15'],
  'profile.years': [7],
  'corporate.logoOf': ['PT Contoh'],
  'provenance': ['Sumber Contoh', 'Pemeriksa', '2026-11-01'],
  'pass.qrAlt': ['Budi Hartono'],
};
function leaves(copy: unknown, path = ''): [string, string][] {
  if (typeof copy === 'string') return [[path, copy]];
  if (typeof copy === 'function') return [[path, String((copy as (...args: unknown[]) => unknown)(...(SAMPLE_ARGS[path] ?? [])))]];
  if (Array.isArray(copy)) return copy.flatMap((value, index) => leaves(value, `${path}[${index}]`));
  if (copy && typeof copy === 'object') return Object.entries(copy).flatMap(([key, value]) => leaves(value, path ? `${path}.${key}` : key));
  return [];
}

/** Words that are the same in both languages: names of things, not translations left out. */
const SAME_IN_BOTH = new Set(['RSVP', 'Video', 'Seminar', 'Webinar', 'Gathering', 'Gala / Award', 'Dress code']);
const INDONESIAN_WORDS = /\b(dan|yang|untuk|dari|dengan|tidak|sudah|belum|kamu|anda|undangan|acara|tamu|silakan|mohon|hadir|kirim|lihat|simpan|unduh|tutup|buka|ucapan|kado|hadiah|galeri|foto|pukul|tahun|anak|lahir|putra|putri|ke-)\b/i;

test('G-018: the dictionary has the same keys, shapes and function arities in both languages', () => {
  const walk = (id: unknown, en: unknown, path: string): string[] => {
    if (typeof id !== typeof en) return [`${path}: ${typeof id} vs ${typeof en}`];
    if (typeof id === 'function') return (id as () => unknown).length === (en as () => unknown).length ? [] : [`${path}: arity`];
    if (Array.isArray(id) || Array.isArray(en)) return Array.isArray(id) && Array.isArray(en) && id.length === en.length ? [] : [`${path}: tuple length`];
    if (id && typeof id === 'object') {
      const keys = new Set([...Object.keys(id), ...Object.keys(en as object)]);
      return [...keys].flatMap((key) =>
        key in (id as object) && key in (en as object)
          ? walk((id as Record<string, unknown>)[key], (en as Record<string, unknown>)[key], path ? `${path}.${key}` : key)
          : [`${path ? `${path}.` : ''}${key}: missing in ${key in (id as object) ? 'en' : 'id'}`],
      );
    }
    return [];
  };
  assert.deepEqual(walk(GUEST_COPY.id, GUEST_COPY.en, ''), []);
  assert.equal(leaves(GUEST_COPY.id).length, leaves(GUEST_COPY.en).length);
  assert.ok(leaves(GUEST_COPY.en).length > 200, 'the dictionary covers the guest page, not a sample of it');
});

test('G-018: no Indonesian is left in the English set', () => {
  const id = new Map(leaves(GUEST_COPY.id));
  const untranslated = leaves(GUEST_COPY.en).filter(([path, text]) => text === id.get(path) && !SAME_IN_BOTH.has(text) && /\p{L}{2,}/u.test(text));
  assert.deepEqual(untranslated, []);
  const indonesian = leaves(GUEST_COPY.en).filter(([path, text]) => INDONESIAN_WORDS.test(text) && !(path === 'people.parentsLine' || path.startsWith('rsvp.condition') || path === 'rsvp.deadlinePassed' || path === 'provenance'));
  assert.deepEqual(indonesian, []);
  // Functions that wrap host words keep them verbatim and translate only their own frame.
  assert.equal(GUEST_COPY.en.people.parentsLine('putri', 'Bapak Contoh & Ibu Fiktif', 2), 'Second daughter of Bapak Contoh & Ibu Fiktif');
  assert.equal(GUEST_COPY.en.people.parentsLine('putra', 'Bapak Contoh & Ibu Fiktif', 12), '12th son of Bapak Contoh & Ibu Fiktif');
  assert.equal(GUEST_COPY.en.people.parentsLine('putra', 'Son of Mr Example', 1), 'Son of Mr Example');
  assert.equal(GUEST_COPY.en.rsvp.condition('Datang bersama?', ['Ya']), 'Answer if your answer to “Datang bersama?” is “Ya”.');
  assert.equal(GUEST_COPY.en.retryIn(1), 'Please try again in 1 minute.');
});

test('G-018: one resolver decides every guest surface; the classic layout, unset, unknown and flag off read Indonesian', () => {
  const on = {};
  const off = { FLAG_GUEST_LANGUAGE: 'off' };
  for (const familyId of FAMILY_IDS) {
    assert.equal(guestPageLanguage({ theme: { familyId }, settings: { language: 'en' } }, on), 'en', familyId);
    assert.equal(guestPageLanguage({ theme: { familyId }, settings: { language: 'id' } }, on), 'id', familyId);
    assert.equal(guestPageLanguage({ theme: { familyId }, settings: {} }, on), 'id', `${familyId}: unset`);
    assert.equal(guestPageLanguage({ theme: { familyId }, settings: { language: 'fr' } }, on), 'id', `${familyId}: unknown`);
    assert.equal(guestPageLanguage({ theme: { familyId }, settings: { language: 'en' } }, off), 'id', `${familyId}: flag off`);
  }
  // D-041: the classic layout (no family, or a retired family id) stays Indonesian whatever is stored.
  assert.equal(guestPageLanguage({ settings: { language: 'en' } }, on), 'id');
  assert.equal(guestPageLanguage({ theme: { familyId: 'retired-family' }, settings: { language: 'en' } }, on), 'id');
  assert.equal(guestPageLanguage(null, on), 'id');
  assert.equal(guestLanguageOf('en', on), 'en');
  assert.equal(guestLanguageOf('en', off), 'id');
  assert.equal(guestLanguageOf(undefined, on), 'id');
  // Every guest surface asks the same resolver.
  for (const file of [
    'components/invitation/public-renderer.tsx',
    'lib/invitation/guest-document-language.ts',
    'lib/invitation/preview-image.ts',
    'app/i/[slug]/page.tsx',
    'app/i/[slug]/[guestSlug]/page.tsx',
    'app/i/[slug]/[guestSlug]/pass/page.tsx',
    'app/i/[slug]/og.png/route.tsx',
    'app/i/[slug]/calendar.ics/route.ts',
  ]) {
    assert.match(source(file), /guestPageLanguage\(/, file);
    assert.doesNotMatch(source(file), /guestLanguageOf\(/, `${file} never resolves the language without the layout`);
  }
});

const reviewRows = familyReviewInvitations({ programme: true, newInvitations: true, ceremony: true, profiles: true, questions: true, musicUrl: 'https://audio.example.com/nada.mp3' });
const row = (slug: string) => {
  const found = reviewRows.find((candidate) => candidate.slug === slug);
  assert.ok(found, slug);
  return found;
};
const KEY = '0f0e0d0c-0b0a-4908-8706-050403020100';
function memorialConfig(): DetailConfig {
  const template = invitationTemplates.find((candidate) => candidate.slug === 'doa-khusyuk')!;
  const trial = { input: { ...EMPTY_TRIAL_INPUT, first: 'Alm. Bapak Contoh', date: '2026-12-03', time: '19:30' }, key: KEY };
  const { config } = initialDraftConfig(catalogDefaultConfig(template), templateEventTypes[template.category], trial, {});
  // The family's own words, so the remembrance section (full name, family, message) renders.
  return {
    ...config,
    ceremonyProfile: { ...config.ceremonyProfile, honoureeName: 'Alm. Bapak Contoh Fiktif bin Rekaan', parents: 'Keluarga Besar Contoh', ceremonyNote: 'Mohon doa untuk almarhum.' },
  };
}

/** Visible text and accessible labels, the words a guest reads or hears; element ids and class names are not copy. */
function guestWords(html: string): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const unescape = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const labels = [...body.matchAll(/\b(?:aria-label|alt|title|placeholder|aria-roledescription)="([^"]*)"/g)].map((match) => unescape(match[1]));
  const text = body.replace(/<[^>]+>/g, '\n').split('\n').map((value) => unescape(value).trim()).filter(Boolean);
  return [...labels, ...text];
}

test('G-018: unset, Indonesian and flag off render byte-identically; the classic layout ignores English (D-041)', (t) => {
  // One clock for every render: the countdown prints the seconds left, which would differ between two renders otherwise.
  t.mock.method(Date, 'now', () => Date.parse('2026-11-11T06:00:00Z'));
  const configs: [string, string, DetailConfig][] = [
    ['wedding', 'wedding', row('review-gapura-full').config],
    ['corporate', 'corporate', row('review-gapura-programme').config],
    ['aqiqah', 'aqiqah', row('review-gapura-aqiqah').config],
    ['memorial', 'tasyakuran', memorialConfig()],
  ];
  for (const { label, familyId } of LAYOUTS) {
    for (const [content, eventType, stored] of configs) {
      const invitation = fixtureInvitation({ eventType });
      const page = (language?: string, flag?: string) =>
        withFlag(flag, () => renderGuestPage({ config: withLanguage(withFamily(stored, familyId), language), invitation, guest: fixtureGuest() }));
      const unset = page(undefined);
      assert.equal(page('id'), unset, `${label}/${content}: explicit Indonesian`);
      assert.equal(page('en', 'off'), unset, `${label}/${content}: flag off`);
      if (!familyId) assert.equal(page('en'), unset, `${label}/${content}: classic stays Indonesian`);
      else assert.notEqual(page('en'), unset, `${label}/${content}: a family follows English`);
      assert.doesNotMatch(unset, / lang="/, `${label}/${content}: an Indonesian page adds no lang attribute`);
    }
  }
});

test('G-018: every family renders its own words, dates and labels in English, wedding and non-wedding alike', () => {
  const cases: [string, string, DetailConfig][] = [
    ['wedding', 'wedding', row('review-gapura-full').config],
    ['birthday', 'birthday', row('review-gapura-birthday').config],
    ['aqiqah', 'aqiqah', row('review-gapura-aqiqah').config],
    ['khitanan', 'khitanan', row('review-gapura-khitanan').config],
    ['tasyakuran', 'tasyakuran', row('review-gapura-tasyakuran').config],
    ['corporate', 'corporate', row('review-gapura-programme').config],
    ['questions', 'wedding', row('review-gapura-questions').config],
    ['music', 'wedding', row('review-gapura-music').config],
  ];
  const idOnly = leaves(GUEST_COPY.id)
    .filter(([path, text]) => text !== new Map(leaves(GUEST_COPY.en)).get(path) && text.length >= 4 && !SAME_IN_BOTH.has(text))
    .map(([, text]) => text);
  for (const familyId of FAMILY_IDS) {
    for (const [content, eventType, stored] of cases) {
      const config = withLanguage(withFamily(stored, familyId), 'en');
      const html = renderGuestPage({ config, invitation: fixtureInvitation({ eventType }), guest: fixtureGuest(), guestPassHref: '/i/budi-sari/budi-hartono/pass' });
      const key = `${familyId}/${content}`;
      assert.match(html, /<main lang="en"/, `${key}: the layout marks its English root`);
      const hostText = strings(stored).join('\n');
      const words = guestWords(html);
      // Whole words only: "Profil" is Indonesian, "Profile" is not.
      const leaked = idOnly.filter((text) => {
        const pattern = new RegExp(`(?:^|[^\\p{L}])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}])`, 'u');
        return words.some((word) => pattern.test(word)) && !hostText.includes(text);
      });
      assert.deepEqual(leaked, [], `${key}: no Indonesian product words`);
    }
    const wedding = renderGuestPage({ config: withLanguage(withFamily(row('review-gapura-full').config, familyId), 'en'), invitation: fixtureInvitation(), guest: fixtureGuest() });
    // Each family greets the guest in its own voice: Riang says "For", the others "Dear".
    const greeting = familyId === 'riang' ? GUEST_COPY.en.forYou : GUEST_COPY.en.dear;
    for (const text of [greeting, GUEST_COPY.en.sections.rsvp, GUEST_COPY.en.rsvp.yes, GUEST_COPY.en.wishes.submit, GUEST_COPY.en.calendarGoogle]) {
      assert.ok(has(wedding, text), `${familyId}: "${text}"`);
    }
  }
});

test('G-018: dates read in English while the event keeps its own day and zone label', () => {
  const config: DetailConfig = {
    couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
    events: [{ id: 'ev-g018a', title: 'Akad Nikah', startAt: '2026-12-28T00:30:00+08:00', endAt: '2026-12-28T01:30:00+08:00', venueName: 'Gedung Contoh' }],
    settings: { language: 'en' },
  };
  for (const familyId of FAMILY_IDS) {
    const html = renderGuestPage({ config: withFamily(config, familyId) });
    assert.ok(html.includes('Monday, 28 December 2026'), `${familyId}: the event's own day in English`);
    assert.ok(html.includes('00:30 WITA'), `${familyId}: the event's zone label`);
    assert.ok(has(html, 'Akad Nikah') && has(html, 'Gedung Contoh'), `${familyId}: host words untouched`);
    assert.doesNotMatch(html, /Desember|Senin|WIB/, `${familyId}: no Indonesian date and no server-zone label`);
  }
});

test('G-018: a memorial stays sober in English and never borrows a celebration word', () => {
  const memorial = withLanguage(memorialConfig(), 'en');
  assert.ok(memorial.theme?.familyId, 'a memorial starts on a family (F-02)');
  for (const familyId of FAMILY_IDS) {
    const config = withFamily(memorial, familyId);
    const html = renderGuestPage({ config, invitation: fixtureInvitation({ eventType: 'tasyakuran' }), guest: fixtureGuest() });
    assert.ok(has(html, GUEST_COPY.en.memorial.heading), `${familyId}: "${GUEST_COPY.en.memorial.heading}"`);
    assert.ok(has(html, 'Alm. Bapak Contoh'), `${familyId}: the name as the family wrote it`);
    const hostText = strings(config).join('\n');
    const words = (html.replace(/<[^>]+>/g, ' ').match(/\b(thanksgiving|celebrat\w*|party|happy|joy\w*)\b/gi) ?? []).filter((word) => !hostText.toLowerCase().includes(word.toLowerCase()));
    assert.deepEqual(words, [], `${familyId}: sober`);
  }
});

test('G-018: long names and host words are printed as written in English', () => {
  const longName = 'Raden Ayu Siti Nurhaliza Kusumawardhani Prameswari Hadiningrat binti Contoh';
  const stored = row('review-gapura-full').config;
  for (const familyId of FAMILY_IDS) {
    const config = withLanguage(withFamily(stored, familyId), 'en');
    const html = renderGuestPage({ config, invitation: fixtureInvitation(), guest: fixtureGuest({ name: longName }) });
    assert.ok(has(html, longName), `${familyId}: the guest's name`);
    for (const text of [stored.settings?.openingCopy, stored.events?.[0]?.title, stored.events?.[0]?.venueName].filter((value): value is string => Boolean(value))) {
      assert.ok(has(html, text), `${familyId}: host words "${text.slice(0, 30)}"`);
    }
  }
});

test('G-018: the gift card names the account holder in the page language; Indonesian keeps its exact text nodes', () => {
  const config: DetailConfig = { gift: { enabled: true, accounts: [{ label: 'Bank Contoh', kind: 'bank', number: '1234567890', holder: 'Laras Ayuningtyas' }] } };
  for (const familyId of FAMILY_IDS) {
    const id = renderGuestPage({ config: withFamily(config, familyId), guest: fixtureGuest() });
    const en = renderGuestPage({ config: withLanguage(withFamily(config, familyId), 'en'), guest: fixtureGuest() });
    assert.ok(id.includes('a.n. Laras Ayuningtyas'), familyId);
    assert.ok(en.includes('Account name: Laras Ayuningtyas') && !en.includes('a.n. '), familyId);
  }
});

test('G-018: the link preview speaks the page language; an Indonesian card keeps its pre-G-018 version', () => {
  const base = { couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } }, events: [{ id: 'ev-a1', title: 'Akad', startAt: '2026-12-28T00:30:00+08:00' }], theme: { paletteId: 'sage' } } as DetailConfig;
  const gapura = withFamily(base, 'gapura');
  // `5k07ql` is this card's version on the tree before G-018 (s49, rendered there); unchanged, so no cached card goes stale.
  for (const config of [base, withLanguage(base, 'en'), gapura, withLanguage(gapura, 'id')]) assert.equal(previewImageVersion(previewImageModel('wedding', config, true)), '5k07ql');
  const english = previewImageModel('wedding', withLanguage(gapura, 'en'), true);
  assert.equal(english.label, 'Wedding Invitation');
  assert.equal(english.date, 'Monday, 28 December 2026');
  assert.equal(invitationShareMetadata({ slug: 'budi-sari', eventType: 'wedding' }, withLanguage(gapura, 'en')).openGraph.locale, 'en_GB');
  assert.equal(invitationShareMetadata({ slug: 'budi-sari', eventType: 'wedding' }, withLanguage(base, 'en')).openGraph.locale, 'id_ID');
  assert.equal(invitationDisplayName('birthday', {}, guestCopy('en').invitation), 'Invitation');
  assert.equal(invitationDisplayName('birthday', {}, guestCopy('id').invitation), 'Undangan');
});

test('G-018: the document language comes from the guest route the proxy names, never from the client', () => {
  assert.equal(guestRouteHeaderOf('/i/budi-sari'), 'budi-sari');
  assert.equal(guestRouteHeaderOf('/i/budi-sari/'), 'budi-sari');
  assert.equal(guestRouteHeaderOf('/i/budi-sari/budi-hartono'), 'budi-sari/budi-hartono');
  assert.equal(guestRouteHeaderOf('/i/budi-sari/budi-hartono/pass'), 'budi-sari/budi-hartono/pass');
  // A guest whose link segment is literally "pass" is a personal page, not a pass.
  assert.equal(guestRouteHeaderOf('/i/budi-sari/pass'), 'budi-sari/pass');
  for (const path of ['/i', '/i/', '/dashboard', '/preview/12', '/i/budi-sari/budi-hartono/photo/couple', '/i/budi-sari/budi-hartono/gift/qris', '/i/budi-sari/gift/qris', '/x/i/budi-sari']) {
    assert.equal(guestRouteHeaderOf(path), null, path);
  }
  assert.deepEqual(parseGuestRoute('budi-sari'), { slug: 'budi-sari' });
  assert.deepEqual(parseGuestRoute('budi-sari/budi%20hartono'), { slug: 'budi-sari', guestSlug: 'budi hartono' });
  assert.deepEqual(parseGuestRoute('budi-sari/budi-hartono/pass'), { slug: 'budi-sari', guestSlug: 'budi-hartono', pass: true });
  assert.deepEqual(parseGuestRoute('budi-sari/pass'), { slug: 'budi-sari', guestSlug: 'pass' });
  for (const value of [null, undefined, '', 'a/b/c', '/a', 'a/', '%E0%A4%A', 'a//pass', 'a/b/pass/c', 'a/b/pass/']) assert.equal(parseGuestRoute(value), null, String(value));
  const proxy = source('proxy.ts');
  const removed = proxy.indexOf(`requestHeaders.delete(GUEST_ROUTE_HEADER)`);
  const set = proxy.indexOf(`requestHeaders.set(GUEST_ROUTE_HEADER`);
  assert.ok(removed > 0 && set > removed, 'a client copy is removed before the proxy sets its own');
  assert.equal(GUEST_ROUTE_HEADER, 'x-guest-route');
  assert.match(source('app/layout.tsx'), /lang = \(await guestDocumentLanguage\(\)\) \?\? \(await getLocale\(\)\)/);
});

test('G-018: the guest pass speaks the page language and keeps no Indonesian of its own', () => {
  const page = source('app/i/[slug]/[guestSlug]/pass/page.tsx');
  for (const text of ['Tunjukkan QR', 'Kembali ke undangan', 'QR pass untuk', 'sudah tidak berlaku', 'lang="id"', "'QR pass tamu'"]) assert.ok(!page.includes(text), text);
  for (const key of ['pass.title', 'pass.qrAlt(', 'pass.expired', 'pass.instructions', 'pass.back', 'lang={language}', ', language);']) assert.ok(page.includes(key), key);
  // The pass's own guards are unchanged (personal link, flag, opt-in and secret, now one rule), then a signed, expiring token.
  assert.match(page, /if \(!guestPassAvailable\(data\) \|\| !secret\) notFound\(\);/);
  assert.match(page, /signGuestPass\(secret, data\.guest\.passId, expiresAt\)/);
  assert.equal(GUEST_COPY.en.pass.qrAlt('Budi Hartono'), 'QR pass for Budi Hartono');
});

test('G-018: every guest 404 reads in the visitor locale (title, body and document) and says nothing about the invitation', () => {
  assert.equal(GUEST_COPY.id.notFoundTitle, 'Undangan tidak ditemukan', 'the Indonesian 404 title the pages always had');
  assert.equal(GUEST_COPY.en.notFoundTitle, 'Invitation not found');
  for (const page of ['app/i/[slug]/page.tsx', 'app/i/[slug]/[guestSlug]/page.tsx']) {
    assert.match(source(page), /if \(!data\) return \{ title: guestCopy\(await getLocale\(\)\)\.notFoundTitle \};/, page);
  }
  assert.match(
    source('app/i/[slug]/[guestSlug]/pass/page.tsx'),
    /title: guestPassAvailable\(data\) \? guestCopy\(guestPageLanguage\(data\.config\)\)\.pass\.title : guestCopy\(await getLocale\(\)\)\.notFoundTitle,/,
  );
  // The document follows: no invitation language for a page that answers 404, a pass that does not exist included.
  assert.match(source('lib/invitation/guest-document-language.ts'), /if \(!data \|\| \(route\.pass && !guestPassAvailable\(data\)\)\) return null;/);
  // The body is the app's own 404, in the visitor's locale.
  assert.match(source('app/not-found.tsx'), /\(await getLocale\(\)\) === 'en'/);
});

test('G-018: the editor offers the language beside the layout and says when the classic layout keeps Indonesian', () => {
  const render = (value?: string, familyId?: string) => renderToStaticMarkup(createElement(GuestLanguageChoice, { value, familyId, onChange: () => {} }));
  const unset = render(undefined, 'gapura');
  const checked = (html: string) => [...html.matchAll(/<input\b[^>]*>/g)].filter(([tag]) => tag.includes('checked=""')).map(([tag]) => /value="(\w+)"/.exec(tag)?.[1]);
  assert.deepEqual(checked(unset), ['id'], 'unset reads as Indonesian');
  assert.deepEqual(checked(render('id', 'gapura')), ['id']);
  assert.deepEqual(checked(render('en', 'gapura')), ['en']);
  assert.match(unset, /<legend[^>]*>Bahasa untuk tamu<\/legend>/);
  assert.match(unset, /<fieldset aria-describedby="[^"]+"/);
  assert.ok(render('en', undefined).includes('Tata letak klasik selalu tampil dalam Bahasa Indonesia'));
  assert.ok(!unset.includes('Tata letak klasik'));
  assert.ok(unset.includes('<span lang="en"'), 'the English option is announced in English');
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /patch\('settings',\{\.\.\.section\('settings'\),language:x\}\)/, 'saved through the normal settings save, other settings kept');
  assert.match(editor, /\{guestLanguage && <Card title="Bahasa halaman tamu"/, 'hidden with the flag off');
  assert.match(source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx'), /guestLanguage=\{isFlagOn\('GUEST_LANGUAGE'\)\}/);
});

test('G-018: the content contract lists the language as rendered, so the editor no longer calls it unseen', () => {
  assert.ok((RENDER_CAPABILITIES.settings.rendered as readonly string[]).includes('language'));
  assert.ok(!(RENDER_CAPABILITIES.settings.storedOnly as readonly string[]).includes('language'));
  assert.deepEqual(storedOnlyNotice('settings', 'id')?.fields, ['jenis huruf']);
});

test('G-018: the countdown, gift copy, lightbox and cover islands receive the page language as plain props', () => {
  const copy: GuestCopy = GUEST_COPY.en;
  for (const labels of [copy.countdown, copy.giftCopy, copy.lightbox, copy.cover]) {
    for (const value of Object.values(labels)) assert.equal(typeof value, 'string', 'island props cross to the browser as strings');
  }
  for (const familyId of FAMILY_IDS) {
    const file = source(`components/invitation/families/${familyId}.tsx`);
    assert.match(file, /labels=\{view\.copy\.countdown\}/, familyId);
    assert.match(file, /labels=\{view\.copy\.giftCopy\}/, familyId);
    assert.match(file, /lang=\{view\.contentLang\}/, familyId);
  }
  assert.match(source('components/invitation/gallery.tsx'), /labels=\{copy\.lightbox\}/);
  assert.match(source('components/invitation/public-renderer.tsx'), /labels=\{family \? view\.copy\.cover : undefined\}/);
});
