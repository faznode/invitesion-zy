/**
 * B-025 (G-028): the gallery's rules, free of React and the database so they are unit-tested
 * (`tests/b025-gallery.test.ts`).
 *
 * - **Layout:** `gallery.layout` (`grid` | `masonry` | `carousel`, stored since the editor's first version) is honoured on
 *   the design families; unset or unknown means each family's own grid, exactly as before. The legacy layout is frozen
 *   (D-041) and keeps its grid whatever is stored.
 * - **Video facade:** a `video` media asset whose URL is a YouTube or Vimeo watch link renders as a poster drawn by the
 *   page (no third-party image) and loads the provider's player only after a tap, from the privacy-enhanced hosts
 *   (`youtube-nocookie.com`, Vimeo with `dnt=1`). Any other http(s) URL is offered as a plain link that opens in a new
 *   tab; anything else is not rendered. No provider request is made before the guest asks for the video.
 */

export const GALLERY_LAYOUTS = ['grid', 'masonry', 'carousel'] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];

export function galleryLayout(value: unknown): GalleryLayout {
  return (GALLERY_LAYOUTS as readonly unknown[]).includes(value) ? (value as GalleryLayout) : 'grid';
}

export type GalleryVideo =
  | { id: number; kind: 'embed'; provider: 'youtube' | 'vimeo'; embedUrl: string; watchUrl: string }
  | { id: number; kind: 'link'; watchUrl: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** The 11-character video id of a YouTube watch, short, Shorts, live or embed link; null for anything else. */
export function youtubeVideoId(value: string): string | null {
  const url = httpUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') id = url.searchParams.get('v');
    else if (first === 'shorts' || first === 'embed' || first === 'live') id = second ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** The numeric id of a Vimeo video page or player link; null for anything else. */
export function vimeoVideoId(value: string): string | null {
  const url = httpUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  const id = host === 'vimeo.com' || host === 'www.vimeo.com' ? segments[0] : host === 'player.vimeo.com' && segments[0] === 'video' ? segments[1] : undefined;
  return id && /^\d{1,12}$/.test(id) ? id : null;
}

/** A video asset as the page offers it, or null when its URL is not http(s). */
export function galleryVideo(asset: { id: number; url: string }): GalleryVideo | null {
  const youtube = youtubeVideoId(asset.url);
  if (youtube) {
    return {
      id: asset.id,
      kind: 'embed',
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${youtube}`,
    };
  }
  const vimeo = vimeoVideoId(asset.url);
  if (vimeo) {
    return { id: asset.id, kind: 'embed', provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeo}?autoplay=1&dnt=1`, watchUrl: `https://vimeo.com/${vimeo}` };
  }
  const url = httpUrl(asset.url);
  return url ? { id: asset.id, kind: 'link', watchUrl: url.href } : null;
}

/**
 * Masonry without measuring anything: originals carry no stored dimensions, so the staggered rhythm comes from a fixed
 * cycle of aspect ratios (every box is sized before its image arrives, no layout shift) and `object-cover` crops.
 */
export const MASONRY_ASPECTS = ['aspect-[3/4]', 'aspect-square', 'aspect-[4/5]', 'aspect-[4/3]', 'aspect-[2/3]', 'aspect-square'] as const;
/**
 * Portrait boxes only, for a frame whose shape needs height: on a box wider than tall, Gapura's arch (`rounded-t-full`)
 * flattens into a dome (s30 review of `review-gapura-gallery-masonry` at 360 × 800).
 */
export const MASONRY_PORTRAIT_ASPECTS = ['aspect-[3/4]', 'aspect-[5/6]', 'aspect-[2/3]', 'aspect-[4/5]', 'aspect-[3/5]', 'aspect-[5/6]'] as const;

/** The accessible name of a gallery photo's trigger and of the photo in the lightbox (hosts write no captions yet). */
export function photoLabel(index: number, total: number): string {
  return `Foto ${index + 1} dari ${total}`;
}
