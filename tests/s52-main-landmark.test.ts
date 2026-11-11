// The signed-in shells own the page's one `main` landmark (s51 observation, fixed in s52). The editor, the manage centre,
// both planner editors and the blueprint picker rendered a second `<main>` inside the dashboard shell's, which axe reports
// as `landmark-main-is-top-level` and `landmark-no-duplicate-main`. Pages inside a shell lay out with plain elements.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const SHELLS = [
  { routes: 'app/(customer)/dashboard', shell: 'app/(customer)/dashboard/customer-shell.tsx' },
  { routes: 'app/(admin)/admin/[entry]/(console)', shell: 'app/(admin)/admin/[entry]/(console)/admin-shell.tsx' },
];

for (const { routes, shell } of SHELLS) {
  test(`${shell} renders the only <main> under ${routes}`, () => {
    const withMain = tsxFiles(join(process.cwd(), routes))
      .map((file) => ({ file: relative(process.cwd(), file), count: readFileSync(file, 'utf8').match(/<main\b/g)?.length ?? 0 }))
      .filter((entry) => entry.count > 0);
    assert.deepEqual(withMain, [{ file: shell, count: 1 }]);
  });
}
