// G-062: one validated manifest per catalog template, derived from the registry and the guest-page palette tokens and
// read by the catalog, the admin surface and `pnpm harness catalog`. The manifests change nothing a template renders or
// an invitation stores; these tests pin that and the refusals.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CATALOG_MANIFESTS,
  catalogIdentityProblems,
  catalogManifestFor,
  catalogManifestReport,
  deriveCatalogManifest,
  validateCatalogManifest,
} from '../lib/invitation/catalog-manifest';
import { FONT_PAIRINGS, SECTION_ORDER_OPTIONS } from '../lib/invitation/family-manifest';
import { paletteHex, paletteIds } from '../lib/invitation/palettes';
import { CATALOG_THEME_TIERS, paletteTier, themeChangeIssues } from '../lib/invitation/theme-entitlement';
import { invitationTemplates, templatePalettes } from '../lib/invitation/templates';
import { checkCatalogManifests } from '../tools/template-harness/catalog';

test('every catalog template has a valid manifest; ids and slugs stay unique', () => {
  const report = catalogManifestReport();
  assert.equal(report.length, 64);
  assert.deepEqual(report.filter((entry) => entry.problems.length).map((entry) => `${entry.template.slug}: ${entry.problems.join('; ')}`), []);
  assert.equal(CATALOG_MANIFESTS.length, 64);
  assert.deepEqual(catalogIdentityProblems(), []);
  assert.deepEqual(CATALOG_MANIFESTS.map((manifest) => manifest.slug), invitationTemplates.map((template) => template.slug));
});

test('manifests agree with the registry and the checkout tiers they were derived from', () => {
  const tiers = new Map(CATALOG_THEME_TIERS);
  for (const template of invitationTemplates) {
    const manifest = catalogManifestFor(template.slug);
    assert.ok(manifest, template.slug);
    assert.equal(manifest.id, template.id);
    assert.equal(manifest.category, template.category);
    assert.equal(manifest.tier, template.tier);
    assert.equal(manifest.entitlement, tiers.get(template.id));
    assert.deepEqual(manifest.palette.tokens, paletteHex(template.paletteId));
    assert.deepEqual(manifest.card.palette, template.palette);
    assert.equal(manifest.defaultLocale, template.preset.settings?.language === 'en' ? 'en' : 'id');
  }
});

test('the catalog palette: bg, ink and soft come from palettes.ts; only the card accents stay, and the output is unchanged', () => {
  assert.deepEqual(Object.keys(templatePalettes).sort(), [...paletteIds].sort());
  const differing: string[] = [];
  for (const id of paletteIds) {
    const card = templatePalettes[id];
    const page = paletteHex(id);
    assert.deepEqual([card.bg, card.ink, card.soft], [page.bg, page.ink, page.soft], id);
    if (card.accent !== page.accent) differing.push(id);
  }
  // The 15 card accents that predate B-016's solver; a change here is a design decision, not drift.
  assert.deepEqual(differing, ['ivory', 'rose-gold', 'confetti', 'sage', 'sand', 'slate', 'terracotta', 'orchid', 'dusk', 'mocha', 'ocean', 'blossom', 'lavender', 'mint', 'sunshine']);
  // The table the catalog rendered before G-062 dropped the duplicate copy, byte for byte (session 44 fingerprint).
  assert.equal(createHash('sha256').update(JSON.stringify(templatePalettes)).digest('hex'), 'e9ae97a1ec1b87dc5e4f643c06d87992bcf10aece86481cf3ec5ad6508482220');
});

test('G-041: the choices a manifest offers are the ones the writers accept, within the entitlement', () => {
  for (const manifest of CATALOG_MANIFESTS) {
    assert.deepEqual(manifest.choices.sectionOrders, [...SECTION_ORDER_OPTIONS]);
    assert.deepEqual(manifest.choices.fontPairings, [...FONT_PAIRINGS]);
    assert.ok(manifest.choices.palettes.includes(manifest.palette.id), manifest.slug);
    for (const paletteId of manifest.choices.palettes) {
      assert.deepEqual(themeChangeIssues({ paletteId }, manifest.entitlement), [], `${manifest.slug} offers ${paletteId}`);
    }
    for (const sectionOrder of manifest.choices.sectionOrders) assert.deepEqual(themeChangeIssues({ sectionOrder }, manifest.entitlement), []);
    for (const fontPairing of manifest.choices.fontPairings) assert.deepEqual(themeChangeIssues({ fontPairing }, manifest.entitlement), []);
    if (manifest.entitlement === 'standard') {
      const withheld = paletteIds.filter((id) => !manifest.choices.palettes.includes(id));
      assert.ok(withheld.length > 0 && withheld.every((id) => paletteTier(id) === 'premium'), manifest.slug);
      for (const paletteId of withheld) assert.notDeepEqual(themeChangeIssues({ paletteId }, 'standard'), [], `${paletteId} must be refused`);
    }
  }
});

test('G-016: every manifest declares one self-hosted pool whose files are on disk byte for byte', () => {
  for (const manifest of CATALOG_MANIFESTS) {
    assert.equal(manifest.art.selfHosted, true);
    assert.doesNotMatch(manifest.art.pool, /\+|remote/, manifest.slug);
    for (const file of manifest.art.files) {
      const bytes = readFileSync(join('public', file.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
      assert.match(file.review, /owner review pending/);
    }
  }
  const gate = checkCatalogManifests();
  assert.ok(gate.ok, gate.lines.filter((line) => !line.startsWith('PASS')).join('\n'));
  assert.equal(gate.lines.at(-1), 'catalog: PASS (64 manifests, 0 failing)');
});

test('validation refuses a tampered manifest and names the problem', () => {
  const template = invitationTemplates.find((entry) => entry.tier === 'free')!;
  const base = deriveCatalogManifest(template) as Record<string, unknown> & { choices: { palettes: string[] }; art: Record<string, unknown> };
  const cases: [string, unknown, RegExp][] = [
    ['an unknown key (no arbitrary HTML)', { ...base, html: '<script>alert(1)</script>' }, /Unrecognized key/],
    ['an external script', { ...base, externalScripts: ['https://cdn.example.com/x.js'] }, /externalScripts/],
    ['a remote art URL', { ...base, art: { ...base.art, cover: 'https://images.example.com/a.jpg' } }, /art\.cover/],
    ['a changed id', { ...base, id: 999 }, /id or slug differs/],
    ['a Premium palette offered by a Standard template', { ...base, choices: { ...base.choices, palettes: [...base.choices.palettes, 'midnight'] } }, /Standard template offers a Premium palette/],
    ['tokens edited away from palettes.ts', { ...base, palette: { ...(base.palette as object), tokens: { ...paletteHex(template.paletteId), ink: '#777777' } } }, /palette tokens differ/],
  ];
  for (const [name, candidate, expected] of cases) {
    const problems = validateCatalogManifest(candidate, template);
    assert.ok(problems.some((problem) => expected.test(problem)), `${name}: ${problems.join(' | ')}`);
  }
  assert.deepEqual(validateCatalogManifest(base, template), []);
});

test('old invitations never depend on a manifest: the guest renderer and the writers do not read them', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  // The admin console's read-only view is the one other reader (`tests/g062-catalog-admin.test.ts` bounds it).
  const ownModules = [join('lib', 'invitation', 'catalog-manifest.ts'), join('lib', 'invitation', 'catalog-admin-view.ts')];
  const readers = ['components/invitation', 'app/i', 'lib/invitation']
    .flatMap(files)
    .filter((path) => !ownModules.includes(path))
    .filter((path) => /from ['"][^'"]*catalog-manifest['"]/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(readers, []);
  assert.equal(catalogManifestFor('a-retired-template'), undefined);
});
