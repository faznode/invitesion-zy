import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isFlagOn } from '@/lib/flags';
import { getTemplateBySlug } from '@/lib/invitation/templates';
import { getLocale } from '@/lib/locale-server';
import PreviewClient from './preview-client';

/**
 * Preview tema tanpa login, meniru undangan digital sungguhan.
 * Mendukung ?to=Nama+Tamu untuk personalisasi gate — sama seperti
 * link undangan asli yang dibagikan ke tamu.
 */

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ to?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const template = getTemplateBySlug(slug);
  return {
    title: template ? `${template.name} — Preview Tema | Invitesion` : 'Preview Tema | Invitesion',
    description: template?.tagline.id,
  };
}

export default async function TemplatePreviewPage({ params, searchParams }: PageProps) {
  const [{ slug }, { to }] = await Promise.all([params, searchParams]);
  const template = getTemplateBySlug(slug);
  if (!template) notFound();
  const locale = await getLocale();
  const guestName = typeof to === 'string' && to.trim() ? to.trim().slice(0, 60) : null;

  return (
    <PreviewClient
      template={template}
      locale={locale === 'en' ? 'en' : 'id'}
      guestName={guestName}
      wizard={isFlagOn('CREATION_WIZARD')}
    />
  );
}
