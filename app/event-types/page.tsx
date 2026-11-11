import type { Metadata } from 'next';
import { marketingPages } from '../marketing-registry';
import { MarketingIndexPage } from '../marketing-public-page';

export const metadata: Metadata = {
  title: 'Jenis acara — Invitesion',
  description: 'Undangan digital, tautan personal, dan RSVP untuk pernikahan, acara keluarga, komunitas, dan bisnis.',
};

export default function Page() {
  return (
    <MarketingIndexPage
      category="event-types"
      eyebrow="JENIS ACARA"
      title="Jenis acara untuk setiap momen."
      intro="Pilih kebutuhan Anda dan temukan halaman khusus dengan alur yang relevan."
      linkLabel="Pelajari"
      pages={marketingPages['event-types']}
    />
  );
}
