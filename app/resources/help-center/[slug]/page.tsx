import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import MarketingFooter from '../../../marketing-footer';
import MarketingHeader from '../../../marketing-header';
import styles from '../../../home.module.css';
import { HELP_TOPICS, publishedHelpArticle, publishedHelpArticles } from '@/lib/help/articles';
import { getLocale } from '@/lib/locale-server';
import { HELP_COPY, SUPPORT_MAILTO } from '../help-copy';
import help from '../help.module.css';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = publishedHelpArticle((await params).slug);
  if (!article) return { robots: { index: false, follow: false } };
  const { title, summary } = article.copy[await getLocale()];
  return { title: `${title} — Invitesion`, description: summary };
}

/**
 * G-061: one help article. An article that is not published in this deployment (a capability it describes is not
 * available here, or it was removed) answers 404 like any unknown slug.
 */
export default async function HelpArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = publishedHelpArticle(slug);
  if (!article) notFound();
  const locale = await getLocale();
  const copy = HELP_COPY[locale];
  const body = article.copy[locale];
  const related = publishedHelpArticles().filter((other) => other.topic === article.topic && other.slug !== article.slug);

  return (
    <main className={styles.site}>
      <MarketingHeader locale={locale} />
      <article className={help.article} aria-labelledby="article-title">
        <nav aria-label={copy.breadcrumbLabel} className={help.breadcrumb}>
          <ol>
            <li>
              <Link href="/resources">{copy.resources}</Link>
            </li>
            <li>
              <Link href="/resources/help-center">{copy.eyebrow}</Link>
            </li>
            <li aria-current="page">{body.title}</li>
          </ol>
        </nav>
        <small className={styles.eyebrow}>{HELP_TOPICS[article.topic][locale]}</small>
        <h1 id="article-title" className={help.title}>
          {body.title}
        </h1>
        <p className={help.summary}>{body.summary}</p>

        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading" className={help.sectionHeading}>
            {copy.steps}
          </h2>
          <ol className={help.steps}>
            {body.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {body.notes && body.notes.length > 0 ? (
          <section aria-labelledby="notes-heading">
            <h2 id="notes-heading" className={help.sectionHeading}>
              {copy.notes}
            </h2>
            <ul className={help.notes}>
              {body.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length > 0 ? (
          <nav aria-labelledby="related-heading">
            <h2 id="related-heading" className={help.sectionHeading}>
              {copy.related}
            </h2>
            <ul className={help.related}>
              {related.map((other) => (
                <li key={other.slug}>
                  <Link href={`/resources/help-center/${other.slug}`}>{other.copy[locale].title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <p className={help.contact}>
          {copy.contactLead} <a href={SUPPORT_MAILTO}>{copy.contactLink}</a>.
        </p>
        <Link href="/resources/help-center" className={help.back}>
          <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
          {copy.back}
        </Link>
      </article>
      <div className={styles.frame}>
        <MarketingFooter />
      </div>
    </main>
  );
}
