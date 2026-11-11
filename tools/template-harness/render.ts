import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { formatEventDate, formatEventTime } from '../../lib/invitation/event-time';
import { SYSTEM_FONTS, type Manifest } from './schema';

/**
 * Harness preview renderer. Template files are body fragments with mustache-style placeholders:
 *   {{t.key}}  localized string     {{guest.name}}  guest name (must sit in a `<bdi>` or `dir="auto"` element)
 *   {{couple.first}} {{couple.second}}   {{asset.<id>}}  asset URL   {{#events}}…{{/events}} with {{event.*}}
 * Every value is HTML-escaped. Triple braces (raw HTML) are refused: personal data never becomes markup.
 * Event times use the product's own formatter (B-004), so previews show WIB / WITA / WIT exactly like guest pages.
 */
export const FIXTURES = {
  default: { guest: 'Budi Hartono' },
  'long-name': { guest: 'Raden Mas Bagus Prasetyo Wicaksono Adiningrat Kusumawardhana Putra Mahardika' },
  rtl: { guest: 'عبد الرحمن' },
  emoji: { guest: 'Tante Rina 🌸✨' },
  hostile: { guest: `<script>alert(1)</script><img src=x onerror=alert(2)>"'&` },
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Fake sample content only (AGENTS.md: never real personal data). Three events cover the three Indonesian zones. */
export const SAMPLE = {
  couple: { first: 'Sari', second: 'Budi' },
  events: [
    { title: 'Akad', startAt: '2026-12-20T08:00:00+07:00', venue: 'Gedung Sampel, Jakarta' },
    { title: 'Resepsi', startAt: '2026-12-27T19:00:00+08:00', venue: 'Balai Contoh, Makassar' },
    { title: 'Ngunduh Mantu', startAt: '2027-01-03T10:30:00+09:00', venue: 'Aula Fiktif, Jayapura' },
  ],
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export class RenderError extends Error {}

const FONT_STACKS: Record<(typeof SYSTEM_FONTS)[number], string> = {
  'system-serif': 'Georgia, "Times New Roman", serif',
  'system-sans': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

function fontFamily(manifest: Manifest, id: string, role: 'display' | 'body') {
  if (id in FONT_STACKS) return { css: FONT_STACKS[id as keyof typeof FONT_STACKS], face: '' };
  const asset = manifest.assets.find((item) => item.id === id && item.kind === 'font');
  if (!asset) throw new RenderError(`typography.${role} refers to unknown font asset "${id}"`);
  const family = `tpl-${role}`;
  const face = `@font-face{font-family:"${family}";src:url("${asset.path}") format("woff2");font-display:swap;font-weight:100 900;}`;
  return { css: `"${family}", ${role === 'display' ? 'Georgia, serif' : 'system-ui, sans-serif'}`, face };
}

function tokenStyle(manifest: Manifest) {
  const { colors, typography, radius, spacingScale } = manifest.tokens;
  const display = fontFamily(manifest, typography.display, 'display');
  const body = fontFamily(manifest, typography.body, 'body');
  const vars = [
    ...Object.entries(colors).map(([key, value]) => `--color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`),
    `--font-display:${display.css}`,
    `--font-body:${body.css}`,
    `--radius:${radius}`,
    ...spacingScale.map((value, index) => `--space-${index}:${value}px`),
    ...manifest.motion.durationsMs.map((value, index) => `--duration-${index}:${value}ms`),
    `--easing:${manifest.motion.easing}`,
  ];
  return `${display.face}${body.face}:root{${vars.join(';')}}`;
}

export function renderTemplate(dir: string, manifest: Manifest, fixture: FixtureName = 'default', locale = manifest.defaultLocale): string {
  const fragment = readFileSync(join(dir, 'template.html'), 'utf8');
  if (fragment.includes('{{{')) throw new RenderError('raw (triple-brace) placeholders are not allowed');

  const strings = (key: string) => {
    const entry = manifest.strings[key];
    const value = entry?.[locale] ?? entry?.[manifest.defaultLocale];
    if (value === undefined) throw new RenderError(`unknown string "t.${key}"`);
    return value;
  };
  const assetUrl = (id: string) => {
    const asset = manifest.assets.find((item) => item.id === id);
    if (!asset) throw new RenderError(`unknown asset "asset.${id}"`);
    return asset.path;
  };
  const scalar = (key: string, event?: (typeof SAMPLE.events)[number]): string => {
    if (key.startsWith('t.')) return strings(key.slice(2));
    if (key.startsWith('asset.')) return assetUrl(key.slice(6));
    if (key === 'guest.name') return [...FIXTURES[fixture].guest].slice(0, manifest.personalization.guestName.maxLength).join('');
    if (key === 'couple.first') return SAMPLE.couple.first;
    if (key === 'couple.second') return SAMPLE.couple.second;
    if (key === 'event.startAt' && event) return event.startAt;
    if (key === 'event.title' && event) return event.title;
    if (key === 'event.venue' && event) return event.venue;
    if (key === 'event.date' && event) return formatEventDate(event.startAt) ?? '';
    if (key === 'event.time' && event) return formatEventTime(event.startAt) ?? '';
    if (key === 'events.firstStartAt') return SAMPLE.events[0].startAt;
    throw new RenderError(`unknown placeholder "{{${key}}}"`);
  };
  const fill = (text: string, event?: (typeof SAMPLE.events)[number]) =>
    text.replace(/\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g, (_, key: string) => escapeHtml(scalar(key, event)));

  const body = fragment
    .replace(/\{\{#events\}\}([\s\S]*?)\{\{\/events\}\}/g, (_, block: string) => SAMPLE.events.map((event) => fill(block, event)).join(''))
    .replace(/\{\{[#/][^}]*\}\}/g, (match) => {
      throw new RenderError(`unknown block ${match}`);
    });
  const filled = fill(body);
  const hasScript = existsSync(join(dir, 'template.js'));

  return [
    '<!doctype html>',
    `<html lang="${manifest.accessibility.lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(manifest.name)}</title>`,
    `<style>${tokenStyle(manifest)}</style>`,
    '<link rel="stylesheet" href="template.css">',
    hasScript ? '<script src="template.js" defer></script>' : '',
    '</head>',
    `<body data-fixture="${fixture}">`,
    filled,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

export function defaultOutDir(manifest: Manifest) {
  return join(tmpdir(), 'invitesion-harness', manifest.id);
}

/** Writes preview.html + one file per fixture, with the template's CSS/JS and assets, outside the repository. */
export function writePreview(dir: string, manifest: Manifest, outDir = defaultOutDir(manifest)) {
  mkdirSync(outDir, { recursive: true });
  for (const file of ['template.css', 'template.js']) if (existsSync(join(dir, file))) copyFileSync(join(dir, file), join(outDir, file));
  for (const asset of manifest.assets) {
    const target = join(outDir, asset.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(dir, asset.path), target);
  }
  const files: Record<string, string> = {};
  for (const fixture of Object.keys(FIXTURES) as FixtureName[]) {
    const name = fixture === 'default' ? 'preview.html' : `preview-${fixture}.html`;
    writeFileSync(join(outDir, name), renderTemplate(dir, manifest, fixture));
    files[fixture] = join(outDir, name);
  }
  return { outDir, files };
}
