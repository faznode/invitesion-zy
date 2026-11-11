'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleCheck, MessageCircle, Play } from 'lucide-react';
import styles from './home.module.css';
import { getMarketingCopy, type HeroSlideTheme } from './marketing-copy';
import type { Locale } from '@/lib/i18n';

const ROTATE_MS = 4200;

/**
 * Each slide gets its own hand-built visual (pure CSS, no image payload):
 * a wedding card, a live RSVP list, a WhatsApp share thread, and a party
 * invite. The visual always matches the headline currently on screen.
 */
function SlideVisual({ theme, locale }: { theme: HeroSlideTheme; locale: Locale }) {
  const id = locale === 'id';

  if (theme === 'wedding') {
    return (
      <div className={`${styles.miniCard} ${styles.miniWedding}`}>
        <small>THE WEDDING OF</small>
        <b>Nadya <i>&amp; Arga</i></b>
        <span>18 . 10 . 2026 — SERAMBI KOTA, JAKARTA</span>
        <div className={styles.miniChip}>
          <CircleCheck size={14} /> {id ? '84 tamu terkonfirmasi' : '84 guests confirmed'}
        </div>
      </div>
    );
  }

  if (theme === 'rsvp') {
    const rows: Array<[string, string, boolean]> = [
      ['Raka & Sinta', id ? 'Hadir' : 'Going', true],
      ['Keluarga Wijaya', id ? 'Hadir' : 'Going', true],
      ['Bimo Ardianto', id ? 'Menunggu' : 'Pending', false],
    ];
    return (
      <div className={`${styles.miniCard} ${styles.miniRsvp}`}>
        <small>{id ? 'DAFTAR TAMU · LIVE' : 'GUEST LIST · LIVE'}</small>
        {rows.map(([name, status, going]) => (
          <div key={name} className={styles.miniRow}>
            <span>{name}</span>
            <em className={going ? styles.ok : styles.wait}>{status}</em>
          </div>
        ))}
        <div className={styles.miniChip}>
          <CircleCheck size={14} /> {id ? '128 konfirmasi masuk minggu ini' : '128 confirmations this week'}
        </div>
      </div>
    );
  }

  if (theme === 'whatsapp') {
    return (
      <div className={`${styles.miniCard} ${styles.miniChat}`}>
        <small><MessageCircle size={12} /> WHATSAPP</small>
        <div className={styles.bubbleMe}>
          {id ? 'Halo! Ini undangan dari kami \uD83D\uDC8C' : 'Hi! Here is our invitation \uD83D\uDC8C'}
          <span>invitesion.id/nadya-arga</span>
        </div>
        <div className={styles.bubbleThem}>
          {id ? 'Cantik banget! Kami hadir ya \uD83C\uDF89' : 'So pretty! We are coming \uD83C\uDF89'}
        </div>
        <div className={styles.miniChip}>
          <Check size={14} /> {id ? 'Tautan personal untuk tiap tamu' : 'A personal link per guest'}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.miniCard} ${styles.miniParty}`}>
      <small>{id ? 'ULANG TAHUN KE-7' : 'TURNING SEVEN'}</small>
      <b>Kayla&apos;s <i>Party</i></b>
      <span>{id ? 'MINGGU, 22 NOV · 15.00 WIB' : 'SUNDAY, NOV 22 · 3:00 PM'}</span>
      <div className={styles.miniChip}>
        <CircleCheck size={14} /> {id ? '32 teman ikut hadir' : '32 friends are going'}
      </div>
    </div>
  );
}

export default function HeroRotator({ locale }: { locale: Locale }) {
  const copy = getMarketingCopy(locale);
  const slides = copy.heroSlides;
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    // Respect users who asked the OS for less motion: no auto-advance.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      if (!paused.current) setActive((v) => (v + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  const slide = slides[active];

  return (
    <section
      className={styles.hero}
      id="produk"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      <div className={styles.heroCopy}>
        <div className={styles.trustPill}><span aria-hidden="true">✦</span>{copy.heroPill}</div>
        <h1 className={styles.heroHeading} aria-live="polite">
          <span key={`q-${active}`} className={styles.qLine}>{slide.q}</span>
          <em key={`a-${active}`} className={styles.aLine}>{slide.a}</em>
        </h1>
        <p>{copy.heroBody}</p>
        <div className={styles.heroActions}>
          <Link href="/sign-up" className={styles.primaryBtn}>
            {copy.heroPrimary} <ArrowRight size={17} />
          </Link>
          <a href="#cara-kerja" className={styles.secondaryBtn}>
            <Play size={15} fill="currentColor" /> {copy.heroSecondary}
          </a>
        </div>
        <small className={styles.heroNote}><Check size={14} /> {copy.heroNote}</small>
      </div>

      <div className={styles.slideStage} aria-label={copy.heroStageAria}>
        {slides.map((s, idx) => (
          <div
            key={s.theme}
            className={`${styles.slideCard} ${idx === active ? styles.slideOn : ''}`}
            aria-hidden={idx !== active}
          >
            <SlideVisual theme={s.theme} locale={locale} />
          </div>
        ))}
        <span className={styles.stageTag}>{slide.tag}</span>
        <div className={styles.slideDots}>
          {slides.map((s, idx) => (
            <button
              key={s.theme}
              type="button"
              className={idx === active ? styles.dotOn : undefined}
              aria-label={s.tag}
              onClick={() => setActive(idx)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
