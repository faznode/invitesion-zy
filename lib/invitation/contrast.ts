/** WCAG 2.x relative luminance and contrast ratio for opaque `#rrggbb` colours. */

const HEX = /^#[0-9a-f]{6}$/i;

export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) throw new Error(`Expected an opaque #rrggbb colour, got ${hex}`);
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA thresholds: 4.5:1 for body text, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold) and UI glyphs. */
export const WCAG_AA = { text: 4.5, large: 3 } as const;

/** `top` at `alpha` over the opaque `bottom`, blended per sRGB channel as browsers composite. */
export function blend(top: string, bottom: string, alpha: number): string {
  relativeLuminance(top);
  relativeLuminance(bottom);
  return `#${[1, 3, 5]
    .map((offset) => {
      const mixed = alpha * Number.parseInt(top.slice(offset, offset + 2), 16) + (1 - alpha) * Number.parseInt(bottom.slice(offset, offset + 2), 16);
      return Math.round(mixed).toString(16).padStart(2, '0');
    })
    .join('')}`;
}

/**
 * The lowest contrast `text` can have over `surface` once any image is laid on it at `imageOpacity`. Each blended
 * channel grows with the image's channel and luminance grows with every channel, so the reachable backgrounds span
 * the all-black to all-white blends; inside that span the text's own luminance can be met (1:1).
 */
export function worstContrastOverImage(text: string, surface: string, imageOpacity: number): number {
  const darkest = blend('#000000', surface, imageOpacity);
  const lightest = blend('#ffffff', surface, imageOpacity);
  const own = relativeLuminance(text);
  if (own >= relativeLuminance(darkest) && own <= relativeLuminance(lightest)) return 1;
  return Math.min(contrastRatio(text, darkest), contrastRatio(text, lightest));
}
