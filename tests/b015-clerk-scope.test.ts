// B-015 (s21): Clerk's client provider wraps only the route groups where someone signs in. At the root it serialised its
// appearance and the whole localisation dictionary into every guest page's RSC payload (≈ 67 KB of ≈ 97 KB measured on
// the s21 snapshot), which SSR parsed back on every view. Server-side auth (`@clerk/nextjs/server`) needs no provider.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const AUTH_GROUPS = ['app/(login)', 'app/(customer)', 'app/(admin)'];
const CLIENT_CLERK_IMPORT = /from\s+['"]@clerk\/nextjs['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test('B-015: the root layout no longer mounts Clerk', () => {
  const layout = source('app/layout.tsx');
  assert.doesNotMatch(layout, /@clerk\//, 'root layout imports Clerk');
  assert.doesNotMatch(layout, /<ClerkProvider\b|<AuthProvider\b/, 'root layout renders a Clerk provider');
  assert.match(layout, /<html\b/, 'root layout still renders the document');
});

test('B-015: each signed-in route group wraps its pages in AuthProvider, which keeps the appearance and localisation', () => {
  for (const group of AUTH_GROUPS) {
    const layout = source(`${group}/layout.tsx`);
    assert.match(layout, /import \{ AuthProvider \} from '@\/components\/auth\/auth-provider';/, group);
    assert.match(layout, /<AuthProvider>\{children\}<\/AuthProvider>/, group);
  }
  const provider = source('components/auth/auth-provider.tsx');
  assert.match(provider, /<ClerkProvider appearance=\{clerkAppearance\} localization=\{clerkLocalization\(locale\)\}>/);
});

test('B-015: every Clerk client import lives inside a signed-in route group (nothing relies on a root provider)', () => {
  const offenders = [...sourceFiles('app'), ...sourceFiles('components')]
    .map((path) => relative(root, join(root, path)))
    .filter((path) => CLIENT_CLERK_IMPORT.test(source(path)))
    .filter((path) => path !== 'components/auth/auth-provider.tsx' && !AUTH_GROUPS.some((group) => path.startsWith(`${group}/`)));
  assert.deepEqual(offenders, []);
});

test('B-015: guest pages, the owner preview and the invitation renderer import nothing from Clerk', () => {
  for (const dir of ['app/i', 'app/preview', 'components/invitation']) {
    for (const path of sourceFiles(dir)) assert.doesNotMatch(source(path), /@clerk\//, path);
  }
});
