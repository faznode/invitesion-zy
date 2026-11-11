'use client';

import { useEffect, useState } from 'react';
import { countdownParts } from '@/lib/invitation/calendar';
import type { CountdownLabels } from '@/lib/invitation/guest-copy';

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

/** The countdown's words before G-018, kept as the default so the legacy layout stays byte-identical (D-041). */
const INDONESIAN_LABELS: CountdownLabels = {
  days: 'Hari',
  hours: 'Jam',
  minutes: 'Menit',
  seconds: 'Detik',
  toEvent: '{days} hari lagi menuju {title}',
  toEventOne: '{days} hari lagi menuju {title}',
};

/**
 * Countdown to the primary event (B-008). The server renders it with the request time, so the first client render
 * is identical (no hydration mismatch) and the boxes keep a fixed size while the numbers change (no layout shift).
 * `role="timer"` is not announced on every tick; the label carries the whole-day summary for screen readers.
 * G-018: `labels` carries the page's language (design families); the event title is the host's, inserted as typed.
 */
export function Countdown({
  target,
  initialNow,
  eventTitle,
  boxClassName,
  labelClassName,
  labels = INDONESIAN_LABELS,
}: {
  target: number;
  initialNow: number;
  eventTitle: string;
  boxClassName: string;
  labelClassName: string;
  labels?: CountdownLabels;
}) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parts = countdownParts(target, now);
  if (!parts) return null;
  // Function replacements: a `$` in the host's title must stay literal.
  const summary = (parts.days === 1 ? labels.toEventOne : labels.toEvent)
    .replace('{days}', () => String(parts.days))
    .replace('{title}', () => eventTitle);

  return (
    <div role="timer" aria-label={summary} className="mt-8 grid grid-cols-4 gap-3 text-center">
      {UNITS.map((unit) => (
        <div key={unit} className={`rounded-2xl px-2 py-4 ${boxClassName}`}>
          <span className="block font-serif text-2xl tabular-nums sm:text-3xl" aria-hidden>
            {String(parts[unit]).padStart(2, '0')}
          </span>
          <span className={`mt-1 block text-xs uppercase tracking-widest ${labelClassName}`} aria-hidden>
            {labels[unit]}
          </span>
        </div>
      ))}
    </div>
  );
}
