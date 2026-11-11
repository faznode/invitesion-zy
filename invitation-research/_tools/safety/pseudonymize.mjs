// pseudonymize.mjs — one rule set (slug-rules.json) for every tool that writes URLs into committed files.
// Identifying slugs (Katsudoto per-couple subdomains, Enviory full-preview couple slugs) become a stable token
// `rdct-<first 10 hex of sha256(lower-case slug)>`. The token → slug map lives only in the private evidence dir,
// so pages queued under a token stay capturable while the map exists (rebuilt by re-running discovery).
// Same algorithm as pseudonymize-slugs.py (bulk apply / --check, also run by commit-guard.sh).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = JSON.parse(readFileSync(join(HERE, 'slug-rules.json'), 'utf8'));
const TOKEN = new RegExp(`${RULES.tokenPrefix}[0-9a-f]{${RULES.tokenHexLength}}`, 'g');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const tokenFor = (slug) => RULES.tokenPrefix + createHash('sha256').update(slug.toLowerCase()).digest('hex').slice(0, RULES.tokenHexLength);

export const mapPath = (privateDir) => join(privateDir, 'redaction-map.json');
export const loadMap = (privateDir) => (existsSync(mapPath(privateDir)) ? JSON.parse(readFileSync(mapPath(privateDir), 'utf8')) : {});
export function saveMap(privateDir, map) {
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(mapPath(privateDir), JSON.stringify(map, null, 1));
}

// Rule pass first (records every slug in `map`), then an exact pass for already-known labels that appear outside
// their URL shape (e.g. URL-encoded inside another URL).
export function pseudonymizeText(text, map = {}) {
  let out = text;
  for (const rule of RULES.rules) {
    out = out.replace(new RegExp(rule.pattern, 'gi'), (slug) => {
      const token = tokenFor(slug);
      map[token] ??= { label: slug.toLowerCase(), rule: rule.id };
      return token;
    });
  }
  for (const [token, { label }] of Object.entries(map)) {
    if (label.length < RULES.exactLabelMinLength) continue;
    out = out.replace(new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(label)}(?![A-Za-z0-9-])`, 'gi'), token);
  }
  return out;
}

export function resolveTokens(text, map) {
  return text.replace(TOKEN, (token) => {
    if (!map[token]) throw new Error(`unknown redaction token ${token}: rebuild the private map by re-running discovery (_tools/discovery/discover-demos.mjs)`);
    return map[token].label;
  });
}

export const hasToken = (text) => new RegExp(TOKEN.source).test(String(text ?? ''));

// D-017 (session 07): couple names shown ON a pseudonymized demo would undo its URL token. Same rule as
// redact-demo-names.py (keep both in step; parity-tested): the Capitalized word runs directly left and right of "&" in
// the page title (before " — ", " | ", " – " or " - ") become "[name]" in the title, every section heading and both
// button lists, and an @handle containing one of them (3+ letters) becomes "@[handle]". Structural words stay.
// D-021 (session 07): applied to every competitor demo, and generic role words ("Wanita & Pria") are not names; they
// stay visible as evidence of placeholder content.
const TITLE_SPLIT = /\s+[—|–-]\s+/;
const NAME = /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’]+$/;
const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ';
const GENERIC_ROLE_WORDS = new Set(['pria', 'wanita', 'groom', 'bride', 'mempelai', 'nama', 'tamu', 'putra', 'putri', 'perempuan', 'mr', 'mrs', 'miss']);

export function demoNameWords(title) {
  const head = String(title ?? '').split(TITLE_SPLIT)[0];
  if (!head.includes('&')) return [];
  const [left, ...rest] = head.split('&');
  const words = (text) => text.split(/\s+/).filter(Boolean);
  const names = [];
  for (const word of words(left).reverse()) { if (!NAME.test(word)) break; names.push(word); }
  for (const word of words(rest.join('&'))) { if (!NAME.test(word)) break; names.push(word); }
  return [...new Set(names)].filter((word) => !GENERIC_ROLE_WORDS.has(word.toLowerCase())).sort((a, b) => b.length - a.length);
}

export function redactNames(text, words) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const word of words) out = out.replace(new RegExp(`(?<![${LETTER}])${escapeRegExp(word)}(?![${LETTER}])`, 'gi'), '[name]');
  const lowered = words.filter((word) => word.length >= 3).map((word) => word.toLowerCase());
  return out.replace(/@[A-Za-z0-9_.]+/g, (handle) => (lowered.some((word) => handle.toLowerCase().includes(word)) ? '@[handle]' : handle));
}

export function redactDemoNames(structure) {
  const after = structure?.afterOpen ?? {};
  const before = structure?.beforeOpen ?? {};
  const words = demoNameWords(after.title);
  if (!words.length) return structure;
  after.title = redactNames(after.title, words);
  for (const section of after.sections ?? []) section.heading = redactNames(section.heading, words);
  for (const block of [after, before]) if (Array.isArray(block.buttons)) block.buttons = block.buttons.map((button) => redactNames(button, words));
  return structure;
}
