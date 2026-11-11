import type { Locale } from '@/lib/i18n';
import type { CapabilityId } from '@/lib/marketing/capabilities';
import { tierPriceLabel } from '@/lib/pricing';

export type HeroSlideTheme = 'wedding' | 'rsvp' | 'whatsapp' | 'party';
export type HeroSlide = { theme: HeroSlideTheme; tag: string; q: string; a: string };

export const marketingCopy = {
  id: {
    // ── Hero (rotating slides, satu tagline) ───────────────────────────
    heroPill: 'Satu platform untuk semua momen spesial',
    heroSlides: [
      { theme: 'wedding', tag: 'PERNIKAHAN', q: 'Undangan nikah yang berkesan?', a: 'Bisa. Banget.' },
      { theme: 'rsvp', tag: 'RSVP', q: 'Ratusan tamu konfirmasi?', a: 'Kekontrol rapi.' },
      { theme: 'whatsapp', tag: 'WHATSAPP', q: 'Sebar ke semua tamu?', a: 'Satu ketuk per tamu.' },
      { theme: 'party', tag: 'SEMUA ACARA', q: 'Ultah, aqiqah, reuni?', a: 'Semua jalan.' },
    ] as readonly HeroSlide[],
    heroStageAria: 'Pratinjau produk Invitesion',
    heroBody:
      'Buat halaman undangan, sebar tautan personal, dan pantau kehadiran tamu secara real-time. Semua dari satu tempat, tanpa ribet.',
    heroPrimary: 'Mulai buat draf gratis',
    heroSecondary: 'Lihat cara kerja',
    heroNote: 'Tanpa kartu kredit · Siap dalam hitungan menit',

    // ── Intro ──────────────────────────────────────────────────────────────
    introEyebrow: 'PLATFORM UNDANGAN',
    introTitle: 'Dari undangan pertama sampai tamu pulang.',
    introBody:
      'Invitesion bukan sekadar halaman undangan. Ini ruang kerja untuk membuat momen kalian terasa lebih terencana, lebih personal, dan lebih mudah dikelola.',

    // ── Features ──────────────────────────────────────────────────────────
    featureLink: 'Pelajari fitur',
    features: [
      {
        title: 'Halaman Undangan',
        text: 'Pilih tema premium, tulis cerita kalian, tambah agenda, lokasi, galeri foto, dan countdown hari-H.',
        href: '/features/online-invitations',
      },
      {
        title: 'RSVP & Form Tamu',
        text: 'Kumpulkan konfirmasi kehadiran, plus-one, dan pertanyaan khusus dalam satu alur yang rapi.',
        href: '/features/online-rsvps',
      },
      {
        title: 'Manajemen Tamu',
        text: 'Kelola daftar tamu, lihat status RSVP, dan kirim tautan personal via WhatsApp ke setiap tamu.',
        href: '/features/guest-list-management',
      },
      {
        title: 'Tema Premium',
        text: 'Koleksi tema eksklusif untuk pernikahan, ulang tahun, aqiqah, hingga acara komunitas.',
        href: '/features/event-website-builder',
      },
    ],

    // ── Guest experience ────────────────────────────────────────────────────
    guestEyebrow: 'PENGALAMAN TAMU',
    guestTitle: 'Semudah membuka tautan. Senyaman memberi kabar.',
    guestBody:
      'Tamu tidak perlu membuat akun. Mereka cukup membuka tautan personal, mengisi respons, dan semua jawabannya langsung masuk ke dashboard kalian.',
    guestPoints: [
      'Tautan unik untuk setiap tamu',
      'RSVP, plus-one & pesan untuk tuan rumah',
      'Sebar langsung via WhatsApp',
    ],
    guestCta: 'Buat undangan pertama',

    // ── Pricing ─────────────────────────────────────────────────────────────
    pricingEyebrow: 'HARGA INVITESION',
    pricingTitle: 'Bayar sekali. Aktif 12 bulan.',
    pricingBody:
      'Tidak ada langganan bulanan. Pilih tema yang paling cocok, bayar satu kali, dan undangan kalian aktif selama satu tahun penuh.',
    pricingBadge: 'COBA DULU',
    pricingPlan: 'Draf & pratinjau tanpa biaya',
    pricingDraftPrice: 'Draf gratis',
    pricingPlanBody:
      'Buat draf, pilih tema, dan lihat pratinjaunya dulu. Undangan bisa dibuka tamu setelah diaktifkan dengan paket Standard atau Premium.',
    pricingIncluded: [
      'Halaman undangan personal',
      'RSVP dan daftar tamu',
      'Agenda, lokasi & galeri',
      'Pratinjau sebelum membayar',
    ],
    pricingCta: 'Buat draf gratis',
    pricingNote:
      'Untuk kebutuhan acara khusus, hubungi tim Invitesion setelah event kalian dibuat.',
    tierStandardLabel: 'STANDARD',
    tierStandardPer: 'per undangan · aktif 12 bulan',
    tierStandardDesc: 'Satu tema pilihan, lengkap dengan semua fitur inti.',
    tierStandardItems: [
      'Undangan aktif & bisa dibagikan 12 bulan',
      '1 tema Standard pilihan',
      'Musik latar & sampul pembuka',
      'Galeri foto & video',
      'Ucapan tamu & info hadiah (rekening/QRIS)',
      'Love story & beberapa sesi acara',
    ],
    tierPremiumLabel: 'PREMIUM',
    tierPremiumPer: 'per undangan · aktif 12 bulan',
    tierPremiumDesc: 'Akses semua tema + ganti tema kapan saja.',
    tierPremiumItems: [
      'Semua fitur Standard',
      'Akses semua tema premium',
      'Ganti ke tema premium mana pun, kapan saja',
      'Prioritas dukungan',
    ],
    tierCta: 'Mulai sekarang',
    tierCtaFree: 'Buat draf dulu',

    // ── Roadmap ─────────────────────────────────────────────────────────────
    roadmapEyebrow: 'DAN TERUS BERKEMBANG',
    roadmapTitle: 'Semakin lengkap, tanpa kehilangan kesederhanaannya.',
    roadmapBody:
      'Sebagian sudah diuji terbatas, sebagian lagi masih direncanakan. Labelnya menunjukkan yang mana.',
    roadmapItems: [
      'Pengingat & kirim massal lewat WhatsApp resmi',
      'Log meja, suvenir & hadiah',
      'Check-in QR tamu',
      'Workspace & kredit untuk reseller',
    ],

    // ── CTA ────────────────────────────────────────────────────────────────
    ctaTitle: 'Momen istimewa kalian layak dirayakan dengan indah.',
    ctaBody: 'Mulai dari draf gratis. Bayar sekali saat undangan siap dibagikan.',
    ctaButton: 'Mulai buat draf gratis',

    // ── Footer ──────────────────────────────────────────────────────────────
    footerTagline: 'Undangan digital yang membantu kabar baik sampai dengan baik.',
    footProduct: 'Produk',
    footHelp: 'Bantuan',
    footAccount: 'Akun & Legal',
    linkAllFeatures: 'Semua fitur',
    linkAllEvents: 'Jenis acara',
    linkPricing: 'Harga',
    linkHow: 'Cara kerja',
    linkHelp: 'Pusat bantuan',
    linkFaq: 'FAQ',
    linkContact: 'Kontak',
    linkPrivacy: 'Privasi & keamanan',
    linkSignIn: 'Masuk',
    linkSignUp: 'Daftar gratis',
    footMeta: [
      { icon: '🇮🇩', text: 'Dibuat di Indonesia' },
      { icon: '💳', text: 'Bayar sekali per undangan' },
      { icon: '📅', text: 'Aktif 12 bulan penuh' },
    ],
    footerRights: '© 2026 Invitesion. Dibuat dengan ❤️ di Indonesia.',

    // ── Workflow phone mock ─────────────────────────────────────────────────
    phoneWedding: 'THE WEDDING OF',
    phoneConfirm: 'Konfirmasi kehadiran',
    phoneQuestion: 'Apakah kamu bisa hadir?',
    phoneYes: 'Ya, saya hadir ✓',
    phoneNo: 'Maaf, belum bisa',
    phoneSaved: 'RSVP tersimpan',
  },

  en: {
    heroPill: 'One platform for every special moment',
    heroSlides: [
      { theme: 'wedding', tag: 'WEDDINGS', q: 'A wedding invitation to remember?', a: 'Absolutely.' },
      { theme: 'rsvp', tag: 'RSVP', q: 'Hundreds of guest confirmations?', a: 'Under control.' },
      { theme: 'whatsapp', tag: 'WHATSAPP', q: 'Share it with every guest?', a: 'One tap per guest.' },
      { theme: 'party', tag: 'EVERY EVENT', q: 'Birthdays, aqiqah, reunions?', a: 'All covered.' },
    ] as readonly HeroSlide[],
    heroStageAria: 'Invitesion product preview',
    heroBody:
      'Build your invitation page, share personal links, and watch attendance in real time. All from one place, without the hassle.',
    heroPrimary: 'Start a free draft',
    heroSecondary: 'See how it works',
    heroNote: 'No credit card · Ready in minutes',
    introEyebrow: 'INVITATION PLATFORM',
    introTitle: 'From the first invitation to the last guest home.',
    introBody:
      'Invitesion is more than an invitation page. It is a workspace that makes your event feel better planned, more personal, and easier to manage.',
    featureLink: 'Explore feature',
    features: [
      {
        title: 'Invitation Page',
        text: 'Choose a premium theme, write your story, add schedule, venue, photo gallery, and a countdown to the big day.',
        href: '/features/online-invitations',
      },
      {
        title: 'RSVP & Guest Forms',
        text: 'Collect confirmations, plus-ones, and custom questions in one clean flow.',
        href: '/features/online-rsvps',
      },
      {
        title: 'Guest Management',
        text: 'Manage your guest list, track RSVP status, and send personal WhatsApp links to each guest.',
        href: '/features/guest-list-management',
      },
      {
        title: 'Premium Themes',
        text: 'An exclusive theme collection for weddings, birthdays, aqiqah, and community events.',
        href: '/features/event-website-builder',
      },
    ],
    guestEyebrow: 'GUEST EXPERIENCE',
    guestTitle: 'As easy as opening a link. As comfortable as replying.',
    guestBody:
      'Guests never need an account. They open their personal link, fill in their response, and every answer lands straight in your dashboard.',
    guestPoints: [
      'Unique link for every guest',
      'RSVP, plus-ones & a message for the host',
      'Share directly via WhatsApp',
    ],
    guestCta: 'Create your first invitation',
    pricingEyebrow: 'INVITESION PRICING',
    pricingTitle: 'Pay once. Active for 12 months.',
    pricingBody:
      'No monthly subscription. Pick the theme that fits, pay once, and your invitation stays live for a full year.',
    pricingBadge: 'TRY FIRST',
    pricingPlan: 'Draft and preview at no cost',
    pricingDraftPrice: 'Free draft',
    pricingPlanBody: 'Create a draft, pick a theme and preview it first. Guests can open the invitation once it is activated with Standard or Premium.',
    pricingIncluded: [
      'Personal invitation page',
      'RSVP and guest list',
      'Schedule, venue & gallery',
      'Preview before you pay',
    ],
    pricingCta: 'Start a free draft',
    pricingNote: 'For specialised event needs, talk to the Invitesion team once your event is created.',
    tierStandardLabel: 'STANDARD',
    tierStandardPer: 'per invitation · active 12 months',
    tierStandardDesc: 'One chosen theme, full feature set.',
    tierStandardItems: [
      'Live, shareable invitation for 12 months',
      '1 Standard theme of your choice',
      'Background music & opening cover',
      'Photo & video gallery',
      'Guest wishes & gift details (bank/QRIS)',
      'Love story & multiple event sessions',
    ],
    tierPremiumLabel: 'PREMIUM',
    tierPremiumPer: 'per invitation · active 12 months',
    tierPremiumDesc: 'All themes unlocked + switch anytime.',
    tierPremiumItems: [
      'All Standard features',
      'Access to all premium themes',
      'Switch to any premium theme, anytime',
      'Priority support',
    ],
    tierCta: 'Get started',
    tierCtaFree: 'Start with a draft',
    roadmapEyebrow: 'AND STILL GROWING',
    roadmapTitle: 'More complete, without losing its simplicity.',
    roadmapBody: 'Some are in limited trial, others are still planned. The labels say which.',
    roadmapItems: [
      'WhatsApp reminders & bulk sending (official API)',
      'Table, souvenir & gift logs',
      'Guest QR check-in',
      'Reseller workspace & credits',
    ],
    ctaTitle: 'Your special moment deserves to be celebrated beautifully.',
    ctaBody: 'Start with a free draft. Pay once when your invitation is ready to share.',
    ctaButton: 'Start a free draft',
    footerTagline: 'The invitation platform that helps good news arrive well.',
    footProduct: 'Product',
    footHelp: 'Support',
    footAccount: 'Account & Legal',
    linkAllFeatures: 'All features',
    linkAllEvents: 'Event types',
    linkPricing: 'Pricing',
    linkHow: 'How it works',
    linkHelp: 'Help Center',
    linkFaq: 'FAQ',
    linkContact: 'Contact',
    linkPrivacy: 'Privacy & security',
    linkSignIn: 'Sign in',
    linkSignUp: 'Sign up free',
    footMeta: [
      { icon: '🇮🇩', text: 'Made in Indonesia' },
      { icon: '💳', text: 'One-time payment per invitation' },
      { icon: '📅', text: 'Active for 12 full months' },
    ],
    footerRights: '© 2026 Invitesion. Made with ❤️ in Indonesia.',
    phoneWedding: 'THE WEDDING OF',
    phoneConfirm: 'Confirm attendance',
    phoneQuestion: 'Can you make it?',
    phoneYes: 'Yes, I will be there ✓',
    phoneNo: 'Sorry, I cannot',
    phoneSaved: 'RSVP saved',
  },
} as const satisfies Record<Locale, unknown>;

/**
 * B-022: the capabilities behind each list item in `marketingCopy`, index for index and shared by both locales.
 * `tests/b022-claims.test.ts` requires every item to be available, except roadmap items, which must not be yet; the
 * homepage labels each roadmap item from its status and drops one that has shipped.
 */
export const marketingClaimNeeds = {
  heroSlides: [['themeCatalog', 'invitationPage'], ['rsvp', 'insights'], ['whatsappLinks', 'personalLinks'], ['themeCatalog', 'eventDetails']],
  features: [['themeCatalog', 'loveStory', 'eventDetails', 'mapLink', 'gallery', 'countdownCalendar'], ['rsvp', 'rsvpQuestions'], ['guestList', 'whatsappLinks', 'personalLinks'], ['themeCatalog']],
  guestPoints: [['personalLinks'], ['rsvp', 'wishes'], ['whatsappLinks']],
  pricingIncluded: [['invitationPage', 'draftPreview'], ['rsvp', 'guestList'], ['eventDetails', 'mapLink', 'gallery'], ['draftPreview']],
  tierStandardItems: [['invitationPage'], ['themeCatalog', 'themeSwitch'], ['music'], ['gallery', 'videoEmbeds'], ['wishes', 'giftAccounts'], ['loveStory', 'eventDetails']],
  tierPremiumItems: [['invitationPage'], ['themeCatalog'], ['themeSwitch'], ['supportEmail']],
  roadmapItems: [['whatsappAutomation'], ['seatingLog', 'giftLog'], ['guestPass', 'checkInScanner'], ['resellerWorkspace', 'workspaceCredits']],
} as const satisfies Record<string, readonly (readonly CapabilityId[])[]>;

/** Copy for one locale; tier prices come from `lib/pricing.ts` so they always equal what checkout charges (B-002). */
export function getMarketingCopy(locale: Locale) {
  return {
    ...marketingCopy[locale],
    tierStandardPrice: tierPriceLabel('standard', locale),
    tierPremiumPrice: tierPriceLabel('premium', locale),
  };
}
