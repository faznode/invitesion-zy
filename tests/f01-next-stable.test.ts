// F-01 (ADR-F1): the app runs a stable Next.js line, and the upgrade's side effects stay out of the repository.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('F-01: Next.js, React and their types are pinned to stable releases, not a canary', () => {
  const manifest = JSON.parse(source('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of ['next', 'react', 'react-dom', '@types/react', '@types/react-dom']) {
    assert.match(all[name] ?? '', /^\d+\.\d+\.\d+$/, `${name} is an exact stable version`);
  }
  assert.equal(all.next.split('.')[0], '16');
  assert.equal(all.react, all['react-dom'], 'react and react-dom move together');
});

test('F-01: next dev may not write its instruction block into the owner-authored AGENTS.md', () => {
  assert.match(source('next.config.ts'), /^\s*agentRules: false,$/m);
  assert.doesNotMatch(source('AGENTS.md'), /nextjs-agent-rules/);
});

test('F-01: one request-interception file, in the Next 16 convention', () => {
  assert.equal(existsSync(join(process.cwd(), 'proxy.ts')), true);
  assert.equal(existsSync(join(process.cwd(), 'middleware.ts')), false);
  assert.doesNotMatch(source('package.json'), /next dev --turbopack/, 'Turbopack is the default bundler in Next 16');
});
