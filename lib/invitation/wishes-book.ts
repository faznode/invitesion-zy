/**
 * I-22 (D-060): the wishes book, a PDF keepsake of the wishes guests left. Pure rules, no I/O and no pdf-lib: what goes on
 * the cover, how a wish's text becomes printable with the PDF standard fonts, how lines wrap, and where everything goes on
 * the pages. The loader (`wishes-book-db.ts`) supplies the invitation's VISIBLE wishes (R-04, D-044) with their name,
 * message, time and the host's reply, oldest first; the renderer (`wishes-book-pdf.ts`) draws this plan; the route checks
 * access (the owner alone) and the flag.
 *
 * Inclusion (D-060): a wish is printed when its moderation state is VISIBLE, whatever the guestbook's settings are now. A
 * closed guestbook and a hosts-only one list nothing on the guest page, yet their visible wishes are still the host's, so
 * the copy says "berstatus Tampil" (the wishes page's own label), never "shown on the invitation".
 */
import type { DetailConfig } from './detail-config';
import { normalizeStoredConfig } from './content-read';
import { formatEventDate } from './event-time';
import { invitationDisplayName } from './headline';

/** Technical ceiling, as the gift log's: the oldest 5,000 visible wishes; the cover says when there are more. */
export const WISHES_BOOK_MAX = 5_000;
/**
 * The book's page budget, cover included: no wish starts once it is reached. 5,000 wishes of typical length (≈ 220
 * characters, a third with a reply) take ≈ 1,700 pages, so the budget binds only for unusually long ones (5,000 wishes of
 * 1,000 characters each with 1,000-character replies would take ≈ 6,300 pages). Measured in s36 (E-078): generation cost
 * grows with pages, not with wishes. The cover counts what was printed.
 */
export const WISHES_BOOK_MAX_PAGES = 2_000;

export type BookWish = { name: string; message: string; createdAt: Date; reply: string | null };

// WinAnsi (CP1252) beyond Latin-1: what the standard fonts draw without an embedded font file.
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function winAnsi(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa1 && codePoint <= 0xff && codePoint !== 0xad) || CP1252_EXTRA.has(codePoint);
}

// Invisible or reordering characters: controls (the newline is kept), format characters (zero-width, joiners, bidirectional
// marks, overrides and isolates, the BOM, tags), variation selectors and skin-tone modifiers.
const INVISIBLE = /(?!\n)[\p{Cc}\p{Cf}\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]|\p{Emoji_Modifier}/gu;
const LINE_BREAKS = /\r\n?|[\u0085\u2028\u2029]/g;
const SPACES = /[\t\p{Zs}]/gu;
// Emoji and flags are left out of a keepsake printed with the standard fonts; the cover says so.
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
// A combining mark that NFC could not join to its letter.
const MARK = /\p{M}/u;
// Transliteration marks ("ʿalaikuma", "Qurʾan") and typographic variants the standard fonts lack, as their nearest CP1252
// character; NFKD would leave them as they are.
const FOLD: Readonly<Record<string, string>> = {
  '\u02bb': '\u2018',
  '\u02bd': '\u2018',
  '\u02bf': '\u2018',
  '\u201b': '\u2018',
  '\u02bc': '\u2019',
  '\u02be': '\u2019',
  '\u201f': '\u201c',
  '\u2032': "'",
  '\u2033': '"',
  '\u2010': '-',
  '\u2011': '-',
  '\u2043': '-',
  '\u2212': '-',
  '\u2012': '\u2013',
  '\u2015': '\u2014',
};
const PLACEHOLDER = '\uFFFD';

/** What stands in for letters the standard fonts cannot draw (another script); the cover explains it. */
export const UNPRINTABLE_MARK = '[…]';
/** A message, name or reply that was emoji only. */
export const EMOJI_ONLY = '(emoji)';

export type Printable = { text: string; marked: boolean; emoji: boolean };

/**
 * Text the standard fonts can draw: Indonesian and every Latin-1 / CP1252 character as written, other Latin letters by
 * their base letter ("Bārakallāhu" → "Barakallahu"), emoji left out (`emoji`), and each run of another script (Arabic,
 * CJK, …) marked once with `[…]` (`marked`). Paragraph breaks are kept (at most one blank line), spaces collapsed, lines
 * trimmed. The stored text is never changed; this is only what the book prints.
 */
export function printable(raw: string): Printable {
  const normalized = raw.normalize('NFC').replace(LINE_BREAKS, '\n').replace(SPACES, ' ').replace(INVISIBLE, '');
  let out = '';
  let emoji = false;
  for (const char of normalized) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === '\n' || winAnsi(codePoint)) {
      out += char;
      continue;
    }
    if (FOLD[char]) {
      out += FOLD[char];
      continue;
    }
    if (EMOJI.test(char)) {
      emoji = true;
      continue;
    }
    if ((codePoint >= 0xd800 && codePoint <= 0xdfff) || MARK.test(char)) continue;
    const base = char.normalize('NFKD').replace(/\p{M}/gu, '');
    out += base && [...base].every((part) => winAnsi(part.codePointAt(0) ?? 0)) ? base : PLACEHOLDER;
  }
  const marked = out.includes(PLACEHOLDER);
  const text = out
    .replace(/\uFFFD(?:[ ]*\uFFFD)*/g, UNPRINTABLE_MARK)
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, marked, emoji };
}

type Measure = (text: string) => number;

/**
 * Lines no wider than `maxWidth`, breaking at spaces, and inside a word only when the word alone is wider. `measure` must be
 * additive (a concatenation is as wide as its parts), as the standard fonts are when drawn without kerning, so each word
 * is measured once.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const space = measure(' ');
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    let width = 0;
    for (const word of paragraph.split(' ')) {
      if (!word) continue;
      const wordWidth = measure(word);
      if (line && width + space + wordWidth <= maxWidth) {
        line += ` ${word}`;
        width += space + wordWidth;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      width = 0;
      if (wordWidth <= maxWidth) {
        line = word;
        width = wordWidth;
        continue;
      }
      for (const char of word) {
        const charWidth = measure(char);
        if (!line || width + charWidth <= maxWidth) {
          line += char;
          width += charWidth;
        } else {
          lines.push(line);
          line = char;
          width = charWidth;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

/** One line no wider than `maxWidth`: the text itself, or as much of it as fits followed by an ellipsis. */
export function fitLine(text: string, maxWidth: number, measure: Measure): string {
  if (measure(text) <= maxWidth) return text;
  let out = '';
  let width = measure('…');
  for (const char of text) {
    const charWidth = measure(char);
    if (width + charWidth > maxWidth) break;
    out += char;
    width += charWidth;
  }
  return `${out.trimEnd()}…`;
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** "9 November 2026, 19.05 WIB" (Western Indonesia Time, the zone the wishes page shows). */
export function tanggalWib(at: Date): string {
  const local = new Date(at.getTime() + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${pad(local.getUTCHours())}.${pad(local.getUTCMinutes())} WIB`;
}

/** The cover's title and date: the invitation's display name ("Sari & Budi") and its first event's date, as the guest page names them. */
export function bookCover(eventType: string, storedConfig: unknown): { title: string; dateLine: string | null } {
  const config: DetailConfig = normalizeStoredConfig(storedConfig ?? {}).config;
  return { title: invitationDisplayName(eventType, config), dateLine: formatEventDate(config.events?.[0]?.startAt, config.eventOperations?.timezone) };
}

const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

/** The attachment's name: the invitation's slug when it is plain lowercase ASCII (it always is when minted), else its id. */
export function bookFilename(slug: string, invitationId: number): string {
  return `buku-ucapan-${SAFE_SLUG.test(slug) ? slug : invitationId}.pdf`;
}

export type FontKey = 'serif' | 'serifItalic' | 'sans' | 'sansBold';
export type Ink = 'text' | 'muted' | 'accent';
export type DrawText = { kind: 'text'; text: string; x: number; y: number; size: number; font: FontKey; ink: Ink };
export type DrawRule = { kind: 'rule'; x1: number; y1: number; x2: number; y2: number; thickness: number; ink: Ink };
export type DrawOp = DrawText | DrawRule;
/** `marked`: wishes with a `[…]` (another script); `emoji`: wishes that lost emoji. The title counts in neither. */
export type BookPlan = { pages: DrawOp[][]; included: number; total: number; marked: number; emoji: number };
export type BookInput = { title: string; dateLine: string | null; wishes: readonly BookWish[]; total: number; generatedAt: Date };
export type Metrics = { width: (text: string, font: FontKey, size: number) => number };

/** A5 portrait, in points. */
export const PAGE = { width: 419.53, height: 595.28, margin: 48, top: 72, bottom: 60 } as const;
export const BODY = PAGE.width - 2 * PAGE.margin;
const REPLY_INDENT = 14;
const TYPE = {
  name: { font: 'sansBold', size: 10.5, leading: 14 },
  date: { font: 'sans', size: 8, leading: 13 },
  message: { font: 'serif', size: 11, leading: 15.5 },
  replyLabel: { font: 'sansBold', size: 8, leading: 12 },
  reply: { font: 'serifItalic', size: 10.5, leading: 14.5 },
} as const;
const DATE_GAP = 3;
/** The cover title shrinks before it wraps past three lines; at the smallest size a fourth line is cut with an ellipsis. */
const TITLE_SIZES = [26, 21, 17] as const;
const TITLE_MAX_LINES = 3;
const NOTE = { font: 'sans', size: 7.5, leading: 11 } as const;

type Prepared = { name: string[]; date: string; message: string[]; reply: string[] | null; marked: boolean; emoji: boolean };

function prepare(wish: BookWish, metrics: Metrics): Prepared {
  const name = printable(wish.name);
  const message = printable(wish.message);
  const reply = wish.reply ? printable(wish.reply) : null;
  const lines = (text: string, style: (typeof TYPE)[keyof typeof TYPE], width = BODY) => wrapText(text, width, (part) => metrics.width(part, style.font, style.size));
  const replyText = reply ? reply.text || (reply.emoji ? EMOJI_ONLY : '') : '';
  return {
    name: lines(name.text || (name.emoji ? EMOJI_ONLY : 'Tamu'), TYPE.name),
    date: tanggalWib(wish.createdAt),
    message: lines(message.text || (message.emoji ? EMOJI_ONLY : '(kosong)'), TYPE.message),
    reply: replyText ? lines(replyText, TYPE.reply, BODY - REPLY_INDENT) : null,
    marked: name.marked || message.marked || Boolean(reply?.marked),
    emoji: name.emoji || message.emoji || Boolean(reply?.emoji),
  };
}

/** What the cover's small print says, each sentence true of this book. */
export function coverNotes(input: { included: number; total: number; generatedAt: Date; marked: boolean; emoji: boolean }): string[] {
  const notes = [`Dibuat ${tanggalWib(input.generatedAt)} dari ucapan berstatus Tampil. Ucapan yang menunggu persetujuan atau disembunyikan tidak dimasukkan.`];
  if (input.included < input.total) {
    const rest = input.total - input.included;
    notes.push(`Buku ini memuat ${input.included.toLocaleString('id-ID')} ucapan paling awal; ${rest.toLocaleString('id-ID')} ucapan setelahnya tidak termasuk.`);
  }
  const lost = [
    input.marked ? `huruf dari aksara yang tidak tersedia di buku ini (misalnya aksara Arab) ditandai ${UNPRINTABLE_MARK}` : '',
    input.emoji ? 'emoji tidak ikut tercetak' : '',
  ].filter(Boolean);
  if (lost.length) {
    const sentence = lost.join('; ');
    notes.push(`${sentence[0].toUpperCase()}${sentence.slice(1)}. Teks aslinya tetap utuh di halaman Ucapan & Doa.`);
  }
  return notes;
}

/**
 * The pages: a cover (title, the event's date, how many wishes, when it was made and what was left out), then the wishes
 * oldest first, each with its name, time, message and the host's reply. A wish starts on a new page when its name, time
 * and first two lines would not fit; a long one continues on the next page. Wish pages carry a running title and a page
 * number; nothing is drawn in the margins. No wish starts once the book has `maxPages` pages (a wish already started is
 * finished, at most two pages more); the cover then counts the wishes printed.
 */
export function layoutBook(input: BookInput, metrics: Metrics, maxPages: number = WISHES_BOOK_MAX_PAGES): BookPlan {
  const centered = (text: string, y: number, font: FontKey, size: number, ink: Ink): DrawText => ({
    kind: 'text',
    text,
    x: (PAGE.width - metrics.width(text, font, size)) / 2,
    y,
    size,
    font,
    ink,
  });

  const titleText = printable(input.title.replace(/\s*\n\s*/g, ' '));
  const title = titleText.text || 'Undangan';
  const measureTitle = (size: number) => (part: string) => metrics.width(part, 'serif', size);
  let titleSize: number = TITLE_SIZES[0];
  let titleLines = wrapText(title, BODY, measureTitle(titleSize));
  for (const size of TITLE_SIZES.slice(1)) {
    if (titleLines.length <= TITLE_MAX_LINES) break;
    titleSize = size;
    titleLines = wrapText(title, BODY, measureTitle(size));
  }
  if (titleLines.length > TITLE_MAX_LINES) {
    // The greedy wrap filled the third line, so the rest is wider than a line and `fitLine` ends it with an ellipsis.
    const rest = titleLines.slice(TITLE_MAX_LINES - 1).join(' ');
    titleLines = [...titleLines.slice(0, TITLE_MAX_LINES - 1), fitLine(rest, BODY, measureTitle(titleSize))];
  }

  // The cover is filled in last, once the wishes printed are known; wish pages are numbered from 2.
  const pages: DrawOp[][] = [[]];
  let page: DrawOp[] = [];
  let y = PAGE.height - PAGE.top;
  const header = fitLine(title, BODY, (part) => metrics.width(part, 'sans', 8));
  const newPage = () => {
    page = [
      { kind: 'text', text: header, x: PAGE.margin, y: PAGE.height - 40, size: 8, font: 'sans', ink: 'muted' },
      { kind: 'rule', x1: PAGE.margin, y1: PAGE.height - 47, x2: PAGE.width - PAGE.margin, y2: PAGE.height - 47, thickness: 0.4, ink: 'muted' },
    ];
    page.push(centered(`— ${pages.length + 1} —`, 30, 'sans', 8, 'muted'));
    pages.push(page);
    y = PAGE.height - PAGE.top;
  };
  const room = () => y - PAGE.bottom;
  const line = (text: string, style: (typeof TYPE)[keyof typeof TYPE], x: number, ink: Ink) => {
    if (room() < style.leading) newPage();
    page.push({ kind: 'text', text, x, y: y - style.size, size: style.size, font: style.font, ink });
    y -= style.leading;
  };

  let included = 0;
  let marked = 0;
  let emoji = 0;
  for (const source of input.wishes) {
    if (pages.length >= maxPages) break;
    const wish = prepare(source, metrics);
    if (!included) newPage();
    else {
      y -= 12;
      if (room() > 24) page.push({ kind: 'rule', x1: PAGE.width / 2 - 12, y1: y, x2: PAGE.width / 2 + 12, y2: y, thickness: 0.5, ink: 'muted' });
      y -= 18;
    }
    const opening = wish.name.length * TYPE.name.leading + TYPE.date.leading + DATE_GAP + Math.min(2, wish.message.length) * TYPE.message.leading;
    if (room() < opening) newPage();
    for (const text of wish.name) line(text, TYPE.name, PAGE.margin, 'text');
    line(wish.date, TYPE.date, PAGE.margin, 'muted');
    y -= DATE_GAP;
    for (const text of wish.message) line(text, TYPE.message, PAGE.margin, 'text');
    if (wish.reply) {
      y -= 6;
      if (room() < TYPE.replyLabel.leading + TYPE.reply.leading) newPage();
      let top = y;
      let current = page;
      const bar = () => current.push({ kind: 'rule', x1: PAGE.margin + 4, y1: top, x2: PAGE.margin + 4, y2: y + 3, thickness: 1, ink: 'accent' });
      line('Balasan tuan rumah', TYPE.replyLabel, PAGE.margin + REPLY_INDENT, 'accent');
      for (const text of wish.reply) {
        if (room() < TYPE.reply.leading) {
          bar();
          newPage();
          top = y;
          current = page;
        }
        line(text, TYPE.reply, PAGE.margin + REPLY_INDENT, 'text');
      }
      bar();
    }
    included += 1;
    if (wish.marked) marked += 1;
    if (wish.emoji) emoji += 1;
  }

  const total = Math.max(input.total, included);
  const cover: DrawOp[] = [];
  let coverY = PAGE.height - 200;
  cover.push(centered('BUKU UCAPAN & DOA', coverY, 'sansBold', 9, 'accent'));
  coverY -= 40;
  for (const text of titleLines) {
    cover.push(centered(text, coverY, 'serif', titleSize, 'text'));
    coverY -= Math.round(titleSize * 1.23);
  }
  const date = input.dateLine ? printable(input.dateLine).text : '';
  if (date) {
    cover.push(centered(date, coverY, 'sans', 10.5, 'muted'));
    coverY -= 18;
  }
  coverY -= 10;
  cover.push({ kind: 'rule', x1: PAGE.width / 2 - 24, y1: coverY, x2: PAGE.width / 2 + 24, y2: coverY, thickness: 0.75, ink: 'accent' });
  coverY -= 28;
  const summary = !included
    ? 'Belum ada ucapan berstatus Tampil.'
    : included < total
      ? `${included.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} ucapan`
      : `${included.toLocaleString('id-ID')} ucapan dari tamu`;
  cover.push(centered(summary, coverY, included ? 'sans' : 'serifItalic', included ? 10 : 11, included ? 'text' : 'muted'));
  const notes = coverNotes({ included, total, generatedAt: input.generatedAt, marked: marked > 0 || titleText.marked, emoji: emoji > 0 || titleText.emoji }).flatMap(
    (note) => wrapText(note, BODY, (part) => metrics.width(part, NOTE.font, NOTE.size)),
  );
  notes.forEach((text, index) => cover.push(centered(text, PAGE.bottom + NOTE.leading * (notes.length - 1 - index), NOTE.font, NOTE.size, 'muted')));
  pages[0] = cover;

  return { pages, included, total, marked, emoji };
}
