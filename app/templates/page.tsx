import type { Metadata } from 'next';
import MarketingHeader from '../marketing-header';
import MarketingFooter from '../marketing-footer';
import { isFlagOn } from '@/lib/flags';
import { getLocale } from '@/lib/locale-server';
import CatalogClient from './catalog-client';
import home from '../home.module.css';

export const metadata: Metadata = {
  title: 'Katalog Tema Undangan · Invitesion',
  description:
    'Puluhan tema undangan digital siap pakai — pernikahan, ulang tahun, aqiqah, korporat, dan lainnya. Semua berbasis preset JSON yang bisa dikustomisasi penuh.',
};

export default async function TemplatesPage() {
  const locale = await getLocale();
  return (
    <div className={home.site}>
      <MarketingHeader locale={locale} />
      <CatalogClient locale={locale} wizard={isFlagOn('CREATION_WIZARD')} />
      <MarketingFooter />
    </div>
  );
}
