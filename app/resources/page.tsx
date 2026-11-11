import type { Metadata } from 'next';
import { marketingPages } from '../marketing-registry';
import { MarketingIndexPage } from '../marketing-public-page';

export const metadata: Metadata = {
  title: 'Resource — Invitesion',
  description: 'FAQ, privasi dan keamanan, serta cara menghubungi tim Invitesion.',
};

export default function ResourcesPage() {
  return (
    <MarketingIndexPage
      category="resources"
      eyebrow="INVITESION RESOURCE"
      title="Rencanakan acara dengan lebih tenang."
      intro="FAQ, privasi dan keamanan, serta kontak tim. Halaman yang isinya belum dipublikasikan diberi label."
      linkLabel="Buka halaman"
      pages={marketingPages.resources}
    />
  );
}
