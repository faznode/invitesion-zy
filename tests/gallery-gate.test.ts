// B-025's browser gate (`tools/template-harness/gallery-gate.ts`): its pure parts. How photo boxes are classified, when a
// page passes, and the generated fixture photos (valid PNGs, no photograph involved).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { arrangement, expectedLayout, FIXTURE_PHOTOS, galleryVerdict, gradientPng, type Box } from '../tools/template-harness/gallery-gate';

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

test('gallery-gate: a page passes only when it ran checks and every one passed', () => {
  assert.equal(galleryVerdict([]), 'FAIL', 'no checks is never a pass');
  assert.equal(galleryVerdict([{ name: 'a', pass: true }, { name: 'b', pass: true }]), 'PASS');
  assert.equal(galleryVerdict([{ name: 'a', pass: true }, { name: 'b', pass: false }]), 'FAIL');
});

test('gallery-gate: the slug names the layout it must show', () => {
  assert.equal(expectedLayout('review-gapura-gallery-grid'), 'grid');
  assert.equal(expectedLayout('review-kartu-gallery-masonry'), 'masonry');
  assert.equal(expectedLayout('review-lontar-gallery-carousel'), 'carousel');
  assert.equal(expectedLayout('review-riang-gallery'), null);
  assert.equal(expectedLayout('review-gapura-full'), null);
});

test('gallery-gate: grids, masonry and carousels are told apart from where the boxes stand', () => {
  // Two columns of squares (Riang, Lontar at 360 px): rows of two, the last alone.
  const grid = [box(20, 1000, 154, 154), box(186, 1000, 154, 154), box(20, 1166, 154, 154), box(186, 1166, 154, 154), box(20, 1332, 154, 154)];
  assert.equal(arrangement(grid), 'grid');
  // Kartu: the first photo spans both columns.
  const kartu = [box(20, 1000, 320, 240), box(20, 1252, 154, 154), box(186, 1252, 154, 154), box(20, 1418, 154, 154), box(186, 1418, 154, 154)];
  assert.equal(arrangement(kartu), 'grid');
  // CSS columns: the second photo under the first, differing heights, two columns.
  const masonry = [box(20, 1000, 154, 205), box(20, 1217, 154, 154), box(186, 1000, 154, 192), box(186, 1204, 154, 116), box(186, 1332, 154, 231)];
  assert.equal(arrangement(masonry), 'masonry');
  // One row in a scroller wider than its box.
  const row = [box(20, 1000, 256, 320), box(288, 1000, 256, 320), box(556, 1000, 256, 320), box(824, 1000, 256, 320)];
  assert.equal(arrangement(row, { clientWidth: 320, scrollWidth: 1080 }), 'carousel');
  assert.equal(arrangement(row, { clientWidth: 1080, scrollWidth: 1080 }), 'unknown', 'a row that cannot scroll is no carousel');
  assert.equal(arrangement(row), 'unknown');
  // A single column of equal photos is none of the three; neither are uneven rows or fewer than three photos.
  assert.equal(arrangement([box(20, 1000, 320, 320), box(20, 1332, 320, 320), box(20, 1664, 320, 320)]), 'unknown');
  assert.equal(arrangement([box(20, 1000, 154, 154), box(186, 1000, 154, 200), box(20, 1166, 154, 154)]), 'unknown');
  assert.equal(arrangement(grid.slice(0, 2)), 'unknown');
});

test('gallery-gate: the fixture photos are valid generated PNGs of the stated size', () => {
  assert.equal(FIXTURE_PHOTOS.length, 5);
  assert.ok(FIXTURE_PHOTOS.some((p) => p.width > p.height) && FIXTURE_PHOTOS.some((p) => p.height > p.width), 'landscape and portrait');
  const png = gradientPng(40, 30, 200);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 40);
  assert.equal(png.readUInt32BE(20), 30);
  assert.deepEqual([...png.subarray(24, 29)], [8, 2, 0, 0, 0], '8-bit RGB, no interlace');
  const idatAt = png.indexOf('IDAT');
  const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + png.readUInt32BE(idatAt - 4)));
  assert.equal(raw.length, (40 * 3 + 1) * 30, 'one filter byte and three bytes per pixel per row');
  assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
});
