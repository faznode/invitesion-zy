// B-035: the content writer's decision (`lib/invitation/content-rules.ts`) on the shared vectors that the Rust port runs
// too (`services/api/tests/content_vectors.rs`): the palette registry, the catalog's theme tiers (B-036) and the
// child-photo fields the rules read, the upload-key grammar, and every decision (version first, then D-040 references,
// then the theme: B-041 and B-036's switch within the tier), including when the tier is looked up. The vectors are
// generated from these rules by `scripts/api/content-vectors.ts`; a rule change fails here until they are regenerated
// and the Rust port follows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { contentDecision, contentNeedsTier, type ContentWriteInput } from '../lib/invitation/content-rules';
import { isProtectedMediaPath, isUploadedMediaPath, mediaPathInvitationId } from '../lib/invitation/image-url';
import { childPhotoField, GIFT_QRIS_FIELD } from '../lib/invitation/media-ownership';
import { paletteIds } from '../lib/invitation/palettes';
import { CATALOG_THEME_TIERS, FALLBACK_PALETTE_ID, paletteTier } from '../lib/invitation/theme-entitlement';

type Vectors = {
  fallbackPalette: string;
  palettes: [string, string][];
  templates: [number, string][];
  childPhotoFields: Record<string, string | null>;
  giftQrisField: string;
  mediaPaths: { value: string; uploaded: boolean; protected: boolean; invitation: number | null }[];
  decisions: { name: string; input: ContentWriteInput; tier: 'standard' | 'premium'; needsTier: boolean; expect: unknown }[];
};

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/content-rules.json'), 'utf8')) as Vectors;

test('the vectors carry the live palette registry, the fallback palette and the media fields', () => {
  assert.deepEqual(vectors.palettes, paletteIds.map((id) => [id, paletteTier(id)]));
  assert.equal(vectors.fallbackPalette, FALLBACK_PALETTE_ID);
  assert.equal(paletteTier(FALLBACK_PALETTE_ID), 'standard');
  assert.ok(vectors.palettes.some(([, tier]) => tier === 'premium'), 'at least one Premium palette is covered');
  for (const [type, field] of Object.entries(vectors.childPhotoFields)) assert.equal(childPhotoField(type), field, type);
  assert.equal(vectors.giftQrisField, GIFT_QRIS_FIELD);
});

test("the vectors carry the live catalog's theme tiers (B-036)", () => {
  assert.deepEqual(vectors.templates, CATALOG_THEME_TIERS.map(([id, tier]) => [id, tier]));
  assert.ok(vectors.templates.some(([, tier]) => tier === 'premium') && vectors.templates.some(([, tier]) => tier === 'standard'));
});

test('upload keys follow the stored grammar exactly', () => {
  assert.ok(vectors.mediaPaths.length >= 15);
  for (const sample of vectors.mediaPaths) {
    assert.equal(isUploadedMediaPath(sample.value), sample.uploaded, `uploaded ${JSON.stringify(sample.value)}`);
    assert.equal(isProtectedMediaPath(sample.value), sample.protected, `protected ${JSON.stringify(sample.value)}`);
    assert.equal(mediaPathInvitationId(sample.value), sample.invitation, `invitation ${JSON.stringify(sample.value)}`);
  }
});

test('every decision and tier lookup matches the vectors', () => {
  assert.ok(vectors.decisions.length >= 30);
  const kinds = new Set<string>();
  for (const { name, input, tier, needsTier, expect } of vectors.decisions) {
    assert.equal(contentNeedsTier(input), needsTier, `${name}: needsTier`);
    const decision = contentDecision(input, tier);
    kinds.add(decision.kind);
    assert.deepEqual(decision, expect, name);
  }
  assert.deepEqual([...kinds].sort(), ['conflict', 'media', 'theme', 'write'], 'every outcome is covered');
});

test('a stale base is refused whatever the content, and the next version is the stored one plus one', () => {
  const input: ContentWriteInput = {
    invitationId: 7,
    eventType: 'wedding',
    storedConfig: {},
    config: { couple: { bride: { photoUrl: '/media/protected/7/0123456789abcdef01234567.png' } }, theme: { paletteId: 'neon' } },
    touchedSections: ['couple', 'theme'],
    baseVersion: 4,
    currentVersion: 9,
  };
  assert.deepEqual(contentDecision(input, 'standard'), { kind: 'conflict', currentVersion: 9 });
  assert.deepEqual(contentDecision({ ...input, config: {}, baseVersion: 9 }, 'standard'), { kind: 'write', nextVersion: 10 });
});
