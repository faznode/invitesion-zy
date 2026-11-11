import type { Locale } from '@/lib/i18n';

/** G-061: the help centre's own strings; the articles carry their copy in `lib/help/articles.ts`. */
export const HELP_COPY: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    intro: string;
    read: string;
    empty: string;
    contactLead: string;
    contactLink: string;
    breadcrumbLabel: string;
    resources: string;
    steps: string;
    notes: string;
    related: string;
    back: string;
    metaDescription: string;
  }
> = {
  id: {
    eyebrow: 'Pusat bantuan',
    title: 'Panduan langkah demi langkah',
    intro: 'Panduan singkat untuk fitur yang sudah tersedia. Nama tombol dan menu ditulis persis seperti di aplikasi.',
    read: 'Baca panduan',
    empty: 'Belum ada panduan yang terbit.',
    contactLead: 'Masih butuh bantuan? Tulis ke',
    contactLink: 'hello@invitesion.id',
    breadcrumbLabel: 'Lokasi halaman',
    resources: 'Resource',
    steps: 'Langkah',
    notes: 'Perlu diketahui',
    related: 'Panduan terkait',
    back: 'Kembali ke pusat bantuan',
    metaDescription: 'Panduan Invitesion: membuat undangan, menambah tamu, mengirim tautan personal, memantau RSVP dan mengelola ucapan.',
  },
  en: {
    eyebrow: 'Help centre',
    title: 'Step-by-step guides',
    intro: 'Short guides for features that are available today. Button and menu names are written exactly as they appear in the app.',
    read: 'Read the guide',
    empty: 'No guide has been published yet.',
    contactLead: 'Still need help? Write to',
    contactLink: 'hello@invitesion.id',
    breadcrumbLabel: 'Breadcrumb',
    resources: 'Resources',
    steps: 'Steps',
    notes: 'Good to know',
    related: 'Related guides',
    back: 'Back to the help centre',
    metaDescription: 'Invitesion guides: create an invitation, add guests, send personal links, follow RSVPs and manage wishes.',
  },
};

export const SUPPORT_MAILTO = 'mailto:hello@invitesion.id';
