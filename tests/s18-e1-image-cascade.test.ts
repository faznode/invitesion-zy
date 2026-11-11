// S18-E1 (s19): an unlayered rule outranks every layered utility, so a top-level `img { max-width: … }` in the global
// stylesheet silently disabled every `max-w-*` on images. Tailwind's preflight already caps images inside `@layer base`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('S18-E1: the global stylesheet has no unlayered img rule that would outrank max-w-* utilities', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  assert.doesNotMatch(css, /^img\b[^{]*\{/m, 'a top-level img rule is unlayered');
  assert.match(css, /^@import "tailwindcss";/m, 'preflight (which caps images in @layer base) is still imported');
});
