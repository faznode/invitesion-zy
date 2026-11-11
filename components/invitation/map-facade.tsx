'use client';

import { useEffect, useId, useState } from 'react';
import type { MapLabels } from '@/lib/invitation/guest-copy';

/**
 * G-029: a disclosure button for the event's map. The frame does not exist until the guest presses the button, and it is
 * removed again when they hide the map, so no map request is made unless they ask (`map-embed.ts`). Like the other
 * guest islands it arrives with hydration: without JavaScript the static location link above it still works.
 */
export function MapFacade({
  embedUrl,
  title,
  labels,
  accentClass,
  lineClass,
}: {
  embedUrl: string;
  title: string;
  labels: MapLabels;
  accentClass: string;
  lineClass: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const frameId = useId();
  useEffect(() => setHydrated(true), []);

  return (
    <div data-map-facade="" className="mt-3 w-full">
      {hydrated && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={frameId}
            onClick={() => setOpen((shown) => !shown)}
            className={`inline-flex min-h-11 items-center rounded-full border border-current px-5 text-xs font-semibold ${accentClass}`}
          >
            {open ? labels.hide : labels.show}
          </button>
          <div id={frameId} hidden={!open} className={`mt-3 overflow-hidden rounded-2xl border ${lineClass}`}>
            {open && (
              <iframe
                src={embedUrl}
                title={title}
                className="block aspect-[4/3] w-full"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                allowFullScreen
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
