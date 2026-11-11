import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { solidPng } from './files';
import { runChecks } from './gates';
import { TIER_BUDGETS } from './policy';
import type { Manifest } from './schema';

/**
 * Deliberate-failure proofs: each one copies the template to a temporary directory, breaks exactly one rule, runs
 * `check`, and passes only if the named gate fails. A harness that cannot catch these is not a quality gate.
 */
type Context = { dir: string; manifest: Manifest; write: (file: string, data: string | Buffer) => void; read: (file: string) => string };

type Proof = { id: string; gate: string; applies?: (manifest: Manifest) => boolean; mutate: (context: Context) => void };

const syncBytes = (context: Context, assetId: string) => {
  const asset = context.manifest.assets.find((item) => item.id === assetId);
  if (asset) asset.bytes = statSync(join(context.dir, asset.path)).size;
};

export const PROOFS: Proof[] = [
  {
    id: 'oversized-asset',
    gate: 'budgets',
    mutate: (context) => {
      const limit = TIER_BUDGETS[context.manifest.tier].imageKiB;
      const target = context.manifest.assets.find((asset) => asset.kind === 'image');
      const path = target?.path ?? 'assets/oversized.png';
      context.write(path, Buffer.concat([solidPng(8, 8, [200, 200, 200]), randomBytes((limit + 64) * 1024)]));
      if (target) syncBytes(context, target.id);
      else context.manifest.assets.push({ id: 'oversized', path, kind: 'image', bytes: statSync(join(context.dir, path)).size, license: 'own-work', source: 'proof', author: 'proof', provenance: 'own-work', deferred: false });
    },
  },
  {
    id: 'unlicensed-font',
    gate: 'licensing',
    mutate: (context) => {
      const font = context.manifest.assets.find((asset) => asset.kind === 'font');
      if (font) {
        font.license = 'LicenseRef-Proprietary';
        return;
      }
      context.write('assets/fonts/rogue.woff2', randomBytes(2048));
      context.manifest.assets.push({ id: 'rogue-font', path: 'assets/fonts/rogue.woff2', kind: 'font', bytes: 2048, license: 'LicenseRef-Proprietary', source: 'proof', author: 'proof', provenance: 'licensed', deferred: false });
      context.manifest.tokens.typography.body = 'rogue-font';
    },
  },
  {
    id: 'missing-reduced-motion',
    gate: 'reduced-motion',
    mutate: (context) => {
      context.manifest.motion.level = Math.max(1, context.manifest.motion.level);
      const css = context.read('template.css').replace(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi, '@media (min-width: 99999px)');
      context.write('template.css', `${css}\n.proof-motion { transition: opacity 300ms ease; }\n`);
    },
  },
  {
    id: 'unsafe-guest-markup',
    gate: 'personalization',
    mutate: (context) => context.write('template.html', context.read('template.html').replace('{{guest.name}}', '{{{guest.name}}}')),
  },
  {
    id: 'guest-name-from-url',
    gate: 'personalization',
    mutate: (context) =>
      context.write('template.js', `${context.read('template.js')}\ndocument.body.insertAdjacentHTML('beforeend', new URLSearchParams(location.search).get('to') || '');\n`),
  },
  {
    id: 'unverified-religious-text',
    gate: 'religious-text',
    mutate: (context) => {
      context.manifest.strings.injectedCitation = Object.fromEntries(context.manifest.locales.map((locale) => [locale, 'QS. Ar-Rum: 21']));
    },
  },
  {
    id: 'quote-not-in-corpus',
    gate: 'religious-text',
    mutate: (context) => {
      context.manifest.quotes = [{ section: 'quote', corpusId: 'unapproved-entry' }];
    },
  },
  {
    id: 'external-script',
    gate: 'external-scripts',
    mutate: (context) => context.write('template.html', `${context.read('template.html')}\n<script src="https://cdn.example.com/tracker.js"></script>\n`),
  },
  {
    id: 'declared-bytes-mismatch',
    gate: 'files',
    mutate: (context) => {
      context.manifest.assets[0].bytes += 1;
    },
  },
  {
    id: 'og-wrong-size',
    gate: 'og-image',
    mutate: (context) => {
      const og = context.manifest.assets.find((asset) => asset.id === context.manifest.og.asset);
      if (!og) return;
      context.write(og.path, solidPng(800, 400, [10, 10, 10]));
      syncBytes(context, og.id);
    },
  },
  {
    id: 'missing-locale-string',
    gate: 'localization',
    mutate: (context) => {
      const [firstKey] = Object.keys(context.manifest.strings);
      if (context.manifest.locales.length < 2) context.manifest.locales.push(context.manifest.locales[0] === 'id' ? 'en' : 'id');
      delete context.manifest.strings[firstKey][context.manifest.locales[1]];
    },
  },
  {
    id: 'competitor-reference',
    gate: 'originality',
    mutate: (context) => {
      context.manifest.originality.references.push('moodboard copied from katsudoto demo');
    },
  },
  {
    id: 'low-contrast',
    gate: 'contrast',
    mutate: (context) => {
      context.manifest.tokens.colors.mutedText = context.manifest.tokens.colors.background;
    },
  },
  {
    id: 'autoplay-audio',
    gate: 'audio',
    applies: (manifest) => Boolean(manifest.audio),
    mutate: (context) => context.write('template.html', context.read('template.html').replace(/<audio\b/i, '<audio autoplay')),
  },
  {
    id: 'eager-3d-model',
    gate: 'lazy-3d',
    applies: (manifest) => Boolean(manifest.threeD),
    mutate: (context) => {
      const model = context.manifest.assets.find((asset) => asset.id === context.manifest.threeD?.asset);
      if (!model) return;
      context.write('template.html', `${context.read('template.html')}\n<link rel="preload" href="${model.path}" as="fetch">\n`);
    },
  },
];

export type ProofResult = { id: string; gate: string; caught: boolean; problem: string | null; otherFailures: string[] };

export function runProofs(dir: string): ProofResult[] {
  const original = JSON.parse(readFileSync(join(dir, 'template.manifest.json'), 'utf8')) as Manifest;
  const results: ProofResult[] = [];
  for (const proof of PROOFS) {
    if (proof.applies && !proof.applies(original)) continue;
    const work = mkdtempSync(join(tmpdir(), `harness-proof-${proof.id}-`));
    try {
      cpSync(dir, work, { recursive: true });
      const manifest = JSON.parse(readFileSync(join(work, 'template.manifest.json'), 'utf8')) as Manifest;
      const context: Context = {
        dir: work,
        manifest,
        write: (file, data) => {
          mkdirSync(dirname(join(work, file)), { recursive: true });
          writeFileSync(join(work, file), data);
        },
        read: (file) => (existsSync(join(work, file)) ? readFileSync(join(work, file), 'utf8') : ''),
      };
      proof.mutate(context);
      writeFileSync(join(work, 'template.manifest.json'), JSON.stringify(manifest, null, 2));
      const result = runChecks(work);
      const target = result.gates.find((item) => item.gate === proof.gate);
      results.push({
        id: proof.id,
        gate: proof.gate,
        caught: Boolean(target && !target.ok),
        problem: target?.problems[0] ?? null,
        otherFailures: result.gates.filter((item) => !item.ok && item.gate !== proof.gate).map((item) => item.gate),
      });
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return results;
}
