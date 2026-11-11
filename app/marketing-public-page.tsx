import Link from 'next/link';
import MarketingHeader from './marketing-header';
import MarketingFooter from './marketing-footer';
import { marketingHref, type MarketingCategory, type MarketingPage } from './marketing-registry';
import { STATUS_LABEL, type ClaimStatus } from '@/lib/marketing/capabilities';
import { getLocale } from '@/lib/locale-server';
import styles from './home.module.css';

const STATUS_ORDER: Record<ClaimStatus, number> = { available: 0, conditional: 1, roadmap: 2, unsupported: 3 };

function StatusLabel({ status, className }: { status: ClaimStatus; className: string }) {
  if (status === 'available') return null;
  return <small className={className} data-status={status}>{STATUS_LABEL[status].id}</small>;
}

export async function MarketingDetailPage({ page }: { page: MarketingPage }) {
  const locale = await getLocale();
  const offersSignUp = page.status === 'available' || page.status === 'conditional';
  return (
    <main className={styles.site}>
      <MarketingHeader locale={locale} />
      <article className={styles.simplePageHero}>
        <small className={styles.eyebrow}>{page.eyebrow}</small>
        <h1>{page.title}</h1>
        <StatusLabel status={page.status} className={styles.statusBadge} />
        <p>{page.summary}</p>
        <section className={styles.resourceCards} aria-label={`Keunggulan ${page.title}`}>
          {page.highlights.map((highlight, index) => (
            <div key={highlight.title}>
              <span>0{index + 1}</span>
              <h2>{highlight.title}</h2>
              <StatusLabel status={highlight.status} className={styles.claimLabel} />
              <p>{highlight.text}</p>
            </div>
          ))}
        </section>
        {offersSignUp ? (
          <Link href="/sign-up" className={styles.primaryBtn}>Mulai buat undangan <span aria-hidden="true">→</span></Link>
        ) : (
          <Link href="/features" className={styles.primaryBtn}>Lihat fitur yang tersedia <span aria-hidden="true">→</span></Link>
        )}
      </article>
      <div className={styles.frame}>
        <MarketingFooter />
      </div>
    </main>
  );
}

export async function MarketingIndexPage({ category, eyebrow, title, intro, linkLabel, pages }: {
  category: MarketingCategory;
  eyebrow: string;
  title: string;
  intro: string;
  linkLabel: string;
  pages: readonly MarketingPage[];
}) {
  const locale = await getLocale();
  const ordered = [...pages].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return (
    <main className={styles.site}>
      <MarketingHeader locale={locale} />
      <section className={styles.simplePageHero}>
        <small className={styles.eyebrow}>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className={styles.resourceCards}>
          {ordered.map((page) => (
            <article key={page.slug}>
              <h2>{page.title}</h2>
              <StatusLabel status={page.status} className={styles.claimLabel} />
              <p>{page.summary}</p>
              <Link href={marketingHref(category, page.title)}>{linkLabel} <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </div>
      </section>
      <div className={styles.frame}>
        <MarketingFooter />
      </div>
    </main>
  );
}
