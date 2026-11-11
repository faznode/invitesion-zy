// s23r Task 4: the pure parts of tools/template-harness/design-acceptance.ts (T3 gaps, PNG ink, PDF operators).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { decodePng, inkRatio, pdfDrawOps, rhythmSummary, verticalGaps } from '../tools/template-harness/design-acceptance';

test('T3: overlapping content merges, and only the space between merged runs counts as a gap', () => {
  const { gaps, contentTop, contentBottom } = verticalGaps([
    [100, 140],
    [0, 40],
    [30, 60],
    [140, 150],
    [10, 20],
    [500, 520],
    [600, 600],
  ]);
  assert.deepEqual(gaps, [
    { top: 60, height: 40 },
    { top: 150, height: 350 },
  ]);
  assert.equal(contentTop, 0);
  assert.equal(contentBottom, 520);
  assert.deepEqual(verticalGaps([]), { gaps: [], contentTop: 0, contentBottom: 0 });
});

test('T3: a gap of half the viewport fails; small gaps are ignored; outliers are listed, not failed', () => {
  const gaps = [8, 32, 40, 48, 40, 160, 12].map((height, i) => ({ top: i * 1000, height }));
  const calm = rhythmSummary(gaps, 800);
  assert.equal(calm.blockGaps, 5);
  assert.equal(calm.median, 40);
  assert.equal(calm.max, 160);
  assert.deepEqual(calm.outliers, [{ top: 5000, height: 160 }]);
  assert.equal(calm.verdict, 'PASS');
  const hole = rhythmSummary([...gaps, { top: 9000, height: 400 }], 800);
  assert.equal(hole.verdict, 'FAIL');
  assert.deepEqual(hole.screenHigh, [{ top: 9000, height: 400 }]);
  assert.equal(rhythmSummary([{ top: 0, height: 399 }], 800).verdict, 'PASS');
  assert.deepEqual(rhythmSummary([], 800), { blockGaps: 0, median: 0, p90: 0, max: 0, screenHigh: [], outliers: [], verdict: 'PASS' });
});

const chunk = (type: string, body: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
};
const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
/** A colour-type-2 PNG whose row y uses PNG filter y % 5, so every unfilter path is exercised. */
function encodePng(width: number, rows: number[][]) {
  const stride = width * 3;
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const filter = y % 5;
    raw.push(filter);
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? row[x - 3] : 0;
      const b = y > 0 ? rows[y - 1][x] : 0;
      const c = x >= 3 && y > 0 ? rows[y - 1][x - 3] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      raw.push((row[x] - predictor) & 0xff);
    }
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG: every filter type decodes back to the original pixels', () => {
  const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x * 37 + y * 91 + ((x * y) % 7) * 13) & 0xff));
  const png = decodePng(encodePng(4, rows));
  assert.equal(png.width, 4);
  assert.equal(png.height, 5);
  assert.equal(png.channels, 3);
  assert.deepEqual([...png.data], rows.flat());
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/);
});

test('ink: the share of pixels away from the dominant colour; a blank box has none', () => {
  const background = [250, 247, 242];
  const ink = [0, 0, 0];
  const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 4 }, (_, x) => (y === 2 && x < 4 ? ink : background)).flat());
  assert.equal(inkRatio(decodePng(encodePng(4, rows))), 4 / 20);
  const blank = Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => background).flat());
  assert.equal(inkRatio(decodePng(encodePng(4, blank))), 0);
});

test('PDF: clip, rect and fill operators are counted inside Flate streams only', () => {
  const content = deflateSync(Buffer.from('q 0 0 24 24 re W n 0 0 0 rg 0 0 24 24 re f Q\nq 1 0 0 1 5 5 cm 0 0 2 2 re f* Q\n', 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj << /Length 9 >>\nstream\n', 'latin1'),
    content,
    Buffer.from('\nendstream\nendobj\n2 0 obj << >>\nstream\nnot flate W n f\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  assert.deepEqual(pdfDrawOps(pdf), { clips: 1, rects: 3, fills: 2 });
});
