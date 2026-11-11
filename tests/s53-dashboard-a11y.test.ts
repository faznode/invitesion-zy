// E-099 (s53): three pre-existing dashboard accessibility defects, reproduced on four served runs of F2's build.
// 1. The signed-in shells' phone drawer is `aria-modal`, yet opening it left focus on "Buka menu" and Tab reached
//    "Profil & akun" behind it. Opening must move focus inside, the page behind it must be inert, and a user's close
//    must hand focus back to the menu button.
// 2. `text-brand-600` is 4.41:1 on the dashboard's slate-50 page, below 4.5:1 for small text (axe `color-contrast`);
//    small brand text uses `text-brand-700` (6.1:1), as R-X9 did on the guest-photo review page.
// 3. The editor's two screens had no `h1` (axe `page-has-heading-one`); each screen's title is the page's `h1`.
// s54: run 6's eight "editor" contrast failures were the root 404 page (I-21 had purged the shared fixture first), whose
// `text-sm` "404" label is the same 4.41:1 on slate-50. A served sweep of every signed-in page found that label and more
// `text-sm` brand kickers on the dashboard, profile, insights and admin pages, plus emerald-600 (#009966), which is
// 3.65:1 against white as text or as the background of white text; emerald-700 is 5.36:1.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const SHELLS = ['app/(customer)/dashboard/customer-shell.tsx', 'app/(admin)/admin/[entry]/(console)/admin-shell.tsx'];

test('the drawer hook moves focus in on open, hands it back after a user close and closes at the desktop breakpoint', () => {
  const hook = read('components/dashboard/use-modal-drawer.ts');
  assert.match(hook, /initialFocusRef\.current\?\.focus\(\)/, 'focus moves into the open drawer');
  assert.match(hook, /triggerRef\.current\?\.focus\(\)/, 'focus returns to the menu button');
  assert.match(hook, /event\.key !== 'Escape'\) return;\s*returnFocus\.current = true;\s*setOpen\(false\);/, 'Escape is a user close');
  assert.match(hook, /const close = \(\) => \{\s*returnFocus\.current = true;\s*setOpen\(false\);/, 'the close controls are user closes');
  assert.match(hook, /const DESKTOP_QUERY = '\(min-width: 1024px\)'/);
  assert.match(hook, /matchMedia\(DESKTOP_QUERY\)/, 'widening to the desktop layout closes the drawer');
});

for (const shell of SHELLS) {
  test(`${shell} runs its phone drawer through useModalDrawer`, () => {
    const source = read(shell);
    assert.match(source, /const drawer = useModalDrawer\(open, setOpen\)/);
    assert.match(source, /ref=\{drawer\.triggerRef\}\s+type="button"\s+onClick=\{\(\) => setOpen\(true\)\}/, 'the menu button');
    assert.match(source, /ref=\{drawer\.initialFocusRef\}/, 'the close button inside the dialog');
    for (const element of ['header', 'aside', 'main']) {
      assert.match(source, new RegExp(`<${element} inert=\\{open\\}`), `the ${element} is inert while the drawer is open`);
    }
    assert.doesNotMatch(source, /onClick=\{\(\) => setOpen\(false\)\}/, 'no close control bypasses the hook');
    assert.equal((source.match(/onClick=\{drawer\.close\}/g) ?? []).length, 2, 'the close button and the backdrop');
    assert.doesNotMatch(source, /addEventListener\('keydown'/, 'the hook owns Escape');
  });
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

// Both signed-in surfaces, their shared dashboard components, and the root 404 that every signed-in 404 renders.
const SIGNED_IN_FILES = () => [
  ...['app/(customer)/dashboard', 'app/(admin)/admin', 'components/dashboard'].flatMap((dir) => tsxFiles(join(process.cwd(), dir))),
  join(process.cwd(), 'app/not-found.tsx'),
];
const SMALL_TEXT = ['text-xs', 'text-sm'];

function classLists(file: string): string[][] {
  return [...readFileSync(file, 'utf8').matchAll(/className=(["`])([\s\S]*?)\1/g)].map((match) => match[2].split(/\s+/));
}

test('small brand text in the signed-in surfaces and the root 404 uses brand-700, never brand-600', () => {
  const offenders = SIGNED_IN_FILES().flatMap((file) =>
    classLists(file)
      .filter((tokens) => tokens.includes('text-brand-600') && SMALL_TEXT.some((size) => tokens.includes(size)))
      .map((tokens) => `${file}: ${tokens.join(' ')}`),
  );
  assert.deepEqual(offenders, []);
});

test('small emerald text and white text on emerald in the signed-in surfaces use emerald-700, never emerald-600', () => {
  const offenders = SIGNED_IN_FILES().flatMap((file) =>
    classLists(file)
      .filter(
        (tokens) =>
          (tokens.includes('text-emerald-600') && SMALL_TEXT.some((size) => tokens.includes(size))) ||
          (tokens.includes('bg-emerald-600') && tokens.includes('text-white')),
      )
      .map((tokens) => `${file}: ${tokens.join(' ')}`),
  );
  assert.deepEqual(offenders, []);
});

test("each editor screen's title is its one h1", () => {
  const editor = read('app/(customer)/dashboard/invitations/[id]/edit/editor.tsx');
  assert.equal((editor.match(/<h1\b/g) ?? []).length, 2, 'the first screen and the section screen, never both at once');
  assert.match(editor, /<h1 className="text-2xl font-bold text-slate-900">Mulai edit undangan<\/h1>/);
  assert.match(editor, /<h1 className="text-2xl font-bold leading-tight text-slate-900">\{title\}<\/h1>/);
});
