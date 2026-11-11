// B-025 (G-028): the design families' gallery. The host's layout (grid, masonry, carousel) is honoured, every photo is a
// link to its original that the lightbox island opens once hydrated, and a video is a facade that asks the provider for
// nothing before a tap. The legacy layout is unchanged (D-041). Browser acceptance: `tools/template-harness/gallery-gate.ts`.
// Fictional people, paths and video ids.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// First: the harness installs the `server-only` and POSTGRES_URL stand-ins the renderer needs at import time.
import { fixtureGuest, fixtureInvitation, LAYOUTS, renderGuestPage, withFamily } from './support/render-guest-page';
import type { MediaAsset } from '../lib/db/schema';
import type { DetailConfig } from '../lib/invitation/detail-config';
import { RENDER_CAPABILITIES } from '../lib/invitation/content-contract';
import { GALLERY_LAYOUTS, galleryLayout, galleryVideo, MASONRY_ASPECTS, MASONRY_PORTRAIT_ASPECTS, photoLabel, vimeoVideoId, youtubeVideoId } from '../lib/invitation/gallery';
import { groupVariants, IMAGE_SIZES, type VariantRow } from '../lib/media/variants';
import { contentSecurityPolicy } from '../lib/security/csp';

const read = (path: string) => readFileSync(path, 'utf8');
const upload = (n: string) => `/media/1/0123456789abcdef012345${n}.jpg`;
const asset = (id: number, type: 'photo' | 'video', url: string, order: number): MediaAsset => ({
  id, invitationId: 1, type, url, sortOrder: order, uploadSequence: order + 1, source: 'web', meta: null, createdAt: new Date('2026-10-02T00:00:00Z'),
});
const PHOTO_URLS = ['6a', '6b', '6c', '6d', '6e'].map(upload);
const photos = PHOTO_URLS.map((url, i) => asset(100 + i, 'photo', url, i));
/** Eleven characters a YouTube id may hold; no real video. */
const YT = 'Contoh_0001';
const VIMEO = '123456789';
const videos = [
  asset(200, 'video', ` https://youtu.be/${YT}?si=contoh `, 5),
  asset(201, 'video', `https://vimeo.com/${VIMEO}`, 6),
  asset(202, 'video', 'https://video.contoh.example/acara/1', 7),
  asset(203, 'video', 'javascript:alert(1)', 8),
];
const base: DetailConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt: '2026-01-05T19:00:00+08:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
};
const FAMILIES = LAYOUTS.filter((layout) => layout.familyId);
const LEGACY = LAYOUTS.find((layout) => !layout.familyId)!;
type Layout = (typeof LAYOUTS)[number];
const render = (layout: Layout, gallery?: DetailConfig['gallery'], media: MediaAsset[] = photos, extra: { imageVariants?: ReturnType<typeof groupVariants> } = {}) =>
  renderGuestPage({ config: withFamily({ ...base, ...(gallery && { gallery }) }, layout.familyId), invitation: fixtureInvitation(), guest: fixtureGuest(), media, ...extra });

const TRIGGER = /<a href="([^"]+)" data-lightbox-index="(\d+)" aria-label="([^"]+)" class="([^"]+)">(<picture[^]*?<\/picture>|<img [^>]+\/>)<\/a>/g;
const triggers = (html: string) => [...html.matchAll(TRIGGER)].map(([, href, index, label, box, image]) => ({ href, index: Number(index), label, box, image }));
const dialogOf = (html: string) => {
  const start = html.indexOf('<dialog');
  return start < 0 ? '' : html.slice(start, html.indexOf('</dialog>', start) + '</dialog>'.length);
};
const STANDARD = [320, 480, 640, 960, 1280, 1920];
const rowsFor = (url: string): VariantRow[] => {
  const sourceKey = url.slice('/media/'.length);
  return STANDARD.map((width) => ({ sourceKey, variantKey: `variants/${sourceKey.replace(/\.[a-z]+$/, '')}/standard-${width}.webp`, tier: 'standard', width }));
};
const variants = groupVariants(PHOTO_URLS.flatMap(rowsFor));
const FRAMES: Record<string, { masonry: string; carousel: string }> = {
  gapura: { masonry: IMAGE_SIZES.gapuraGallery, carousel: IMAGE_SIZES.gapuraCarousel },
  kartu: { masonry: IMAGE_SIZES.kartuGallery, carousel: IMAGE_SIZES.kartuCarousel },
  riang: { masonry: IMAGE_SIZES.wideGallery, carousel: IMAGE_SIZES.wideCarousel },
  lontar: { masonry: IMAGE_SIZES.wideGallery, carousel: IMAGE_SIZES.wideCarousel },
};

test('B-025: a stored layout is one of three; anything else means the family’s own grid', () => {
  assert.deepEqual([...GALLERY_LAYOUTS], ['grid', 'masonry', 'carousel']);
  for (const value of GALLERY_LAYOUTS) assert.equal(galleryLayout(value), value);
  for (const value of [undefined, null, '', 'Grid', 'MASONRY', 'slider', 3, {}]) assert.equal(galleryLayout(value), 'grid', String(value));
});

test('B-025: YouTube and Vimeo links are recognised by host and id shape only', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${YT}`, `https://youtube.com/watch?v=${YT}&t=42s`, `https://m.youtube.com/watch?v=${YT}`,
    `https://music.youtube.com/watch?v=${YT}`, `https://youtu.be/${YT}?si=x`, `https://www.youtube.com/shorts/${YT}`,
    `https://www.youtube.com/embed/${YT}`, `https://www.youtube.com/live/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`,
    `  https://youtu.be/${YT}  `, `http://youtu.be/${YT}`,
  ]) assert.equal(youtubeVideoId(url), YT, url);
  for (const url of [
    'https://www.youtube.com/watch?v=short', `https://www.youtube.com/watch?v=${YT}x`, `https://youtube.com.contoh.example/watch?v=${YT}`,
    `https://contoh.example/watch?v=${YT}`, `https://youtube.com@contoh.example/watch?v=${YT}`, 'javascript:alert(1)', `ftp://youtu.be/${YT}`,
    `/watch?v=${YT}`, 'https://www.youtube.com/watch?v=<script>alert', 'https://youtu.be/', `https://www.youtube.com/channel/${YT}`, '',
  ]) assert.equal(youtubeVideoId(url), null, url);
  for (const url of [`https://vimeo.com/${VIMEO}`, `https://www.vimeo.com/${VIMEO}`, `https://player.vimeo.com/video/${VIMEO}?h=abc`]) {
    assert.equal(vimeoVideoId(url), VIMEO, url);
  }
  for (const url of [
    `https://vimeo.com/channels/staffpicks/${VIMEO}`, 'https://vimeo.com/abc', 'https://vimeo.com/1234567890123', `https://vimeo.com.contoh.example/${VIMEO}`,
    `https://player.vimeo.com/${VIMEO}`, `javascript://vimeo.com/${VIMEO}`,
  ]) assert.equal(vimeoVideoId(url), null, url);
});

test('B-025: a video becomes a privacy-enhanced player, a plain link for other http(s) pages, or nothing', () => {
  assert.deepEqual(galleryVideo({ id: 1, url: `https://youtu.be/${YT}` }), {
    id: 1, kind: 'embed', provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${YT}?autoplay=1&rel=0`, watchUrl: `https://www.youtube.com/watch?v=${YT}`,
  });
  assert.deepEqual(galleryVideo({ id: 2, url: `https://player.vimeo.com/video/${VIMEO}` }), {
    id: 2, kind: 'embed', provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${VIMEO}?autoplay=1&dnt=1`, watchUrl: `https://vimeo.com/${VIMEO}`,
  });
  assert.deepEqual(galleryVideo({ id: 3, url: 'https://video.contoh.example/acara/1' }), { id: 3, kind: 'link', watchUrl: 'https://video.contoh.example/acara/1' });
  assert.deepEqual(galleryVideo({ id: 4, url: 'http://video.contoh.example/a b' }), { id: 4, kind: 'link', watchUrl: 'http://video.contoh.example/a%20b' });
  for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', '/media/1/video.mp4', 'mailto:panitia@contoh.example', 'not a url']) {
    assert.equal(galleryVideo({ id: 5, url }), null, url);
  }
});

test('B-025: every family shows each photo as a named link to its original; the closed lightbox requests nothing', () => {
  for (const layout of FAMILIES) {
    const html = render(layout);
    const found = triggers(html);
    assert.deepEqual(found.map((t) => t.href), PHOTO_URLS, `${layout.label}: one link per photo, in order, to the original`);
    assert.deepEqual(found.map((t) => t.index), [0, 1, 2, 3, 4], layout.label);
    assert.deepEqual(found.map((t) => t.label), PHOTO_URLS.map((_, i) => `Buka ${photoLabel(i, 5).toLowerCase()}`), layout.label);
    for (const trigger of found) {
      assert.match(trigger.image, new RegExp(`^<img src="${trigger.href}" alt="" loading="lazy" class="[^"]+"/>$`), `${layout.label}: the photo itself is decorative and lazy`);
      assert.ok(trigger.box.includes('focus-visible:outline'), `${layout.label}: a visible focus ring`);
    }
    const dialog = dialogOf(html);
    assert.equal(html.match(/<dialog\b/g)?.length, 1, `${layout.label}: one lightbox`);
    assert.match(dialog, /^<dialog aria-label="Galeri foto" class="[^"]*\bm-0 h-full max-h-none w-full max-w-none\b/, layout.label);
    assert.ok(!/<img\b|<source\b/.test(dialog), `${layout.label}: the closed lightbox holds no image to request`);
    for (const name of ['Tutup galeri', 'Foto sebelumnya', 'Foto berikutnya']) {
      assert.match(dialog, new RegExp(`<button type="button" aria-label="${name}" class="[^"]*min-h-11 min-w-11[^"]*">`), `${layout.label}: ${name} is a 44 px button`);
    }
    const single = dialogOf(render(layout, undefined, photos.slice(0, 1)));
    assert.ok(single.includes('Tutup galeri') && !single.includes('Foto berikutnya'), `${layout.label}: one photo has nothing to step to`);
  }
});

test('B-025: the three layouts are distinct on every family; grid is the family’s own and equals an unset layout', () => {
  for (const layout of FAMILIES) {
    const family = layout.familyId!;
    const unset = render(layout);
    assert.equal(render(layout, { enabled: true, layout: 'grid' }), unset, `${family}: an explicit grid is the family's own grid`);
    assert.ok(!/break-inside-avoid|snap-x|role="region"/.test(unset), family);

    const masonry = render(layout, { enabled: true, layout: 'masonry' });
    const masonryTriggers = triggers(masonry);
    assert.equal(masonryTriggers.length, 5, family);
    // Gapura's arch needs portrait boxes; the others take the general cycle.
    const aspects: readonly string[] = family === 'gapura' ? MASONRY_PORTRAIT_ASPECTS : MASONRY_ASPECTS;
    masonryTriggers.forEach((trigger, i) => {
      assert.ok(trigger.box.endsWith(' mb-3 break-inside-avoid'), `${family}: masonry boxes never split across columns`);
      assert.ok(trigger.image.includes(`class="${aspects[i % aspects.length]} w-full `), `${family}: photo ${i + 1} is sized before it loads (no layout shift)`);
    });
    if (family === 'gapura') {
      for (const aspect of MASONRY_PORTRAIT_ASPECTS) {
        const [w, h] = /aspect-\[(\d+)\/(\d+)\]/.exec(aspect)!.slice(1).map(Number);
        assert.ok(h > w, `${aspect}: taller than wide, so the arch keeps its shape`);
      }
    }
    assert.match(masonry, /<div class="mt-\d+ columns-2[^"]* gap-3">/, `${family}: CSS columns`);

    const carousel = render(layout, { enabled: true, layout: 'carousel' });
    assert.match(carousel, /<div role="region" aria-label="Galeri 5 foto, geser untuk melihat semuanya" tabindex="0" class="[^"]*\bflex snap-x snap-mandatory gap-3 overflow-x-auto\b[^"]*motion-safe:scroll-smooth/, `${family}: one keyboard-scrollable row`);
    for (const trigger of triggers(carousel)) {
      assert.ok(trigger.box.endsWith(' w-4/5 shrink-0 snap-center'), family);
      assert.ok(trigger.image.includes('class="aspect-[4/5] w-full '), `${family}: carousel photos are sized before they load`);
    }

    assert.equal(new Set([unset, masonry, carousel]).size, 3, `${family}: three different galleries`);
    // With variants, each layout names its own slot width for the browser.
    for (const [kind, expected] of [['masonry', FRAMES[family].masonry], ['carousel', FRAMES[family].carousel]] as const) {
      const html = render(layout, { enabled: true, layout: kind }, photos, { imageVariants: variants });
      const sizes = triggers(html).map((t) => /<source type="image\/webp" srcSet="[^"]+" sizes="([^"]+)"\/>/.exec(t.image)?.[1]);
      assert.deepEqual(sizes, Array(5).fill(expected), `${family} ${kind}: sizes`);
    }
  }
});

test('B-025 / D-041: the legacy layout keeps its grid and shows no video and no lightbox, whatever is stored', () => {
  const plain = render(LEGACY);
  assert.ok(!/<dialog\b|data-lightbox-index|youtube|vimeo/.test(plain));
  for (const gallery of [{ enabled: true, layout: 'grid' }, { enabled: true, layout: 'masonry' }, { enabled: true, layout: 'carousel' }] as const) {
    assert.equal(render(LEGACY, gallery), plain, `legacy with ${gallery.layout}`);
    assert.equal(render(LEGACY, gallery, [...photos, ...videos]), plain, `legacy with ${gallery.layout} and videos`);
  }
});

test('B-025: a video is a facade: a link to its own page, no player and nothing from the provider before a tap', () => {
  for (const layout of FAMILIES) {
    const html = render(layout, undefined, [...photos, ...videos]);
    assert.ok(!/<iframe\b/.test(html), `${layout.label}: no player in the page`);
    assert.ok(!/youtube-nocookie\.com|player\.vimeo\.com|ytimg|vimeocdn/.test(html), `${layout.label}: no provider URL a browser would request`);
    // React's static markup gives server-action forms an `action="javascript:throw …"` placeholder; links are the concern.
    assert.ok(!/href="javascript:/i.test(html) && !html.includes('alert(1)'), `${layout.label}: an unsafe link is dropped`);
    assert.match(html, new RegExp(`<a href="https://www\\.youtube\\.com/watch\\?v=${YT}" target="_blank" rel="noopener noreferrer" class="[^"]+">[^]*?Putar video 1</span><span class="[^"]+">YouTube dimuat setelah diketuk</span></a>`), layout.label);
    assert.match(html, new RegExp(`<a href="https://vimeo\\.com/${VIMEO}" target="_blank" rel="noopener noreferrer" class="[^"]+">[^]*?Putar video 2</span><span class="[^"]+">Vimeo dimuat setelah diketuk</span></a>`), layout.label);
    assert.match(html, /<a href="https:\/\/video\.contoh\.example\/acara\/1" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 [^"]+">Tonton video 3<\/a>/, layout.label);
    assert.ok(html.indexOf('Putar video 1') > html.lastIndexOf('data-lightbox-index'), `${layout.label}: videos follow the photos`);
    assert.match(html, /<div class="grid gap-4 sm:grid-cols-2"><div class="aspect-video w-full /, `${layout.label}: two players side by side from sm`);
    assert.ok(html.indexOf('Tonton video 3') > html.indexOf('Putar video 2'), `${layout.label}: plain links after the players`);
    const lone = render(layout, undefined, [videos[0]]);
    assert.match(lone, /Putar video<\/span>/, `${layout.label}: a lone video is just "video"`);
    assert.match(lone, /<div class="grid gap-4"><div class="aspect-video w-full /, `${layout.label}: a lone player keeps the full width`);
    const videosOnly = render(layout, undefined, videos.slice(0, 2));
    assert.ok(videosOnly.includes('Galeri') && videosOnly.includes('Putar video 1') && triggers(videosOnly).length === 0, `${layout.label}: a gallery of videos alone`);
    const off = render(layout, { enabled: false }, [...photos, ...videos]);
    assert.ok(!/Putar video|data-lightbox-index|<dialog\b/.test(off), `${layout.label}: a switched-off gallery shows neither`);
  }
});

test('B-025: the layout is rendered (content contract) and the CSP frames exactly the players the page builds', () => {
  assert.deepEqual([...RENDER_CAPABILITIES.gallery.rendered], ['enabled', 'layout']);
  assert.deepEqual([...RENDER_CAPABILITIES.gallery.storedOnly], []);
  // B-038 moved the policy to lib/security/csp.ts; this reads the frame-src a guest page is actually sent.
  const policy = contentSecurityPolicy({ nonce: 'n', pathname: '/i/review/budi', secure: true });
  const frameSrc = policy.split('; ').find((directive) => directive.startsWith('frame-src '))?.split(' ').slice(1) ?? [];
  const players = [`https://youtu.be/${YT}`, `https://vimeo.com/${VIMEO}`].map((url) => {
    const video = galleryVideo({ id: 1, url });
    return video?.kind === 'embed' ? new URL(video.embedUrl).origin : null;
  });
  assert.deepEqual(players, ['https://www.youtube-nocookie.com', 'https://player.vimeo.com']);
  for (const origin of players) assert.ok(frameSrc.includes(origin!), `frame-src allows ${origin}`);
});

test('B-025: one shared island with a native modal dialog, no motion of its own; families never build their own', () => {
  const island = read('components/invitation/gallery-lightbox.tsx');
  const block = read('components/invitation/gallery.tsx');
  assert.ok(island.startsWith("'use client';"));
  assert.ok(island.includes('dialog.showModal()') && island.includes('onClose={onClose}'), 'a modal dialog: the page behind is inert and Escape closes it');
  assert.ok(island.includes('triggerRef.current?.focus({ preventScroll: true })'), 'focus returns to the photo that opened it');
  for (const source of [island, block]) {
    assert.ok(!/\btransition\b|animate-|inv-rise|duration-/.test(source), 'I-15: nothing for reduced motion to switch off');
    assert.equal(source.match(/scroll-smooth/g)?.length ?? 0, source.match(/motion-safe:scroll-smooth/g)?.length ?? 0, 'smooth scrolling only under motion-safe');
  }
  for (const family of ['gapura', 'kartu', 'riang', 'lontar']) {
    const source = read(`components/invitation/families/${family}.tsx`);
    assert.ok(source.includes('<GalleryBody'), `${family}: the shared gallery block`);
    assert.ok(!/data-lightbox-index|<dialog|<iframe/.test(source), `${family}: no gallery or player of its own`);
  }
});
