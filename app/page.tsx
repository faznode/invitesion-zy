import Link from 'next/link';
import { ArrowRight, Check, CircleCheck, Sparkles } from 'lucide-react';
import styles from './home.module.css';
import MarketingHeader from './marketing-header';
import MarketingFooter from './marketing-footer';
import HeroRotator from './hero-rotator';
import { getMarketingCopy, marketingClaimNeeds } from './marketing-copy';
import { getLocale } from '@/lib/locale-server';
import { claimStatus, STATUS_LABEL } from '@/lib/marketing/capabilities';

export default async function HomePage() {
  const locale = await getLocale();
  const copy = getMarketingCopy(locale);
  const cardStyles = [styles.fPink, styles.fPaper, styles.fPeach, styles.fInk];
  // B-022: each roadmap item says whether it is in limited trial or still planned; one that has shipped drops out.
  const roadmap = copy.roadmapItems.flatMap((item, index) => {
    const status = claimStatus(marketingClaimNeeds.roadmapItems[index]);
    return status === 'available' ? [] : [{ item, status }];
  });

  return (
    <main className={styles.site}>
      <MarketingHeader locale={locale} />

      <div className={styles.frame}>
        <HeroRotator locale={locale} />

        <section className={styles.intro} id="fitur">
          <div>
            <small className={styles.eyebrow}>{copy.introEyebrow}</small>
            <h2 className={styles.serifH2}>{copy.introTitle}</h2>
          </div>
          <p>{copy.introBody}</p>
        </section>

        <section className={styles.featureGrid} aria-label={copy.introEyebrow}>
          {copy.features.map((feature, i) => (
            <article key={feature.title} className={`${styles.featureCard} ${cardStyles[i]}`}>
              <span className={styles.featureIndex}>0{i + 1}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <Link href={feature.href} className={styles.textLink}>
                {copy.featureLink} <ArrowRight size={14} />
              </Link>
            </article>
          ))}
        </section>

        <section className={styles.workflow} id="cara-kerja">
          <div className={styles.workflowCopy}>
            <small className={styles.eyebrow}>{copy.guestEyebrow}</small>
            <h2 className={styles.serifH2}>{copy.guestTitle}</h2>
            <p>{copy.guestBody}</p>
            <ul>
              {copy.guestPoints.map((point) => (
                <li key={point}><CircleCheck size={17} /> {point}</li>
              ))}
            </ul>
            <Link href="/sign-up" className={styles.primaryBtn}>
              {copy.guestCta} <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.workflowVisual}>
            <div className={styles.phoneMock}>
              <div className={styles.phoneHead}>
                <small>{copy.phoneWedding}</small>
                <b>Nadya &amp; Arga</b>
                <span>18 . 10 . 2026</span>
              </div>
              <div className={styles.phoneSection}>
                <small>{copy.phoneConfirm}</small>
                <p>{copy.phoneQuestion}</p>
                <div className={styles.phoneYes}>{copy.phoneYes}</div>
                <div className={styles.phoneNo}>{copy.phoneNo}</div>
              </div>
              <div className={styles.phoneBadge}><Check size={13} /> {copy.phoneSaved}</div>
            </div>
          </div>
        </section>

        <section className={styles.pricingSection} id="harga">
          <div className={styles.pricingSectionHead}>
            <small className={styles.eyebrow}>{copy.pricingEyebrow}</small>
            <h2 className={styles.serifH2}>{copy.pricingTitle}</h2>
            <p>{copy.pricingBody}</p>
          </div>

          <div className={styles.pricingCards}>
            <div className={styles.pricingCard}>
              <small>{copy.pricingBadge}</small>
              <h3>{copy.pricingPlan}</h3>
              <div className={styles.pricingPrice}><strong>{copy.pricingDraftPrice}</strong></div>
              <p>{copy.pricingPlanBody}</p>
              <ul>{copy.pricingIncluded.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
              <Link href="/sign-up" className={styles.pricingCtaOutline}>
                {copy.tierCtaFree} <ArrowRight size={15} />
              </Link>
            </div>

            <div className={styles.pricingCard}>
              <small>{copy.tierStandardLabel}</small>
              <h3>{copy.tierStandardDesc}</h3>
              <div className={styles.pricingPrice}>
                <strong>{copy.tierStandardPrice}</strong>
                <span>{copy.tierStandardPer}</span>
              </div>
              <ul>{copy.tierStandardItems.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
              <Link href="/sign-up" className={styles.pricingCtaOutline}>
                {copy.tierCta} <ArrowRight size={15} />
              </Link>
            </div>

            <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
              <small>{copy.tierPremiumLabel}</small>
              <h3>{copy.tierPremiumDesc}</h3>
              <div className={styles.pricingPrice}>
                <strong>{copy.tierPremiumPrice}</strong>
                <span>{copy.tierPremiumPer}</span>
              </div>
              <ul>{copy.tierPremiumItems.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
              <Link href="/sign-up" className={styles.pricingCtaPrimary}>
                {copy.tierCta} <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <p className={styles.pricingNote}>{copy.pricingNote}</p>
        </section>

        <section className={styles.roadmap} aria-label={copy.roadmapEyebrow}>
          <div className={styles.roadmapHead}>
            <small className={styles.eyebrow}>{copy.roadmapEyebrow}</small>
            <h2 className={styles.serifH2}>{copy.roadmapTitle}</h2>
            <p>{copy.roadmapBody}</p>
          </div>
          <div className={styles.roadmapGrid}>
            {roadmap.map(({ item, status }) => (
              <div key={item}><span>{STATUS_LABEL[status][locale]}</span><b>{item}</b></div>
            ))}
          </div>
        </section>

        <section className={styles.ctaWrap}>
          <div className={styles.cta}>
            <span className={styles.ctaSpark}><Sparkles size={26} /></span>
            <h2 className={styles.serifH2}>{copy.ctaTitle}</h2>
            <p>{copy.ctaBody}</p>
            <Link href="/sign-up" className={styles.ctaButton}>
              {copy.ctaButton} <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </div>

      <a
        className={styles.waFloat}
        href="https://wa.me/6281234567890"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.9 4.43-9.9 9.88 0 1.74.46 3.45 1.32 4.95L2.05 22l5.3-1.38c1.45.79 3.08 1.21 4.7 1.21h.01c5.45 0 9.89-4.43 9.89-9.88 0-2.64-1.03-5.12-2.9-6.99A9.83 9.83 0 0 0 12.04 2Zm5.8 14.12c-.25.7-1.45 1.33-2.02 1.42-.52.08-1.17.11-1.88-.12-.43-.14-.99-.32-1.7-.63-3-1.29-4.95-4.3-5.1-4.5-.15-.2-1.22-1.62-1.22-3.08 0-1.47.77-2.19 1.04-2.49.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.84 2.06.92 2.21.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.45.3.15.46.12.63-.07.17-.2.72-.84.92-1.13.2-.3.39-.25.66-.15.27.1 1.72.81 2.02.96.3.15.5.22.57.35.07.12.07.72-.18 1.42Z"/></svg>
      </a>
    </main>
  );
}
