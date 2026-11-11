// B-036 (s32, E-072; D-054): free theme switching within the paid tier. The picker offers the catalog themes of the
// invitation's event type; a switch writes the catalog id and its palette through the content writers and nothing else,
// so the purchased theme (`invitations.template_id`), checkout and settlement are untouched. The database-backed proofs
// are scripts/verify-theme-entitlement.ts (through the facade, with real orders) and scripts/verify-content-api.ts (both
// writers); the Rust port runs the shared vectors.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeSwitch } from '../app/(customer)/dashboard/invitations/[id]/edit/editor-theme';
import { contentDecision, type ContentWriteInput } from '../lib/invitation/content-rules';
import { resolveEventType } from '../lib/invitation/template-event-types';
import { invitationTemplates } from '../lib/invitation/templates';
import { CATALOG_THEME_TIERS, catalogThemeTier } from '../lib/invitation/theme-entitlement';
import { themeSwitchOptions } from '../lib/invitation/theme-switch';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const EVENT_TYPES = ['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'] as const;

test("a catalog theme's tier is the one checkout stores for it (free → Standard, premium and signature → Premium)", () => {
  assert.equal(CATALOG_THEME_TIERS.length, invitationTemplates.length);
  for (const template of invitationTemplates) {
    assert.equal(catalogThemeTier(template.id), template.tier === 'free' ? 'standard' : 'premium', `${template.id}`);
  }
  assert.match(source('lib/invitation/template-sync.ts'), /isPremium: tpl\.tier !== 'free'/);
  assert.equal(new Set(invitationTemplates.map((template) => template.id)).size, invitationTemplates.length, 'catalog ids are unique');
});

test('the picker lists the event type\'s catalog themes, Standard first, with the palette a switch applies', () => {
  for (const eventType of EVENT_TYPES) {
    const options = themeSwitchOptions(eventType);
    const expected = invitationTemplates.filter((template) => resolveEventType(template.category) === eventType);
    assert.deepEqual(options.map((o) => o.id).sort(), expected.map((t) => t.id).sort(), eventType);
    const firstPremium = options.findIndex((o) => o.tier === 'premium');
    assert.ok(firstPremium === -1 || options.slice(firstPremium).every((o) => o.tier === 'premium'), `${eventType}: Standard first`);
    for (const option of options) {
      const template = invitationTemplates.find((t) => t.id === option.id)!;
      assert.equal(option.tier, catalogThemeTier(option.id));
      assert.equal(option.paletteId, template.paletteId);
      assert.deepEqual(option.swatch, [template.palette.bg, template.palette.accent, template.palette.ink]);
    }
  }
  assert.ok(themeSwitchOptions('wedding').some((o) => o.tier === 'standard') && themeSwitchOptions('wedding').some((o) => o.tier === 'premium'));
});

test('a theme the config names outside its event type stays first, so the picker shows what the invitation uses', () => {
  const corporate = invitationTemplates.find((t) => resolveEventType(t.category) === 'corporate')!;
  const options = themeSwitchOptions('wedding', corporate.id);
  assert.equal(options[0].id, corporate.id);
  assert.equal(themeSwitchOptions('wedding', 999)[0].id, themeSwitchOptions('wedding')[0].id, 'an unknown id adds nothing');
});

test('every switch the picker offers is accepted by the writers, and every locked one is refused', () => {
  for (const eventType of EVENT_TYPES) {
    for (const option of themeSwitchOptions(eventType)) {
      const write = (tier: 'standard' | 'premium') => {
        const input: ContentWriteInput = {
          invitationId: 7,
          eventType,
          storedConfig: { theme: { templateId: -1, paletteId: 'ivory' }, quote: { enabled: true, text: 'Tetap' } },
          config: { theme: { templateId: option.id, paletteId: option.paletteId }, quote: { enabled: true, text: 'Tetap' } },
          touchedSections: ['theme'],
          baseVersion: 2,
          currentVersion: 2,
        };
        return contentDecision(input, tier);
      };
      assert.deepEqual(write('premium'), { kind: 'write', nextVersion: 3 }, `${option.id}: a Premium entitlement takes any theme`);
      const standard = write('standard');
      if (option.tier === 'standard') assert.deepEqual(standard, { kind: 'write', nextVersion: 3 }, `${option.id}: free switch`);
      else {
        assert.equal(standard.kind, 'theme', `${option.id}: locked`);
        assert.deepEqual((standard as { issues: unknown[] }).issues[0], { path: 'theme.templateId', reason: 'premium-template' });
      }
    }
  }
});

test('the picker shows locked Premium themes as unavailable and the chosen theme as checked', () => {
  const options = themeSwitchOptions('wedding');
  const free = options.find((o) => o.tier === 'standard')!;
  const paid = options.find((o) => o.tier === 'premium')!;
  const render = (tier: 'standard' | 'premium') =>
    renderToStaticMarkup(createElement(ThemeSwitch, { options, tier, templateId: free.id, paletteId: free.paletteId, onPick: () => {} }));
  const standard = render('standard');
  const radios = standard.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
  assert.equal(radios.length, options.length);
  assert.equal(radios.filter((tag) => /\sdisabled=""/.test(tag)).length, options.filter((o) => o.tier === 'premium').length);
  assert.ok(radios.some((tag) => tag.includes(`value="${free.id}"`) && /\schecked=""/.test(tag)), 'the used theme is checked');
  assert.ok(radios.some((tag) => tag.includes(`value="${paid.id}"`) && /\sdisabled=""/.test(tag)), 'a Premium theme is locked');
  assert.match(standard, /<legend[^>]*>Tema katalog<\/legend>/);
  assert.match(standard, /perlu upgrade/);
  assert.match(standard, /Tema Premium terbuka setelah paket di-upgrade\./);
  const premium = render('premium');
  assert.ok(!/\sdisabled=""/.test(premium), 'a Premium entitlement locks nothing');
  assert.ok(!premium.includes('perlu upgrade'));
});

test('a switch writes the config only: neither writer touches invitations.template_id, and payment keys on it', () => {
  const next = source('lib/invitation/content-next.ts');
  assert.match(next, /\.update\(invitations\)\.set\(\{ config: input\.config \}\)/);
  assert.equal((next.match(/\.update\(invitations\)/g) ?? []).length, 1);
  const rust = source('services/api/src/content/http.rs');
  assert.match(rust, /"update invitations set config = \$1 where id = \$2 and deleted_at is null"/);
  assert.ok(!/template_id\s*=\s*\$/.test(rust), 'the Rust writer never assigns template_id');
  assert.match(source('lib/invitation/publish.ts'), /hasPaidOrder\(invitation\.id, invitation\.templateId\)/);
  assert.match(source('app/(customer)/dashboard/invitations/[id]/checkout/actions.ts'), /hasPaidOrder\(invitationId, invitation\.templateId\)/);
});

test('the editor offers the switch and sends the catalog id with its palette, keeping the rest of the theme', () => {
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /<ThemeSwitch options=\{themes\.options\} tier=\{themes\.tier\}/);
  assert.match(editor, /onPick=\{\(o\)=>patch\('theme',\{\.\.\.v,templateId:o\.id,paletteId:o\.paletteId\}\)\}/);
  assert.ok(!editor.includes('Fitur ganti tema menyusul'), 'the old "coming soon" note is gone');
  const page = source('app/(customer)/dashboard/invitations/[id]/edit/page.tsx');
  assert.match(page, /loadThemeTier\(id, user\.id\)/);
  assert.match(page, /themeSwitchOptions\(invitation\.eventType,/);
});
