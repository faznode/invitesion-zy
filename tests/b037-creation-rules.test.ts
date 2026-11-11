// B-037 (D-055): the creation writers' decision (`lib/invitation/creation-rules.ts`) on the shared vectors that the Rust
// port runs too (`services/api/tests/creation_vectors.rs`): the core event types and the catalog's category table, the
// slug-base, slug-suffix, catalog-id and creation-key contracts, and every decision (the creation's own rules, then the
// content rules of a save at version 0). The vectors are generated from these rules by `scripts/api/creation-vectors.ts`;
// a rule change fails here until they are regenerated and the Rust port follows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  catalogIdOfDefaults,
  CORE_EVENT_TYPES,
  creationDecision,
  firstFreeSlug,
  isCreationKey,
  isSlugBase,
  SLUG_BASE_MAX,
  SLUG_SUFFIX_LIMIT,
  type CreationInput,
} from '../lib/invitation/creation-rules';
import { templateEventTypes } from '../lib/invitation/template-event-types';

type Vectors = {
  coreEventTypes: string[];
  categoryEventTypes: [string, string][];
  slugBaseMax: number;
  slugSuffixLimit: number;
  slugBases: { value: string; valid: boolean }[];
  slugs: { name: string; base: string; taken: string[]; limit: number; expect: string | null }[];
  catalogIds: { name: string; defaults: unknown; expect: number | null }[];
  keys: { value: string; valid: boolean }[];
  decisions: { name: string; input: CreationInput; expect: unknown }[];
};

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/creation-rules.json'), 'utf8')) as Vectors;

test('the event types and the category table are the ones the rules read', () => {
  assert.deepEqual(vectors.coreEventTypes, [...CORE_EVENT_TYPES]);
  assert.deepEqual(vectors.categoryEventTypes, Object.entries(templateEventTypes));
});

test('the slug, catalog-id and key contracts agree with the vectors', () => {
  assert.equal(vectors.slugBaseMax, SLUG_BASE_MAX);
  assert.equal(vectors.slugSuffixLimit, SLUG_SUFFIX_LIMIT);
  for (const { value, valid } of vectors.slugBases) assert.equal(isSlugBase(value), valid, `slug base ${JSON.stringify(value)}`);
  for (const { name, base, taken, limit, expect } of vectors.slugs) assert.equal(firstFreeSlug(base, taken, limit), expect, name);
  for (const { name, defaults, expect } of vectors.catalogIds) assert.equal(catalogIdOfDefaults(defaults), expect, name);
  for (const { value, valid } of vectors.keys) assert.equal(isCreationKey(value), valid, `key ${JSON.stringify(value)}`);
});

test('every decision in the vectors is what the rules decide', () => {
  assert.ok(vectors.decisions.length >= 20, 'the vectors cover the rules');
  const kinds = new Set<string>();
  for (const { name, input, expect } of vectors.decisions) {
    const decided = creationDecision(input);
    kinds.add(decided.kind);
    assert.deepEqual(decided, expect, name);
  }
  assert.deepEqual([...kinds].sort(), ['creation', 'media', 'theme', 'write'], 'every outcome is exercised');
});
