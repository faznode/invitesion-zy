import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMarketingPage, marketingPageMetadata, marketingPages } from '../../marketing-registry';
import { MarketingDetailPage } from '../../marketing-public-page';

export const dynamicParams = false;
/** `help-center` has its own route (G-061, `app/resources/help-center`), which takes precedence over this segment. */
const OWN_ROUTES = new Set(['help-center']);
export function generateStaticParams() { return marketingPages['resources'].filter(({ slug }) => !OWN_ROUTES.has(slug)).map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = getMarketingPage('resources', (await params).slug);
  return page ? marketingPageMetadata(page) : {};
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getMarketingPage('resources', slug);
  if (!page) notFound();
  return <MarketingDetailPage page={page} />;
}
