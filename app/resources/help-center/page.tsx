import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import MarketingFooter from '../../marketing-footer';
import MarketingHeader from '../../marketing-header';
import styles from '../../home.module.css';
import { HELP_TOPICS, publishedHelpArticles, type HelpArticle, type HelpTopic } from '@/lib/help/articles';
import { getLocale } from '@/lib/locale-server';
import { HELP_COPY, SUPPORT_MAILTO } from './help-copy';
import help from './help.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const copy = HELP_COPY[await getLocale()];
  return { title: `${copy.eyebrow} — Invitesion`, description: copy.metaDescription };
}

/**
 * G-061: the help centre. It lists only the published articles (`publishedHelpArticles`: every capability an article
 * describes is available in this deployment), grouped by topic; a topic without a published article is left out.
 */
export default async function HelpCentrePage() {
  const locale = await getLocale();
  const copy = HELP_COPY[locale];
  const articles = publishedHelpArticles();
  const topics = (Object.keys(HELP_TOPICS) as HelpTopic[])
    .map((topic) => ({ topic, articles: articles.filter((article) => article.topic === topic) }))
    .filter((group) => group.articles.length > 0);

  return (
    <main className={styles.site}>
      <MarketingHeader locale={locale} />
      <div className={help.page}>
        <small className={styles.eyebrow}>{copy.eyebrow}</small>
        <h1 className={help.title}>{copy.title}</h1>
        <p className={help.intro}>{copy.intro}</p>
        {topics.length === 0 ? <p>{copy.empty}</p> : null}
        <div className={help.topics}>
          {topics.map(({ topic, articles: inTopic }) => (
            <section key={topic} aria-labelledby={`topic-${topic}`}>
              <h2 id={`topic-${topic}`} className={help.topicHeading}>
                {HELP_TOPICS[topic][locale]}
              </h2>
              <ul className={help.cards}>
                {inTopic.map((article) => (
                  <li key={article.slug}>
                    <ArticleCard article={article} locale={locale} readLabel={copy.read} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className={help.contact}>
          {copy.contactLead} <a href={SUPPORT_MAILTO}>{copy.contactLink}</a>.
        </p>
      </div>
      <div className={styles.frame}>
        <MarketingFooter />
      </div>
    </main>
  );
}

function ArticleCard({ article, locale, readLabel }: { article: HelpArticle; locale: 'id' | 'en'; readLabel: string }) {
  const { title, summary } = article.copy[locale];
  return (
    <Link href={`/resources/help-center/${article.slug}`} className={help.card}>
      <span className={help.cardTitle}>{title}</span>
      <span className={help.cardText}>{summary}</span>
      <span className={help.cardMore} aria-hidden="true">
        {readLabel}
        <ArrowRight size={16} strokeWidth={2.25} />
      </span>
    </Link>
  );
}
