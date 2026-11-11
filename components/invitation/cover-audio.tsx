'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { CoverLabels, GuestLanguage } from '@/lib/invitation/guest-copy';
import { InvitationIcon } from './icons';

/**
 * B-009 (D-045): background music and the "Buka Undangan" cover gate, one small client island around the server-rendered
 * layout of an invitation with playable music. It renders and runs only there. Next.js lists a route's client chunks
 * statically, so every guest page downloads its chunk (5.6 KB decoded, measured in E-061). A lazy boundary was not used:
 * it could stream the gate after the content it must cover, and a page without JavaScript would never show either.
 *
 * - The gate is in the server HTML and works from first paint without JavaScript: both links point at the gate itself
 *   (`#sampul`), so a tap makes it `:target` and the stylesheet hides it (`app/globals.css`).
 * - Once hydrated, the same tap is handled here: the gate leaves and the music starts inside that tap, the only moment a
 *   browser allows sound. "Buka tanpa musik" opens without it. Escape opens without music too.
 * - I-15: the gate's exit is the only motion (0.7 s, well inside the 1.5 s limit) and is skipped under reduced motion.
 * - While the gate is shown the page behind it is inert, so focus stays on the gate; afterwards focus moves to the page.
 * - The music control is a toggle (`aria-pressed`) that appears only once it can work, and not at all if the source
 *   cannot play. One `<audio preload="none">`: nothing is fetched until the guest asks for sound.
 */

export type MusicSource = { src: string; title?: string; playOnOpen: boolean };
export type CoverGateContent = { kicker: string; names: string[]; dateText?: string; guestName?: string };

type GateState = 'shown' | 'leaving' | 'gone';

const GATE_ID = 'sampul';
const LEAVE_MS = 700;

/** The gate's own words before G-018, kept as the default so the legacy layout's page stays byte-identical (D-041). */
const INDONESIAN_LABELS: CoverLabels = {
  dear: 'Kepada Yth.',
  open: 'Buka Undangan',
  withMusic: 'Dengan musik latar.',
  withoutMusic: 'Buka tanpa musik',
  music: 'Musik latar',
};

export function CoverAudio({
  music,
  gate,
  style,
  labels = INDONESIAN_LABELS,
  lang,
  children,
}: {
  music: MusicSource;
  /** The gate's content, or null when the page opens directly (no play-on-open, or the guest is back after a form post). */
  gate: CoverGateContent | null;
  /** The palette's CSS variables: the gate and the control sit outside the layout's `<main>`. */
  style: CSSProperties;
  /** G-018: the gate's and the control's words in the page's language (design families); Indonesian otherwise. */
  labels?: CoverLabels;
  /** G-018: the language of those words, for pages whose document language differs (the owner's preview). */
  lang?: GuestLanguage;
  children: ReactNode;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<GateState>(gate ? 'shown' : 'gone');
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openLinkRef = useRef<HTMLAnchorElement>(null);
  const openedByGuest = useRef(false);

  useEffect(() => {
    setHydrated(true);
    if (!gate) return;
    if (window.location.hash === `#${GATE_ID}`) {
      // Opened before this script ran (the link works without JavaScript): it stays open, without music.
      setState('gone');
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    } else if (document.activeElement === document.body) {
      openLinkRef.current?.focus({ preventScroll: true });
    }
  }, [gate]);

  useEffect(() => {
    if (state !== 'leaving') return;
    const timer = window.setTimeout(() => setState('gone'), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state !== 'shown' && openedByGuest.current) contentRef.current?.focus({ preventScroll: true });
  }, [state]);

  function play() {
    // A refused play() leaves the control paused for another tap; a source that cannot play fires `error` instead.
    audioRef.current?.play().catch(() => undefined);
  }

  function openGate(withMusic: boolean) {
    if (state !== 'shown') return;
    openedByGuest.current = true;
    if (withMusic) play();
    setState(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'gone' : 'leaving');
  }

  const onOpen = (withMusic: boolean) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    openGate(withMusic);
  };

  const onGateKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') openGate(false);
  };

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play();
    else audio.pause();
  }

  return (
    <>
      {gate && (
        <div
          id={GATE_ID}
          lang={lang}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sampul-judul"
          aria-describedby={gate.guestName ? 'sampul-tamu' : undefined}
          hidden={state === 'gone'}
          inert={state === 'leaving' || undefined}
          data-state={state}
          onKeyDown={onGateKey}
          style={style}
          className="inv-cover-gate fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto overscroll-contain bg-(--inv-bg) px-6 py-10 text-center text-(--inv-ink) transition-[opacity,transform] duration-700 ease-out data-[state=leaving]:-translate-y-6 data-[state=leaving]:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-(--inv-accent)">{gate.kicker}</p>
            <p id="sampul-judul" dir="auto" className="mt-6 font-serif text-4xl leading-tight text-balance [overflow-wrap:anywhere]">
              {gate.names.map((name, index) => (
                <span key={index} className="block">
                  {index > 0 && <span className="my-2 block text-2xl text-(--inv-accent)">&amp;</span>}
                  {name}
                </span>
              ))}
            </p>
            {gate.dateText && <p className="mt-5 text-sm tracking-wide text-(--inv-accent)">{gate.dateText}</p>}
            <span aria-hidden="true" className="mt-8 block h-px w-12 bg-(--inv-accent)" />
            {gate.guestName && (
              <div id="sampul-tamu" className="mt-8">
                <p className="text-xs uppercase tracking-widest text-(--inv-muted)">{labels.dear}</p>
                <p dir="auto" className="mt-1 font-serif text-xl [overflow-wrap:anywhere]">
                  {gate.guestName}
                </p>
              </div>
            )}
            <a
              ref={openLinkRef}
              href={`#${GATE_ID}`}
              onClick={onOpen(true)}
              className="mt-10 inline-flex min-h-12 items-center justify-center rounded-full bg-(--inv-accent) px-8 text-sm font-semibold tracking-wide text-(--inv-bg) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--inv-accent)"
            >
              {labels.open}
            </a>
            <p className="mt-4 text-sm text-(--inv-muted)">{labels.withMusic}</p>
            <a
              href={`#${GATE_ID}`}
              onClick={onOpen(false)}
              className="inline-flex min-h-11 items-center px-3 text-sm text-(--inv-accent) underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-(--inv-accent)"
            >
              {labels.withoutMusic}
            </a>
          </div>
        </div>
      )}
      <div ref={contentRef} tabIndex={-1} inert={(hydrated && state === 'shown') || undefined} className="outline-none">
        {children}
      </div>
      <audio ref={audioRef} src={music.src} preload="none" loop onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
      {hydrated && state === 'gone' && !failed && (
        <button
          type="button"
          lang={lang}
          aria-pressed={playing}
          onClick={toggle}
          style={style}
          className={`fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-12 w-12 items-center justify-center rounded-full border border-(--inv-line) shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-accent) ${
            playing ? 'bg-(--inv-accent) text-(--inv-bg)' : 'bg-(--inv-card) text-(--inv-accent)'
          }`}
        >
          <InvitationIcon name={playing ? 'volume-2' : 'volume-x'} className="h-5 w-5" />
          <span className="sr-only">{music.title ? `${labels.music}: ${music.title}` : labels.music}</span>
        </button>
      )}
    </>
  );
}
