import type { ReactNode } from 'react';
import { MASONRY_ASPECTS } from '@/lib/invitation/gallery';
import type { MediaAsset } from '@/lib/db/schema';
import type { GuestView } from '@/components/invitation/guest-view';
import { VariantImage } from '@/components/invitation/guest-blocks';
import { GalleryLightbox, VideoFacade } from '@/components/invitation/gallery-lightbox';

/**
 * B-025 (G-028): the design families' gallery, one shared block. Each family passes its own frame: its grid exactly as it
 * was (the layout when `gallery.layout` is unset or `grid`) and its photo shape for the other two layouts.
 * - **masonry:** CSS columns with a fixed cycle of aspect ratios (`MASONRY_ASPECTS`), so every box is sized before its
 *   image arrives (no layout shift);
 * - **carousel:** one horizontal scroll-snap row that a keyboard can scroll once focused; no script.
 * Every photo is a link to its original with an accessible name, opened in the lightbox once the island is hydrated.
 * Videos follow the photos as facades (`VideoFacade`), or as a plain link for a provider without one.
 * The legacy layout never renders this block (D-041).
 */
export type GalleryFrame = {
  /** Space between the section heading and the gallery. */
  spacing: string;
  /** The family's own grid: its container and, per photo, an optional span for the box, the image's classes and `sizes`. */
  grid: { className: string; photo: (index: number) => { span?: string; image: string; sizes: string } };
  /** A photo's corners in the masonry and carousel layouts. */
  shape: string;
  /** `aspects`: the cycle of box ratios, `MASONRY_ASPECTS` unless the shape needs portrait boxes. */
  masonry: { columns: string; sizes: string; aspects?: readonly string[] };
  carousel: { sizes: string };
};

export function GalleryBody({ view, frame }: { view: GuestView; frame: GalleryFrame }) {
  const { gallery, galleryLayout: layout, galleryVideos: videos, tone, copy } = view;
  if (!gallery.length && !videos.length) return null;
  const total = gallery.length;
  const embeds = videos.filter((video) => video.kind === 'embed').length;
  // G-018: the page's language; "Foto 2 dari 5" in Indonesian, as `photoLabel` (`gallery.ts`) and the lightbox say it.
  const videoLabel = (index: number) => (videos.length > 1 ? `${copy.gallery.video} ${index + 1}` : copy.gallery.video);
  const photoName = (index: number) => copy.lightbox.photo.replace('{n}', () => String(index + 1)).replace('{total}', () => String(total));
  const trigger = (asset: MediaAsset, index: number, box: string, image: string, sizes: string) => (
    <a
      key={asset.id}
      href={asset.url}
      data-lightbox-index={index}
      aria-label={`${copy.gallery.open} ${photoName(index).toLowerCase()}`}
      className={`block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4${box ? ` ${box}` : ''}`}
    >
      <VariantImage srcSet={view.imageSrcSet(asset.url)} sizes={sizes} src={asset.url} alt="" loading="lazy" className={image} />
    </a>
  );

  let photos: ReactNode = null;
  if (total && layout === 'masonry') {
    const aspects = frame.masonry.aspects ?? MASONRY_ASPECTS;
    photos = (
      <div className={`${frame.spacing} ${frame.masonry.columns} gap-3`}>
        {gallery.map((asset, index) =>
          trigger(asset, index, 'mb-3 break-inside-avoid', `${aspects[index % aspects.length]} w-full ${frame.shape} object-cover`, frame.masonry.sizes),
        )}
      </div>
    );
  } else if (total && layout === 'carousel') {
    photos = (
      <div
        role="region"
        aria-label={copy.gallery.swipe(total)}
        tabIndex={0}
        className={`${frame.spacing} flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 motion-safe:scroll-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4`}
      >
        {gallery.map((asset, index) => trigger(asset, index, 'w-4/5 shrink-0 snap-center', `aspect-[4/5] w-full ${frame.shape} object-cover`, frame.carousel.sizes))}
      </div>
    );
  } else if (total) {
    photos = (
      <div className={`${frame.spacing} ${frame.grid.className}`}>
        {gallery.map((asset, index) => {
          const photo = frame.grid.photo(index);
          return trigger(asset, index, photo.span ?? '', photo.image, photo.sizes);
        })}
      </div>
    );
  }

  return (
    <GalleryLightbox
      photos={gallery.map((asset) => ({ src: asset.url, srcSet: view.imageSrcSet(asset.url) }))}
      tone={{ bg: tone.bg, ink: tone.ink, line: tone.line }}
      labels={copy.lightbox}
    >
      {photos}
      {videos.length > 0 && (
        <div className={`${total ? 'mt-6' : frame.spacing} flex flex-col gap-4`}>
          {/* Two or more players sit side by side from `sm` (s30 review: one poster per row at 1280 px was a large empty
              card); a lone one keeps the full width its player fills after the tap. Plain links get their own row. */}
          {embeds > 0 && (
            <div className={embeds > 1 ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
              {videos.map((video, index) =>
                video.kind === 'embed' ? (
                  <VideoFacade
                    key={video.id}
                    video={video}
                    label={videoLabel(index)}
                    labels={copy.lightbox}
                    tone={{ bg: tone.bg, ink: tone.ink, line: tone.line, card: tone.card, muted: tone.muted }}
                  />
                ) : null,
              )}
            </div>
          )}
          {embeds < videos.length && (
            <div className="flex flex-wrap justify-center gap-3">
              {videos.map((video, index) =>
                video.kind === 'link' ? (
                  <a
                    key={video.id}
                    href={video.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-11 items-center justify-center rounded-full border border-current px-6 text-sm font-semibold ${tone.accent}`}
                  >
                    {`${copy.gallery.watch} `}
                    {videoLabel(index).toLowerCase()}
                  </a>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}
    </GalleryLightbox>
  );
}
