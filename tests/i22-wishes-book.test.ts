// I-22 (D-060): the wishes book. The pure rules (`lib/invitation/wishes-book.ts`), the real renderer with pdf-lib's standard
// fonts (`wishes-book-pdf.ts`) read back by an extractor that shares no code with pdf-lib's writer (zlib and the
// windows-1252 decoder), the bounded large books, and source guards for what `scripts/verify-wishes-book.ts` proves end to
// end: the route is the owner's behind FLAG_WISHES_BOOK, the loader reads visible wishes only, and pdf-lib stays out of the
// browser.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import type { DrawOp } from '../lib/invitation/wishes-book';

const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;

type Book = typeof import('../lib/invitation/wishes-book');
const book = () => require('../lib/invitation/wishes-book') as Book;
const renderer = () => require('../lib/invitation/wishes-book-pdf') as typeof import('../lib/invitation/wishes-book-pdf');
const ROOT = process.cwd();
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const codeUnder = (dir: string) =>
  (readdirSync(join(ROOT, dir), { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file)).map((file) => join(dir, file).split('\\').join('/'));
const WISHES = 'app/(customer)/dashboard/invitations/[id]/wishes';

/** The renderer's metrics, rebuilt here from the same standard fonts. */
async function standardMetrics() {
  const doc = await PDFDocument.create();
  const keys = { serif: StandardFonts.TimesRoman, serifItalic: StandardFonts.TimesRomanItalic, sans: StandardFonts.Helvetica, sansBold: StandardFonts.HelveticaBold } as const;
  const fonts = {} as Record<keyof typeof keys, PDFFont>;
  for (const key of Object.keys(keys) as (keyof typeof keys)[]) fonts[key] = await doc.embedFont(keys[key]);
  const metrics = { width: (text: string, font: keyof typeof keys, size: number) => [...text].reduce((sum, char) => sum + fonts[font].widthOfTextAtSize(char, size), 0) };
  return { fonts, metrics };
}

/** Every `Tj` string of a PDF, page by page, decoded as WinAnsi; independent of pdf-lib (zlib and TextDecoder only). */
function extract(pdf: Uint8Array): { font: string; x: number; y: number; text: string }[][] {
  const raw = Buffer.from(pdf).toString('latin1');
  const pages: { font: string; x: number; y: number; text: string }[][] = [];
  const decoder = new TextDecoder('windows-1252');
  for (const match of raw.matchAll(/<<([^]*?)>>\s*stream\r?\n/g)) {
    if (!/\/FlateDecode/.test(match[1])) continue;
    const length = Number(/\/Length (\d+)/.exec(match[1])?.[1]);
    const start = (match.index ?? 0) + match[0].length;
    const content = inflateSync(Buffer.from(raw.slice(start, start + length), 'latin1')).toString('latin1');
    pages.push(
      [...content.matchAll(/BT \/(\S+) [\d.]+ Tf [\d. ]+ rg 1 0 0 1 ([\d.-]+) ([\d.-]+) Tm <([0-9A-Fa-f]*)> Tj ET/g)].map((op) => ({
        font: op[1].replace(/-\d+$/, ''),
        x: Number(op[2]),
        y: Number(op[3]),
        text: decoder.decode(Buffer.from(op[4], 'hex')),
      })),
    );
  }
  return pages;
}

const at = (iso: string) => new Date(iso);
const wish = (name: string, message: string, iso = '2026-11-01T02:00:00Z', reply: string | null = null) => ({ name, message, createdAt: at(iso), reply });

test('printable: Indonesian and Latin-1 as written; other Latin by its base letter; transliteration marks folded', () => {
  const { printable } = book();
  assert.deepEqual(printable('Selamat menempuh hidup baru, semoga sakinah!'), { text: 'Selamat menempuh hidup baru, semoga sakinah!', marked: false, emoji: false });
  assert.equal(printable('Félicitations — café “crème” … € ™ © ® ½ ß Œ').text, 'Félicitations — café “crème” … € ™ © ® ½ ß Œ');
  assert.equal(printable('Bārakallāhu ṣaḥīḥ Nguyễn').text, 'Barakallahu sahih Nguyen');
  assert.equal(printable('wa baraka ʿalaikuma, Qurʾan, Hawaiʻi, minus −5, non‑breaking').text, 'wa baraka ‘alaikuma, Qur’an, Hawai‘i, minus -5, non-breaking');
  assert.equal(printable('ﬁne Ａ１').text, 'fine A1', 'compatibility forms by their plain letters');
});

test('printable: emoji are left out and reported; another script is marked once per run', () => {
  const { printable, UNPRINTABLE_MARK } = book();
  assert.deepEqual(printable('Selamat 🎉🎉 ya 👨‍👩‍👧 🤲🏽 🇮🇩'), { text: 'Selamat ya', marked: false, emoji: true });
  assert.deepEqual(printable('Flag 🏴󠁧󠁢󠁳󠁣󠁴󠁿 and keycap 1️⃣'), { text: 'Flag and keycap 1', marked: false, emoji: true });
  assert.deepEqual(printable('بارك الله لكما وبارك عليكما — semoga berkah'), { text: `${UNPRINTABLE_MARK} — semoga berkah`, marked: true, emoji: false });
  assert.deepEqual(printable('Lin 林 祝你们幸福'), { text: `Lin ${UNPRINTABLE_MARK}`, marked: true, emoji: false });
  assert.deepEqual(printable('🎉🎊'), { text: '', marked: false, emoji: true });
});

test('printable: controls, zero-width and bidirectional characters go; line breaks are kept, blank lines and spaces collapsed', () => {
  const { printable } = book();
  assert.equal(printable('A\u0000B\u0007C\u202eD\u202cE\u2066F\u2069G\u200bH\u200dI\ufeffJ\u061cK\u00adL').text, 'ABCDEFGHIJKL');
  assert.equal(printable('one\r\ntwo\rthree\u2028four\u2029five\u0085six').text, 'one\ntwo\nthree\nfour\nfive\nsix');
  assert.equal(printable('  a\t\tb\u00a0\u3000c  \n\n\n\n\n d  ').text, 'a b c\n\nd');
});

test('every character `printable` keeps is one the four standard fonts encode and draw', async () => {
  const { winAnsi, printable } = book();
  const { fonts } = await standardMetrics();
  const kept: number[] = [];
  for (let code = 0; code <= 0x2122; code += 1) if (winAnsi(code)) kept.push(code);
  assert.equal(kept.length, 95 + 94 + 27, 'ASCII, Latin-1 without the soft hyphen and NBSP, and the 27 CP1252 extras');
  for (const font of Object.values(fonts)) {
    for (const code of kept) assert.ok(font.widthOfTextAtSize(String.fromCharCode(code), 10) > 0, `U+${code.toString(16)} in ${font.name}`);
  }
  const sample = [...Array.from({ length: 0x3100 }, (_, i) => i), 0x1f389, 0x1f1ee, 0x1f468, 0x2f800, 0xe0067, 0x10348];
  for (const code of sample) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    for (const char of printable(`a${String.fromCodePoint(code)}b`).text) assert.ok(char === '\n' || winAnsi(char.codePointAt(0) ?? 0), `U+${code.toString(16)} left ${JSON.stringify(char)}`);
  }
});

test('wrapping: at spaces, inside a word only when it alone is too wide; fitLine ends with an ellipsis', () => {
  const { wrapText, fitLine } = book();
  const measure = (text: string) => text.length;
  assert.deepEqual(wrapText('satu dua tiga empat lima', 9, measure), ['satu dua', 'tiga', 'empat', 'lima']);
  assert.deepEqual(wrapText('abcdefghijklmnop qr', 6, measure), ['abcdef', 'ghijkl', 'mnop', 'qr']);
  assert.deepEqual(wrapText('a\n\nb', 5, measure), ['a', '', 'b']);
  assert.equal(fitLine('pendek', 10, measure), 'pendek');
  assert.equal(fitLine('Sari & Budi selamanya', 10, measure), 'Sari & Bu…');
  assert.ok(fitLine('x'.repeat(50), 10, measure).length <= 10);
});

test('cover, filename and copy: the display name and first event, a safe name, and sentences true of the book', () => {
  const { bookCover, bookFilename, coverNotes } = book();
  const config = {
    couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' }, displayOrder: 'groom-first' },
    events: [{ id: 'e1', title: 'Akad', startAt: '2026-11-21T09:00:00+07:00' }, { id: 'e2', title: 'Resepsi', startAt: '2026-11-22T19:00:00+07:00' }],
  };
  assert.deepEqual(bookCover('wedding', config), { title: 'Budi & Sari', dateLine: 'Sabtu, 21 November 2026' });
  assert.deepEqual(bookCover('birthday', null), { title: 'Undangan', dateLine: null });
  assert.equal(bookFilename('budi-sari', 7), 'buku-ucapan-budi-sari.pdf');
  for (const unsafe of ['Budi"; filename=x', 'a/../b', 'sari\r\nx-evil: 1', '-awal', 'Ünï', '']) assert.equal(bookFilename(unsafe, 7), 'buku-ucapan-7.pdf', unsafe);
  const generatedAt = at('2026-11-09T12:30:00Z');
  assert.deepEqual(coverNotes({ included: 3, total: 3, generatedAt, marked: false, emoji: false }), [
    'Dibuat 9 November 2026, 19.30 WIB dari ucapan berstatus Tampil. Ucapan yang menunggu persetujuan atau disembunyikan tidak dimasukkan.',
  ]);
  const notes = coverNotes({ included: 5000, total: 5120, generatedAt, marked: true, emoji: true });
  assert.equal(notes[1], 'Buku ini memuat 5.000 ucapan paling awal; 120 ucapan setelahnya tidak termasuk.');
  assert.equal(notes[2], 'Huruf dari aksara yang tidak tersedia di buku ini (misalnya aksara Arab) ditandai […]; emoji tidak ikut tercetak. Teks aslinya tetap utuh di halaman Ucapan & Doa.');
  assert.equal(coverNotes({ included: 1, total: 1, generatedAt, marked: false, emoji: true })[1], 'Emoji tidak ikut tercetak. Teks aslinya tetap utuh di halaman Ucapan & Doa.');
});

test('layout with the real fonts: every line inside the margins, body clear of the running header and the folio, order kept', async () => {
  const { layoutBook, PAGE } = book();
  const { metrics } = await standardMetrics();
  const long = Array.from({ length: 40 }, (_, i) => `Kalimat ${i + 1} penuh doa agar sakinah, mawaddah, warahmah.`).join(' ');
  const wishes = [
    wish('Budi Hartono', 'Selamat menempuh hidup baru!', '2026-11-01T02:00:00Z', 'Terima kasih!'),
    wish('W'.repeat(150), `Kata-${'W'.repeat(400)} lalu biasa.`, '2026-11-01T02:00:00Z'),
    wish('Keluarga Besar', long.slice(0, 1000), '2026-11-02T02:00:00Z', long.slice(0, 1000)),
    ...Array.from({ length: 30 }, (_, i) => wish(`Tamu ${i + 1}`, `Ucapan nomor ${i + 1}.\nBaris kedua.`, `2026-11-03T0${i % 10}:00:00Z`)),
  ];
  const plan = layoutBook({ title: 'Sari & Budi', dateLine: 'Sabtu, 21 November 2026', wishes, total: wishes.length, generatedAt: at('2026-11-09T12:30:00Z') }, metrics);
  assert.equal(plan.included, wishes.length);
  const eps = 0.01;
  plan.pages.forEach((ops, index) => {
    for (const op of ops) {
      if (op.kind !== 'text') continue;
      const width = metrics.width(op.text, op.font, op.size);
      assert.ok(op.x >= PAGE.margin - eps && op.x + width <= PAGE.width - PAGE.margin + eps, `page ${index + 1}: "${op.text.slice(0, 30)}" spans ${op.x.toFixed(1)}–${(op.x + width).toFixed(1)}`);
    }
    if (index === 0) return;
    const [header, rule, folio, ...body] = ops;
    assert.ok(header.kind === 'text' && header.y === PAGE.height - 40 && rule.kind === 'rule' && folio.kind === 'text' && folio.text === `— ${index + 1} —` && folio.y === 30, `page ${index + 1} furniture`);
    for (const op of body) {
      const ys = op.kind === 'text' ? [op.y, op.y + op.size] : [op.y1, op.y2];
      for (const y of ys) assert.ok(y >= PAGE.bottom && y <= PAGE.height - PAGE.top, `page ${index + 1}: body at ${y.toFixed(1)}`);
    }
  });
  const names = plan.pages.flat().filter((op) => op.kind === 'text' && op.font === 'sansBold' && op.size === 10.5).map((op) => (op as { text: string }).text);
  assert.deepEqual(names.filter((name) => /^Tamu \d+$/.test(name)), Array.from({ length: 30 }, (_, i) => `Tamu ${i + 1}`), 'oldest first as given');
  const bars = plan.pages.map((ops) => ops.filter((op) => op.kind === 'rule' && op.x1 === PAGE.margin + 4).length);
  assert.ok(bars.filter((n) => n > 0).length >= 2, 'a reply that continues on the next page carries its bar on both');
});

test('layout: an empty book is a readable cover; a capped or budgeted book says how many it holds; long titles shrink, then cut', async () => {
  const { layoutBook } = book();
  const { metrics } = await standardMetrics();
  const generatedAt = at('2026-11-09T12:30:00Z');
  const texts = (ops: DrawOp[]) => ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []));

  const empty = layoutBook({ title: 'Sari & Budi', dateLine: null, wishes: [], total: 0, generatedAt }, metrics);
  assert.equal(empty.pages.length, 1);
  assert.ok(texts(empty.pages[0]).includes('Belum ada ucapan berstatus Tampil.'));

  const three = [wish('A', 'satu'), wish('B', 'dua'), wish('C', 'tiga')];
  const capped = layoutBook({ title: 'Sari & Budi', dateLine: null, wishes: three, total: 10, generatedAt }, metrics);
  assert.ok(texts(capped.pages[0]).includes('3 dari 10 ucapan'));
  assert.ok(texts(capped.pages[0]).some((line) => line.includes('Buku ini memuat 3 ucapan paling awal; 7 ucapan')));

  const many = Array.from({ length: 200 }, (_, i) => wish(`Tamu ${i}`, 'Semoga bahagia selalu dan menjadi keluarga yang sakinah.'));
  const budgeted = layoutBook({ title: 'Sari & Budi', dateLine: null, wishes: many, total: 200, generatedAt }, metrics, 4);
  assert.ok(budgeted.pages.length <= 6 && budgeted.included < 200 && budgeted.included > 0, `${budgeted.pages.length} pages, ${budgeted.included} wishes`);
  assert.ok(texts(budgeted.pages[0]).includes(`${budgeted.included} dari 200 ucapan`));
  const last = budgeted.pages.at(-1) ?? [];
  assert.ok(!(last.at(-1)?.kind === 'rule' && (last.at(-1) as { x2: number; x1: number }).x2 - (last.at(-1) as { x1: number }).x1 === 24), 'no separator after the last wish');

  const name = 'Raden Ajeng Kartika Sari Wulandari Putri Prameswari & Raden Mas Budi Hartono Wicaksono Adiningrat Kusumo';
  const medium = layoutBook({ title: name, dateLine: null, wishes: [], total: 0, generatedAt }, metrics);
  const mediumTitle = medium.pages[0].filter((op) => op.kind === 'text' && op.font === 'serif');
  assert.ok(mediumTitle.length <= 3 && mediumTitle.every((op) => (op as { size: number }).size < 26), 'shrinks to fit three lines');
  const huge = layoutBook({ title: `${name} ${name} ${name}`, dateLine: null, wishes: [wish('A', 'b')], total: 1, generatedAt }, metrics);
  const hugeTitle = huge.pages[0].filter((op) => op.kind === 'text' && op.font === 'serif') as { text: string; size: number }[];
  assert.equal(hugeTitle.length, 3);
  assert.ok(hugeTitle[2].text.endsWith('…') && hugeTitle[2].size === 17);
  const header = huge.pages[1][0] as { text: string };
  assert.ok(header.text.endsWith('…'), 'the running title is cut to the measure');
});

test('the rendered PDF: A5, standard fonts only, plain metadata, and the text in order with nothing invented', async () => {
  const { renderWishesBook } = renderer();
  const wishes = [
    wish('Budi Hartono', 'Selamat menempuh hidup baru!', '2026-11-01T02:00:00Z', 'Terima kasih, Budi!'),
    wish('Ëmilie Ñúñez', 'Félicitations “café” — ʿalaikuma', '2026-11-01T02:00:00Z'),
    wish('محمد', 'بارك الله لكما\nSemoga berkah 🤲', '2026-11-01T03:00:00Z'),
    wish('🎉', '🎉🎊', '2026-11-01T04:00:00Z'),
  ];
  const result = await renderWishesBook({ title: 'Sari & Budi', dateLine: 'Sabtu, 21 November 2026', wishes, total: wishes.length, generatedAt: at('2026-11-09T12:30:00Z') });
  const head = Buffer.from(result.bytes.slice(0, 8)).toString('latin1');
  assert.equal(head, '%PDF-1.7');
  assert.match(Buffer.from(result.bytes.slice(-8)).toString('latin1'), /%%EOF\s*$/);
  assert.deepEqual({ pages: result.pages, included: result.included, marked: result.marked, emoji: result.emoji }, { pages: 2, included: 4, marked: 1, emoji: 2 });

  const doc = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(doc.getPageCount(), 2);
  for (const page of doc.getPages()) assert.deepEqual(page.getSize(), { width: 419.53, height: 595.28 });
  assert.equal(doc.getTitle(), 'Buku Ucapan & Doa');
  assert.equal(doc.getProducer(), 'Invitesion');
  assert.equal(doc.getCreator(), 'Invitesion');
  for (const field of [doc.getAuthor(), doc.getSubject(), doc.getKeywords()]) assert.equal(field, undefined);
  const raw = Buffer.from(result.bytes).toString('latin1');
  assert.doesNotMatch(raw, /FontFile|pdf-lib|Hopding/, 'no embedded font program, no library signature');

  const pages = extract(result.bytes);
  assert.equal(pages.length, 2);
  const cover = pages[0].map((op) => op.text);
  assert.deepEqual(cover.slice(0, 4), ['BUKU UCAPAN & DOA', 'Sari & Budi', 'Sabtu, 21 November 2026', '4 ucapan dari tamu']);
  const body = pages[1].map((op) => op.text);
  assert.deepEqual(body.slice(0, 2), ['Sari & Budi', '— 2 —']);
  const sequence = ['Budi Hartono', '1 November 2026, 09.00 WIB', 'Selamat menempuh hidup baru!', 'Balasan tuan rumah', 'Terima kasih, Budi!', 'Ëmilie Ñúñez', 'Félicitations “café” — ‘alaikuma', '[…]', '[…]', 'Semoga berkah', '(emoji)', '(emoji)'];
  let from = 0;
  for (const text of sequence) {
    const found = body.indexOf(text, from);
    assert.ok(found >= from, `"${text}" after position ${from} in ${JSON.stringify(body)}`);
    from = found + 1;
  }
  assert.equal(pages[1].find((op) => op.text === 'Budi Hartono')?.font, 'sansBold');
  assert.equal(pages[1].find((op) => op.text === 'Terima kasih, Budi!')?.font, 'serifItalic');
});

test('bounded large books: 5,000 typical wishes in full, and the longest possible wishes stop at the page budget', async () => {
  const { renderWishesBook } = renderer();
  const { WISHES_BOOK_MAX, WISHES_BOOK_MAX_PAGES } = book();
  const words = 'semoga menjadi keluarga yang sakinah mawaddah warahmah bahagia selalu aamiin selamat menempuh hidup baru'.split(' ');
  const text = (length: number, seed: number) => {
    let out = '';
    for (let i = seed; out.length < length; i += 1) out += `${out ? ' ' : ''}${words[i % words.length]}`;
    return out.slice(0, length);
  };
  const base = Date.parse('2026-11-01T00:00:00Z');
  const make = (length: number, replyEvery: number, replyLength: number) =>
    Array.from({ length: WISHES_BOOK_MAX }, (_, i) => ({ name: `Tamu ${i + 1}`, message: text(length, i), createdAt: new Date(base + i * 60_000), reply: i % replyEvery === 0 ? text(replyLength, i + 3) : null }));

  let started = performance.now();
  const typical = await renderWishesBook({ title: 'Sari & Budi', dateLine: null, wishes: make(220, 3, 120), total: WISHES_BOOK_MAX, generatedAt: new Date(base) });
  const typicalMs = performance.now() - started;
  assert.equal(typical.included, WISHES_BOOK_MAX);
  assert.ok(typical.pages < WISHES_BOOK_MAX_PAGES, `${typical.pages} pages`);
  assert.ok(typical.bytes.byteLength < 4 * 1024 * 1024 && typicalMs < 20_000, `${typical.bytes.byteLength} bytes in ${Math.round(typicalMs)} ms`);

  started = performance.now();
  const longest = await renderWishesBook({ title: 'Sari & Budi', dateLine: null, wishes: make(1000, 1, 1000), total: WISHES_BOOK_MAX, generatedAt: new Date(base) });
  const longestMs = performance.now() - started;
  assert.ok(longest.pages >= WISHES_BOOK_MAX_PAGES && longest.pages <= WISHES_BOOK_MAX_PAGES + 2, `${longest.pages} pages`);
  assert.ok(longest.included < WISHES_BOOK_MAX && longest.total === WISHES_BOOK_MAX);
  assert.ok(longest.bytes.byteLength < 4 * 1024 * 1024 && longestMs < 20_000, `${longest.bytes.byteLength} bytes in ${Math.round(longestMs)} ms`);
  const cover = extract(longest.bytes)[0].map((op) => op.text);
  assert.ok(cover.includes(`${longest.included.toLocaleString('id-ID')} dari 5.000 ucapan`), cover.join(' | '));
});

test('guards: the route is the owner\u2019s behind FLAG_WISHES_BOOK, refuses administrators first, and answers a private PDF', () => {
  const route = source(`${WISHES}/book/route.ts`);
  assert.match(
    route,
    /if \(!user\) return new Response\('Unauthorized', \{ status: 401 \}\);\s*if \(user\.role === 'ADMIN'\) return new Response\('Forbidden', \{ status: 403 \}\);\s*if \(!isFlagOn\('WISHES_BOOK'\)\) return new Response\('Not found', \{ status: 404 \}\);/,
  );
  assert.match(route, /await accessFor\(user\.id, id, 'manage'\);\s*if \(!access \|\| id === null\) return new Response\('Not found', \{ status: 404 \}\);\s*const \{ wishes, total \} = await loadWishesBook\(id\);/);
  assert.match(route, /'content-type': 'application\/pdf'/);
  assert.match(route, /'content-disposition': `attachment; filename="\$\{bookFilename\(access\.invitation\.slug, id\)\}"`/);
  assert.match(route, /'cache-control': 'private, no-store'/);

  const page = source(`${WISHES}/page.tsx`);
  assert.match(page, /\{owner && isFlagOn\('WISHES_BOOK'\) && <WishesBookCard invitationId=\{id\} visible=\{tally\.VISIBLE\} \/>\}/);
  const { isFlagOn } = require('../lib/flags') as typeof import('../lib/flags');
  assert.equal(isFlagOn('WISHES_BOOK', {}), false);
  assert.equal(isFlagOn('WISHES_BOOK', { FLAG_WISHES_BOOK: 'on' }), true);
  assert.match(source('.env.example'), /^# FLAG_WISHES_BOOK=off$/m);
});

test('guards: the loader reads visible wishes only, oldest first with a tie-break, capped, in one read-only snapshot', () => {
  const loader = source('lib/invitation/wishes-book-db.ts');
  assert.match(loader, /^import 'server-only';/);
  assert.match(loader, /const visible = and\(eq\(guestMessages\.invitationId, invitationId\), eq\(guestMessages\.isHidden, false\)\);/);
  assert.match(loader, /\.select\(\{ name: guestMessages\.name, message: guestMessages\.message, createdAt: guestMessages\.createdAt, reply: guestMessages\.hostReply \}\)/);
  assert.match(loader, /\.orderBy\(asc\(guestMessages\.createdAt\), asc\(guestMessages\.id\)\)\s*\.limit\(Math\.max\(0, Math\.min\(limit, WISHES_BOOK_MAX\)\)\);/);
  assert.match(loader, /\{ isolationLevel: 'repeatable read', accessMode: 'read only' \}/);
  const columns = new Set([...loader.matchAll(/guestMessages\.(\w+)/g)].map((match) => match[1]));
  assert.deepEqual([...columns].sort(), ['createdAt', 'hostReply', 'id', 'invitationId', 'isHidden', 'message', 'name'], 'no other column is touched');
  assert.doesNotMatch(loader, /from '@\/lib\/db\/schema';[^]*\b(guests|users|invitations)\b,/, 'no other table');
});

test('guards: pdf-lib and the renderer stay on the server', () => {
  assert.match(source('lib/invitation/wishes-book-pdf.ts'), /^import 'server-only';/);
  const files = [...codeUnder('app'), ...codeUnder('components'), ...codeUnder('lib')];
  const importers = files.filter((file) => /from 'pdf-lib'|wishes-book-pdf'/.test(source(file)));
  assert.deepEqual(importers.sort(), [`${WISHES}/book/route.ts`, 'lib/invitation/wishes-book-pdf.ts'].sort());
  for (const file of files) if (/^['"]use client['"]/m.test(source(file))) assert.doesNotMatch(source(file), /wishes-book/, `${file} is a client component`);
});
