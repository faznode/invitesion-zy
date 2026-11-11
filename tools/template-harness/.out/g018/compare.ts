// Scratch (git-ignored): compare two render dumps page by page.
//   npx tsx compare.ts <old.json> <new.json> <newLang> [--only legacy|families] [--show N]
// Old pages are keyed `slug|unset|audience`; new pages `slug|<newLang>|audience`.
import { readFileSync } from 'node:fs';

const [oldPath, newPath, newLang, ...rest] = process.argv.slice(2);
const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1] : undefined;
const show = rest.includes('--show') ? Number(rest[rest.indexOf('--show') + 1]) : 3;
const before = JSON.parse(readFileSync(oldPath, 'utf8')) as Record<string, string>;
const after = JSON.parse(readFileSync(newPath, 'utf8')) as Record<string, string>;

const isLegacy = (slug: string) => /^review-legacy-/.test(slug) || (/^review-new-/.test(slug) && false);
let same = 0;
const differ: string[] = [];
for (const key of Object.keys(before)) {
  const [slug, , audience] = key.split('|');
  if (only === 'legacy' && !isLegacy(slug)) continue;
  if (only === 'families' && isLegacy(slug)) continue;
  const next = after[`${slug}|${newLang}|${audience}`];
  if (next === undefined) continue;
  if (next === before[key]) same++;
  else differ.push(key);
}
console.log(`${newLang}${only ? ` (${only})` : ''}: ${same} identical, ${differ.length} different`);
for (const key of differ.slice(0, show)) {
  const [slug, , audience] = key.split('|');
  const a = before[key];
  const b = after[`${slug}|${newLang}|${audience}`];
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  console.log(`--- ${key} first difference at ${i}`);
  console.log(`  old: …${a.slice(Math.max(0, i - 120), i + 160)}`);
  console.log(`  new: …${b.slice(Math.max(0, i - 120), i + 160)}`);
}
