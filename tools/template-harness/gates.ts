import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { approvedEntry, looksReligious } from '../../lib/invitation/religious-text';
import { contrastRatio, imageInfo, kib } from './files';
import { COMPETITOR_MARKERS, EXTERNAL_SCRIPT_ALLOWLIST, FONT_LICENSES, LICENSE_ALLOWLIST, MAX_FONT_FAMILIES, TIER_BUDGETS } from './policy';
import { FIXTURES, renderTemplate, RenderError, type FixtureName } from './render';
import { manifestSchema, SYSTEM_FONTS, type Manifest } from './schema';

/**
 * Static quality gates (`harness check`, masterplan 08 §4). Every gate reports problems (fail) and notes (honest
 * limits or observations). Sizes are measured from the files, never taken from the manifest.
 */
export type GateResult = { gate: string; ok: boolean; problems: string[]; notes: string[] };

export type Measurements = {
  htmlBytes: number;
  cssBytes: number;
  jsBytes: number;
  fontBytes: number;
  imageBytes: number;
  coldLoadBytes: number;
  deferredAudioBytes: number;
  deferredModelBytes: number;
  largestImage: { id: string; bytes: number } | null;
};

export type CheckResult = { dir: string; manifest: Manifest | null; ok: boolean; gates: GateResult[]; measurements: Measurements | null };

/** Open-ended og budget: WhatsApp drops large preview images [ASSUMPTION, revisit with a device check]. */
const OG_MAX_KIB = 300;
const OG_SIZE = { width: 1200, height: 630 };

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const visibleText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function gate(name: string, run: (problems: string[], notes: string[]) => void): GateResult {
  const problems: string[] = [];
  const notes: string[] = [];
  try {
    run(problems, notes);
  } catch (error) {
    problems.push(`gate crashed: ${(error as Error).message}`);
  }
  return { gate: name, ok: problems.length === 0, problems, notes };
}

export function runChecks(dir: string): CheckResult {
  const manifestPath = join(dir, 'template.manifest.json');
  const gates: GateResult[] = [];
  let manifest: Manifest | null = null;

  gates.push(
    gate('schema', (problems) => {
      if (!existsSync(manifestPath)) {
        problems.push('template.manifest.json missing');
        return;
      }
      const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, 'utf8')));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
        return;
      }
      manifest = parsed.data;
    }),
  );
  if (!manifest) return { dir, manifest: null, ok: false, gates, measurements: null };
  const m: Manifest = manifest;

  const html = read(join(dir, 'template.html'));
  const css = read(join(dir, 'template.css'));
  const js = read(join(dir, 'template.js'));
  const assetById = new Map(m.assets.map((asset) => [asset.id, asset]));
  const fileBytes = (path: string) => (existsSync(join(dir, path)) ? statSync(join(dir, path)).size : 0);
  const budget = { ...TIER_BUDGETS[m.tier], ...m.budgets };

  gates.push(
    gate('files', (problems, notes) => {
      if (!html) problems.push('template.html missing or empty');
      if (!css) problems.push('template.css missing or empty');
      const ids = new Set<string>();
      const paths = new Set<string>();
      for (const asset of m.assets) {
        if (ids.has(asset.id)) problems.push(`duplicate asset id ${asset.id}`);
        if (paths.has(asset.path)) problems.push(`duplicate asset path ${asset.path}`);
        ids.add(asset.id);
        paths.add(asset.path);
        const full = join(dir, asset.path);
        if (!existsSync(full)) {
          problems.push(`${asset.id}: file ${asset.path} missing`);
          continue;
        }
        const actual = statSync(full).size;
        if (actual !== asset.bytes) problems.push(`${asset.id}: declared ${asset.bytes} bytes, file has ${actual}`);
        if (asset.kind === 'image' || asset.kind === 'og') {
          const info = imageInfo(readFileSync(full));
          if (info.format === 'unknown') problems.push(`${asset.id}: not a PNG, JPEG, WebP or SVG file`);
          if (asset.width && info.width && asset.width !== info.width) problems.push(`${asset.id}: declared width ${asset.width}, file is ${info.width}`);
          if (asset.height && info.height && asset.height !== info.height) problems.push(`${asset.id}: declared height ${asset.height}, file is ${info.height}`);
        }
      }
      for (const role of ['display', 'body'] as const) {
        const id = m.tokens.typography[role];
        if (!(SYSTEM_FONTS as readonly string[]).includes(id) && assetById.get(id)?.kind !== 'font') problems.push(`typography.${role} "${id}" is neither a system font nor a font asset`);
      }
      if (assetById.get(m.og.asset)?.kind !== 'og') problems.push(`og.asset "${m.og.asset}" is not an og asset`);
      if (m.audio && assetById.get(m.audio.asset)?.kind !== 'audio') problems.push(`audio.asset "${m.audio.asset}" is not an audio asset`);
      if (m.threeD && assetById.get(m.threeD.asset)?.kind !== 'model') problems.push(`threeD.asset "${m.threeD.asset}" is not a model asset`);
      if (m.threeD && assetById.get(m.threeD.fallbackImage)?.kind !== 'image') problems.push(`threeD.fallbackImage "${m.threeD.fallbackImage}" is not an image asset`);
      if (!m.locales.includes(m.defaultLocale)) problems.push(`defaultLocale ${m.defaultLocale} is not in locales`);
      notes.push(`${m.assets.length} assets, sizes and dimensions read from the files`);
    }),
  );

  const htmlBytes = Buffer.byteLength(html);
  const cssBytes = Buffer.byteLength(css);
  const jsBytes = Buffer.byteLength(js);
  const nonDeferred = m.assets.filter((asset) => !asset.deferred && asset.kind !== 'og');
  const fontAssets = m.assets.filter((asset) => asset.kind === 'font');
  const fontBytes = fontAssets.filter((asset) => !asset.deferred).reduce((sum, asset) => sum + fileBytes(asset.path), 0);
  const imageAssets = nonDeferred.filter((asset) => asset.kind === 'image');
  const imageBytes = imageAssets.reduce((sum, asset) => sum + fileBytes(asset.path), 0);
  const largest = [...m.assets.filter((asset) => asset.kind === 'image')].sort((a, b) => fileBytes(b.path) - fileBytes(a.path))[0];
  const measurements: Measurements = {
    htmlBytes,
    cssBytes,
    jsBytes,
    fontBytes,
    imageBytes,
    coldLoadBytes: htmlBytes + cssBytes + jsBytes + nonDeferred.reduce((sum, asset) => sum + fileBytes(asset.path), 0),
    deferredAudioBytes: m.assets.filter((asset) => asset.kind === 'audio').reduce((sum, asset) => sum + fileBytes(asset.path), 0),
    deferredModelBytes: m.assets.filter((asset) => asset.kind === 'model').reduce((sum, asset) => sum + fileBytes(asset.path), 0),
    largestImage: largest ? { id: largest.id, bytes: fileBytes(largest.path) } : null,
  };

  gates.push(
    gate('budgets', (problems, notes) => {
      const tier = TIER_BUDGETS[m.tier];
      for (const [key, value] of Object.entries(m.budgets ?? {})) {
        if (value > tier[key as keyof typeof tier]) problems.push(`budgets.${key} ${value} loosens the ${m.tier} default ${tier[key as keyof typeof tier]} (only tightening is allowed)`);
      }
      const over = (label: string, bytes: number, limitKiB: number) => {
        if (bytes > limitKiB * 1024) problems.push(`${label} ${kib(bytes)} KiB > ${limitKiB} KiB (${m.tier})`);
      };
      over('cold-load total', measurements.coldLoadBytes, budget.coldLoadKiB);
      over('template JS', jsBytes, budget.jsKiB);
      over('fonts', fontBytes, budget.fontsKiB);
      const families = new Set([m.tokens.typography.display, m.tokens.typography.body].filter((id) => !(SYSTEM_FONTS as readonly string[]).includes(id)));
      if (families.size > MAX_FONT_FAMILIES) problems.push(`${families.size} font families > ${MAX_FONT_FAMILIES}`);
      for (const font of fontAssets) if (!families.has(font.id)) problems.push(`font asset ${font.id} is not used by the typography tokens`);
      for (const image of m.assets.filter((asset) => asset.kind === 'image')) over(`image ${image.id}`, fileBytes(image.path), budget.imageKiB);
      for (const og of m.assets.filter((asset) => asset.kind === 'og')) over(`og image ${og.id}`, fileBytes(og.path), OG_MAX_KIB);
      for (const audio of m.assets.filter((asset) => asset.kind === 'audio')) {
        if (budget.audioKiB === 0) problems.push(`audio ${audio.id}: the ${m.tier} tier allows no audio`);
        if (!audio.deferred) problems.push(`audio ${audio.id} must be deferred (loaded after the open gesture)`);
        over(`audio ${audio.id}`, fileBytes(audio.path), budget.audioKiB);
      }
      for (const model of m.assets.filter((asset) => asset.kind === 'model')) {
        if (budget.modelKiB === 0) problems.push(`model ${model.id}: the ${m.tier} tier allows no 3D model`);
        if (!model.deferred) problems.push(`model ${model.id} must be deferred`);
        over(`model ${model.id}`, fileBytes(model.path), Math.min(budget.modelKiB, (m.threeD?.maxBytes ?? Infinity) / 1024));
      }
      if (m.motion.level > tier.maxMotion) problems.push(`motion level ${m.motion.level} > ${tier.maxMotion} allowed for ${m.tier}`);
      notes.push(
        `cold load ${kib(measurements.coldLoadBytes)} / ${budget.coldLoadKiB} KiB · JS ${kib(jsBytes)} / ${budget.jsKiB} · fonts ${kib(fontBytes)} / ${budget.fontsKiB} · largest image ${measurements.largestImage ? `${kib(measurements.largestImage.bytes)} KiB` : 'none'}`,
        'bytes on disk; transfer size after compression is measured only by `bench` (Lighthouse)',
      );
    }),
  );

  gates.push(
    gate('contrast', (problems, notes) => {
      const c = m.tokens.colors;
      const pairs: Array<[string, string, string, number]> = [
        ['text', c.text, 'background', m.accessibility.minContrast.body],
        ['mutedText', c.mutedText, 'background', m.accessibility.minContrast.body],
        ['text', c.text, 'surface', m.accessibility.minContrast.body],
        ['mutedText', c.mutedText, 'surface', m.accessibility.minContrast.body],
        ['accent', c.accent, 'background', m.accessibility.minContrast.large],
        ['onAccent', c.onAccent, 'accent', m.accessibility.minContrast.body],
      ];
      for (const [fg, fgHex, bg, min] of pairs) {
        const bgHex = c[bg as keyof typeof c];
        const ratio = contrastRatio(fgHex, bgHex);
        (ratio < min ? problems : notes).push(`${fg} on ${bg}: ${ratio}:1 (min ${min})`);
      }
      notes.push('computed on tokens, not on rendered pixels over images');
    }),
  );

  gates.push(
    gate('reduced-motion', (problems, notes) => {
      const hasQuery = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i.test(css);
      if (m.motion.level > 0 && !hasQuery) problems.push(`motion level ${m.motion.level} but template.css has no @media (prefers-reduced-motion: reduce)`);
      const jsAnimates = /\b(requestAnimationFrame|\.animate\(|IntersectionObserver|getContext\(\s*['"]webgl)/.test(js);
      if (m.motion.level > 0 && jsAnimates && !/prefers-reduced-motion/.test(js)) problems.push('template.js animates without checking prefers-reduced-motion');
      if (m.motion.level === 0 && /@keyframes|animation\s*:/.test(css)) problems.push('motion level 0 but template.css declares animations');
      notes.push(`fallback declared: ${m.motion.reducedMotion}; behaviour confirmed by \`snapshot\` with emulated reduced motion`);
    }),
  );

  gates.push(
    gate('lazy-3d', (problems, notes) => {
      const models = m.assets.filter((asset) => asset.kind === 'model');
      if (!m.threeD) {
        if (models.length) problems.push('model asset present without a threeD block');
        notes.push('no 3D');
        return;
      }
      const model = assetById.get(m.threeD.asset);
      const fallback = assetById.get(m.threeD.fallbackImage);
      if (model && html.includes(model.path)) problems.push('model path appears in the initial HTML (must load lazily from template.js)');
      if (model && !model.deferred) problems.push('model asset must be deferred');
      if (fallback && fallback.deferred) problems.push('fallback image must be part of the first render (not deferred)');
      if (fallback && !html.includes(`asset.${fallback.id}`)) problems.push('fallback image is not referenced by template.html');
      if (fallback && fileBytes(fallback.path) > budget.fallbackKiB * 1024) problems.push(`fallback image ${kib(fileBytes(fallback.path))} KiB > ${budget.fallbackKiB} KiB`);
      if (!js) problems.push('3D declared but there is no template.js to load it');
      else if (model && !js.includes(model.path)) problems.push('template.js does not reference the model path');
      if (m.threeD.trigger === 'interaction' && !/addEventListener\(\s*['"](click|pointerdown)['"]/.test(js)) problems.push('trigger "interaction" but template.js has no click/pointer listener');
      notes.push('real-device frame rate is not measured');
    }),
  );

  gates.push(
    gate('audio', (problems, notes) => {
      const tag = html.match(/<audio\b[^>]*>/i)?.[0];
      if (!m.audio) {
        if (tag) problems.push('<audio> present without an audio block');
        notes.push('no audio');
        return;
      }
      if (!tag) {
        problems.push('audio declared but template.html has no <audio>');
        return;
      }
      if (!/preload=["']none["']/i.test(tag)) problems.push('<audio> must have preload="none"');
      if (/\bautoplay\b/i.test(tag)) problems.push('<audio> must not autoplay');
      if (!/aria-pressed=/.test(html)) problems.push('no pause/mute control with aria-pressed');
      if (!/\.play\(\)/.test(js) || !/addEventListener\(\s*['"]click['"]/.test(js)) problems.push('template.js must start playback from the open gesture (click handler calling play())');
      notes.push('playback itself is not verified without a device (opening ≠ playback, D-016)');
    }),
  );

  gates.push(
    gate('personalization', (problems, notes) => {
      if (html.includes('{{{')) problems.push('raw triple-brace placeholder in template.html');
      if (!html.includes('{{guest.name}}')) problems.push('template.html never renders {{guest.name}}');
      const isolated = /<bdi\b[^>]*>\s*\{\{guest\.name\}\}\s*<\/bdi>|dir=["']auto["'][^>]*>\s*\{\{guest\.name\}\}/.test(html);
      if (html.includes('{{guest.name}}') && !isolated) problems.push('{{guest.name}} must sit directly inside <bdi> or an element with dir="auto"');
      const unsafe = js.match(/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function|location\.(search|hash)|URLSearchParams)\b/g);
      if (unsafe) problems.push(`template.js uses ${[...new Set(unsafe)].join(', ')} (guest data comes from the guests table only, never from the URL or as markup)`);
      try {
        const rendered = renderTemplate(dir, m, 'hostile');
        if (/<script>alert\(1\)|<img src=x onerror/i.test(rendered)) problems.push('hostile guest fixture reached the page unescaped');
        if (!rendered.includes('&lt;script&gt;alert(1)')) problems.push('hostile guest fixture is not visible as escaped text');
      } catch (error) {
        problems.push(`render failed: ${(error as Error).message}`);
      }
      notes.push('harness renderer, not the product renderer (product: H-INV-003)');
    }),
  );

  gates.push(
    gate('render-fixtures', (problems, notes) => {
      for (const fixture of Object.keys(FIXTURES) as FixtureName[]) {
        for (const locale of m.locales) {
          try {
            renderTemplate(dir, m, fixture, locale);
          } catch (error) {
            problems.push(`${fixture}/${locale}: ${error instanceof RenderError ? error.message : String(error)}`);
          }
        }
      }
      const rendered = renderTemplate(dir, m, 'default');
      for (const label of ['WIB', 'WITA', 'WIT']) if (html.includes('{{event.time}}') && !rendered.includes(` ${label}`)) problems.push(`event times lack the ${label} label`);
      notes.push('fixtures: long Indonesian name, Arabic name, emoji name, hostile markup; overflow is judged in snapshots');
    }),
  );

  gates.push(
    gate('localization', (problems, notes) => {
      for (const [key, values] of Object.entries(m.strings)) {
        for (const locale of m.locales) if (!values[locale]?.trim()) problems.push(`t.${key} missing ${locale}`);
      }
      const used = new Set([...html.matchAll(/\{\{t\.([a-zA-Z0-9]+)\}\}/g)].map((match) => match[1]));
      for (const key of used) if (!m.strings[key]) problems.push(`t.${key} used but not defined`);
      const unused = Object.keys(m.strings).filter((key) => !used.has(key) && !js.includes(key));
      if (unused.length) notes.push(`unused strings: ${unused.join(', ')}`);
    }),
  );

  gates.push(
    gate('external-scripts', (problems) => {
      const patterns = [
        /<script[^>]+src=["']?(https?:)?\/\/[^"'\s>]+/gi,
        /<link[^>]+href=["']?(https?:)?\/\/[^"'\s>]+/gi,
        /@import[^;]+/gi,
        /url\(\s*["']?(https?:)?\/\/[^)"']+/gi,
        /\b(src|data-src|poster)=["']?(https?:)?\/\/[^"'\s>]+/gi,
        /\b(fetch|import)\(\s*["'`](https?:)?\/\/[^"'`]+/gi,
        /new\s+(WebSocket|EventSource|Worker)\(/g,
      ];
      for (const [name, text] of [['template.html', html], ['template.css', css], ['template.js', js]] as const) {
        for (const pattern of patterns) {
          for (const match of text.matchAll(pattern)) {
            if (!EXTERNAL_SCRIPT_ALLOWLIST.some((origin) => match[0].includes(origin))) problems.push(`${name}: external load "${match[0].slice(0, 80)}"`);
          }
        }
      }
      for (const origin of m.externalScripts) if (!EXTERNAL_SCRIPT_ALLOWLIST.includes(origin)) problems.push(`externalScripts: ${origin} is not on the allowlist (empty)`);
    }),
  );

  gates.push(
    gate('og-image', (problems, notes) => {
      const og = assetById.get(m.og.asset);
      if (!og || !existsSync(join(dir, og.path))) {
        problems.push('og image missing');
        return;
      }
      const info = imageInfo(readFileSync(join(dir, og.path)));
      if (!['png', 'jpeg', 'webp'].includes(info.format)) problems.push(`og image must be PNG, JPEG or WebP (found ${info.format})`);
      if (info.width !== OG_SIZE.width || info.height !== OG_SIZE.height) problems.push(`og image is ${info.width}×${info.height}, expected 1200×630`);
      notes.push(`${og.path} ${info.width}×${info.height}`);
    }),
  );

  gates.push(
    gate('licensing', (problems, notes) => {
      for (const asset of m.assets) {
        if (!LICENSE_ALLOWLIST.includes(asset.license)) problems.push(`${asset.id}: license "${asset.license}" is not on the allowlist (${LICENSE_ALLOWLIST.join(', ')})`);
        if (asset.kind === 'font') {
          if (!FONT_LICENSES.includes(asset.license)) problems.push(`${asset.id}: fonts must be ${FONT_LICENSES.join(' or ')} (found ${asset.license})`);
          const folder = dirname(join(dir, asset.path));
          const hasLicenseFile = existsSync(folder) && readdirSync(folder).some((file) => /^(OFL|LICENSE)/i.test(file));
          if (!hasLicenseFile) problems.push(`${asset.id}: no OFL/LICENSE file next to the font`);
        }
        if (asset.provenance === 'licensed' && asset.license === 'own-work') problems.push(`${asset.id}: provenance "licensed" needs a real license id`);
      }
      notes.push('declarations are trusted; provenance review stays human');
    }),
  );

  gates.push(
    gate('originality', (problems, notes) => {
      const haystacks: Array<[string, string]> = [
        ['template.html', html],
        ['template.css', css],
        ['template.js', js],
        ['manifest', readFileSync(manifestPath, 'utf8')],
      ];
      for (const [name, text] of haystacks) {
        const lower = text.toLowerCase();
        for (const marker of COMPETITOR_MARKERS) if (lower.includes(marker)) problems.push(`${name} references "${marker}"`);
      }
      notes.push('cannot prove visual dissimilarity; reviewer sign-off belongs in the generation report');
    }),
  );

  gates.push(
    gate('religious-text', (problems, notes) => {
      for (const quote of m.quotes ?? []) if (!approvedEntry(quote.corpusId)) problems.push(`quote ${quote.corpusId} is not an approved entry of content/verified-religious-texts/corpus.json`);
      for (const [key, values] of Object.entries(m.strings)) {
        for (const [locale, value] of Object.entries(values)) if (looksReligious(value)) problems.push(`t.${key}.${locale} looks like religious text: "${value.slice(0, 60)}"`);
      }
      const text = visibleText(html);
      if (looksReligious(text)) problems.push('template.html contains religious text outside the verified corpus');
      notes.push('the corpus is empty until the owner approves entries, so no quote blocks ship (ADR-O04)');
    }),
  );

  return { dir, manifest: m, ok: gates.every((result) => result.ok), gates, measurements };
}

export function formatCheck(result: CheckResult): string {
  const lines = [`harness check ${result.dir}: ${result.ok ? 'PASS' : 'FAIL'}`];
  for (const item of result.gates) {
    lines.push(`  ${item.ok ? 'ok  ' : 'FAIL'} ${item.gate}`);
    for (const problem of item.problems) lines.push(`         ✗ ${problem}`);
  }
  return lines.join('\n');
}
