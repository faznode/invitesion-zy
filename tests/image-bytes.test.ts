// B-019 / I-28 harness: the verdict logic of tools/template-harness/image-bytes.ts (the browser run itself is lab work).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateWidths, classifyImageUrl, imageVerdict, SINGLE_IMAGE_BUDGET, summarise, type ImageRun } from '../tools/template-harness/image-bytes';

const ORIGINAL = 'http://127.0.0.1:3100/media/12/0123456789abcdef01234567.jpg';
const variant = (tier: string, width: number) => `http://127.0.0.1:3100/media/variants/12/0123456789abcdef01234567/${tier}-${width}.webp`;
const SRCSET = [320, 480, 640, 960, 1280, 1920].map((w) => `/media/variants/12/0123456789abcdef01234567/standard-${w}.webp ${w}w`).join(', ');

const run = (over: Partial<ImageRun> = {}): ImageRun => ({
  label: 'gapura',
  url: 'http://127.0.0.1:3100/i/review/budi',
  viewport: { width: 360, height: 800, scale: 2 },
  saveData: false,
  status: 200,
  loaded: true,
  requests: [],
  images: [],
  ...over,
});

test('image-bytes: uploads are told apart from their variants and from everything else', () => {
  assert.deepEqual(classifyImageUrl(ORIGINAL), { kind: 'original' });
  assert.deepEqual(classifyImageUrl(variant('lite', 480)), { kind: 'variant', tier: 'lite', width: 480 });
  assert.deepEqual(classifyImageUrl('/media/variants/12/0123456789abcdef01234567/standard-1920.webp'), { kind: 'variant', tier: 'standard', width: 1920 });
  for (const other of ['/media/protected/12/0123456789abcdef01234567.jpg', '/media/avatars/3/0123456789abcdef01234567.png', '/review/cover.png', '/media/variants/12/x/standard-320.webp', 'not a url ::']) {
    assert.deepEqual(classifyImageUrl(other), { kind: 'other' }, other);
  }
  assert.deepEqual(candidateWidths(SRCSET), [320, 480, 640, 960, 1280, 1920]);
  assert.deepEqual(candidateWidths(null), []);
});

test('image-bytes: an unloaded or failed page is INCOMPLETE, never PASS', () => {
  assert.equal(imageVerdict(run({ status: 404 })).verdict, 'INCOMPLETE');
  assert.equal(imageVerdict(run({ loaded: false })).verdict, 'INCOMPLETE');
  assert.equal(imageVerdict(run({ error: 'CDP connection failed' })).verdict, 'INCOMPLETE');
});

test('image-bytes: a page without variants passes (the "before" run) and is only measured', () => {
  const before = run({ requests: [{ url: ORIGINAL, status: 200, transferBytes: 4_900_000, decodedBytes: 4_900_000 }], images: [{ src: ORIGINAL, currentSrc: ORIGINAL, renderedWidth: 302, offered: null }] });
  assert.deepEqual(imageVerdict(before), { verdict: 'PASS', problems: [] });
  assert.equal(summarise(before).originals, 1);
  assert.equal(summarise(before).uploadTransferBytes, 4_900_000);
});

test('image-bytes: the right variant passes; an oversized, missed or blurry one fails', () => {
  const image = { src: '/media/12/0123456789abcdef01234567.jpg', renderedWidth: 302, offered: SRCSET };
  // 302 CSS px at scale 2 needs 604 device px: 640 is the right pick.
  const good = run({ requests: [{ url: variant('standard', 640), status: 200, transferBytes: 54_000, decodedBytes: 54_000 }], images: [{ ...image, currentSrc: variant('standard', 640) }] });
  assert.deepEqual(imageVerdict(good), { verdict: 'PASS', problems: [] });

  const oversized = run({ requests: [{ url: variant('standard', 1920), status: 200, transferBytes: SINGLE_IMAGE_BUDGET + 1, decodedBytes: 0 }] });
  assert.equal(imageVerdict(oversized).verdict, 'FAIL');

  const missed = run({ images: [{ ...image, currentSrc: ORIGINAL }] });
  assert.match(imageVerdict(missed).problems[0], /offered variants but loaded/);

  const blurry = run({ images: [{ ...image, currentSrc: variant('standard', 320) }] });
  assert.match(imageVerdict(blurry).problems[0], /chose 320 px for 604 device px/);

  // The largest offered variant is never blurry, whatever the screen needs.
  const largest = run({ viewport: { width: 412, height: 915, scale: 2.625 }, images: [{ ...image, renderedWidth: 900, currentSrc: variant('standard', 1920) }] });
  assert.equal(imageVerdict(largest).verdict, 'PASS');
});
