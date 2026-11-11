'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Eye } from 'lucide-react';
import {
  invitationTemplates,
  templateCategories,
  templateCategoryLabels,
  templateStyleTagLabels,
  type InvitationTemplate,
  type TemplateCategory,
  type TemplateStyleTag,
} from '@/lib/invitation/templates';
import { getThemeArt } from '@/lib/invitation/theme-art';
import { templateUseHref } from '@/lib/invitation/template-use-href';
import styles from './templates.module.css';
import ui from './catalog-ui.module.css';

type Locale = 'id' | 'en';

const COPY: Record<
  Locale,
  {
    kicker: string;
    lead: string;
    steps: Array<{ n: string; t: string; b: string }>;
    filterCat: string;
    filterStyle: string;
    all: string;
    themes: string;
    curatedNote: string;
    more: string;
    reset: string;
    preview: string;
    use: string;
    empty: string;
    tiers: Record<'free' | 'premium' | 'signature', string>;
  }
> = {
  id: {
    kicker: 'KATALOG TEMA',
    lead: 'Setiap tema punya arah seni dan asetnya sendiri — bukan sekadar ganti warna. Mulai dari pilihan kurasi di bawah, atau saring sesuai acaramu.',
    steps: [
      { n: '01', t: 'Pilih & saring', b: 'Gunakan filter kategori dan gaya — kami tampilkan pilihan terbaik lebih dulu, bukan semuanya sekaligus.' },
      { n: '02', t: 'Preview seperti tamu', b: 'Buka tema mana pun tanpa login: nama tamu, hitung mundur, RSVP demo — semuanya bisa dicoba.' },
      { n: '03', t: 'Pakai & sesuaikan', b: 'Klik “Pakai tema”, dan semua teks, foto, serta detail acara bisa kamu ubah di dashboard.' },
    ],
    filterCat: 'Kategori',
    filterStyle: 'Gaya',
    all: 'Semua',
    themes: 'tema',
    curatedNote: 'Pilihan kurasi — satu tema terbaik dari tiap kategori. Saring atau jelajahi untuk melihat lainnya.',
    more: 'Jelajahi semua tema',
    reset: 'Atur ulang filter',
    preview: 'Preview penuh',
    use: 'Pakai tema',
    empty: 'Belum ada tema untuk kombinasi filter ini — coba longgarkan salah satu filter.',
    tiers: { free: 'Gratis', premium: 'Premium', signature: 'Signature' },
  },
  en: {
    kicker: 'THEME CATALOG',
    lead: 'Every theme has its own art direction and assets — not just a palette swap. Start from the curated picks below, or filter by your event.',
    steps: [
      { n: '01', t: 'Pick & filter', b: 'Use the category and style filters — we surface the best picks first, not everything at once.' },
      { n: '02', t: 'Preview as a guest', b: 'Open any theme without logging in: guest name, countdown, demo RSVP — all interactive.' },
      { n: '03', t: 'Use & customize', b: 'Click “Use theme” and edit every text, photo, and event detail in your dashboard.' },
    ],
    filterCat: 'Category',
    filterStyle: 'Style',
    all: 'All',
    themes: 'themes',
    curatedNote: 'Curated picks — the best theme from each category. Filter or explore to see more.',
    more: 'Explore all themes',
    reset: 'Reset filters',
    preview: 'Full preview',
    use: 'Use theme',
    empty: 'No themes match this filter combo — try loosening one filter.',
    tiers: { free: 'Free', premium: 'Premium', signature: 'Signature' },
  },
};

/** `wizard`: B-037's `FLAG_CREATION_WIZARD`, read on the server; "Pakai tema" opens the wizard when on. */
export default function CatalogClient({ locale = 'id', wizard = false }: { locale?: Locale; wizard?: boolean }) {
  const [cat, setCat] = useState<TemplateCategory | 'all'>('all');
  const [tag, setTag] = useState<TemplateStyleTag | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const t = COPY[locale];

  const styleTags = useMemo(() => {
    const seen = new Set<TemplateStyleTag>();
    for (const tpl of invitationTemplates) {
      for (const styleTag of tpl.styleTags) seen.add(styleTag);
    }
    return Array.from(seen);
  }, []);

  // Kurasi default: satu tema pertama dari tiap kategori — etalase, bukan gudang.
  const curated = useMemo(() => {
    const seen = new Set<TemplateCategory>();
    const picks: InvitationTemplate[] = [];
    for (const tpl of invitationTemplates) {
      if (!seen.has(tpl.category)) {
        seen.add(tpl.category);
        picks.push(tpl);
      }
    }
    return picks;
  }, []);

  const filtered = useMemo(
    () =>
      invitationTemplates.filter(
        (tpl) =>
          (cat === 'all' || tpl.category === cat) &&
          (tag === 'all' || tpl.styleTags.includes(tag)),
      ),
    [cat, tag],
  );

  const hasFilter = cat !== 'all' || tag !== 'all';
  const isCurated = !hasFilter && !showAll;
  const shown = isCurated ? curated : filtered;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.kicker}>
          {t.kicker} · {invitationTemplates.length} {locale === 'id' ? 'DESAIN' : 'DESIGNS'}
        </p>
        <h1 className={styles.title}>
          {locale === 'id' ? (
            <>
              Tema yang <em>hidup</em>, bukan template yang itu-itu saja.
            </>
          ) : (
            <>
              Themes that feel <em>alive</em>, not cookie-cutter templates.
            </>
          )}
        </h1>
        <p className={styles.lead}>{t.lead}</p>
      </header>

      <div className={ui.steps}>
        {t.steps.map((step) => (
          <div key={step.n} className={ui.step}>
            <p className={ui.stepN}>{step.n}</p>
            <p className={ui.stepT}>{step.t}</p>
            <p className={ui.stepB}>{step.b}</p>
          </div>
        ))}
      </div>

      <div className={ui.bar}>
        <label className={ui.field}>
          {t.filterCat}
          <select
            className={ui.select}
            value={cat}
            onChange={(event) => setCat(event.target.value as TemplateCategory | 'all')}
          >
            <option value="all">{t.all}</option>
            {templateCategories.map((category) => (
              <option key={category} value={category}>
                {templateCategoryLabels[category][locale]}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field}>
          {t.filterStyle}
          <select
            className={ui.select}
            value={tag}
            onChange={(event) => setTag(event.target.value as TemplateStyleTag | 'all')}
          >
            <option value="all">{t.all}</option>
            {styleTags.map((styleTag) => (
              <option key={styleTag} value={styleTag}>
                {templateStyleTagLabels[styleTag][locale]}
              </option>
            ))}
          </select>
        </label>
        <span className={ui.count}>
          {shown.length} {t.themes}
          {hasFilter ? (
            <>
              {' · '}
              <button
                type="button"
                className={ui.reset}
                onClick={() => {
                  setCat('all');
                  setTag('all');
                }}
              >
                {t.reset}
              </button>
            </>
          ) : null}
        </span>
      </div>

      {isCurated ? <p className={ui.curatedNote}>{t.curatedNote}</p> : <div style={{ height: 24 }} aria-hidden="true" />}

      {shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((tpl) => {
            const vars = {
              '--bg': tpl.palette.bg,
              '--ink': tpl.palette.ink,
              '--a': tpl.palette.accent,
              '--s': tpl.palette.soft,
            } as CSSProperties;
            const art = getThemeArt(tpl);
            return (
              <article key={tpl.slug} className={styles.card}>
                <Link
                  href={`/templates/${tpl.slug}`}
                  className={styles.coverLink}
                  aria-label={`${t.preview}: ${tpl.name}`}
                >
                  <div
                    className={styles.cover}
                    style={vars}
                    data-motif={tpl.motif}
                    data-font={tpl.font}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={ui.art} src={art.card ?? art.cover} alt="" loading="lazy" decoding="async" />
                    <span className={ui.tint} aria-hidden="true" />
                    <span className={`${styles.tierBadge} ${ui.raise}`} data-tier={tpl.tier}>
                      {t.tiers[tpl.tier]}
                    </span>
                    <i className={styles.petals} aria-hidden="true" />
                    <span className={styles.frame} aria-hidden="true" />
                    <div className={`${styles.coverInner} ${ui.lift}`}>
                      <span className={styles.cEyebrow}>{tpl.sample.eyebrow}</span>
                      <span className={styles.cNames}>{tpl.sample.names}</span>
                      <span className={styles.cDate}>{tpl.sample.date}</span>
                    </div>
                  </div>
                </Link>
                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <h3 className={styles.cardName}>{tpl.name}</h3>
                    <span className={styles.cardCat}>{templateCategoryLabels[tpl.category][locale]}</span>
                  </div>
                  <p className={styles.cardTagline}>{tpl.tagline[locale]}</p>
                  <div className={styles.cardFoot}>
                    <Link href={`/templates/${tpl.slug}`} className={styles.previewLink}>
                      <Eye size={14} aria-hidden="true" /> {t.preview}
                    </Link>
                    <Link href={templateUseHref(tpl.slug, wizard)} className={styles.useLink}>
                      {t.use} <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>{t.empty}</p>
      )}

      {isCurated ? (
        <div className={ui.moreWrap}>
          <button type="button" className={ui.moreBtn} onClick={() => setShowAll(true)}>
            {t.more} ({invitationTemplates.length}) →
          </button>
        </div>
      ) : null}
    </div>
  );
}
