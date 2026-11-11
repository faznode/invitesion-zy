'use client';

import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { GalleryVideo } from '@/lib/invitation/gallery';
import type { LightboxLabels } from '@/lib/invitation/guest-copy';
import { InvitationIcon } from './icons';

/**
 * B-025 (G-028): the gallery's lightbox, one small client island around the server-rendered gallery of the design
 * families (`gallery.tsx`). Every photo there is a link to its original, so without JavaScript a tap opens the image
 * itself; once hydrated the same tap opens this viewer instead.
 *
 * - A native modal `<dialog>`: the page behind is inert (focus stays in the viewer), Escape closes it, and focus returns
 *   to the photo that opened it. Arrow keys and a horizontal swipe move between photos; the counter is announced.
 * - The viewer's image exists only while it is open, so a closed lightbox requests nothing. It offers the photo's WebP
 *   variants for the full viewport width (the lite ladder under Save-Data, as on the page) with the original as `src`.
 * - No motion at all, so there is nothing for `prefers-reduced-motion` to switch off (I-15). Colours are the palette's
 *   own `bg` / `ink` pair, inherited from the page.
 */

export type LightboxPhoto = { src: string; srcSet?: string };
export type LightboxTone = { bg: string; ink: string; line: string };

const SWIPE_PX = 48;

/** The lightbox's words before G-018 (Indonesian); the design families pass their page's language. */
const INDONESIAN_LABELS: LightboxLabels = {
  dialog: 'Galeri foto',
  close: 'Tutup galeri',
  previous: 'Foto sebelumnya',
  next: 'Foto berikutnya',
  play: 'Putar',
  loadsOnTap: 'dimuat setelah diketuk',
  photo: 'Foto {n} dari {total}',
};

/** "Foto 2 dari 5" from the template (`photoLabel` in `gallery.ts` is the Indonesian one). */
function fillPhotoLabel(template: string, index: number, total: number): string {
  return template.replace('{n}', () => String(index + 1)).replace('{total}', () => String(total));
}

export function GalleryLightbox({
  photos,
  tone,
  labels = INDONESIAN_LABELS,
  children,
}: {
  photos: LightboxPhoto[];
  tone: LightboxTone;
  labels?: LightboxLabels;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const swipeFrom = useRef<number | null>(null);
  // A swipe that starts beside the photo ends with a click on the backdrop in some browsers; that click must not close.
  const swiped = useRef(false);
  const [index, setIndex] = useState<number | null>(null);
  const total = photos.length;

  const open = (next: number, trigger: HTMLElement) => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    triggerRef.current = trigger;
    setIndex(next);
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    closeRef.current?.focus();
    return true;
  };
  const step = (delta: number) => setIndex((current) => (current === null ? current : (current + delta + total) % total));
  const close = () => dialogRef.current?.close();
  const onClose = () => {
    setIndex(null);
    document.documentElement.style.overflow = '';
    triggerRef.current?.focus({ preventScroll: true });
  };

  const onGalleryClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('a[data-lightbox-index]');
    if (!trigger) return;
    const next = Number(trigger.dataset.lightboxIndex);
    if (Number.isInteger(next) && next >= 0 && next < total && open(next, trigger)) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (total < 2) return;
    if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
    else return;
    event.preventDefault();
  };
  const onPointerDown = (event: PointerEvent) => {
    swiped.current = false;
    swipeFrom.current = event.pointerType === 'mouse' ? null : event.clientX;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (swipeFrom.current === null || total < 2) return;
    const travelled = event.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(travelled) < SWIPE_PX) return;
    swiped.current = true;
    step(travelled < 0 ? 1 : -1);
  };
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (event.target === event.currentTarget) close();
  };

  const photo = index === null ? null : photos[index];
  const label = index === null ? labels.dialog : fillPhotoLabel(labels.photo, index, total);
  const control = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border ${tone.line} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`;

  return (
    <>
      <div className="contents" onClick={onGalleryClick}>
        {children}
      </div>
      <dialog
        ref={dialogRef}
        aria-label={label}
        onClose={onClose}
        onKeyDown={onKeyDown}
        className={`m-0 h-full max-h-none w-full max-w-none border-0 p-0 ${tone.bg} ${tone.ink}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p aria-live="polite" className="text-sm tabular-nums">
              {index === null ? '' : `${index + 1} / ${total}`}
            </p>
            <button ref={closeRef} type="button" onClick={close} aria-label={labels.close} className={control}>
              <InvitationIcon name="x" className="h-5 w-5" />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              swipeFrom.current = null;
            }}
            onClick={onBackdropClick}
          >
            {photo && (
              <picture className="contents">
                {photo.srcSet && <source type="image/webp" srcSet={photo.srcSet} sizes="100vw" />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt={label} decoding="async" className="max-h-full max-w-full select-none object-contain" draggable={false} />
              </picture>
            )}
          </div>
          {total > 1 && (
            <div className="flex items-center justify-center gap-6 px-4 py-4">
              <button type="button" onClick={() => step(-1)} aria-label={labels.previous} className={control}>
                <InvitationIcon name="chevron-left" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label={labels.next} className={control}>
                <InvitationIcon name="chevron-right" className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * B-025: a video as a poster the page draws itself (no provider image, no provider request) that becomes the provider's
 * privacy-enhanced player only after a tap. Without JavaScript the poster is a link to the video's own page.
 */
export function VideoFacade({
  video,
  tone,
  label,
  labels = INDONESIAN_LABELS,
}: {
  video: Extract<GalleryVideo, { kind: 'embed' }>;
  tone: LightboxTone & { card: string; muted: string };
  label: string;
  labels?: LightboxLabels;
}) {
  const [playing, setPlaying] = useState(false);
  const provider = video.provider === 'youtube' ? 'YouTube' : 'Vimeo';
  return (
    <div className={`aspect-video w-full overflow-hidden rounded-2xl border ${tone.line} ${tone.card}`}>
      {playing ? (
        <iframe
          // The poster link that had focus is gone; the player takes it so keyboard and screen-reader users stay put.
          ref={(frame) => frame?.focus()}
          src={video.embedUrl}
          title={`${label} (${provider})`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      ) : (
        <a
          href={video.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            setPlaying(true);
          }}
          className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4"
        >
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-current">
            <InvitationIcon name="play" className="ml-0.5 h-6 w-6" />
          </span>
          <span className="text-sm font-semibold">
            {`${labels.play} `}
            {label.toLowerCase()}
          </span>
          <span className={`text-xs ${tone.muted}`}>
            {provider}
            {` ${labels.loadsOnTap}`}
          </span>
        </a>
      )}
    </div>
  );
}
