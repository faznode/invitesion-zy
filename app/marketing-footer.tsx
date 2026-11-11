import Link from 'next/link';
import styles from './home.module.css';
import { getMarketingCopy } from './marketing-copy';
import { getLocale } from '@/lib/locale-server';

/**
 * Shared site footer for every marketing page. Reads the resolved locale on
 * the server so subpages stay in sync with the header language.
 */
export default async function MarketingFooter() {
  const locale = await getLocale();
  const copy = getMarketingCopy(locale);
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}>
          <span className={styles.logo}>invitesion<b>.</b></span>
          <p>{copy.footerTagline}</p>
        </div>
        <nav className={styles.footerLinks} aria-label="Footer">
          <div>
            <h2>{copy.footProduct}</h2>
            <Link href="/features">{copy.linkAllFeatures}</Link>
            <Link href="/event-types">{copy.linkAllEvents}</Link>
            <Link href="/pricing">{copy.linkPricing}</Link>
            <a href="/#cara-kerja">{copy.linkHow}</a>
          </div>
          <div>
            <h2>{copy.footHelp}</h2>
            <Link href="/resources/help-center">{copy.linkHelp}</Link>
            <Link href="/resources/faq">{copy.linkFaq}</Link>
            <a href="mailto:hello@invitesion.id">{copy.linkContact}</a>
          </div>
          <div>
            <h2>{copy.footAccount}</h2>
            <Link href="/sign-in">{copy.linkSignIn}</Link>
            <Link href="/sign-up">{copy.linkSignUp}</Link>
            <Link href="/resources/privacy-and-security">{copy.linkPrivacy}</Link>
          </div>
        </nav>
      </div>
      <div className={styles.footerBottom}>{copy.footerRights}</div>
    </footer>
  );
}
