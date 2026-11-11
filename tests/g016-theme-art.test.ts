// G-016: self-hosted, original theme art replaces the runtime Unsplash hotlinks pool by pool (sessions 43–44: every pool
// that serves a catalog template); the three pools no catalog template uses keep their remote photos, and an empty
// register restores the pre-G-016 output exactly (the rollback).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { invitationTemplates } from '../lib/invitation/templates';
import { catalogDefaultConfig, presetConfigFromTemplateDefaults } from '../lib/invitation/template-defaults';
import {
  buildThemeArtRegistry,
  getThemeArt,
  isSelfHostedThemeArt,
  REMOTE_THEME_ART_POOLS,
  type ThemeArt,
} from '../lib/invitation/theme-art';
import { THEME_ART_REGISTER, THEME_ART_WIDTHS, themeArtManifestAssets } from '../lib/invitation/theme-art-register';
import { assetSchema } from '../tools/template-harness/schema';

/** SHA-256 of every catalog template's art before G-016 (64 templates, 448 remote URLs), taken from the unchanged module. */
const PRE_G016_FINGERPRINT = 'e36902ddbbdc77e40cdeebece2068b5a39bc4d3c8eaec3bfc468fb5b195c84e4';

const COVERED: Record<string, string[]> = {
  // Session 43.
  marble: ['boardroom', 'boardroom-charter', 'eternal-ivory', 'expo-hall', 'keynote', 'rumah-baru', 'sand-minimal', 'syukur-hangat', 'terracotta-vow', 'toga-slate'],
  gold: ['alumni-classic', 'gala-awards', 'gold-noir-deco', 'golden-years', 'kurma-oasis', 'midnight-gala', 'orchid-monogram', 'summa-gold', 'velvet-gala'],
  night: ['bintang-kecil', 'little-star', 'midnight-countdown', 'natal-hangat', 'neon-night', 'reveal-dusk', 'teratai-subuh'],
  // Session 44.
  floral: ['melati-suci'],
  peony: ['blossom-aquarelle', 'rose-gold-romance'],
  rose: ['emerald-royale', 'garden-rose', 'silver-years', 'velvet-rope'],
  sakura: ['pink-or-blue'],
  eucalyptus: ['atelier', 'boho-picnic', 'sage-garden', 'vine-ivy'],
  tropics: ['frangipani-bali'],
  sawah: ['offsite-escape'],
  batik: ['batik-kencana'],
  islamic: ['barakah-mint', 'doa-khusyuk', 'halal-bihalal', 'sakinah-sand'],
  boho: ['bunga-kering'],
  beach: ['awan-lembut', 'launch-day'],
  mist: ['pearl-koi'],
  candle: ['after-hours-mixer'],
  party: ['bravo-team', 'kampung-fest', 'marigold-fiesta', 'pastel-wonder', 'peach-cuddle'],
  fireworks: ['blush-brunch', 'confetti-pop', 'grand-opening', 'grand-stage', 'ignition', 'kickoff-arena', 'retro-reunion', 'sweet-seventeen'],
  elegant: ['purnabakti-emas'],
};
const coveredSlugs = new Set(Object.values(COVERED).flat());
/** Quality step budgets (`THEME_ART_PROVENANCE.derivation`): a gallery cut is held to the cover's. */
const BUDGETS = { cover: 100 * 1024, card: 48 * 1024, gallery: 100 * 1024 } as const;

const fingerprint = (registry: Map<string, ThemeArt>) =>
  createHash('sha256')
    .update(JSON.stringify(invitationTemplates.map((tpl) => [tpl.slug, registry.get(tpl.slug)])))
    .digest('hex');

const registerFiles = () => {
  const files = new Map<string, { width: number; height: number; bytes: number; sha256: string }>();
  for (const entry of THEME_ART_REGISTER) for (const file of Object.values(entry.files)) files.set(file.path, file);
  return files;
};

/** Width and height from a WebP header (simple lossy `VP8 `, lossless `VP8L` or extended `VP8X`). */
function webpSize(data: Buffer): { width: number; height: number } {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    assert.deepEqual([...data.subarray(23, 26)], [0x9d, 0x01, 0x2a], 'VP8 start code');
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  assert.equal(chunk, 'VP8X');
  return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css|mjs|js)$/.test(name) ? [path] : [];
  });

test('every register file is in public/, byte-identical to its record, and a WebP of the recorded size', () => {
  const files = registerFiles();
  assert.equal(files.size, 177, '70 covers, 70 cards and 37 distinct gallery cuts');
  assert.deepEqual(
    readdirSync('public/theme-art').sort(),
    [...files.keys()].map((path) => path.replace('/theme-art/', '')).sort(),
    'no orphan file and no missing file',
  );
  for (const entry of THEME_ART_REGISTER) {
    for (const [kind, file] of Object.entries(entry.files)) {
      assert.match(file.path, new RegExp(`^/theme-art/${entry.pool}-\\d{2}-(cover|card|gallery)\\.webp$`), `${entry.id} ${kind}`);
      assert.ok(file.path.startsWith(`/theme-art/${entry.id}-`), `${entry.id} ${kind}: named after its asset`);
      assert.ok(file.bytes <= BUDGETS[kind as keyof typeof BUDGETS], `${entry.id} ${kind} stays within its budget`);
      const quality = (file as { quality?: number }).quality;
      if (quality !== undefined) assert.ok(quality >= 60 && quality < 78 && (78 - quality) % 4 === 0, `${entry.id} ${kind}: a recorded step, never below 60`);
    }
  }
  for (const [path, record] of files) {
    const data = readFileSync(join('public', path));
    assert.equal(data.length, record.bytes, path);
    assert.equal(createHash('sha256').update(data).digest('hex'), record.sha256, path);
    assert.deepEqual(webpSize(data), { width: record.width, height: record.height }, path);
    assert.equal(record.height, Math.floor((record.width * 5) / 4), `${path} is 4:5`);
  }
  for (const entry of THEME_ART_REGISTER) {
    for (const kind of ['cover', 'card', 'gallery'] as const) {
      assert.ok(entry.files[kind].width <= THEME_ART_WIDTHS[kind], `${entry.id} ${kind} width`);
    }
    assert.ok(entry.files.cover.bytes <= 100 * 1024, `${entry.id} cover stays under 100 KiB`);
    assert.ok(entry.files.card.bytes <= 48 * 1024, `${entry.id} card stays under 48 KiB`);
  }
});

test('every register asset has a licence record in the harness asset shape', () => {
  const ids = THEME_ART_REGISTER.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of THEME_ART_REGISTER) {
    assert.match(entry.sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(entry.prompt, /\bno people\b/i, `${entry.id}: the prompt excludes people`);
    assert.match(entry.prompt, /no text, no logos\.$/, `${entry.id}: the prompt excludes text and logos`);
    const [left, top, right, bottom] = entry.crop;
    assert.ok(left >= 0 && top >= 0 && right <= 1024 && bottom <= 1024 && right > left && bottom > top, entry.id);
  }
  const assets = themeArtManifestAssets();
  assert.equal(assets.length, 177);
  for (const asset of assets) {
    assert.doesNotThrow(() => assetSchema.parse(asset), asset.id);
    assert.equal(asset.license, 'own-work');
    assert.equal(asset.provenance, 'generated');
    assert.match(asset.source, /^Generated for this repository \(v0 image tool, text prompt only \(no input image\), 2026-11-10; prompt: /);
  }
});

test('every catalog template resolves to self-hosted files from its own pool only', () => {
  assert.equal(coveredSlugs.size, invitationTemplates.length, 'all 64 catalog templates are listed once');
  const local = invitationTemplates.filter((tpl) => isSelfHostedThemeArt(getThemeArt(tpl)));
  assert.deepEqual(local.map((tpl) => tpl.slug).sort(), [...coveredSlugs].sort());
  const files = registerFiles();
  for (const [pool, slugs] of Object.entries(COVERED)) {
    for (const slug of slugs) {
      const tpl = invitationTemplates.find((candidate) => candidate.slug === slug);
      assert.ok(tpl, slug);
      const art = getThemeArt(tpl);
      assert.ok(art.card, `${slug} has a card cut`);
      assert.equal(art.gallery.length, 6);
      for (const src of [art.cover, art.card, ...art.gallery]) {
        assert.ok(files.has(src), `${slug}: ${src} is a register file`);
        assert.ok(src.startsWith(`/theme-art/${pool}-`), `${slug}: ${src} comes from its own pool`);
      }
    }
  }
  const covers = new Map<string, string[]>();
  const used = new Set<string>();
  for (const slug of coveredSlugs) {
    const art = getThemeArt(invitationTemplates.find((tpl) => tpl.slug === slug)!);
    covers.set(art.cover, [...(covers.get(art.cover) ?? []), slug]);
    for (const src of [art.cover, ...art.gallery]) used.add(src.replace(/-(cover|gallery)\.webp$/, ''));
  }
  const poolSize = (pool: string) => THEME_ART_REGISTER.filter((entry) => entry.pool === pool).length;
  const distinctCovers = Object.entries(COVERED).reduce((sum, [pool, slugs]) => sum + Math.min(slugs.length, poolSize(pool)), 0);
  assert.equal(covers.size, distinctCovers, 'templates of a pool lead with different originals until the pool runs out');
  assert.equal(distinctCovers, 50);
  assert.equal(used.size, THEME_ART_REGISTER.length, 'every generated original appears in some template (cover or gallery)');
});

test('no catalog template hotlinks; only the three template-less pools keep remote photos (the explicit boundary)', () => {
  assert.deepEqual([...REMOTE_THEME_ART_POOLS], ['watercolor', 'lavender', 'graduation']);
  const remote = buildThemeArtRegistry([]);
  for (const tpl of invitationTemplates) {
    const art = getThemeArt(tpl);
    assert.ok(isSelfHostedThemeArt(art), `${tpl.slug} is self-hosted`);
    assert.notDeepEqual(art, remote.get(tpl.slug), tpl.slug);
  }
  // A template outside the catalog still resolves through its motif or category: to a self-hosted pool where one serves
  // it, otherwise to the remaining remote photos.
  const offCatalog = getThemeArt({ slug: 'off-catalog', category: 'graduation', motif: 'floral' });
  assert.ok([offCatalog.cover, ...offCatalog.gallery].every((src) => src.startsWith('https://unsplash.com/photos/')));
  assert.equal(offCatalog.card, undefined);
  assert.ok(isSelfHostedThemeArt(getThemeArt({ slug: 'off-catalog', category: 'wedding', motif: 'floral' })), 'wedding → the peony pool');
});

test('rollback: an empty register reproduces the pre-G-016 output exactly; one pool can be rolled back alone', () => {
  assert.equal(fingerprint(buildThemeArtRegistry([])), PRE_G016_FINGERPRINT);
  assert.notEqual(fingerprint(buildThemeArtRegistry(THEME_ART_REGISTER)), PRE_G016_FINGERPRINT);

  const remote = buildThemeArtRegistry([]);
  for (const pool of ['night', 'fireworks', 'islamic']) {
    const without = buildThemeArtRegistry(THEME_ART_REGISTER.filter((entry) => entry.pool !== pool));
    for (const tpl of invitationTemplates) {
      const art = without.get(tpl.slug)!;
      if (COVERED[pool].includes(tpl.slug) || !coveredSlugs.has(tpl.slug)) assert.deepEqual(art, remote.get(tpl.slug), `${pool}: ${tpl.slug}`);
      else assert.ok(isSelfHostedThemeArt(art), `${pool}: ${tpl.slug}`);
    }
  }
});

test('the art stays template-owned: stored with the template defaults, dropped from a new invitation', () => {
  const tpl = invitationTemplates.find((candidate) => candidate.slug === 'eternal-ivory')!;
  const defaults = catalogDefaultConfig(tpl);
  assert.deepEqual(defaults.art, getThemeArt(tpl));
  const preset = presetConfigFromTemplateDefaults(defaults);
  assert.ok(preset.ok);
  assert.deepEqual(preset.droppedKeys, ['art']);
  assert.equal('art' in preset.config, false);
});

test('the catalog card loads the card cut, and no other source file builds an Unsplash URL', () => {
  const catalog = readFileSync('app/templates/catalog-client.tsx', 'utf8');
  assert.match(catalog, /src=\{art\.card \?\? art\.cover\}/);
  const builders = ['app', 'lib', 'components']
    .flatMap(sourceFiles)
    .filter((path) => /unsplash\.com/i.test(readFileSync(path, 'utf8')));
  assert.deepEqual(builders, ['lib/invitation/theme-art.ts']);
});

/** The declarations of one top-level rule (`.name { … }`) in a CSS module. */
function ruleBody(file: string, selector: string): string {
  const css = readFileSync(file, 'utf8');
  const match = new RegExp(`(^|\\n)\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(match, `${file} has no ${selector} rule`);
  return match[2];
}

test('text over theme art keeps full-strength ink on a centred plate (card and preview gate)', () => {
  // Session 44 measured the served catalog (64 cards) and the 19 pool previews: at 70 % opacity on the vertical wash
  // alone, 110 of 192 card texts and 29 of 114 gate texts fell below 4.5:1 at the 5th percentile; with full-strength
  // labels and the plate every one cleared it. The browser harness proves the pixels; this guards the two rules.
  const surfaces = [
    { styles: 'app/templates/templates.module.css', tint: 'app/templates/catalog-ui.module.css', tintRule: '.tint' },
    { styles: 'app/templates/[slug]/preview.module.css', tint: 'app/templates/[slug]/art.module.css', tintRule: '.artTint' },
  ];
  for (const { styles, tint, tintRule } of surfaces) {
    for (const label of ['.cEyebrow', '.cDate']) assert.doesNotMatch(ruleBody(styles, label), /opacity/, `${styles} ${label}`);
    const background = ruleBody(tint, tintRule);
    const plate = background.indexOf('radial-gradient(');
    const wash = background.indexOf('linear-gradient(');
    assert.ok(plate >= 0 && wash > plate, `${tint} ${tintRule}: the plate is painted over the wash`);
    assert.match(background, /color-mix\(in srgb, var\(--bg\) 90%, transparent\) 0%/, `${tint} ${tintRule}: the plate is the palette surface`);
  }
});
