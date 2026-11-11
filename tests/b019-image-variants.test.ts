// B-019 (G-017, QA-016) + I-28: WebP variants of a host's public uploads in the design families' `srcset`, the lite
// ladder under `Save-Data: on`, the original kept as `src` and served exactly as before whenever an image has no variants.
// Fictional people and paths.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily, withoutReadingToggle, withoutSectionMarkers, withoutShareActions } from './support/render-guest-page';
import type { MediaAsset } from '../lib/db/schema';
import type { DetailConfig } from '../lib/invitation/detail-config';
import {
  groupVariants,
  IMAGE_SIZES,
  NO_IMAGE_VARIANTS,
  saveDataRequested,
  variantSourceInvitation,
  variantSourceKey,
  variantSrcSet,
  type VariantRow,
} from '../lib/media/variants';

const vectors = JSON.parse(readFileSync('contracts/vectors/image-variants.json', 'utf8')) as {
  sources: { url: string; key: string; invitationId: number | null }[];
};

const upload = (n: string) => `/media/1/0123456789abcdef012345${n}.jpg`;
const STANDARD = [320, 480, 640, 960, 1280, 1920];
const LITE = [320, 480, 640];
const rowsFor = (url: string): VariantRow[] => {
  const sourceKey = url.slice('/media/'.length);
  const stem = sourceKey.replace(/\.[a-z]+$/, '');
  return [
    ...STANDARD.map((width) => ({ sourceKey, variantKey: `variants/${stem}/standard-${width}.webp`, tier: 'standard', width })),
    ...LITE.map((width) => ({ sourceKey, variantKey: `variants/${stem}/lite-${width}.webp`, tier: 'lite', width })),
  ];
};

const events: DetailConfig['events'] = [{ title: 'Resepsi', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }];
const media: MediaAsset[] = ['6a', '6b', '6c'].map((n, i) => ({
  id: 100 + i, invitationId: 1, type: 'photo', url: upload(n), sortOrder: i, uploadSequence: i + 1, source: 'web', meta: null, createdAt: new Date('2026-10-02T00:00:00Z'),
}));
const wedding: DetailConfig = {
  theme: { cover: { imageUrl: upload('5a') } },
  couple: {
    bride: { fullName: 'Sari Lestari', nickName: 'Sari', parents: 'Bapak Contoh & Ibu Sampel', order: 2, photoUrl: upload('5b') },
    groom: { fullName: 'Budi Hartono', nickName: 'Budi', parents: 'Bapak Rekaan & Ibu Fiktif', order: 1, photoUrl: upload('5c') },
  },
  events,
};
const corporate: DetailConfig = {
  theme: { cover: { imageUrl: upload('5d') } },
  corporateProfile: { organizationName: 'PT Contoh Sejahtera', logoUrl: '/media/1/0123456789abcdef0123455e.png' },
  settings: { title: 'Rapat Kerja Contoh' },
  events,
};
const contents = { wedding: [wedding, 'wedding'], corporate: [corporate, 'corporate'] } as const;
const allUploads = [...['5a', '5b', '5c', '5d', '6a', '6b', '6c'].map(upload), '/media/1/0123456789abcdef0123455e.png'];
const everyVariant = groupVariants(allUploads.flatMap(rowsFor));

/**
 * Captured from the unchanged s29 renderer (`9508a54`, tree `7797c95`) with these fixtures, before B-019 touched a
 * layout (scratch `tools/template-harness/.out/s30/b019-baseline.ts`): without variants every page stays byte-identical.
 * The legacy rows never change (D-041). The family rows were re-captured once, for B-025 (s30, E-068), which puts each
 * gallery photo inside a lightbox link and adds the lightbox. Before: d9a5420c / cfb55a1f / 84634e75 / ed7271dc (Gapura),
 * 59f2ed03 / 6ef038a3 / e6b5f920 / 64a90716 (Kartu), 9e42ceb0 / bf4ed86c / afcc44cf / d247eedc (Riang), 81ddcfd5 / b214decd /
 * 8fa16178 / c1b07450 (Lontar). A cross-tree render against the pre-B-025 copy showed every page without a gallery
 * byte-identical and each family's difference confined to its gallery block; `tests/b025-gallery.test.ts` pins that block.
 */
const BEFORE_B019: Record<string, string> = {
  'legacy/wedding/personal': '43d7e706a21c8488', 'legacy/wedding/link': '36f26b99d3dcd6be',
  'legacy/corporate/personal': 'fac5cdf073716d05', 'legacy/corporate/link': '430084cfc6171922',
  'gapura/wedding/personal': '98ef7845832a1d6f', 'gapura/wedding/link': '34d2e0f5e670c52e',
  'gapura/corporate/personal': '7b9c4230f65ef781', 'gapura/corporate/link': 'e46fc516486ba58c',
  'kartu/wedding/personal': '9c16865a181356e7', 'kartu/wedding/link': 'd496c6ff5f215020',
  'kartu/corporate/personal': 'd0ecb9872617493a', 'kartu/corporate/link': '3bec4f08953071ca',
  'riang/wedding/personal': '9024f8a99602aa0a', 'riang/wedding/link': '8e40f6a69726d3ce',
  'riang/corporate/personal': '14c70d0970e17d69', 'riang/corporate/link': '9c7f9ddd5c321289',
  'lontar/wedding/personal': 'fb004f85fb0db5c6', 'lontar/wedding/link': 'd536240aa9398b73',
  'lontar/corporate/personal': 'dcf77c93b38e3bad', 'lontar/corporate/link': 'cf2f5e3afe89bd54',
};
const sha = (html: string) => createHash('sha256').update(html).digest('hex').slice(0, 16);
const render = (layout: (typeof LAYOUTS)[number], content: keyof typeof contents, audience: 'personal' | 'link', extra: { imageVariants?: typeof everyVariant; saveData?: boolean } = {}) => {
  const [config, eventType] = contents[content];
  return renderGuestPage({ config: withFamily(config, layout.familyId), invitation: fixtureInvitation({ eventType }), guest: audience === 'personal' ? fixtureGuest() : null, media, ...extra });
};

test('B-019: variant sources are exactly the public invitation uploads (shared vector, both languages)', () => {
  assert.ok(vectors.sources.length >= 10);
  for (const source of vectors.sources) {
    assert.equal(variantSourceInvitation(source.url), source.invitationId, source.url);
    assert.equal(variantSourceKey(source.url), source.invitationId === null ? null : source.key, source.url);
  }
  for (const value of [undefined, null, '', '/media/', 'media/1/0123456789abcdef01234567.jpg']) assert.equal(variantSourceKey(value), null);
});

test('B-019: rows become sorted srcsets; anything but the shapes the job writes is ignored', () => {
  const url = upload('5a');
  const shuffled = [...rowsFor(url)].reverse();
  const set = groupVariants(shuffled).get(url);
  assert.deepEqual(set?.standard.map((c) => c.width), STANDARD);
  assert.deepEqual(set?.lite.map((c) => c.width), LITE);
  assert.equal(set?.standard[0].url, '/media/variants/1/0123456789abcdef0123455a/standard-320.webp');

  const good = rowsFor(url)[0];
  const bad: VariantRow[] = [
    { ...good, tier: 'lite' }, // tier disagrees with the key
    { ...good, width: 321 }, // width disagrees with the key
    { ...good, variantKey: 'variants/1/0123456789abcdef0123455b/standard-320.webp' }, // another source's variant
    { ...good, variantKey: 'variants/1/0123456789abcdef0123455a/standard-320.webp 1w, /x.webp' }, // srcset injection
    { ...good, variantKey: 'variants/1/0123456789abcdef0123455a/huge-320.webp', tier: 'huge' },
    { ...good, sourceKey: 'protected/1/0123456789abcdef0123455a.jpg' },
    { ...good, sourceKey: 'avatars/1/0123456789abcdef0123455a.jpg' },
  ];
  assert.equal(groupVariants(bad).size, 0);
});

test('I-28: Save-Data offers only the lite ladder; no row, no srcset', () => {
  const url = upload('5a');
  const standard = variantSrcSet(everyVariant, url, false);
  const lite = variantSrcSet(everyVariant, url, true);
  assert.equal(standard, STANDARD.map((w) => `/media/variants/1/0123456789abcdef0123455a/standard-${w}.webp ${w}w`).join(', '));
  assert.equal(lite, LITE.map((w) => `/media/variants/1/0123456789abcdef0123455a/lite-${w}.webp ${w}w`).join(', '));
  assert.equal(variantSrcSet(everyVariant, upload('ff'), false), undefined, 'an image without variants');
  assert.equal(variantSrcSet(NO_IMAGE_VARIANTS, url, false), undefined);
  assert.equal(variantSrcSet(undefined, url, true), undefined);
  assert.equal(variantSrcSet(everyVariant, undefined, false), undefined);
  for (const [header, expected] of [['on', true], [' ON ', true], ['off', false], ['1', false], [null, false], [undefined, false]] as const) {
    assert.equal(saveDataRequested(header), expected, String(header));
  }
});

test('B-019: without variants every page is byte-identical to the renderer before B-019 (D-041 legacy included)', () => {
  for (const layout of LAYOUTS) {
    for (const content of ['wedding', 'corporate'] as const) {
      for (const audience of ['personal', 'link'] as const) {
        const key = `${layout.label}/${content}/${audience}`;
        // B-030's section markers and G-035's share actions are the only markup added since; the digests pin the page without them.
        const pinned = (html: string) => sha(withoutReadingToggle(withoutShareActions(withoutSectionMarkers(html))));
        assert.equal(pinned(render(layout, content, audience)), BEFORE_B019[key], `${key} (no variants)`);
        assert.equal(pinned(render(layout, content, audience, { imageVariants: NO_IMAGE_VARIANTS, saveData: true })), BEFORE_B019[key], `${key} (Save-Data, no variants)`);
      }
    }
  }
});

test('B-019 / D-041: the legacy layout keeps its originals even when variants exist', () => {
  const legacy = LAYOUTS.find((layout) => !layout.familyId)!;
  for (const content of ['wedding', 'corporate'] as const) {
    for (const audience of ['personal', 'link'] as const) {
      const html = render(legacy, content, audience, { imageVariants: everyVariant });
      assert.equal(sha(html), BEFORE_B019[`legacy/${content}/${audience}`]);
      assert.ok(!html.includes('<picture') && !html.includes('/media/variants/'));
    }
  }
});

test('B-019: every family offers each upload as WebP variants, keeps the original as src and the slot unchanged', () => {
  for (const layout of LAYOUTS.filter((l) => l.familyId)) {
    for (const [content, uploads] of [['wedding', ['5a', '5b', '5c', '6a', '6b', '6c'].map(upload)], ['corporate', ['5d', '6a', '6b', '6c'].map(upload).concat('/media/1/0123456789abcdef0123455e.png')]] as const) {
      const html = render(layout, content, 'personal', { imageVariants: everyVariant });
      const pictures = html.match(/<picture class="contents"><source type="image\/webp" srcSet="[^"]+" sizes="[^"]+"\/><img [^>]+><\/picture>/g) ?? [];
      assert.equal(pictures.length, uploads.length, `${layout.label}/${content}: one <picture> per upload`);
      assert.equal((html.match(/<img /g) ?? []).length, uploads.length, `${layout.label}/${content}: no image added or lost`);
      for (const url of uploads) {
        const picture = pictures.find((p) => p.includes(`src="${url}"`));
        assert.ok(picture, `${layout.label}/${content}: ${url} is still the <img src>`);
        const stem = url.slice('/media/'.length).replace(/\.[a-z]+$/, '');
        assert.ok(picture.includes(`/media/variants/${stem}/standard-320.webp 320w`) && picture.includes(`/media/variants/${stem}/standard-1920.webp 1920w`));
        assert.ok(!picture.includes('/lite-'), 'the lite ladder only under Save-Data');
      }
      // React preloads the first eager <img> of a page: without variants that is the full original cover, at high
      // priority. It never preloads inside a <picture> (the browser chooses the source), so with variants that preload is
      // gone and the preload scanner fetches the chosen WebP instead. Apart from it, only the wrappers differ.
      const plain = render(layout, content, 'personal');
      assert.match(plain, /<link rel="preload" as="image" href="\/media\/1\/[0-9a-f]{24}\.(jpg|png)"\/>/, `${layout.label}/${content}: today the original is preloaded`);
      assert.ok(!/rel="preload" as="image"/.test(html), `${layout.label}/${content}: no original preloaded once variants exist`);
      const unwrapped = html.replace(/<picture class="contents"><source type="image\/webp" srcSet="[^"]+" sizes="[^"]+"\/>(<img [^>]+>)<\/picture>/g, '$1');
      assert.equal(unwrapped, plain.replace(/<link rel="preload" as="image" href="[^"]+"\/>/g, ''), `${layout.label}/${content}: only the wrappers and that preload differ`);
    }
  }
});

test('I-28: under Save-Data the families offer only lite variants (≤ 640 px)', () => {
  for (const layout of LAYOUTS.filter((l) => l.familyId)) {
    const html = render(layout, 'wedding', 'link', { imageVariants: everyVariant, saveData: true });
    const sets = [...html.matchAll(/srcSet="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(sets.length, 6, layout.label);
    for (const set of sets) {
      const widths = [...set.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]));
      assert.deepEqual(widths, LITE, `${layout.label}: ${set}`);
      assert.ok(!set.includes('standard-'));
    }
  }
});

test('B-019: an image without rows renders as before beside one with variants', () => {
  const coverOnly = groupVariants(rowsFor(upload('5a')));
  for (const layout of LAYOUTS.filter((l) => l.familyId)) {
    const html = render(layout, 'wedding', 'personal', { imageVariants: coverOnly });
    assert.equal((html.match(/<picture /g) ?? []).length, 1, layout.label);
    assert.ok(html.includes(`<img src="${upload('6a')}"`), `${layout.label}: the gallery photo stays a plain <img>`);
  }
});

test('B-019: every slot names its rendered width for the browser (sizes)', () => {
  for (const [slot, value] of Object.entries(IMAGE_SIZES)) {
    assert.match(value, /^(\(min-width: \d+px\) (\d+px|calc\([^)]+\)), )*(\d+px|calc\([^)]+\))$/, slot);
  }
  for (const family of ['gapura', 'kartu', 'lontar', 'riang']) {
    const source = readFileSync(`components/invitation/families/${family}.tsx`, 'utf8');
    assert.ok(!/<img\b/.test(source), `${family}: images go through VariantImage`);
    assert.ok(source.includes('srcSet={view.imageSrcSet('), family);
  }
});

test('s43 R9: the <source> of a <picture class="contents"> never takes a grid cell or a flex slot', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const base = css.slice(css.indexOf('@layer base {'), css.indexOf('@layer components {'));
  assert.match(base, /picture > source \{ display: none; \}/, 'the rule sits in the base layer, below every utility');
  const lontar = LAYOUTS.find((layout) => layout.familyId === 'lontar')!;
  const html = render(lontar, 'wedding', 'link', { imageVariants: everyVariant });
  const cover = html.slice(html.indexOf('data-section="cover"'), html.indexOf('</header>'));
  assert.match(cover, /sm:grid-cols-\[1fr_13rem\][^]*?<picture class="contents"><source /, 'Lontar sets its cover photo, a <picture>, in a two-column grid beside the band');
});

test('B-019: generation is flagged and best-effort; a failing read never fails a page', async () => {
  const { enqueueImageVariants, loadImageVariants } = await import('../lib/media/variant-jobs');
  const previous = process.env.FLAG_IMAGE_VARIANTS;
  try {
    process.env.FLAG_IMAGE_VARIANTS = 'off';
    assert.equal(await enqueueImageVariants(upload('5a')), false);
    assert.equal(await loadImageVariants(1), NO_IMAGE_VARIANTS);
    process.env.FLAG_IMAGE_VARIANTS = 'on';
    assert.equal(await enqueueImageVariants('/media/protected/1/0123456789abcdef0123455a.jpg'), false, 'never a protected upload');
    assert.equal(await enqueueImageVariants('https://example.com/x.jpg'), false);
    // The test database URL is unreachable: both calls fail inside and degrade (no job, no variants, the original).
    const errors: unknown[] = [];
    const log = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      assert.equal(await enqueueImageVariants(upload('5a')), false);
      assert.equal(await loadImageVariants(1), NO_IMAGE_VARIANTS);
    } finally {
      console.error = log;
    }
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => !JSON.stringify(e).includes('0123456789abcdef')), 'logs name the error, never the key');
  } finally {
    if (previous === undefined) delete process.env.FLAG_IMAGE_VARIANTS;
    else process.env.FLAG_IMAGE_VARIANTS = previous;
  }
});

test('B-019: the upload route queues variants for public uploads only, after the object is stored', () => {
  const route = readFileSync('app/api/invitations/[id]/upload/route.ts', 'utf8');
  const enqueue = route.indexOf('enqueueImageVariants(url)');
  assert.ok(enqueue > route.indexOf("const url = await saveImage((ext) => keyFor(id, ext), file, MAX_BYTES);"), 'after the save');
  assert.ok(enqueue > route.indexOf("if (purpose === 'gift-qris')"), 'after the QRIS branch returned');
  assert.match(route, /if \(purpose === null\) await enqueueImageVariants\(url\);/);
  assert.equal(route.match(/enqueueImageVariants\(/g)?.length, 1);
  // The job writes the key shape the renderer accepts.
  const rust = readFileSync('services/api/src/media.rs', 'utf8');
  assert.ok(rust.includes('format!("variants/{invitation}/{stem}/{}-{width}.webp", tier.as_str())'));
  assert.ok(rust.includes('&[320, 480, 640, 960, 1280, 1920]') && rust.includes('&[320, 480, 640]'));
});
