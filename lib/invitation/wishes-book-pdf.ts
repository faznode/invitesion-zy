import 'server-only';

import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { PAGE, layoutBook, winAnsi, type BookInput, type DrawOp, type FontKey, type Ink, type Metrics } from './wishes-book';

/**
 * I-22 (D-060): draws `layoutBook`'s plan with pdf-lib on the server. Only the four standard fonts (Times and Helvetica,
 * WinAnsi): nothing is embedded or fetched, and `printable` has already reduced every string to what they can encode. The
 * widths come from the same fonts, one character at a time, which is exactly what a `Tj` advances (no kerning is applied),
 * so a measured line is the drawn line. Each page's text is written as one content stream in the operators `drawText`
 * would emit, with pdf-lib's own WinAnsi bytes; drawing through `drawText` cost ≈ 45 µs and several objects per line,
 * which made a long book slow and heavy (s36, E-078). Never imported by a client component: the route alone renders.
 */
const FONTS: Record<FontKey, StandardFonts> = {
  serif: StandardFonts.TimesRoman,
  serifItalic: StandardFonts.TimesRomanItalic,
  sans: StandardFonts.Helvetica,
  sansBold: StandardFonts.HelveticaBold,
};

/** Near-black text, a grey for dates and furniture, and the product's brand-700 (#be0045) for the accents. */
const INKS: Record<Ink, string> = {
  text: '0.13 0.12 0.13',
  muted: '0.4 0.4 0.43',
  accent: '0.745 0 0.271',
};

const num = (value: number) => String(Math.round(value * 100) / 100);

export type RenderedBook = { bytes: Uint8Array; pages: number; included: number; total: number; marked: number; emoji: number };

export async function renderWishesBook(input: BookInput): Promise<RenderedBook> {
  // No default producer, creator or dates from pdf-lib; the metadata is set below and names no person.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const fonts = {} as Record<FontKey, PDFFont>;
  for (const key of Object.keys(FONTS) as FontKey[]) fonts[key] = await doc.embedFont(FONTS[key]);

  const units = new Map<string, number>();
  const metrics: Metrics = {
    width(text, font, size) {
      let total = 0;
      for (const char of text) {
        const key = `${font}:${char}`;
        let width = units.get(key);
        if (width === undefined) {
          width = fonts[font].widthOfTextAtSize(char, 1000);
          units.set(key, width);
        }
        total += width;
      }
      return (total * size) / 1000;
    },
  };

  // Every printable character's WinAnsi byte, as pdf-lib itself encodes it (the four fonts share the encoding).
  const bytes = new Map<number, string>();
  const hex = (text: string) => {
    let out = '';
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      let byte = bytes.get(code);
      if (byte === undefined) {
        if (!winAnsi(code)) throw new Error(`unprintable character U+${code.toString(16)} reached the renderer`);
        byte = fonts.serif.encodeText(text[index]).toString().slice(1, -1);
        bytes.set(code, byte);
      }
      out += byte;
    }
    return out;
  };

  const plan = layoutBook(input, metrics);
  for (const ops of plan.pages) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    const names = new Map<FontKey, string>();
    const fontName = (key: FontKey) => {
      let name = names.get(key);
      if (!name) {
        name = page.node.newFontDictionary(key, fonts[key].ref).toString();
        names.set(key, name);
      }
      return name;
    };
    const lines = ops.map((op: DrawOp) =>
      op.kind === 'rule'
        ? `q ${INKS[op.ink]} RG ${num(op.thickness)} w ${num(op.x1)} ${num(op.y1)} m ${num(op.x2)} ${num(op.y2)} l S Q`
        : op.text
          ? `BT ${fontName(op.font)} ${num(op.size)} Tf ${INKS[op.ink]} rg 1 0 0 1 ${num(op.x)} ${num(op.y)} Tm <${hex(op.text)}> Tj ET`
          : '',
    );
    const stream = doc.context.stream(deflateSync(Buffer.from(lines.filter(Boolean).join('\n'), 'latin1')), { Filter: 'FlateDecode' });
    page.node.addContentStream(doc.context.register(stream));
  }

  doc.setTitle('Buku Ucapan & Doa');
  doc.setLanguage('id-ID');
  doc.setCreator('Invitesion');
  doc.setProducer('Invitesion');
  doc.setCreationDate(input.generatedAt);
  doc.setModificationDate(input.generatedAt);
  // Object streams cost ≈ 15 s on a 6,000-page book for ≈ 15 % fewer bytes; a plain cross-reference table is kept.
  const pdf = await doc.save({ useObjectStreams: false, objectsPerTick: Infinity });
  return { bytes: pdf, pages: plan.pages.length, included: plan.included, total: plan.total, marked: plan.marked, emoji: plan.emoji };
}
