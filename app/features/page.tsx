import type { Metadata } from 'next';
import { marketingPages } from '../marketing-registry';
import { MarketingIndexPage } from '../marketing-public-page';

export const metadata: Metadata = {
  title: 'Fitur — Invitesion',
  description: 'Fitur Invitesion yang tersedia hari ini, yang sedang diuji terbatas, dan yang belum tersedia.',
};

export default function Page() {
  return (
    <MarketingIndexPage
      category="features"
      eyebrow="FITUR INVITESION"
      title="Semua fitur dalam satu alur."
      intro="Fitur yang tersedia tampil lebih dulu. Fitur yang masih diuji terbatas atau belum tersedia diberi label supaya kamu tahu persis apa yang bisa dipakai hari ini."
      linkLabel="Pelajari"
      pages={marketingPages.features}
    />
  );
}
