// B-037 + I-08: the wizard's typed content (names, date, theme) and its try-with-your-names preview. The preview renders
// the real guest renderer with typed props and nothing stored; the config it draws is the one the draft stores
// (`initialDraftConfig`, the same function creation uses); hostile, right-to-left, long and emoji input render as text;
// the visitor's cookie carries only the bounded input and a draft key; the slug comes from the names. Source guards pin
// the routes to the flag, the renderer, the creation facade and the frame policy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { formCount, linkHrefs, renderGuestPage } from './support/render-guest-page';
import { normalizeStoredConfig } from '../lib/invitation/content-read';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { configForAudience } from '../lib/invitation/gift-privacy';
import { isFlagOn } from '../lib/flags';
import { catalogDefaultConfig } from '../lib/invitation/template-defaults';
import { templateEventTypes } from '../lib/invitation/template-event-types';
import { templateUseHref } from '../lib/invitation/template-use-href';
import { getTemplateBySlug, invitationTemplates, type InvitationTemplate } from '../lib/invitation/templates';
import {
  decodeTrialState,
  draftKeySchema,
  draftSlugBase,
  EMPTY_TRIAL_INPUT,
  encodeTrialState,
  initialDraftConfig,
  previewInput,
  trialEventId,
  trialInputSchema,
  trialPlaceholders,
  trialSaveIssues,
  type TrialInput,
  type TrialState,
} from '../lib/invitation/trial';
import { TRIAL_PREVIEW_SLUG, trialPreviewInvitation, trialPreviewProps } from '../lib/invitation/trial-preview';

const KEY = '3f9a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const typed = (over: Partial<Omit<TrialInput, 'slug'>> = {}): Omit<TrialInput, 'slug'> => ({
  first: 'Sari',
  second: 'Budi',
  date: '2027-02-14',
  time: '10:30',
  zone: 'Asia/Makassar',
  ...over,
});
const firstOfType = (eventType: string): InvitationTemplate => {
  const found = invitationTemplates.find((template) => templateEventTypes[template.category] === eventType);
  assert.ok(found, `the catalog has a ${eventType} theme`);
  return found;
};
const draftOf = (template: InvitationTemplate, input: Omit<TrialInput, 'slug'> | null, env: Record<string, string | undefined> = {}) =>
  initialDraftConfig(catalogDefaultConfig(template), templateEventTypes[template.category], input ? { input, key: KEY } : null, env).config;
const previewHtml = (template: InvitationTemplate, config: DetailConfig) => {
  const props = trialPreviewProps(trialPreviewInvitation(templateEventTypes[template.category], config), config);
  return renderGuestPage(props);
};

test('every catalog theme starts a valid draft config with the new-invitation defaults', () => {
  for (const template of invitationTemplates) {
    const config = draftOf(template, null);
    assert.ok(detailConfigSchema.safeParse(config).success, `${template.slug}: strict schema`);
    assert.equal(config.theme?.templateId, template.id, `${template.slug}: names its own catalog theme`);
    assert.equal(config.theme?.paletteId, template.paletteId, `${template.slug}: its palette`);
    assert.equal((config.gift as { personalOnly?: boolean } | undefined)?.personalOnly, true, `${template.slug}: gift details on personal links (B-026)`);
    assert.ok(config.theme?.familyId, `${template.slug}: the event type's family (F-02, DEFAULT_FAMILY on)`);
  }
  const legacy = draftOf(getTemplateBySlug('sage-garden')!, null, { FLAG_DEFAULT_FAMILY: 'off' });
  assert.equal(legacy.theme?.familyId, undefined, 'DEFAULT_FAMILY off leaves the layout to the preset');
});

test("typed names and the date land in the event type's own fields, with a durable event id", () => {
  const expectations: Record<string, (config: DetailConfig) => void> = {
    wedding: (config) => {
      assert.equal(config.couple?.bride?.nickName, 'Sari');
      assert.equal(config.couple?.groom?.nickName, 'Budi');
    },
    birthday: (config) => assert.equal(config.birthdayPerson?.nickName, 'Sari'),
    aqiqah: (config) => assert.equal(config.ceremonyProfile?.nickName, 'Sari'),
    tasyakuran: (config) => assert.equal(config.ceremonyProfile?.nickName, 'Sari'),
    corporate: (config) => {
      assert.equal(config.corporateProfile?.eventName, 'Sari');
      assert.equal(config.corporateProfile?.organizationName, 'Budi');
    },
  };
  for (const [eventType, check] of Object.entries(expectations)) {
    const config = draftOf(firstOfType(eventType), typed());
    check(config);
    assert.equal(config.events?.length, 1, `${eventType}: one event`);
    assert.equal(config.events?.[0].startAt, '2027-02-14T10:30:00+08:00', `${eventType}: the date in the chosen zone (WITA)`);
    assert.equal(config.events?.[0].id, trialEventId(KEY), `${eventType}: the id is fixed by the draft key`);
  }
  assert.match(trialEventId(KEY), /^ev-[a-z0-9]{10}$/);
  assert.equal(draftOf(firstOfType('wedding'), typed({ date: '' })).events?.length ?? 0, 0, 'no date, no event');
});

test('the preview renders the typed names through the real guest renderer, on a family and on the legacy layout', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-07T12:00:00Z') });
  const template = getTemplateBySlug('sage-garden')!;
  for (const env of [{}, { FLAG_DEFAULT_FAMILY: 'off' }]) {
    const config = draftOf(template, typed({ first: 'Kirana', second: 'Arga' }), env);
    const html = previewHtml(template, config);
    assert.ok(html.includes('Kirana') && html.includes('Arga'), `typed names render (${JSON.stringify(env)})`);
    assert.equal(formCount(html), 0, 'no RSVP or guestbook form without a guest link');
    assert.ok(!linkHrefs(html).some((href) => href.startsWith('/i/') && !href.startsWith(`/i/${TRIAL_PREVIEW_SLUG}`)), 'no link to a real invitation');
  }
});

test('hostile, right-to-left, long and emoji names render as text, never as markup', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-07T12:00:00Z') });
  const template = getTemplateBySlug('sage-garden')!;
  const hostile = trialInputSchema.parse({ slug: template.slug, ...typed({ first: '<script>alert(1)</script>', second: '"><img src=x onerror=alert(1)>' }) });
  const html = previewHtml(template, draftOf(template, hostile));
  assert.ok(!html.includes('<script>alert(1)'), 'no script element from input');
  assert.ok(!/<img[^>]*onerror=/i.test(html), 'no img element with a handler from input');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the text is shown escaped');

  const rtl = trialInputSchema.parse({ slug: template.slug, ...typed({ first: 'سارة', second: 'محمد' }) });
  const rtlHtml = previewHtml(template, draftOf(template, rtl));
  assert.ok(rtlHtml.includes('سارة') && rtlHtml.includes('محمد'), 'right-to-left names render');

  const long = 'Raden Ajeng Kartika Sari Dewi Wulandari Putri Pertiwi Ayuningtyas'.slice(0, 60);
  const longHtml = previewHtml(template, draftOf(template, trialInputSchema.parse({ slug: template.slug, ...typed({ first: long, second: 'Budi 💍' }) })));
  assert.ok(longHtml.includes(long), 'a 60-character name renders whole');
  assert.ok(longHtml.includes('Budi 💍'), 'emoji render');
});

test('the input schema bounds and cleans what a visitor can type', () => {
  const base = { slug: 'sage-garden', ...typed() };
  assert.equal(trialInputSchema.safeParse({ ...base, first: 'x'.repeat(61) }).success, false, 'longer than 60 is refused');
  assert.equal(trialInputSchema.parse({ ...base, first: '  Sari\u0007\n  ' }).first, 'Sari', 'control characters and padding are removed');
  assert.equal(trialInputSchema.parse({ ...base, first: '\u202eiraS\u202c' }).first, 'iraS', 'bidi overrides are removed');
  assert.equal(trialInputSchema.safeParse({ ...base, date: '2026-02-30' }).success, false, 'an impossible date');
  assert.equal(trialInputSchema.safeParse({ ...base, time: '24:00' }).success, false, 'an impossible time');
  assert.equal(trialInputSchema.safeParse({ ...base, zone: 'Asia/Tokyo' }).success, false, 'zones of Indonesia only');
  assert.equal(trialInputSchema.safeParse({ ...base, slug: '../admin' }).success, false, 'a catalog slug only');
  assert.equal(trialInputSchema.safeParse({ ...base, extra: 'x' }).success, false, 'nothing else rides along');
  assert.equal(trialInputSchema.safeParse({ ...base, date: '' }).success, true, 'an empty date while typing');
});

test("placeholders fill only the preview; a save needs the names the event type asks for and the date", () => {
  const template = getTemplateBySlug('eternal-ivory')!;
  const placeholders = trialPlaceholders(template, 'wedding');
  assert.deepEqual(placeholders, { first: 'Alya', second: 'Raka' });
  assert.deepEqual(previewInput(EMPTY_TRIAL_INPUT, placeholders, 'wedding'), { ...EMPTY_TRIAL_INPUT, first: 'Alya', second: 'Raka' });
  assert.deepEqual(previewInput(typed({ second: '' }), placeholders, 'wedding'), { ...typed(), second: 'Raka' });
  assert.deepEqual(trialSaveIssues('wedding', EMPTY_TRIAL_INPUT).map((issue) => issue.field), ['first', 'second', 'date']);
  assert.deepEqual(trialSaveIssues('corporate', typed({ second: '' })), [], 'the organiser is optional');
  assert.deepEqual(trialSaveIssues('birthday', typed({ second: '' })), []);
  assert.deepEqual(trialSaveIssues('wedding', typed()), []);
});

test("the cookie holds the bounded input and a draft key, and nothing that is not one", () => {
  const state: TrialState = { v: 1, key: KEY, slug: 'sage-garden', ...typed() };
  const raw = encodeTrialState(state);
  assert.match(raw, /^[A-Za-z0-9_-]+$/, 'base64url: no quoting in a cookie');
  assert.ok(raw.length < 512, `small (${raw.length})`);
  assert.deepEqual(decodeTrialState(raw), state);
  const tamper = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.equal(decodeTrialState(undefined), null);
  assert.equal(decodeTrialState('not base64 json'), null);
  assert.equal(decodeTrialState('a'.repeat(3000)), null, 'oversized');
  assert.equal(decodeTrialState(tamper({ ...state, key: 'not-a-uuid' })), null);
  assert.equal(decodeTrialState(tamper({ ...state, v: 2 })), null, 'another shape');
  assert.equal(decodeTrialState(tamper({ ...state, userId: 7 })), null, 'nothing rides along');
  assert.equal(decodeTrialState(tamper({ ...state, first: 'x'.repeat(61) })), null);
});

test('the slug comes from the typed names, else the theme name, else the event type, bounded for a suffix', () => {
  assert.equal(draftSlugBase('wedding', typed(), 'Sage Garden'), 'sari-budi');
  assert.equal(draftSlugBase('birthday', typed(), 'Confetti'), 'sari', 'single-name types use the first name');
  assert.equal(draftSlugBase('corporate', typed({ first: 'Rapat Tahunan', second: 'PT Contoh' }), 'Slate'), 'rapat-tahunan-pt-contoh');
  assert.equal(draftSlugBase('wedding', typed({ first: 'سارة', second: 'محمد' }), 'Sage Garden'), 'sage-garden', 'no URL letters: the theme name');
  assert.equal(draftSlugBase('wedding', typed({ first: 'سارة', second: 'محمد' }), null), 'wedding', 'then the event type');
  assert.equal(draftSlugBase('wedding', null, 'Sage Garden'), 'sage-garden', 'no typed content: the theme name, as before B-037');
  const hostile = draftSlugBase('wedding', typed({ first: '<script>alert(1)</script>', second: '"><img src=x onerror=alert(1)>' }), null);
  assert.match(hostile, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const long = draftSlugBase('wedding', typed({ first: 'a'.repeat(59) + ' b', second: 'c'.repeat(60) }), null);
  assert.ok(long.length <= 60 && !long.endsWith('-'), long);
});

test("the preview hands the renderer what the owner preview would read from the stored draft", (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-07T12:00:00Z') });
  for (const slug of ['sage-garden', 'eternal-ivory']) {
    const template = getTemplateBySlug(slug)!;
    const config = draftOf(template, typed());
    const invitation = trialPreviewInvitation('wedding', config, { id: 41, slug: 'sari-budi' });
    // What `loadPublicInvitation(slug, undefined, true)` does to a stored config: JSON, the lenient read, the host's audience.
    const stored = configForAudience(normalizeStoredConfig(JSON.parse(JSON.stringify(config))).config, 'owner').config;
    const owner = renderGuestPage({ invitation, config: stored, guest: null, preview: true });
    const trial = renderGuestPage(trialPreviewProps(invitation, config));
    assert.equal(trial, owner, `${slug}: the preview equals the owner preview of the same draft`);
  }
});

test('the routes keep to the flag, the real renderer, the creation facade and the frame policy', () => {
  assert.equal(isFlagOn('CREATION_WIZARD', {}), false, 'off by default until DA-01');
  assert.equal(isFlagOn('CREATION_WIZARD', { FLAG_CREATION_WIZARD: 'on' }), true);
  assert.equal(templateUseHref('sage-garden', true), '/buat/sage-garden');
  assert.equal(templateUseHref('sage-garden', false), '/dashboard/templates/use?slug=sage-garden');

  const previewPage = source('app/buat/pratinjau/page.tsx');
  assert.match(previewPage, /import \{ PublicInvitationRenderer \} from '@\/components\/invitation\/public-renderer';/);
  assert.match(previewPage, /initialDraftConfig\(catalogDefaultConfig\(template\)/, 'the config creation stores');
  assert.doesNotMatch(previewPage, /lib\/db|drizzle|createDraft|insert\(/, 'the preview never touches the database');
  for (const path of ['app/buat/[slug]/page.tsx', 'app/buat/pratinjau/page.tsx', 'app/buat/simpan/page.tsx']) {
    assert.match(source(path), /if \(!isFlagOn\('CREATION_WIZARD'\)\) notFound\(\);/, `${path}: 404 with the flag off`);
  }
  const actions = source('app/buat/actions.ts');
  assert.match(actions, /createDraftInvitation\(/, 'the save goes through the creation facade');
  assert.doesNotMatch(actions, /createInvitation\(|insert\(/);
  assert.match(actions, /redirect_url=\$\{encodeURIComponent\('\/buat\/simpan'\)\}/, 'signed out: sign in and come back');
  for (const caller of ['app/(customer)/dashboard/templates/use/page.tsx', 'app/(customer)/dashboard/templates/actions.ts']) {
    assert.match(source(caller), /createDraftInvitation\(\{ userId: user\.id, ownerToken: ownerSessionToken \}/, `${caller}: the facade with the session token`);
  }
  const session = source('app/buat/trial-session.ts');
  for (const attribute of [/httpOnly: true/, /sameSite: 'lax'/, /export const TRIAL_COOKIE_PATH = '\/buat';/, /maxAge: TRIAL_MAX_AGE_SECONDS/]) {
    assert.match(session, attribute);
  }
  assert.match(source('lib/security/csp.ts'), /pathname\.startsWith\('\/preview\/'\) \|\| pathname === '\/buat\/pratinjau' \? "frame-ancestors 'self'"/);
});

// s33's browser harness: three taps queued three saves; the first cleared the cookie, the others minted fresh keys and
// made two more drafts. The key now lives with the wizard and travels with every call.
test('one draft key per wizard: from the cookie or minted at render, sent with every call, never minted by an action', () => {
  const actions = source('app/buat/actions.ts');
  assert.doesNotMatch(actions, /randomUUID/, 'an action never mints a key: a repeat after the first save would make a second draft');
  assert.match(actions, /export async function updateTrial\(values: TrialFormValues, key: string\)/);
  assert.match(actions, /export async function saveTrial\(values: TrialFormValues, key: string\)/);
  assert.match(actions, /const draftKey = draftKeySchema\.safeParse\(key\);/, 'the submitted key is checked');
  assert.match(source('app/buat/[slug]/page.tsx'), /draftKey=\{state\?\.key \?\? randomUUID\(\)\}/, "the cookie's key, else one per page");
  const wizard = source('app/buat/[slug]/trial-wizard.tsx');
  assert.match(wizard, /const \[key\] = useState\(draftKey\);/, "held for the wizard's lifetime, whatever the page re-renders with");
  assert.match(wizard, /updateTrial\(sent, key\)/);
  assert.match(wizard, /saveTrial\(latest\.current, key\)/);
  assert.match(wizard, /if \(submitting\.current\) return;/, 'taps in one frame save once');
  assert.match(source('app/buat/simpan/confirm-save.tsx'), /if \(sent\.current\) return previous;/, 'taps queued behind a confirm are dropped');
  assert.equal(draftKeySchema.safeParse(KEY).success, true);
  for (const bad of ['', 'not-a-key', `${KEY}x`, 42, null]) assert.equal(draftKeySchema.safeParse(bad).success, false, String(bad));
  assert.equal(decodeTrialState(encodeTrialState({ v: 1, key: KEY, slug: 'sage-garden', ...typed() }))?.key, KEY, 'the cookie carries the same key');
});
