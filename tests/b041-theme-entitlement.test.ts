// B-041 (s26, E-054; D-042): server-side theme entitlement on config writes, with B-036's switch within the tier (s32,
// E-072; D-054). Pure rules here; the database-backed proof through the facade (a published Standard invitation switches
// to another Standard theme and stays paid; a Premium theme or palette needs an order) is
// scripts/verify-theme-entitlement.ts, and both writers' is scripts/verify-content-api.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { palette, paletteIds } from '../lib/invitation/palettes';
import { invitationTemplates } from '../lib/invitation/templates';
import {
  changedThemeFields,
  FALLBACK_PALETTE_ID,
  needsTierLookup,
  paletteTier,
  storedThemeFields,
  ThemeEntitlementError,
  themeChangeIssues,
} from '../lib/invitation/theme-entitlement';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const freeTheme = invitationTemplates.find((template) => template.tier === 'free')!;
const premiumTheme = invitationTemplates.find((template) => template.tier === 'premium')!;
const signatureTheme = invitationTemplates.find((template) => template.tier === 'signature')!;
const standard = 'standard' as const;
const premium = 'premium' as const;

test('a palette is Standard when a free catalog theme uses it or it is the fallback, otherwise Premium', () => {
  const freePalettes = new Set(invitationTemplates.filter((template) => template.tier === 'free').map((template) => template.paletteId));
  for (const id of paletteIds) {
    assert.equal(paletteTier(id), freePalettes.has(id) || id === FALLBACK_PALETTE_ID ? 'standard' : 'premium', id);
  }
  // Today's catalog; a catalog change that moves a palette across tiers must update D-042 deliberately.
  assert.deepEqual(paletteIds.filter((id) => paletteTier(id) === 'premium').sort(), ['blossom', 'gold-noir', 'midnight', 'orchid']);
});

test('the fallback palette is what a page without a palette renders, so it can never be Premium-only', () => {
  assert.deepEqual(palette(undefined).style, palette(FALLBACK_PALETTE_ID).style);
  assert.deepEqual(palette('not-a-palette').style, palette(FALLBACK_PALETTE_ID).style);
  assert.equal(paletteTier(FALLBACK_PALETTE_ID), 'standard');
});

test('ids the palette registry does not know have no tier', () => {
  assert.equal(paletteTier('neon'), null);
  assert.equal(paletteTier(''), null);
});

test('a Standard invitation cannot change to a Premium palette', () => {
  const changed = changedThemeFields({ templateId: freeTheme.id, paletteId: freeTheme.paletteId }, { templateId: freeTheme.id, paletteId: 'midnight' });
  assert.deepEqual(changed, { paletteId: 'midnight' });
  assert.equal(needsTierLookup(changed), true);
  assert.deepEqual(themeChangeIssues(changed, standard), [{ path: 'theme.paletteId', reason: 'premium-palette' }]);
});

test('a Premium entitlement may take any registered palette', () => {
  for (const id of paletteIds) assert.deepEqual(themeChangeIssues({ paletteId: id }, premium), [], id);
});

test('Standard palettes pass without a tier lookup', () => {
  for (const id of paletteIds.filter((paletteId) => paletteTier(paletteId) === 'standard')) {
    assert.equal(needsTierLookup({ paletteId: id }), false, id);
    assert.deepEqual(themeChangeIssues({ paletteId: id }, standard), [], id);
  }
});

test('unchanged fields pass even when today they would not be allowed, so legacy rows keep saving', () => {
  const stored = { templateId: 999, paletteId: 'midnight' };
  assert.deepEqual(changedThemeFields(stored, { ...stored }), {});
  assert.deepEqual(themeChangeIssues(changedThemeFields(stored, { ...stored }), standard), []);
});

test('clearing the palette or the theme id needs no entitlement', () => {
  assert.deepEqual(changedThemeFields({ templateId: freeTheme.id, paletteId: 'sage' }, {}), {});
  assert.deepEqual(changedThemeFields({ templateId: freeTheme.id, paletteId: 'sage' }, undefined), {});
});

test('B-036: templateId may name any catalog theme within the entitled tier', () => {
  for (const template of invitationTemplates) {
    const paid = template.tier !== 'free';
    assert.equal(needsTierLookup({ templateId: template.id }), paid, `${template.id}: lookup`);
    assert.deepEqual(themeChangeIssues({ templateId: template.id }, premium), [], `${template.id}: Premium entitlement`);
    assert.deepEqual(
      themeChangeIssues({ templateId: template.id }, standard),
      paid ? [{ path: 'theme.templateId', reason: 'premium-template' }] : [],
      `${template.id}: Standard entitlement`,
    );
  }
  // Signature themes are paid like premium ones (template-sync stores `is_premium = tier !== 'free'`).
  assert.deepEqual(themeChangeIssues({ templateId: signatureTheme.id }, standard), [{ path: 'theme.templateId', reason: 'premium-template' }]);
});

test('B-036: ids the catalog does not know are refused for every tier, without a tier lookup', () => {
  for (const id of [0, 5, 999, freeTheme.id + 0.5, -freeTheme.id]) {
    assert.equal(needsTierLookup({ templateId: id }), false, `${id}`);
    for (const tier of [standard, premium]) {
      assert.deepEqual(themeChangeIssues({ templateId: id }, tier), [{ path: 'theme.templateId', reason: 'unknown-template' }], `${id} ${tier}`);
    }
  }
});

test("B-036: a switch to a Premium theme on its own Premium palette names both, the theme's first", () => {
  const orchid = invitationTemplates.find((template) => template.tier !== 'free' && paletteTier(template.paletteId) === 'premium')!;
  assert.deepEqual(themeChangeIssues({ templateId: orchid.id, paletteId: orchid.paletteId }, standard), [
    { path: 'theme.templateId', reason: 'premium-template' },
    { path: 'theme.paletteId', reason: 'premium-palette' },
  ]);
  assert.deepEqual(themeChangeIssues({ templateId: premiumTheme.id, paletteId: premiumTheme.paletteId }, premium), []);
});

test('unknown palettes are refused for every tier', () => {
  for (const entitlement of [standard, premium]) {
    assert.deepEqual(themeChangeIssues({ paletteId: 'neon' }, entitlement), [{ path: 'theme.paletteId', reason: 'unknown-palette' }]);
  }
});

test('stored theme fields are read leniently', () => {
  assert.deepEqual(storedThemeFields(null), {});
  assert.deepEqual(storedThemeFields({ theme: 'ivory' }), {});
  const none = { templateId: undefined, paletteId: undefined, sectionOrder: undefined, fontPairing: undefined };
  assert.deepEqual(storedThemeFields({ theme: { templateId: '7', paletteId: 3 } }), none);
  assert.deepEqual(storedThemeFields({ theme: { templateId: 7, paletteId: 'sage', familyId: 'gapura' } }), { ...none, templateId: 7, paletteId: 'sage' });
  // G-041: the layout choices are read the same way, any string or nothing.
  assert.deepEqual(storedThemeFields({ theme: { sectionOrder: 2, fontPairing: ['sans'] } }), none);
  assert.deepEqual(storedThemeFields({ theme: { sectionOrder: 'lama', fontPairing: 'sans' } }), { ...none, sectionOrder: 'lama', fontPairing: 'sans' });
});

test('the error names paths and reasons, never stored values', () => {
  const error = new ThemeEntitlementError([{ path: 'theme.paletteId', reason: 'premium-palette' }]);
  assert.equal(error.name, 'ThemeEntitlementError');
  assert.match(error.message, /theme\.paletteId \(premium-palette\)/);
});

test('the config writers check the theme before they write, and the PATCH answers 403', () => {
  // s32 (B-035): the check moved into the content writers' shared decision, inside the transaction that holds the row
  // lock, so it judges the row it writes; both writers decide before the config statement (Rust: the same vectors).
  const rules = source('lib/invitation/content-rules.ts');
  assert.match(rules, /themeChangeIssues\(themeChangeOf\(input\), tier\)/);
  const next = source('lib/invitation/content-next.ts');
  assert.ok(next.indexOf('contentDecision(') > 0 && next.indexOf('contentDecision(') < next.indexOf('.update(invitations)'));
  const rust = source('services/api/src/content/http.rs');
  assert.ok(rust.indexOf('content_decision(') > 0 && rust.indexOf('content_decision(') < rust.indexOf('update invitations set config'));
  const route = source('app/api/invitations/[id]/detail/route.ts');
  assert.match(route, /case 'theme':\s*return apiError\(403, 'THEME_NOT_ENTITLED'/);
});
