import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import styles from '../home.module.css';
import MarketingHeader from '../marketing-header';
import MarketingFooter from '../marketing-footer';
import { getMarketingCopy } from '../marketing-copy';
import { getLocale } from '@/lib/locale-server';
import { tierPriceLabel } from '@/lib/pricing';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Harga Invitesion — Bayar Sekali, Aktif 12 Bulan',
  description: `Draf dan pratinjau gratis. Aktifkan undangan dengan Standard ${tierPriceLabel('standard', 'id')} atau Premium ${tierPriceLabel('premium', 'id')}: bayar sekali, aktif 12 bulan, tanpa biaya bulanan.`,
};

export default async function PricingPage() {
  const locale = await getLocale();
  const copy = getMarketingCopy(locale);
  return (
    <main className={styles.site}>
      <MarketingHeader locale={locale} />
      <section className={styles.simplePageHero}>
        <small className={styles.eyebrow}>{copy.pricingEyebrow}</small>
        <h1>{copy.pricingTitle}</h1>
        <p>{copy.pricingBody}</p>

        <div className={styles.pricingCards} style={{ marginTop: 0 }}>
          {/* Draft & preview (not a plan: publishing needs Standard or Premium) */}
          <div className={styles.pricingCard}>
            <small>{copy.pricingBadge}</small>
            <h3>{copy.pricingPlan}</h3>
            <div className={styles.pricingPrice}>
              <strong>{copy.pricingDraftPrice}</strong>
            </div>
            <p>{copy.pricingPlanBody}</p>
            <ul>{copy.pricingIncluded.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
            <Link href="/sign-up" className={styles.pricingCtaOutline}>
              {copy.tierCtaFree} <ArrowRight size={15}/>
            </Link>
          </div>

          {/* Standard */}
          <div className={styles.pricingCard}>
            <small>{copy.tierStandardLabel}</small>
            <h3>{copy.tierStandardDesc}</h3>
            <div className={styles.pricingPrice}>
              <strong>{copy.tierStandardPrice}</strong>
              <span>{copy.tierStandardPer}</span>
            </div>
            <ul>{copy.tierStandardItems.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
            <Link href="/sign-up" className={styles.pricingCtaOutline}>
              {copy.tierCta} <ArrowRight size={15}/>
            </Link>
          </div>

          {/* Premium */}
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <small>{copy.tierPremiumLabel}</small>
            <h3>{copy.tierPremiumDesc}</h3>
            <div className={styles.pricingPrice}>
              <strong>{copy.tierPremiumPrice}</strong>
              <span>{copy.tierPremiumPer}</span>
            </div>
            <ul>{copy.tierPremiumItems.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
            <Link href="/sign-up" className={styles.pricingCtaPrimary}>
              {copy.tierCta} <ArrowRight size={15}/>
            </Link>
          </div>
        </div>

        <p className={styles.pricingNote}>{copy.pricingNote}</p>
      </section>
      <div className={styles.frame}>
        <MarketingFooter />
      </div>
    </main>
  );
}
