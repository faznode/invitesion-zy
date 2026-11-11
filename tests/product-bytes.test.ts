// s21: the product-family byte census splits a guest page into the shared shell and family-attributable bytes, and the
// budgets separate the current build from the pre-B-015 build it replaced (tools/template-harness/product-bytes.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attributeBytes,
  checkProductBudgets,
  formatHostUploads,
  formatRelative,
  hostUploadRows,
  inlinePayloadBytes,
  isHostUpload,
  otherBasis,
  parseFamilyBasis,
  productVerdict,
  relativeToLeanest,
  type PageCensus,
  type Resource,
} from '../tools/template-harness/product-bytes';
import { FAMILY_BUDGET_BASIS, PRODUCT_PAGE_BUDGETS } from '../tools/template-harness/policy';

const resource = (url: string, type: string, decodedBytes: number, transferBytes = decodedBytes): Resource => ({ url, type, status: 200, decodedBytes, transferBytes });
const page = (label: string, counted: Resource[], payloadBytes = 0): PageCensus => ({ label, url: `http://lab/i/${label}`, status: 200, payloadBytes, counted, excluded: [] });

test('product-bytes: resources every page loads are the shell; the document and anything else belong to the family', () => {
  const chunk = resource('/_next/static/chunks/app.js', 'Script', 400_000, 120_000);
  const css = resource('/_next/static/chunks/app.css', 'Stylesheet', 90_000, 18_000);
  const ornament = resource('/families/riang/bunting.svg', 'Image', 6_000);
  const pages = [
    page('legacy', [resource('/i/a', 'Document', 50_000, 16_000), chunk, css], 30_000),
    page('gapura', [resource('/i/b', 'Document', 54_000, 17_000), css, chunk], 33_000),
    page('riang', [resource('/i/c', 'Document', 60_000, 18_000), chunk, css, ornament], 37_000),
  ];
  const { shell, families } = attributeBytes(pages);
  assert.deepEqual(shell.resources.map((r) => r.url).sort(), [chunk.url, css.url].sort());
  assert.equal(shell.bytes, 490_000);
  assert.equal(shell.transferBytes, 138_000);
  assert.deepEqual(shell.bytesByType, { Script: 400_000, Stylesheet: 90_000 });
  const riang = families.find((family) => family.label === 'riang')!;
  assert.deepEqual(riang.own.map((r) => r.url), [ornament.url]);
  assert.equal(riang.familyBytes, 66_000);
  assert.equal(riang.markupBytes, 23_000);
  assert.equal(riang.totalBytes, 556_000);
  assert.equal(riang.totalTransferBytes, 138_000 + 18_000 + 6_000);
  for (const family of families) assert.equal(family.totalBytes, shell.bytes + family.familyBytes);
});

test('product-bytes: a resource only some families load is each of those families’ own cost, never the shell', () => {
  const font = resource('/fonts/display.woff2', 'Font', 24_000);
  const pages = [page('a', [resource('/i/a', 'Document', 10), font]), page('b', [resource('/i/b', 'Document', 10), font]), page('c', [resource('/i/c', 'Document', 10)])];
  const { shell, families } = attributeBytes(pages);
  assert.equal(shell.resources.length, 0);
  assert.deepEqual(families.map((family) => family.familyBytes), [24_010, 24_010, 10]);
});

test('product-bytes: budgets flag the shell, a family, the page total and the total as served, inclusive of the limit', () => {
  const budgets = { shellKiB: 100, familyKiB: 10, totalKiB: 108, totalTransferKiB: 50 };
  const at = (shellBytes: number, documentBytes: number, transfer: number) =>
    attributeBytes([
      page('x', [resource('/i/x', 'Document', documentBytes, transfer), resource('/s.js', 'Script', shellBytes, 0)]),
      page('y', [resource('/i/y', 'Document', 1, 1), resource('/s.js', 'Script', shellBytes, 0)]),
    ]);
  assert.deepEqual(checkProductBudgets(at(100 * 1024, 8 * 1024, 50 * 1024), budgets), []);
  const problems = checkProductBudgets(at(100 * 1024 + 1, 10 * 1024 + 1, 50 * 1024 + 1), budgets);
  assert.equal(problems.length, 4);
  assert.match(problems[0], /^shell /);
  assert.match(problems[1], /^x: design bytes/);
  assert.match(problems[2], /^x: page total /);
  assert.match(problems[3], /^x: page total as served/);
});

test('product-bytes: the verdict is INCOMPLETE without two loaded 200 pages, FAIL on a budget problem, else PASS', () => {
  const ok = page('a', [resource('/i/a', 'Document', 1)]);
  assert.equal(productVerdict([ok], []).verdict, 'INCOMPLETE');
  assert.equal(productVerdict([ok, { ...ok, label: 'b', status: 404 }], []).verdict, 'INCOMPLETE');
  assert.equal(productVerdict([ok, { ...ok, label: 'b', error: 'no load event within 20 s' }], []).verdict, 'INCOMPLETE');
  assert.equal(productVerdict([ok, { ...ok, label: 'b', counted: [] }], []).verdict, 'INCOMPLETE');
  assert.equal(productVerdict([ok, { ...ok, label: 'b' }], ['shell 700 KiB > 640 KiB']).verdict, 'FAIL');
  assert.equal(productVerdict([ok, { ...ok, label: 'b' }], []).verdict, 'PASS');
});

test('product-bytes: the inline RSC payload counts only Next.js flight scripts, in UTF-8 bytes', () => {
  const html = '<script src="/a.js"></script><script>self.__next_f.push([1,"é"])</script><p>x</p><script>self.__next_f.push([2])</script><script>other()</script>';
  assert.equal(inlinePayloadBytes(html), Buffer.byteLength('self.__next_f.push([1,"é"])') + Buffer.byteLength('self.__next_f.push([2])'));
});

// The s21 census of the five `review-<layout>-full` pages (decoded / served bytes; shell split by type), on the build
// the budgets are anchored on and on the pre-B-015 build of the same data.
const MEASURED = {
  current: { shell: { Font: [55_160, 56_810], Stylesheet: [93_277, 17_780], Script: [475_142, 147_604] }, documents: { legacy: [50_207, 16_781], gapura: [55_180, 17_675], kartu: [57_760, 17_825], riang: [62_114, 18_463], lontar: [56_087, 18_042] } },
  preB015: { shell: { Font: [55_160, 56_810], Stylesheet: [93_277, 17_780], Script: [656_558, 201_170] }, documents: { legacy: [125_440, 31_718], gapura: [130_413, 32_601], kartu: [132_993, 32_745], riang: [137_347, 33_390], lontar: [131_320, 32_967] } },
};
const measuredPages = (build: (typeof MEASURED)['current']) =>
  Object.entries(build.documents).map(([label, [decoded, transfer]]) =>
    page(label, [resource(`/i/${label}`, 'Document', decoded, transfer), ...Object.entries(build.shell).map(([type, [d, t]]) => resource(`/shell.${type}`, type, d, t))]),
  );

test('product-bytes: the anchored budgets pass the s21 build and fail the pre-B-015 build on shell, family and total', () => {
  assert.deepEqual(checkProductBudgets(attributeBytes(measuredPages(MEASURED.current)), PRODUCT_PAGE_BUDGETS), []);
  const problems = checkProductBudgets(attributeBytes(measuredPages(MEASURED.preB015)), PRODUCT_PAGE_BUDGETS);
  assert.ok(problems.some((problem) => problem.startsWith('shell ')), problems.join('; '));
  for (const label of Object.keys(MEASURED.preB015.documents)) {
    assert.ok(problems.some((problem) => problem.startsWith(`${label}: design bytes`)), `${label} family`);
    assert.ok(problems.some((problem) => problem.startsWith(`${label}: page total `)), `${label} total`);
  }
});

test('product-bytes (s25, Q-O11): without host uploads both bases give the same verdict, so the s21 anchoring stands', () => {
  const sameBudget = (problem: string) => problem.replace(': design bytes ', ': family bytes ');
  for (const build of [MEASURED.current, MEASURED.preB015]) {
    const attribution = attributeBytes(measuredPages(build));
    assert.ok(attribution.families.every((family) => family.hostMedia.length === 0 && family.designBytes === family.familyBytes));
    const design = checkProductBudgets(attribution, PRODUCT_PAGE_BUDGETS, 'design');
    assert.deepEqual(design.map(sameBudget), checkProductBudgets(attribution, PRODUCT_PAGE_BUDGETS, 'family'));
  }
});

test('product-bytes (s23r): the relative figure compares each family with the leanest layout and never decides the verdict', () => {
  const chunk = resource('/_next/static/chunks/app.js', 'Script', 400_000, 120_000);
  const pages = [
    page('legacy', [resource('/i/a', 'Document', 40_000, 12_000), chunk]),
    page('riang', [resource('/i/c', 'Document', 50_000, 15_000), chunk]),
    page('kartu', [resource('/i/b', 'Document', 44_000, 13_000), chunk]),
  ];
  const attribution = attributeBytes(pages);
  const relative = relativeToLeanest(attribution);
  assert.equal(relative.leanest, 'legacy');
  assert.deepEqual(
    relative.rows.map((row) => [row.label, row.aboveLeanestBytes, row.aboveLeanestPercent]),
    [['legacy', 0, 0], ['riang', 10_000, 25], ['kartu', 4_000, 10]],
  );
  assert.match(formatRelative(relative), /not a budget\): leanest legacy; riang \+9\.8 KiB \(\+25 %\), kartu \+3\.9 KiB \(\+10 %\)$/);
  assert.deepEqual(relativeToLeanest({ shell: attribution.shell, families: [] }), { rows: [] });
  // A family far above the leanest still passes when it is inside the absolute budgets: only budgets decide.
  assert.equal(productVerdict(pages, checkProductBudgets(attribution)).verdict, 'PASS');
});

test('product-bytes (s24 → s25, Q-O11): an upload stays in the family figure and the totals; only the family budget basis changed', () => {
  const chunk = resource('/_next/static/chunks/app.js', 'Script', 600_000, 200_000);
  const logoA = resource('http://lab/media/41/0123456789abcdef01234567.png', 'Image', 15_000);
  const logoB = resource('http://lab/media/42/89abcdef0123456789abcdef.png', 'Image', 15_000);
  const ornament = resource('/families/riang/bunting.svg', 'Image', 2_000);
  const pages = [
    page('legacy', [resource('/i/a', 'Document', 66_000), chunk, logoA]),
    page('riang', [resource('/i/b', 'Document', 70_000), chunk, logoB, ornament]),
  ];
  const attribution = attributeBytes(pages);
  const riang = attribution.families.find((family) => family.label === 'riang')!;
  assert.deepEqual(riang.hostMedia.map((r) => r.url), [logoB.url]);
  assert.equal(riang.hostMediaBytes, 15_000);
  assert.equal(riang.familyBytes, 87_000, 'the family figure still contains the upload');
  assert.equal(riang.designBytes, 72_000, 'the ornament is design; only the upload is taken out');
  assert.equal(riang.totalBytes, 687_000, 'page totals keep the upload');
  assert.deepEqual(checkProductBudgets(attribution), [], 's25 basis: both layouts are within the family budget on design bytes');
  assert.deepEqual(checkProductBudgets(attribution, PRODUCT_PAGE_BUDGETS, 'family'), ['riang: family bytes 85 KiB > 80 KiB'], 's21–s24 basis still reproducible');
  assert.equal(isHostUpload('http://lab/media/protected/7/0123456789abcdef01234567.jpg'), true);
  assert.equal(isHostUpload('/media/avatars/7/0123456789abcdef01234567.webp'), true);
  assert.equal(isHostUpload('http://lab/media/review/cover.png'), false, 'not an upload path');
  assert.equal(isHostUpload('http://lab/media/007/0123456789abcdef01234567.png'), false, 'no leading zeros, as the product rule');
  assert.equal(isHostUpload('http://lab/media/variants/7/0123456789abcdef01234567/standard-640.webp'), true, 's43: a variant of an upload is an upload');
  assert.equal(isHostUpload('/media/variants/7/0123456789abcdef01234567/lite-320.webp'), true);
  assert.equal(isHostUpload('/media/variants/7/0123456789abcdef01234567/hero-640.webp'), false, 'only the tiers the job writes');
  assert.equal(isHostUpload('/media/variants/7/0123456789abcdef01234567/standard-640.png'), false, 'variants are WebP only');
  assert.equal(isHostUpload('/media/variants/07/0123456789abcdef01234567/standard-640.webp'), false, 'no leading zeros, as VARIANT_KEY');
  assert.equal(isHostUpload('/media/variants/review/standard-640.webp'), false, 'not a variant key');
});

test('s43: a family that serves the host photos as variants keeps them out of its design bytes', () => {
  const chunk = resource('/_next/static/chunks/app.js', 'Script', 600_000);
  const original = resource('http://lab/media/9/0123456789abcdef01234567.jpg', 'Image', 220_000);
  const variant = resource('http://lab/media/variants/10/89abcdef0123456789abcdef/standard-640.webp', 'Image', 21_000);
  const attribution = attributeBytes([
    page('legacy', [resource('/i/a', 'Document', 45_000), chunk, original]),
    page('gapura', [resource('/i/b', 'Document', 63_000), chunk, variant]),
  ]);
  const gapura = attribution.families.find((family) => family.label === 'gapura')!;
  assert.deepEqual(gapura.hostMedia.map((r) => r.url), [variant.url]);
  assert.equal(gapura.designBytes, 63_000, 'the document alone is design');
  assert.equal(gapura.totalBytes, 684_000, 'the page total still carries the variant');
});

// s24's census of the B-029 `corporate` stress page (E-052; build `xZBBe0c6HlX_kBcDDxsiM`; stored JSON sha256
// ecc894b7…): decoded / served bytes of the shell by type, each layout's document, and the one host upload each page
// fetched (the same 18,062-byte logo under each invitation's own URL).
const S24_CORPORATE = {
  shell: { Font: [55_160, 56_810], Stylesheet: [97_423, 18_651], Script: [475_142, 147_604] },
  documents: { legacy: [65_530, 16_157], gapura: [68_733, 17_279], kartu: [69_624, 17_475], riang: [73_951, 17_828], lontar: [69_067, 16_678] },
  upload: [18_062, 18_683],
  storedReasons: ['legacy: family bytes 81.6 KiB > 80 KiB', 'gapura: family bytes 84.8 KiB > 80 KiB', 'kartu: family bytes 85.6 KiB > 80 KiB', 'riang: family bytes 89.9 KiB > 80 KiB', 'lontar: family bytes 85.1 KiB > 80 KiB'],
};
const s24CorporatePages = (extra: Record<string, Resource[]> = {}, upload: Partial<Record<string, [number, number]>> = {}) =>
  Object.entries(S24_CORPORATE.documents).map(([label, [decoded, transfer]], index) => {
    const [uploadDecoded, uploadTransfer] = upload[label] ?? S24_CORPORATE.upload;
    return page(label, [
      resource(`/i/review-${label}-corporate/budi-hartono`, 'Document', decoded, transfer),
      ...Object.entries(S24_CORPORATE.shell).map(([type, [d, t]]) => resource(`/_next/static/shell.${type}`, type, d, t)),
      resource(`http://lab/media/${5 + index}/0123456789abcdef01234567.png`, 'Image', uploadDecoded, uploadTransfer),
      ...(extra[label] ?? []),
    ]);
  });

test('product-bytes (s25, Q-O11): s24’s measured corporate page passes on design bytes and keeps its s24 verdict on the old basis', () => {
  const pages = s24CorporatePages();
  const attribution = attributeBytes(pages);
  assert.equal(attribution.shell.bytes, 627_725);
  assert.equal(attribution.shell.transferBytes, 223_065);
  const riang = attribution.families.find((family) => family.label === 'riang')!;
  assert.equal(riang.designBytes, 73_951);
  assert.equal(riang.totalBytes, 719_738, 'the stored page total, upload included');
  assert.equal(riang.totalTransferBytes, 259_576, 'the stored total as served, upload included');
  assert.deepEqual(checkProductBudgets(attribution), []);
  assert.equal(productVerdict(pages, checkProductBudgets(attribution)).verdict, 'PASS');
  const historical = checkProductBudgets(attribution, PRODUCT_PAGE_BUDGETS, 'family');
  assert.deepEqual(historical, S24_CORPORATE.storedReasons, 'the s21–s24 basis reproduces the stored s24 reasons exactly');
  assert.equal(productVerdict(pages, historical).verdict, 'FAIL');
});

test('product-bytes (s25, Q-O11): a large upload still fails both page totals, and nothing but an upload path leaves the design figure', () => {
  const heavy = attributeBytes(s24CorporatePages({}, { riang: [102_400, 102_900] }));
  assert.deepEqual(checkProductBudgets(heavy), ['riang: page total 785.2 KiB > 720 KiB', 'riang: page total as served 335.7 KiB > 320 KiB']);
  const disguised = attributeBytes(
    s24CorporatePages({
      lontar: [resource('/families/lontar/frame.webp', 'Image', 16_000)],
      kartu: [resource('http://lab/media/9/cover-photo.png', 'Image', 13_000)],
    }),
  );
  assert.deepEqual(checkProductBudgets(disguised), ['kartu: design bytes 80.7 KiB > 80 KiB', 'lontar: design bytes 83.1 KiB > 80 KiB']);
  const lontar = disguised.families.find((family) => family.label === 'lontar')!;
  assert.equal(lontar.hostMediaBytes, 18_062, 'only the upload-shaped path counts as the host’s');
});

test('product-bytes (s25, Q-O11): host uploads are reported per layout, and layouts that fetch different uploads are flagged', () => {
  assert.equal(formatHostUploads(attributeBytes(measuredPages(MEASURED.current))), undefined, 'nothing to report without uploads');
  const same = attributeBytes(s24CorporatePages());
  assert.deepEqual(hostUploadRows(same)[3], { label: 'riang', count: 1, decodedBytes: 18_062, transferBytes: 18_683 });
  const line = formatHostUploads(same)!;
  assert.match(line, /^host uploads, in the page totals and not in the family budget: legacy 1 \(17\.6 KiB decoded, 18\.2 served\), gapura 1/);
  assert.doesNotMatch(line, /different uploads/);
  const eagerGallery = attributeBytes(s24CorporatePages({ gapura: [resource('http://lab/media/6/89abcdef0123456789abcdef.jpg', 'Image', 40_000)] }));
  assert.match(formatHostUploads(eagerGallery)!, /gapura 2 \(56\.7 KiB decoded, 57\.3 served\).*the layouts fetch different uploads for the same content/);
  assert.deepEqual(checkProductBudgets(eagerGallery), ['gapura: page total 736.8 KiB > 720 KiB'], 'the extra upload is outside the family budget but inside the page total');
});

test('product-bytes (s25, Q-O11): the basis is a reversible policy setting with a one-run override', () => {
  assert.equal(FAMILY_BUDGET_BASIS, 'design', 'Q-O11 as resolved in s25; changing it reverses the decision and must update the records');
  assert.equal(parseFamilyBasis(undefined), 'design');
  assert.equal(parseFamilyBasis('family'), 'family');
  assert.equal(otherBasis('design'), 'family');
  assert.equal(otherBasis('family'), 'design');
  assert.throws(() => parseFamilyBasis('Design'), /design or family/);
  assert.throws(() => parseFamilyBasis(''), /design or family/);
});
