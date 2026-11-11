'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReadingLabels } from '@/lib/invitation/guest-copy';
import { READING_COOKIE, READING_COOKIE_MAX_AGE, READING_COOKIE_VALUE, type ReadingMode } from '@/lib/invitation/reading-mode';

/**
 * G-036 (I-05): the cover's large-text switch, one tap for an older guest. A toggle button whose pressed state is
 * announced; it flips the page it sits on at once (`data-reading` on the layout's `<main>`, styled in `globals.css` from
 * the palette's own tokens) and keeps the choice for this device in a cookie the guest routes read, so the next page
 * paints large from its first byte. Like the share buttons it arrives with hydration (without JavaScript it could not
 * keep the choice); until then its row keeps its 44 px height, so nothing on the cover moves.
 */
export function ReadingToggle({
  reading,
  labels,
  accentClass,
  align,
  className = '',
}: {
  reading: ReadingMode;
  labels: ReadingLabels;
  accentClass: string;
  align: 'center' | 'start';
  /** The layout's own width rule for the row (Kartu keeps it under its card, outside the card's offset shadow). */
  className?: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [on, setOn] = useState(reading.on);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => setHydrated(true), []);

  function toggle() {
    const next = !on;
    setOn(next);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = next
      ? `${READING_COOKIE}=${READING_COOKIE_VALUE}; Path=/; Max-Age=${READING_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
      : `${READING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    const main = button.current?.closest('main');
    if (next) main?.setAttribute('data-reading', READING_COOKIE_VALUE);
    else main?.removeAttribute('data-reading');
  }

  return (
    <div data-reading-toggle="" className={`mt-6 flex min-h-11 ${align === 'center' ? 'justify-center' : 'justify-start'}${className ? ` ${className}` : ''}`}>
      {hydrated && (
        <button
          ref={button}
          type="button"
          aria-pressed={on}
          onClick={toggle}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-5 text-sm font-semibold ${accentClass}`}
        >
          <span aria-hidden="true" className="font-serif text-base">
            Aa
          </span>
          {labels.toggle}
        </button>
      )}
    </div>
  );
}
