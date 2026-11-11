// Content contract (s11): the render-capability map agrees with the renderer, the editor notices are derived from it,
// stored configs are read leniently per section, and guest pages get no locale cookie (B-014 step 1).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CONTENT_SCHEMA_VERSION,
  RENDER_CAPABILITIES,
  sectionForEditorTab,
  storedOnlyNotice,
  type ContentSection,
} from '../lib/invitation/content-contract';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { viewLockKey } from '../lib/invitation/view-tracking';
import { mirrorsLocaleCookie } from '../lib/locale-cookie';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
// Every file that renders guest-page content, design families included (B-030): a family that reads a stored-only
// field must fail here exactly like the legacy layout would.
const guestPageFiles = [
  'components/invitation/public-renderer.tsx',
  'components/invitation/guest-view.ts',
  'components/invitation/guest-blocks.tsx',
  'components/invitation/cover-audio.tsx',
  ...readdirSync(join(process.cwd(), 'components/invitation/families')).map((file) => `components/invitation/families/${file}`),
  // B-030's composition and shared sections, and G-041's choices (`familyChoices` reads the theme's order and pairing).
  'components/invitation/family-sections.tsx',
  'lib/invitation/family-manifest.ts',
  'lib/invitation/headline.ts',
  // G-018: the guest page's words and the one language resolver (`guestPageLanguage` reads `settings.language`).
  'lib/invitation/guest-copy.ts',
  // G-035: the one rule for the footer's share actions and the Story image (`inviteShareAvailable` reads `settings.guestShare`).
  'lib/invitation/invite-share.ts',
  // I-21: the one rule for the post-event memory (`postEventSettings` reads the section) and the section that renders it.
  'lib/invitation/post-event.ts',
  'components/invitation/post-event-memory.tsx',
];
const guestPageSource = guestPageFiles.map(source).join('\n');
const ITEM_ALIAS: Partial<Record<ContentSection, string>> = { events: 'event', gift: 'account', story: 'item', registrationForm: 'question' };
const chain = (section: string, path: string) => new RegExp(`${[section, ...path.split('.')].join('\\??\\.')}\\b`);
const referenced = (section: ContentSection, path: string) =>
  chain(section, path).test(guestPageSource) ||
  (ITEM_ALIAS[section] !== undefined && new RegExp(`\\b${ITEM_ALIAS[section]}\\.${path}\\b`).test(guestPageSource));

test('every config section is classified, and nothing else', () => {
  assert.deepEqual(Object.keys(RENDER_CAPABILITIES).sort(), Object.keys(detailConfigSchema.shape).sort());
});

test('every field marked rendered is read by the guest page', () => {
  const missing = Object.entries(RENDER_CAPABILITIES).flatMap(([section, cap]) =>
    cap.rendered.filter((path) => !referenced(section as ContentSection, path)).map((path) => `${section}.${path}`));
  assert.deepEqual(missing, []);
});

test('no field marked stored-only is read by the guest page (move it to rendered when a template renders it)', () => {
  const rendered = Object.entries(RENDER_CAPABILITIES).flatMap(([section, cap]) =>
    cap.storedOnly.filter((path) => referenced(section as ContentSection, path)).map((path) => `${section}.${path}`));
  assert.deepEqual(rendered, []);
});

test('editor notices come from the map: whole sections, field lists and caveats', () => {
  // B-009 (D-045): music plays now, so its tab no longer says the section is stored only.
  assert.equal(storedOnlyNotice('music', 'id'), null);
  // No section is stored-only as a whole any more; a partly rendered one lists only the fields guests do not see.
  const streaming = storedOnlyNotice('streaming', 'id');
  assert.equal(streaming?.wholeSection, false);
  assert.deepEqual(streaming?.fields, ['platform', 'jadwal siaran']);
  // B-029 (s17) renders the hashtag and filter link, so the section no longer carries a notice; the ceremony profile
  // keeps one for its photo only.
  assert.equal(storedOnlyNotice('instagramStory', 'en'), null);
  // s20 (D-038): the photos and the couple's parents render now; only the couple's Instagram stays stored-only.
  assert.equal(storedOnlyNotice('ceremonyProfile', 'id'), null);
  const couple = storedOnlyNotice('couple', 'id');
  assert.equal(couple?.wholeSection, false);
  assert.deepEqual(couple?.fields, ['Instagram'], JSON.stringify(couple));
  assert.equal(new Set(couple?.fields).size, couple?.fields.length, 'bride and groom fields collapse into one label each');
  // R-04 (D-044): moderation works now, so the guestbook tab no longer warns that it does not.
  assert.equal(storedOnlyNotice('guestbook', 'id'), null);
  assert.equal(storedOnlyNotice('events', 'id'), null);
  assert.equal(storedOnlyNotice('quote', 'en'), null);
  // B-025: the families honour the gallery layout, so the gallery tab no longer lists it as not shown.
  assert.equal(storedOnlyNotice('gallery', 'id'), null);
});

test('the profile tab edits a different section per event type', () => {
  assert.equal(sectionForEditorTab('couple', 'wedding'), 'couple');
  assert.equal(sectionForEditorTab('couple', 'birthday'), 'birthdayPerson');
  assert.equal(sectionForEditorTab('couple', 'corporate'), 'corporateProfile');
  for (const ceremony of ['aqiqah', 'khitanan', 'tasyakuran']) assert.equal(sectionForEditorTab('couple', ceremony), 'ceremonyProfile');
  assert.equal(sectionForEditorTab('whatsapp', 'wedding'), 'whatsappTemplate');
  assert.equal(sectionForEditorTab('music', 'wedding'), 'music');
  assert.equal(sectionForEditorTab('settings', 'wedding'), 'settings');
  assert.equal(sectionForEditorTab('nonsense', 'wedding'), null);
});

test('lenient read: a valid config round-trips, version absent means 1', () => {
  const config = { settings: { title: 'Budi & Sari' }, quote: { enabled: true, text: 'Teks', author: 'A' } };
  const read = normalizeStoredConfig(config);
  assert.deepEqual(read.dropped, []);
  assert.equal(read.version, 1);
  // D-036: version 2 keys every event; a version-1 config is migrated on read (tests/b027-event-ids.test.ts).
  assert.equal(CONTENT_SCHEMA_VERSION, 2);
  assert.equal(read.config.settings?.title, 'Budi & Sari');
  assert.equal(read.config.quote?.text, 'Teks');
});

test('lenient read: a legacy or broken section is dropped, the rest still renders', () => {
  const legacy = {
    settings: { title: 'Dimas & Laras' },
    art: { cover: 'x' }, // ADR-O01 leftover: template-owned key that once leaked into invitation configs
    events: [{ title: 'Akad', startAt: 'not-a-date' }],
    gift: { enabled: true, accounts: [{ kind: 'bank', label: 'BCA', number: '123' }] },
  };
  assert.equal(detailConfigSchema.safeParse(legacy).success, false, 'the strict schema rejects it as a whole');
  const read = normalizeStoredConfig(legacy);
  assert.deepEqual(read.dropped.sort(), ['art', 'events']);
  assert.equal(read.config.settings?.title, 'Dimas & Laras');
  assert.equal(read.config.gift?.accounts?.[0]?.label, 'BCA');
  assert.equal(read.config.events, undefined);
});

test('lenient read: non-objects become an empty config; a future version keeps the sections it can read', () => {
  for (const raw of [null, undefined, 'x', 42, ['a']]) assert.deepEqual(normalizeStoredConfig(raw).config, {});
  const future = normalizeStoredConfig({ schemaVersion: 3, settings: { title: 'T' }, newSection: { a: 1 } });
  assert.equal(future.version, 3);
  assert.equal(future.config.settings?.title, 'T');
  assert.deepEqual(future.dropped, ['newSection']);
});

test('B-014 step 1: guest pages get no locale cookie; other routes still do', () => {
  assert.equal(mirrorsLocaleCookie('/i/budi-sari/budi-hartono'), false);
  assert.equal(mirrorsLocaleCookie('/i/budi-sari'), false);
  assert.equal(mirrorsLocaleCookie('/i'), false);
  assert.equal(mirrorsLocaleCookie('/'), true);
  assert.equal(mirrorsLocaleCookie('/invitations'), true, 'a path that merely starts with "i" keeps the cookie');
  assert.equal(mirrorsLocaleCookie('/dashboard'), true);
  assert.match(source('proxy.ts'), /if \(mirrorsLocaleCookie\(pathname\)\) \{\s*res\.cookies\.set\('locale'/);
});

test('B-014 step 1: one loader call per request — the loader is wrapped in React cache()', () => {
  assert.match(source('lib/invitation/public.ts'), /export const loadPublicInvitation = cache\(async \(slug: string, guestSlug\?: string, includeDraft = false\)/);
});

test('B-017a: advisory-lock keys never collide between guests and anonymous opens', () => {
  assert.equal(viewLockKey(7, 42), 42);
  assert.equal(viewLockKey(7, null), -7);
  assert.equal(viewLockKey(7, undefined), -7);
  assert.notEqual(viewLockKey(42, null), viewLockKey(1, 42));
});
