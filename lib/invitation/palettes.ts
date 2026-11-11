import type { CSSProperties } from 'react';

/**
 * Guest-page palettes (B-016). Hex tokens are the single source: the page reads them as CSS custom properties through
 * `palette().style`, and the link-preview image (B-010) reads the same values through `paletteHex()`, so the WhatsApp
 * preview and the page never drift apart. Every text token meets WCAG 2.x AA on every surface it is drawn on
 * (`tests/palette-contrast.test.ts`). Every paletteId used by lib/invitation/templates.ts is registered here, and stored
 * invitations keep their IDs.
 */
export type PaletteTokens = {
  scheme: 'light' | 'dark';
  /** Page surface. */
  bg: string;
  /** Body text. */
  ink: string;
  /** Accent text, icons, links and outlined buttons. */
  accent: string;
  /** Secondary text: labels, hints, addresses, captions. */
  muted: string;
  /** Tinted blocks: guest name, countdown, locked fields. */
  soft: string;
  /** Solid card surface. */
  card: string;
  /** Editable form-field surface. */
  field: string;
  /** Borders; the only token that may carry alpha. */
  line: string;
};

/*
 * Values come from a WCAG solver run for B-016: an accent keeps its hue and saturation and moves lightness only until it
 * clears 4.6:1 (AA plus a rounding margin) on bg, card and soft; muted is the lightest ink→bg blend that clears the same
 * bar; light cards are the old 70 % white over bg made solid. Dark palettes draw cards on their soft tone, because
 * translucent white under light ink measured 1.64:1 (QA-008).
 */
const light = (bg: string, ink: string, accent: string, muted: string, soft: string, card: string): PaletteTokens => ({
  scheme: 'light',
  bg,
  ink,
  accent,
  muted,
  soft,
  card,
  field: '#ffffff',
  line: '#0000001f',
});

const dark = (bg: string, ink: string, accent: string, muted: string, soft: string): PaletteTokens => ({
  scheme: 'dark',
  bg,
  ink,
  accent,
  muted,
  soft,
  card: soft,
  field: bg,
  line: '#ffffff2e',
});

const palettes: Record<string, PaletteTokens> = {
  ivory: light('#faf7f2', '#3f3a34', '#876132', '#6c6762', '#f1e9dd', '#fefdfb'),
  'rose-gold': light('#fdf6f4', '#453437', '#9e4f5b', '#716364', '#f7e4e3', '#fefcfc'),
  confetti: light('#fef8f3', '#3b3340', '#b6401c', '#6c646d', '#fde5d6', '#fffdfb'),
  sage: light('#f5f8f4', '#34403a', '#546f58', '#606a65', '#e3ede2', '#fcfdfc'),
  sand: light('#faf7f0', '#403a30', '#7c623f', '#6b655c', '#efe6d5', '#fefdfb'),
  slate: light('#f6f7f9', '#2b3138', '#3c6aa1', '#64686e', '#e5eaf1', '#fcfdfd'),
  midnight: dark('#101526', '#e8e9f2', '#d3b16a', '#898c98', '#1c2338'),
  terracotta: light('#faf3ee', '#41332c', '#9b4e2b', '#6d615b', '#f3e0d3', '#fefbfa'),
  orchid: light('#faf6fb', '#3d3242', '#825391', '#6a616e', '#efe0f2', '#fefcfe'),
  emerald: light('#f2f7f4', '#22352b', '#1f6f50', '#5a6961', '#dcebe2', '#fbfdfc'),
  dusk: light('#f6f4f9', '#33303f', '#6150ca', '#64616d', '#e6e1f2', '#fcfcfd'),
  mocha: light('#f9f5f1', '#3c332c', '#825c44', '#6b635d', '#eee2d7', '#fdfcfb'),
  ocean: light('#f3f8fa', '#27353d', '#25708c', '#5e6a70', '#dcedf2', '#fbfdfe'),
  blossom: light('#fdf5f6', '#43333a', '#b53856', '#716369', '#f8e2e7', '#fefcfc'),
  'gold-noir': dark('#171310', '#f1e9dc', '#caa353', '#8f8980', '#262019'),
  lavender: light('#f8f6fc', '#3a3547', '#6e5aaa', '#686372', '#ebe5f6', '#fdfcfe'),
  mint: light('#f3faf6', '#2c3b33', '#337558', '#5e6b64', '#def0e6', '#fbfefc'),
  sunshine: light('#fffaf0', '#3f3626', '#936003', '#71695b', '#fdedcb', '#fffefb'),
};

export const paletteIds = Object.keys(palettes);

/** Static class names (literal so Tailwind generates them); the values arrive through `Tone.style`. */
const toneClasses = {
  bg: 'bg-(--inv-bg)',
  ink: 'text-(--inv-ink)',
  accent: 'text-(--inv-accent)',
  muted: 'text-(--inv-muted)',
  soft: 'bg-(--inv-soft)',
  card: 'bg-(--inv-card)',
  field: 'bg-(--inv-field)',
  line: 'border-(--inv-line)',
  hoverSoft: 'hover:bg-(--inv-soft)',
  placeholder: 'placeholder:text-(--inv-muted)',
  /** Decorative strokes and fills for design-family ornaments (B-030); never behind text. */
  accentLine: 'border-(--inv-accent)',
  accentFill: 'bg-(--inv-accent)',
  inkFill: 'bg-(--inv-ink)',
  lineFill: 'bg-(--inv-line)',
} as const;

export type Tone = typeof toneClasses & { style: CSSProperties };

const tokensOf = (id?: string | null): PaletteTokens => palettes[id ?? ''] ?? palettes.ivory;

const cssVariables = (tokens: PaletteTokens): CSSProperties =>
  ({
    colorScheme: tokens.scheme,
    '--inv-bg': tokens.bg,
    '--inv-ink': tokens.ink,
    '--inv-accent': tokens.accent,
    '--inv-muted': tokens.muted,
    '--inv-soft': tokens.soft,
    '--inv-card': tokens.card,
    '--inv-field': tokens.field,
    '--inv-line': tokens.line,
  }) as CSSProperties;

const tones = new Map(Object.entries(palettes).map(([id, tokens]) => [id, { ...toneClasses, style: cssVariables(tokens) }]));

/** Class names plus the CSS variables to set on the page root; unknown IDs fall back to ivory. */
export function palette(id?: string | null): Tone {
  return tones.get(id ?? '') ?? tones.get('ivory')!;
}

/** The raw tokens for consumers that cannot use CSS variables (the link-preview image) and for contrast checks. */
export function paletteHex(id?: string | null): PaletteTokens {
  return tokensOf(id);
}
