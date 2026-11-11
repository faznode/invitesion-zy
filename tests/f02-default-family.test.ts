// F-02 (D-041 (3), D-048): a new invitation starts on the design family chosen for its event type; legacy stays
// selectable, stored invitations are untouched, and `FLAG_DEFAULT_FAMILY=off` restores the legacy start. The rendered
// contrast of new invitations is the product-gates step "rendered contrast: new invitations (F-02)". Fictional data only.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins that `template-sync` (through the database
// client) needs at import time.
import { fixtureGuest, renderGuestPage, withFamily } from './support/render-guest-page';
import { detailConfigSchema, type DetailConfig } from '../lib/invitation/detail-config';
import { defaultFamilyFor, FAMILIES, FAMILY_IDS, familyOf } from '../lib/invitation/families';
import { newInvitationConfig, withDefaultFamily } from '../lib/invitation/new-invitation';
import { occasionOfCategory } from '../lib/invitation/occasion';
import { catalogDefaultConfig, presetConfigFromTemplateDefaults } from '../lib/invitation/template-defaults';
import { resolveEventType } from '../lib/invitation/template-sync';
import { invitationTemplates } from '../lib/invitation/templates';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const EVENT_TYPES = ['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'] as const;
const ON = {};
const OFF = { FLAG_DEFAULT_FAMILY: 'off' };

test('F-02: every event type starts on a family designed around it; nothing else gets one', () => {
  assert.match(source('lib/invitation/create.ts'), /EVENT_TYPES = \['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'\] as const/, 'the same six event types');
  const intended = { wedding: 'wedding', corporate: 'formal' } as const;
  for (const eventType of EVENT_TYPES) {
    const familyId = defaultFamilyFor(eventType);
    assert.ok(familyId && (FAMILY_IDS as readonly string[]).includes(familyId), eventType);
    assert.equal(FAMILIES[familyId].intendedFor, intended[eventType as keyof typeof intended] ?? 'celebration', `${eventType} → ${familyId}`);
  }
  for (const other of ['', 'graduation', 'constructor', 'toString', '__proto__']) assert.equal(defaultFamilyFor(other), undefined, JSON.stringify(other));
});

test('F-02: a new invitation gets the family and the B-026 default, keeping the rest of its preset', () => {
  assert.deepEqual(newInvitationConfig({}, 'wedding', ON), { gift: { personalOnly: true }, theme: { familyId: 'gapura' } });
  const preset = { theme: { paletteId: 'sage', cover: { headline: 'Syukuran' } }, gift: { enabled: true } };
  const before = structuredClone(preset);
  assert.deepEqual(newInvitationConfig(preset, 'birthday', ON), {
    theme: { paletteId: 'sage', cover: { headline: 'Syukuran' }, familyId: 'riang' },
    gift: { enabled: true, personalOnly: true },
  });
  assert.deepEqual(preset, before, 'the preset is not mutated');
  assert.equal((newInvitationConfig({}, 'corporate', ON).theme as { familyId: string }).familyId, 'lontar');
});

test('F-02: a preset that names an existing family keeps it; a retired id gets the default', () => {
  assert.deepEqual(withDefaultFamily({ theme: { familyId: 'kartu', paletteId: 'ivory' } }, 'wedding'), { theme: { familyId: 'kartu', paletteId: 'ivory' } });
  assert.deepEqual(withDefaultFamily({ theme: { familyId: 'retired-family' } }, 'wedding'), { theme: { familyId: 'gapura' } });
  assert.deepEqual(withDefaultFamily({ theme: 'not-an-object' }, 'aqiqah'), { theme: { familyId: 'riang' } });
  assert.deepEqual(withDefaultFamily({ theme: { paletteId: 'mint' } }, 'graduation'), { theme: { paletteId: 'mint' } }, 'no family for an unknown type');
});

test('F-02: FLAG_DEFAULT_FAMILY=off starts new invitations on the legacy layout, as before', () => {
  assert.deepEqual(newInvitationConfig({ theme: { paletteId: 'sage' } }, 'wedding', OFF), { theme: { paletteId: 'sage' }, gift: { personalOnly: true } });
  assert.deepEqual(newInvitationConfig({ theme: { familyId: 'kartu' } }, 'wedding', OFF), { theme: { familyId: 'kartu' }, gift: { personalOnly: true } }, 'a template\u2019s own family stays');
});

test('F-02: every catalog template starts a valid invitation on a family', () => {
  assert.ok(invitationTemplates.length >= 60);
  for (const template of invitationTemplates) {
    const eventType = resolveEventType(template.category);
    assert.ok(eventType, `${template.slug}: ${template.category} resolves to an event type`);
    const preset = presetConfigFromTemplateDefaults(catalogDefaultConfig(template));
    assert.ok(preset.ok, template.slug);
    const parsed = detailConfigSchema.safeParse(newInvitationConfig(preset.config as Record<string, unknown>, eventType, ON));
    assert.ok(parsed.success, `${template.slug}: the new invitation passes the strict schema`);
    // B-032: a memorial category's preset declares its occasion, which starts it on a calmer family.
    assert.equal(parsed.data.theme?.familyId, defaultFamilyFor(eventType, occasionOfCategory(template.category)), `${template.slug} (${eventType})`);
    assert.equal(parsed.data.theme?.paletteId, template.preset.theme?.paletteId, `${template.slug}: the template\u2019s palette is kept`);
  }
});

test('F-02: a new invitation of each type renders its family, not the legacy layout', () => {
  const content: DetailConfig = {
    couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
    events: [{ title: 'Acara', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
  };
  for (const eventType of EVENT_TYPES) {
    const config = detailConfigSchema.parse({ ...content, ...newInvitationConfig({ theme: { paletteId: 'ivory' } }, eventType, ON) });
    const familyId = defaultFamilyFor(eventType)!;
    const page = renderGuestPage({ config, guest: fixtureGuest() });
    assert.equal(page, renderGuestPage({ config: withFamily({ ...config, theme: { paletteId: 'ivory' } }, familyId), guest: fixtureGuest() }), `${eventType}: ${familyId}`);
    assert.notEqual(page, renderGuestPage({ config: { ...config, theme: { paletteId: 'ivory' } }, guest: fixtureGuest() }), `${eventType}: not legacy`);
  }
});

test('F-02: only invitation creation applies the defaults; stored invitations and the editor keep their layout', () => {
  // B-037 (D-055): creation's one rule is `initialDraftConfig`; every creation reaches it through the facade, and the
  // wizard's preview renders the same, unstored config.
  assert.match(source('lib/invitation/trial.ts'), /const base = newInvitationConfig\(start, eventType, env\);/);
  assert.match(source('lib/invitation/creation.ts'), /initialDraftConfig\(input\.template\?\.defaultConfig \?\? null, input\.eventType, input\.trial \?\? null, env\)/);
  assert.match(source('lib/invitation/create.ts'), /prepareDraftRequest\(\{ eventType, template: template \?\? null, title: title \?\? null \}\)/, 'the scripts\u2019 wrapper too');
  const files = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : [],
    );
  const callers = ['app', 'components', 'lib'].flatMap(files).filter((path) => /\bnewInvitationConfig\(|\bwithDefaultFamily\(/.test(source(path)));
  assert.deepEqual(callers.sort(), ['lib/invitation/new-invitation.ts', 'lib/invitation/trial.ts']);
  const editor = source('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.match(editor, /placeholder="Klasik \(tata letak saat ini\)" options=\{FAMILY_IDS\.map/, 'legacy stays selectable');
  assert.match(editor, /familyId:x\|\|undefined/, 'choosing it clears the family');
  assert.equal(familyOf(undefined), null, 'a stored invitation without a family renders legacy');
});
