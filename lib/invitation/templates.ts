import { detailConfigSchema, type DetailConfig } from './detail-config';
import { paletteHex } from './palettes';

/**
 * Invitation template catalog.
 *
 * Competitor scan (Jul 2026 — WebNikah, Wevitation, Satumomen, Katsudoto,
 * Paperless Post, Greenvelope, RSVPify): local players win on catalog breadth
 * and category filters, global players on strong per-theme art direction,
 * style filters, and event-type coverage far beyond weddings. This catalog
 * does all three — broad, filterable, general-purpose, and every template is
 * an opinionated art direction instead of a palette swap.
 *
 * The contract with the backend is deliberately boring: every entry is plain
 * JSON-serialisable data, and `preset` is validated through
 * `detailConfigSchema` at module load, so it can be copied straight into the
 * invitation `config` column and the public renderer picks it up with zero
 * extra wiring. `id` maps to `config.theme.templateId` and `paletteId` to
 * `config.theme.paletteId` — every palette id below is also registered in
 * `components/invitation/public-renderer.tsx`.
 */

export type TemplateCategory =
  | 'wedding'
  | 'anniversary'
  | 'bridal-shower'
  | 'birthday'
  | 'aqiqah-khitanan'
  | 'syukuran'
  | 'baby-shower'
  | 'graduation'
  | 'reunion'
  | 'holiday-gathering'
  | 'corporate'
  | 'gender-reveal'
  | 'tahlilan'
  | 'retirement'
  | 'product-launch'
  | 'conference'
  | 'tradeshow'
  | 'sales-kickoff'
  | 'workshop'
  | 'networking'
  | 'team-building'
  | 'investor-meeting'
  | 'gala'
  | 'client-vip'
  | 'employee-appreciation'
  | 'shows'
  | 'community-event';

export type TemplateStyleTag =
  | 'elegant'
  | 'minimal'
  | 'floral'
  | 'boho'
  | 'luxury'
  | 'playful'
  | 'islamic'
  | 'vintage'
  | 'modern'
  | 'illustrated'
  | 'bold'
  | 'watercolor';

/** Drives the pure-CSS ornament on the catalog preview card. */
export type TemplateMotif =
  | 'arch'
  | 'floral'
  | 'deco'
  | 'confetti'
  | 'stars'
  | 'waves'
  | 'monogram'
  | 'botanical'
  | 'crescent'
  | 'geometric'
  | 'balloons'
  | 'rings';

export type TemplateTier = 'free' | 'premium' | 'signature';
export type TemplateFont = 'serif' | 'sans';

export type TemplatePalette = { bg: string; ink: string; accent: string; soft: string };

/**
 * The catalog card's accent per palette: the hues from before B-016's contrast solver, lighter than the guest page's
 * text-safe accents in `palettes.ts`. The card draws them as keylines and petals only, never as text. G-062 (session 44)
 * proved bg, ink and soft identical in all 18 palettes and dropped that copy; 15 of the 18 accents differ, so this
 * table stays until the catalog's accent is a design decision (`tests/g062-catalog-manifest.test.ts` pins the output).
 */
const CARD_ACCENTS: Record<string, string> = {
  ivory: '#a1743c',
  'rose-gold': '#b76e79',
  confetti: '#e2653f',
  sage: '#5f7d63',
  sand: '#9a7a4f',
  slate: '#3f6fa8',
  midnight: '#d3b16a',
  terracotta: '#bd5f34',
  orchid: '#8e5a9e',
  emerald: '#1f6f50',
  dusk: '#6a5acd',
  mocha: '#8a6248',
  ocean: '#2a7f9e',
  blossom: '#d26d85',
  'gold-noir': '#caa353',
  lavender: '#7d6bb3',
  mint: '#3e8e6b',
  sunshine: '#d98e04',
};

/** The catalog card's palette: the guest page's own surface, ink and soft tone (`palettes.ts`), with the card accent. */
export const templatePalettes: Record<string, TemplatePalette> = Object.fromEntries(
  Object.entries(CARD_ACCENTS).map(([id, accent]) => {
    const { bg, ink, soft } = paletteHex(id);
    return [id, { bg, ink, accent, soft }];
  }),
);

export const templateCategoryLabels: Record<TemplateCategory, { id: string; en: string }> = {
  wedding: { id: 'Pernikahan', en: 'Wedding' },
  anniversary: { id: 'Anniversary', en: 'Anniversary' },
  'bridal-shower': { id: 'Bridal shower', en: 'Bridal shower' },
  birthday: { id: 'Ulang tahun', en: 'Birthday' },
  'aqiqah-khitanan': { id: 'Aqiqah & Khitanan', en: 'Aqiqah & Khitanan' },
  syukuran: { id: 'Syukuran', en: 'Thanksgiving' },
  'baby-shower': { id: 'Baby shower', en: 'Baby shower' },
  graduation: { id: 'Wisuda', en: 'Graduation' },
  reunion: { id: 'Reuni', en: 'Reunion' },
  'holiday-gathering': { id: 'Hari raya', en: 'Holiday' },
  corporate: { id: 'Korporat', en: 'Corporate' },
  'gender-reveal': { id: 'Gender reveal', en: 'Gender reveal' },
  tahlilan: { id: 'Tahlilan & Doa', en: 'Memorial' },
  retirement: { id: 'Purnabakti', en: 'Retirement' },
  'product-launch': { id: 'Launching & Brand', en: 'Launch' },
  conference: { id: 'Konferensi & Summit', en: 'Conference' },
  tradeshow: { id: 'Pameran & Expo', en: 'Tradeshow' },
  'sales-kickoff': { id: 'Sales Kickoff', en: 'Sales kickoff' },
  workshop: { id: 'Workshop & Training', en: 'Workshop' },
  networking: { id: 'Networking', en: 'Networking' },
  'team-building': { id: 'Team Building', en: 'Team building' },
  'investor-meeting': { id: 'Investor & RUPS', en: 'Investor' },
  gala: { id: 'Gala & Fundraising', en: 'Gala' },
  'client-vip': { id: 'Klien & VIP', en: 'Client & VIP' },
  'employee-appreciation': { id: 'Apresiasi Karyawan', en: 'Employee' },
  shows: { id: 'Pertunjukan', en: 'Shows' },
  'community-event': { id: 'Komunitas', en: 'Community' },
};

export const templateStyleTagLabels: Record<TemplateStyleTag, { id: string; en: string }> = {
  elegant: { id: 'Elegan', en: 'Elegant' },
  minimal: { id: 'Minimal', en: 'Minimal' },
  floral: { id: 'Floral', en: 'Floral' },
  boho: { id: 'Boho', en: 'Boho' },
  luxury: { id: 'Mewah', en: 'Luxury' },
  playful: { id: 'Ceria', en: 'Playful' },
  islamic: { id: 'Islami', en: 'Islamic' },
  vintage: { id: 'Vintage', en: 'Vintage' },
  modern: { id: 'Modern', en: 'Modern' },
  illustrated: { id: 'Ilustrasi', en: 'Illustrated' },
  bold: { id: 'Bold', en: 'Bold' },
  watercolor: { id: 'Cat air', en: 'Watercolor' },
};

export type InvitationTemplate = {
  /** Maps to config.theme.templateId. */
  id: number;
  slug: string;
  name: string;
  tagline: { id: string; en: string };
  category: TemplateCategory;
  styleTags: TemplateStyleTag[];
  motif: TemplateMotif;
  tier: TemplateTier;
  paletteId: string;
  palette: TemplatePalette;
  font: TemplateFont;
  /** Placeholder copy rendered on the preview card. */
  sample: { eyebrow: string; names: string; date: string };
  /** Backend-ready starting config, validated against detailConfigSchema. */
  preset: DetailConfig;
};

type TemplateSeed = Omit<InvitationTemplate, 'palette' | 'preset'> & {
  /** Section-level overrides shallow-merged over the category base preset. */
  presetOverrides?: Record<string, unknown>;
};

/**
 * Category defaults keep every preset honest about what the public renderer
 * can actually display today: greetings, quote, events, story, gallery,
 * gift, RSVP, guestbook and music. Anything richer stays in the editor.
 * Business-formal categories share one English base preset.
 *
 * No religious text lives here (scripture quotes, prayers): it may only come
 * from the owner-approved corpus in content/verified-religious-texts (ADR-O04,
 * B-003), and tests/p0-trust-fixes.test.ts fails any preset that carries it.
 */
function basePreset(seed: TemplateSeed): Record<string, unknown> {
  const theme = { templateId: seed.id, paletteId: seed.paletteId, cover: { headline: seed.sample.eyebrow } };
  const common = { theme, events: [] as unknown[], rsvp: { enabled: true } };
  switch (seed.category) {
    case 'wedding':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Tanpa mengurangi rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir di hari bahagia kami.' },
        greetings: { enabled: true },
        story: { enabled: true, items: [] },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        gift: { enabled: true, accounts: [] },
        guestbook: { enabled: true, heading: 'Ucapan & Doa' },
        music: { enabled: true },
      };
    case 'anniversary':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Dengan penuh syukur, kami mengundang Bapak/Ibu/Saudara/i untuk merayakan hari jadi pernikahan kami.' },
        greetings: { enabled: true },
        story: { enabled: true, items: [] },
        gallery: { enabled: true, layout: 'masonry', assetIds: [] },
        guestbook: { enabled: true, heading: 'Ucapan & Doa' },
        music: { enabled: true },
      };
    case 'bridal-shower':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Sebelum hari bahagianya tiba, mari rayakan sang calon pengantin.' },
        gallery: { enabled: true, layout: 'carousel', assetIds: [] },
        guestbook: { enabled: true, heading: 'Pesan untuk Calon Pengantin' },
      };
    case 'birthday':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Yuk, rayakan hari istimewa ini bersama kami!' },
        gallery: { enabled: true, layout: 'carousel', assetIds: [] },
        guestbook: { enabled: true, heading: 'Ucapan Ulang Tahun' },
        music: { enabled: true },
      };
    case 'aqiqah-khitanan':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Dengan memohon rahmat dan ridha Allah SWT, kami bermaksud menyelenggarakan tasyakuran.' },
        greetings: { enabled: true },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: true, heading: 'Doa & Ucapan' },
      };
    case 'syukuran':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Dengan penuh rasa syukur, kami mengundang Bapak/Ibu/Saudara/i hadir dalam acara syukuran kami.' },
        greetings: { enabled: true },
        guestbook: { enabled: true, heading: 'Doa & Ucapan' },
      };
    case 'baby-shower':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Menyambut kehadiran buah hati, kami mengundangmu berbagi doa dan kebahagiaan.' },
        greetings: { enabled: true },
        gallery: { enabled: true, layout: 'carousel', assetIds: [] },
        guestbook: { enabled: true, heading: 'Ucapan untuk Si Kecil' },
      };
    case 'graduation':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Satu babak selesai. Rayakan kelulusan ini bersama kami.' },
        story: { enabled: true, items: [] },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: true, heading: 'Ucapan Selamat' },
      };
    case 'reunion':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Sudah lama tidak bertemu — mari kumpul lagi.' },
        gallery: { enabled: true, layout: 'masonry', assetIds: [] },
        guestbook: { enabled: true, heading: 'Salam Kangen' },
      };
    case 'holiday-gathering':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Mari rayakan momen hangat ini bersama keluarga dan sahabat.' },
        greetings: { enabled: true },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: true, heading: 'Ucapan & Doa' },
      };
    case 'gender-reveal':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Pink atau biru? Datang dan saksikan kejutannya bersama kami.' },
        gallery: { enabled: true, layout: 'carousel', assetIds: [] },
        guestbook: { enabled: true, heading: 'Tebakanmu: Cowok atau Cewek?' },
        music: { enabled: true },
      };
    case 'tahlilan':
      // B-032 (G-060, I-13): a memorial with sober defaults. Music, gift and countdown start off; the opening words are the
      // family's own (an empty field renders nothing), and any religious text may only be an approved corpus entry picked in
      // the editor (ADR-O04, I-11: the corpus is empty, so the preset adds none).
      return {
        ...common,
        settings: { language: 'id', occasion: 'memorial', countdown: false },
        greetings: { enabled: true },
        music: { enabled: false },
        gift: { enabled: false },
        guestbook: { enabled: true, heading: 'Doa & Kenangan' },
      };
    case 'retirement':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Dengan hormat, kami mengundang Bapak/Ibu hadir dalam acara pelepasan purnabakti.' },
        story: { enabled: true, items: [] },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: true, heading: 'Pesan & Kesan' },
      };
    case 'product-launch':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Sesuatu yang baru segera hadir — jadilah yang pertama menyaksikannya.' },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: false },
      };
    case 'workshop':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Kursi terbatas — amankan tempatmu di sesi hands-on ini.' },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: false },
      };
    case 'gala':
      return {
        ...common,
        settings: { language: 'en', openingCopy: 'We request the pleasure of your company at our black-tie evening.' },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        gift: { enabled: true, accounts: [] },
        guestbook: { enabled: true, heading: 'Messages & Pledges' },
        music: { enabled: true },
      };
    case 'shows':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Lampu segera redup, tirai segera terbuka — jangan sampai kehabisan kursi.' },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: false },
        music: { enabled: true },
      };
    case 'community-event':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Dari kita, untuk kita — mari ramaikan acara komunitas ini bersama.' },
        gallery: { enabled: true, layout: 'masonry', assetIds: [] },
        guestbook: { enabled: true, heading: 'Pesan untuk Komunitas' },
      };
    case 'team-building':
      return {
        ...common,
        settings: { language: 'id', openingCopy: 'Saatnya keluar kantor — ikut ya, jangan cuma jadi wacana!' },
        gallery: { enabled: true, layout: 'masonry', assetIds: [] },
        guestbook: { enabled: true, heading: 'Pesan untuk Tim' },
      };
    case 'corporate':
    case 'conference':
    case 'tradeshow':
    case 'sales-kickoff':
    case 'networking':
    case 'investor-meeting':
    case 'client-vip':
    case 'employee-appreciation':
      return {
        ...common,
        settings: { language: 'en', openingCopy: 'We cordially invite you to join us at our upcoming event.' },
        gallery: { enabled: true, layout: 'grid', assetIds: [] },
        guestbook: { enabled: false },
      };
  }
}

function make(seed: TemplateSeed): InvitationTemplate {
  const { presetOverrides, ...template } = seed;
  const raw = { ...basePreset(seed), ...presetOverrides };
  // A bad preset must never take the marketing page down; fall back to the
  // smallest valid config and let the editor fill in the rest.
  const parsed = detailConfigSchema.safeParse(raw);
  const fallback = parsed.success ? null : detailConfigSchema.safeParse({});
  const preset = parsed.success
    ? parsed.data
    : fallback && fallback.success
      ? fallback.data
      : ({} as DetailConfig);
  return { ...template, palette: templatePalettes[seed.paletteId], preset };
}

export const invitationTemplates: InvitationTemplate[] = [
  // ————— Pernikahan —————
  make({ id: 101, slug: 'eternal-ivory', name: 'Eternal Ivory', category: 'wedding', styleTags: ['elegant', 'minimal'], motif: 'arch', tier: 'premium', paletteId: 'ivory', font: 'serif', sample: { eyebrow: 'THE WEDDING OF', names: 'Alya & Raka', date: '20 . 12 . 2026' }, tagline: { id: 'Putih gading klasik dengan lengkung arch yang tenang', en: 'Quiet ivory classic framed by a soft arch' } }),
  make({ id: 102, slug: 'rose-gold-romance', name: 'Rose Gold Romance', category: 'wedding', styleTags: ['floral', 'elegant'], motif: 'floral', tier: 'premium', paletteId: 'rose-gold', font: 'serif', sample: { eyebrow: 'UNDANGAN PERNIKAHAN', names: 'Nadia & Fajar', date: 'Sabtu, 14 Februari 2027' }, tagline: { id: 'Rona rose gold dengan taburan floral di tiap sudut', en: 'Rose gold glow with florals in every corner' } }),
  make({ id: 103, slug: 'sage-garden', name: 'Sage Garden', category: 'wedding', styleTags: ['floral', 'boho'], motif: 'botanical', tier: 'free', paletteId: 'sage', font: 'serif', sample: { eyebrow: 'THE WEDDING OF', names: 'Sinta & Bayu', date: '08 . 08 . 2026' }, tagline: { id: 'Hijau sage dan dedaunan untuk pesta kebun', en: 'Sage greens and foliage for a garden party' } }),
  make({ id: 104, slug: 'midnight-gala', name: 'Midnight Gala', category: 'wedding', styleTags: ['luxury', 'modern'], motif: 'deco', tier: 'signature', paletteId: 'midnight', font: 'serif', sample: { eyebrow: 'WE ARE GETTING MARRIED', names: 'Laras & Dimas', date: '31 . 12 . 2026' }, tagline: { id: 'Biru malam dan emas untuk resepsi malam hari', en: 'Midnight blue and gold for an evening reception' }, presetOverrides: { settings: { language: 'en', openingCopy: 'Together with our families, we joyfully invite you to celebrate our wedding.' }, quote: { enabled: true, text: 'Whatever our souls are made of, his and mine are the same.', author: 'Emily Bronte' } } }),
  make({ id: 105, slug: 'terracotta-vow', name: 'Terracotta Vow', category: 'wedding', styleTags: ['boho', 'vintage'], motif: 'arch', tier: 'premium', paletteId: 'terracotta', font: 'sans', sample: { eyebrow: 'UNDANGAN PERNIKAHAN', names: 'Ratih & Gilang', date: 'Minggu, 6 Juni 2027' }, tagline: { id: 'Tanah liat hangat bergaya boho rustic', en: 'Warm clay tones with a rustic boho mood' } }),
  make({ id: 106, slug: 'orchid-monogram', name: 'Orchid Monogram', category: 'wedding', styleTags: ['elegant', 'modern'], motif: 'monogram', tier: 'premium', paletteId: 'orchid', font: 'serif', sample: { eyebrow: 'THE WEDDING OF', names: 'Kirana & Arga', date: '17 . 05 . 2026' }, tagline: { id: 'Ungu anggrek dengan monogram lingkar ganda', en: 'Orchid purple with a double-ring monogram' } }),
  make({ id: 107, slug: 'sand-minimal', name: 'Sand Minimal', category: 'wedding', styleTags: ['minimal', 'modern'], motif: 'geometric', tier: 'free', paletteId: 'sand', font: 'sans', sample: { eyebrow: 'WEDDING INVITATION', names: 'Dewi & Rizky', date: '12 . 09 . 2026' }, tagline: { id: 'Netral pasir, tipografi bersih, tanpa distraksi', en: 'Sandy neutrals, clean type, zero distraction' } }),
  make({ id: 108, slug: 'gold-noir-deco', name: 'Gold Noir', category: 'wedding', styleTags: ['luxury', 'vintage'], motif: 'deco', tier: 'signature', paletteId: 'gold-noir', font: 'serif', sample: { eyebrow: 'A NIGHT TO REMEMBER', names: 'Maharani & Bima', date: 'SABTU · 21 . 11 . 2026' }, tagline: { id: 'Art deco hitam-emas ala Gatsby', en: 'Black-and-gold art deco, Gatsby style' } }),
  make({ id: 109, slug: 'blossom-aquarelle', name: 'Blossom Aquarelle', category: 'wedding', styleTags: ['watercolor', 'floral'], motif: 'floral', tier: 'premium', paletteId: 'blossom', font: 'serif', sample: { eyebrow: 'THE WEDDING OF', names: 'Puti & Danu', date: 'Minggu, 3 Oktober 2027' }, tagline: { id: 'Sapuan cat air merah muda yang lembut', en: 'Soft pink watercolor washes' } }),
  make({ id: 110, slug: 'emerald-royale', name: 'Emerald Royale', category: 'wedding', styleTags: ['luxury', 'elegant'], motif: 'rings', tier: 'signature', paletteId: 'emerald', font: 'serif', sample: { eyebrow: 'THE ROYAL WEDDING OF', names: 'Saraswati & Mahesa', date: '01 . 01 . 2027' }, tagline: { id: 'Zamrud megah dengan cincin bersilang', en: 'Regal emerald with interlocking rings' } }),
  make({ id: 138, slug: 'melati-suci', name: 'Melati Suci', category: 'wedding', styleTags: ['floral', 'islamic', 'elegant'], motif: 'floral', tier: 'free', paletteId: 'mint', font: 'serif', sample: { eyebrow: 'AKAD NIKAH', names: 'Hana & Yusuf', date: 'Sabtu, 12 Juni 2027' }, tagline: { id: 'Melati putih dan doa yang khusyuk', en: 'White jasmine and solemn prayers' }, presetOverrides: { greetings: { enabled: true } } }),
  make({ id: 139, slug: 'batik-kencana', name: 'Batik Kencana', category: 'wedding', styleTags: ['vintage', 'luxury'], motif: 'geometric', tier: 'signature', paletteId: 'midnight', font: 'serif', sample: { eyebrow: 'UNDANGAN NGUNDUH MANTU', names: 'Sekar & Panji', date: 'Minggu, 11 April 2027' }, tagline: { id: 'Parang emas di atas biru malam, klasik Jawa', en: 'Golden parang on midnight blue, a Javanese classic' } }),
  make({ id: 140, slug: 'frangipani-bali', name: 'Frangipani Bali', category: 'wedding', styleTags: ['boho', 'floral'], motif: 'botanical', tier: 'premium', paletteId: 'sand', font: 'sans', sample: { eyebrow: 'PAWIWAHAN', names: 'Ayu & Bagus', date: 'Sabtu, 24 Juli 2027' }, tagline: { id: 'Kamboja putih dan angin pantai pulau dewata', en: 'White frangipani and island sea breeze' } }),
  make({ id: 141, slug: 'bunga-kering', name: 'Bunga Kering', category: 'wedding', styleTags: ['boho', 'vintage', 'floral'], motif: 'floral', tier: 'free', paletteId: 'terracotta', font: 'serif', sample: { eyebrow: 'THE WEDDING OF', names: 'Laras & Bima', date: '19 . 09 . 2027' }, tagline: { id: 'Bunga kering earthy: beige, dusty rose, terakota', en: 'Earthy pressed flowers: beige, dusty rose, terracotta' } }),
  make({ id: 142, slug: 'garden-rose', name: 'Garden Rose', category: 'wedding', styleTags: ['elegant', 'floral', 'illustrated'], motif: 'floral', tier: 'premium', paletteId: 'blossom', font: 'serif', sample: { eyebrow: 'WEDDING INVITATION', names: 'Alma & Radit', date: 'Minggu, 30 Mei 2027' }, tagline: { id: 'Mawar taman ilustratif untuk resepsi ballroom', en: 'Illustrated garden roses for a ballroom reception' } }),
  // ————— Anniversary —————
  make({ id: 111, slug: 'silver-years', name: 'Silver Years', category: 'anniversary', styleTags: ['elegant'], motif: 'rings', tier: 'free', paletteId: 'lavender', font: 'serif', sample: { eyebrow: '25TH ANNIVERSARY', names: 'Ratna & Hasan', date: '12 . 12 . 2026' }, tagline: { id: 'Perak tenang untuk seperempat abad bersama', en: 'Quiet silver for a quarter century together' } }),
  make({ id: 112, slug: 'golden-years', name: 'Golden Years', category: 'anniversary', styleTags: ['vintage', 'luxury'], motif: 'monogram', tier: 'premium', paletteId: 'mocha', font: 'serif', sample: { eyebrow: 'GOLDEN ANNIVERSARY', names: 'Eyang Uti & Kakung', date: '50 TAHUN BERSAMA' }, tagline: { id: 'Cokelat moka hangat untuk kenangan emas', en: 'Warm mocha for golden memories' } }),
  make({ id: 143, slug: 'vine-ivy', name: 'Vine & Ivy', category: 'anniversary', styleTags: ['floral', 'minimal'], motif: 'botanical', tier: 'free', paletteId: 'emerald', font: 'sans', sample: { eyebrow: '10TH ANNIVERSARY', names: 'Tia & Rangga', date: 'Sabtu, 17 Juli 2027' }, tagline: { id: 'Sulur daun hijau yang tumbuh bersama', en: 'Green vines that grew together' } }),
  make({ id: 144, slug: 'pearl-koi', name: 'Pearl Koi', category: 'anniversary', styleTags: ['elegant', 'watercolor'], motif: 'waves', tier: 'premium', paletteId: 'ocean', font: 'serif', sample: { eyebrow: 'PEARL ANNIVERSARY', names: 'Maya & Surya', date: '30 TAHUN BERSAMA' }, tagline: { id: 'Gelombang cat air biru mutiara', en: 'Pearl blue watercolor waves' } }),
  // ————— Bridal shower —————
  make({ id: 113, slug: 'blush-brunch', name: 'Blush Brunch', category: 'bridal-shower', styleTags: ['playful', 'floral'], motif: 'confetti', tier: 'free', paletteId: 'rose-gold', font: 'serif', sample: { eyebrow: 'BRIDAL SHOWER', names: 'Bride to Be: Salma', date: 'Sabtu, 11 Juli 2026' }, tagline: { id: 'Merona ceria untuk pesta menjelang hari H', en: 'Blushing and cheerful before the big day' } }),
  make({ id: 114, slug: 'boho-picnic', name: 'Boho Picnic', category: 'bridal-shower', styleTags: ['boho', 'illustrated'], motif: 'botanical', tier: 'premium', paletteId: 'terracotta', font: 'sans', sample: { eyebrow: 'BRIDAL SHOWER', names: 'Tara & The Girls', date: 'Minggu, 9 Agustus 2026' }, tagline: { id: 'Piknik boho santai dengan dedaunan terakota', en: 'Laid-back boho picnic with terracotta leaves' } }),
  // ————— Ulang tahun —————
  make({ id: 115, slug: 'confetti-pop', name: 'Confetti Pop', category: 'birthday', styleTags: ['playful', 'bold'], motif: 'confetti', tier: 'free', paletteId: 'confetti', font: 'sans', sample: { eyebrow: 'YOU ARE INVITED', names: 'Kenzie is Turning 7!', date: 'Minggu, 15 Maret 2026' }, tagline: { id: 'Taburan confetti untuk pesta anak yang meriah', en: 'A confetti burst for a lively kids party' } }),
  make({ id: 116, slug: 'pastel-wonder', name: 'Pastel Wonder', category: 'birthday', styleTags: ['playful'], motif: 'balloons', tier: 'free', paletteId: 'lavender', font: 'sans', sample: { eyebrow: 'BIRTHDAY PARTY', names: 'Arunika ke-5', date: 'Sabtu, 2 Mei 2026' }, tagline: { id: 'Balon pastel lembut untuk si kecil', en: 'Soft pastel balloons for the little one' } }),
  make({ id: 117, slug: 'neon-night', name: 'Neon Night', category: 'birthday', styleTags: ['bold', 'modern'], motif: 'stars', tier: 'premium', paletteId: 'midnight', font: 'sans', sample: { eyebrow: 'BIRTHDAY BASH', names: 'Radit Turns 21', date: '21 . 08 . 2026' }, tagline: { id: 'Gelap, berani, dan siap pesta sampai larut', en: 'Dark, bold, and ready to party late' } }),
  make({ id: 118, slug: 'little-star', name: 'Little Star', category: 'birthday', styleTags: ['playful', 'illustrated'], motif: 'stars', tier: 'free', paletteId: 'ocean', font: 'sans', sample: { eyebrow: 'FIRST BIRTHDAY', names: 'Baby Alma Turns 1', date: 'Minggu, 19 April 2026' }, tagline: { id: 'Bintang kecil untuk ulang tahun pertama', en: 'A little star for the very first birthday' } }),
  make({ id: 119, slug: 'sweet-seventeen', name: 'Sweet Seventeen', category: 'birthday', styleTags: ['elegant', 'playful'], motif: 'confetti', tier: 'premium', paletteId: 'blossom', font: 'serif', sample: { eyebrow: 'SWEET SEVENTEEN', names: 'Queensha Aurelia', date: 'Sabtu, 27 Juni 2026' }, tagline: { id: 'Elegan merona untuk usia tujuh belas', en: 'Blushing elegance for turning seventeen' } }),
  make({ id: 145, slug: 'marigold-fiesta', name: 'Marigold Fiesta', category: 'birthday', styleTags: ['bold', 'playful'], motif: 'confetti', tier: 'free', paletteId: 'sunshine', font: 'sans', sample: { eyebrow: 'FIESTA!', names: 'Gempita ke-30', date: 'Sabtu, 21 Maret 2026' }, tagline: { id: 'Marigold jingga yang hangat dan meriah', en: 'Warm, festive orange marigold' } }),
  // ————— Aqiqah & Khitanan —————
  make({ id: 120, slug: 'barakah-mint', name: 'Barakah Mint', category: 'aqiqah-khitanan', styleTags: ['islamic'], motif: 'crescent', tier: 'free', paletteId: 'mint', font: 'serif', sample: { eyebrow: 'TASYAKURAN AQIQAH', names: 'Muhammad Al Fatih', date: 'Minggu, 12 April 2026' }, tagline: { id: 'Hijau mint teduh dengan hilal yang lembut', en: 'Calm mint green with a gentle crescent' } }),
  make({ id: 121, slug: 'bintang-kecil', name: 'Bintang Kecil', category: 'aqiqah-khitanan', styleTags: ['islamic', 'playful'], motif: 'stars', tier: 'free', paletteId: 'ocean', font: 'sans', sample: { eyebrow: 'WALIMATUL KHITAN', names: 'Ananda Rafif', date: 'Minggu, 28 Juni 2026' }, tagline: { id: 'Langit biru dan bintang untuk sang jagoan', en: 'Blue skies and stars for the brave boy' } }),
  make({ id: 122, slug: 'sakinah-sand', name: 'Sakinah Sand', category: 'aqiqah-khitanan', styleTags: ['islamic', 'elegant'], motif: 'crescent', tier: 'premium', paletteId: 'sand', font: 'serif', sample: { eyebrow: 'TASYAKURAN AQIQAH', names: 'Aisyah Humaira', date: 'Sabtu, 9 Mei 2026' }, tagline: { id: 'Nuansa pasir elegan bernapas islami', en: 'Elegant sandy tones with an Islamic soul' } }),
  // ————— Syukuran —————
  make({ id: 123, slug: 'syukur-hangat', name: 'Syukur Hangat', category: 'syukuran', styleTags: ['vintage'], motif: 'geometric', tier: 'free', paletteId: 'mocha', font: 'serif', sample: { eyebrow: 'SYUKURAN KELUARGA', names: 'Keluarga Wijaya', date: 'Minggu, 26 Juli 2026' }, tagline: { id: 'Hangat dan bersahaja untuk syukuran keluarga', en: 'Warm and humble for a family thanksgiving' } }),
  make({ id: 124, slug: 'rumah-baru', name: 'Rumah Baru', category: 'syukuran', styleTags: ['modern', 'minimal'], motif: 'geometric', tier: 'free', paletteId: 'terracotta', font: 'sans', sample: { eyebrow: 'HOUSEWARMING', names: 'Rumah Baru Keluarga Putra', date: 'Sabtu, 5 September 2026' }, tagline: { id: 'Garis geometris bersih untuk rumah baru', en: 'Clean geometric lines for a new home' } }),
  make({ id: 146, slug: 'teratai-subuh', name: 'Teratai Subuh', category: 'syukuran', styleTags: ['islamic', 'watercolor'], motif: 'waves', tier: 'premium', paletteId: 'dusk', font: 'serif', sample: { eyebrow: 'TASYAKURAN', names: 'Keluarga Ananta', date: 'Minggu, 18 April 2027' }, tagline: { id: 'Teratai subuh: cat air ungu yang teduh', en: 'Dawn lotus in calm purple watercolor' } }),
  // ————— Baby shower —————
  make({ id: 125, slug: 'awan-lembut', name: 'Awan Lembut', category: 'baby-shower', styleTags: ['playful'], motif: 'waves', tier: 'free', paletteId: 'ocean', font: 'sans', sample: { eyebrow: 'BABY SHOWER', names: 'Menanti Dedek Bayi', date: 'Minggu, 10 Mei 2026' }, tagline: { id: 'Gelombang biru selembut awan', en: 'Blue waves as soft as clouds' } }),
  make({ id: 126, slug: 'peach-cuddle', name: 'Peach Cuddle', category: 'baby-shower', styleTags: ['playful', 'illustrated'], motif: 'balloons', tier: 'premium', paletteId: 'blossom', font: 'sans', sample: { eyebrow: 'BABY SHOWER', names: 'Welcoming Baby R', date: 'Sabtu, 20 Juni 2026' }, tagline: { id: 'Persik hangat dan balon menyambut si kecil', en: 'Warm peach and balloons to welcome baby' } }),
  make({ id: 127, slug: 'reveal-dusk', name: 'Reveal Dusk', category: 'baby-shower', styleTags: ['modern'], motif: 'stars', tier: 'free', paletteId: 'dusk', font: 'sans', sample: { eyebrow: 'GENDER REVEAL', names: 'He or She?', date: 'Sabtu, 8 Agustus 2026' }, tagline: { id: 'Senja ungu untuk kejutan he or she', en: 'Purple dusk for the he-or-she surprise' } }),
  // ————— Wisuda —————
  make({ id: 128, slug: 'toga-slate', name: 'Toga Slate', category: 'graduation', styleTags: ['minimal', 'modern'], motif: 'geometric', tier: 'free', paletteId: 'slate', font: 'sans', sample: { eyebrow: 'GRADUATION', names: 'Sarjana Baru: Naufal', date: 'Kamis, 22 Oktober 2026' }, tagline: { id: 'Biru slate rapi untuk hari kelulusan', en: 'Crisp slate blue for graduation day' } }),
  make({ id: 129, slug: 'summa-gold', name: 'Summa Gold', category: 'graduation', styleTags: ['luxury'], motif: 'deco', tier: 'premium', paletteId: 'gold-noir', font: 'serif', sample: { eyebrow: 'GRADUATION NIGHT', names: 'Class of 2026', date: '30 . 10 . 2026' }, tagline: { id: 'Malam kelulusan bergaya hitam-emas', en: 'A black-and-gold graduation night' } }),
  // ————— Reuni —————
  make({ id: 130, slug: 'retro-reunion', name: 'Retro Reunion', category: 'reunion', styleTags: ['vintage', 'bold'], motif: 'confetti', tier: 'free', paletteId: 'sunshine', font: 'sans', sample: { eyebrow: 'REUNI AKBAR', names: 'SMA 3 Angkatan 2010', date: 'Sabtu, 15 Agustus 2026' }, tagline: { id: 'Kuning retro yang bikin kangen masa sekolah', en: 'Retro yellow that brings the school days back' } }),
  make({ id: 131, slug: 'alumni-classic', name: 'Alumni Classic', category: 'reunion', styleTags: ['elegant'], motif: 'monogram', tier: 'premium', paletteId: 'slate', font: 'serif', sample: { eyebrow: 'HOMECOMING', names: 'Alumni FT 2005', date: 'Sabtu, 12 September 2026' }, tagline: { id: 'Klasik berkelas untuk temu alumni', en: 'Classic and classy for an alumni homecoming' } }),
  // ————— Hari raya —————
  make({ id: 132, slug: 'halal-bihalal', name: 'Halal Bihalal', category: 'holiday-gathering', styleTags: ['islamic'], motif: 'crescent', tier: 'free', paletteId: 'mint', font: 'serif', sample: { eyebrow: 'HALAL BIHALAL', names: 'Keluarga Besar Hartono', date: 'Minggu, 29 Maret 2026' }, tagline: { id: 'Hijau syawal untuk silaturahmi keluarga', en: 'Eid greens for the family gathering' }, presetOverrides: { greetings: { enabled: true }, guestbook: { enabled: true, heading: 'Maaf Lahir & Batin' } } }),
  make({ id: 133, slug: 'natal-hangat', name: 'Natal Hangat', category: 'holiday-gathering', styleTags: ['elegant'], motif: 'stars', tier: 'free', paletteId: 'emerald', font: 'serif', sample: { eyebrow: 'CHRISTMAS DINNER', names: 'Keluarga Tobing', date: 'Jumat, 25 Desember 2026' }, tagline: { id: 'Hijau natal dengan kerlip bintang', en: 'Christmas green with twinkling stars' }, presetOverrides: { guestbook: { enabled: true, heading: 'Ucapan Natal & Tahun Baru' } } }),
  make({ id: 134, slug: 'midnight-countdown', name: 'Midnight Countdown', category: 'holiday-gathering', styleTags: ['bold', 'modern'], motif: 'stars', tier: 'premium', paletteId: 'midnight', font: 'sans', sample: { eyebrow: 'NEW YEAR PARTY', names: 'Countdown to 2027', date: '31 . 12 . 2026' }, tagline: { id: 'Hitung mundur bergaya langit tengah malam', en: 'A countdown styled like the midnight sky' } }),
  make({ id: 147, slug: 'kurma-oasis', name: 'Kurma Oasis', category: 'holiday-gathering', styleTags: ['islamic', 'elegant'], motif: 'crescent', tier: 'free', paletteId: 'mocha', font: 'serif', sample: { eyebrow: 'IFTAR BERSAMA', names: 'Keluarga Besar Ramadhan', date: 'Sabtu, 6 Maret 2027' }, tagline: { id: 'Cokelat kurma hangat untuk buka bersama', en: 'Warm date-palm browns for an iftar gathering' }, presetOverrides: { greetings: { enabled: true }, guestbook: { enabled: true, heading: 'Doa & Harapan' } } }),
  // ————— Korporat —————
  make({ id: 135, slug: 'boardroom', name: 'Boardroom', category: 'corporate', styleTags: ['minimal', 'modern'], motif: 'geometric', tier: 'free', paletteId: 'slate', font: 'sans', sample: { eyebrow: 'CORPORATE GATHERING', names: 'NodeX Annual Summit', date: 'Kamis, 19 November 2026' }, tagline: { id: 'Tegas dan profesional untuk acara kantor', en: 'Sharp and professional for company events' } }),
  make({ id: 136, slug: 'gala-awards', name: 'Gala Awards', category: 'corporate', styleTags: ['luxury'], motif: 'deco', tier: 'signature', paletteId: 'gold-noir', font: 'serif', sample: { eyebrow: 'AWARDS NIGHT', names: 'Innovator Awards 2026', date: 'BALLROOM · 05 . 12 . 2026' }, tagline: { id: 'Malam penghargaan berbalut hitam-emas', en: 'An awards night dressed in black and gold' } }),
  make({ id: 137, slug: 'launch-day', name: 'Launch Day', category: 'corporate', styleTags: ['modern', 'bold'], motif: 'waves', tier: 'premium', paletteId: 'ocean', font: 'sans', sample: { eyebrow: 'PRODUCT LAUNCH', names: 'Invitesion 2.0', date: 'Rabu, 14 Oktober 2026' }, tagline: { id: 'Gelombang biru untuk peluncuran produk', en: 'Blue waves for a product launch' } }),
  // ————— Gender reveal —————
  make({ id: 148, slug: 'pink-or-blue', name: 'Pink or Blue', category: 'gender-reveal', styleTags: ['playful', 'modern'], motif: 'balloons', tier: 'free', paletteId: 'dusk', font: 'sans', sample: { eyebrow: 'GENDER REVEAL', names: 'Boy or Girl?', date: 'Sabtu, 14 Maret 2026' }, tagline: { id: 'Misteri pink atau biru terjaga sampai detik reveal', en: 'The pink-or-blue mystery kept until the reveal' } }),
  // ————— Tahlilan & Doa —————
  make({ id: 149, slug: 'doa-khusyuk', name: 'Doa Khusyuk', category: 'tahlilan', styleTags: ['islamic', 'minimal'], motif: 'crescent', tier: 'free', paletteId: 'sand', font: 'serif', sample: { eyebrow: 'TAHLILAN & DOA BERSAMA', names: 'Alm. H. Soedirman', date: 'Malam ke-40 · Kamis, 5 Maret 2026' }, tagline: { id: 'Teduh dan khidmat untuk majelis doa', en: 'Calm and solemn for a night of prayers' } }),
  // ————— Purnabakti —————
  make({ id: 150, slug: 'purnabakti-emas', name: 'Purnabakti Emas', category: 'retirement', styleTags: ['elegant', 'vintage'], motif: 'monogram', tier: 'free', paletteId: 'mocha', font: 'serif', sample: { eyebrow: 'PURNABAKTI', names: 'Bpk. Harsono Wijaya', date: '35 TAHUN PENGABDIAN' }, tagline: { id: 'Penghormatan hangat untuk masa pengabdian', en: 'A warm tribute to years of service' } }),
  // ————— Launching & Brand —————
  make({ id: 151, slug: 'ignition', name: 'Ignition', category: 'product-launch', styleTags: ['bold', 'modern'], motif: 'geometric', tier: 'premium', paletteId: 'midnight', font: 'sans', sample: { eyebrow: 'GRAND LAUNCHING', names: 'Astra One', date: 'Rabu, 17 Juni 2026' }, tagline: { id: 'Kembang api biru malam untuk momen peluncuran', en: 'Midnight fireworks for launch night' } }),
  make({ id: 152, slug: 'grand-opening', name: 'Grand Opening', category: 'product-launch', styleTags: ['modern', 'playful'], motif: 'confetti', tier: 'free', paletteId: 'terracotta', font: 'sans', sample: { eyebrow: 'GRAND OPENING', names: 'Kopi Pelita', date: 'Sabtu, 4 April 2026' }, tagline: { id: 'Hangat dan meriah untuk pembukaan gerai baru', en: 'Warm and festive for a new store opening' } }),
  // ————— Konferensi & Summit —————
  make({ id: 153, slug: 'keynote', name: 'Keynote', category: 'conference', styleTags: ['minimal', 'modern'], motif: 'geometric', tier: 'free', paletteId: 'slate', font: 'sans', sample: { eyebrow: 'ANNUAL CONFERENCE', names: 'IndoTech Summit 2027', date: 'Kamis, 22 Januari 2027' }, tagline: { id: 'Slate bersih dan tegas untuk panggung utama', en: 'Clean, sharp slate for the main stage' } }),
  // ————— Pameran & Expo —————
  make({ id: 154, slug: 'expo-hall', name: 'Expo Hall', category: 'tradeshow', styleTags: ['modern', 'bold'], motif: 'geometric', tier: 'free', paletteId: 'ocean', font: 'sans', sample: { eyebrow: 'EXPO & TRADESHOW', names: 'Karya Nusantara Expo', date: '15–17 Mei 2026' }, tagline: { id: 'Biru laut modern untuk booth dan panggung expo', en: 'Modern ocean blue for booths and expo stages' } }),
  // ————— Sales kickoff —————
  make({ id: 155, slug: 'kickoff-arena', name: 'Kickoff Arena', category: 'sales-kickoff', styleTags: ['bold', 'modern'], motif: 'stars', tier: 'premium', paletteId: 'midnight', font: 'sans', sample: { eyebrow: 'SALES KICKOFF 2027', names: 'One Team, One Target', date: 'Senin, 11 Januari 2027' }, tagline: { id: 'Energi panggung besar untuk membakar semangat tim', en: 'Big-stage energy to fire up the team' } }),
  // ————— Workshop & Training —————
  make({ id: 156, slug: 'atelier', name: 'Atelier', category: 'workshop', styleTags: ['minimal', 'boho'], motif: 'botanical', tier: 'free', paletteId: 'sage', font: 'sans', sample: { eyebrow: 'WORKSHOP SERIES', names: 'Kelas Keramik Dasar', date: 'Sabtu, 9 Mei 2026' }, tagline: { id: 'Hijau sage tenang untuk kelas hands-on', en: 'Calm sage green for a hands-on class' } }),
  // ————— Networking —————
  make({ id: 157, slug: 'after-hours-mixer', name: 'After Hours Mixer', category: 'networking', styleTags: ['modern', 'bold'], motif: 'stars', tier: 'free', paletteId: 'dusk', font: 'sans', sample: { eyebrow: 'NETWORKING NIGHT', names: 'Founders & Friends', date: 'Jumat, 8 Mei 2026' }, tagline: { id: 'Senja ungu dan bokeh untuk malam relasi', en: 'Purple dusk and bokeh for a night of connections' } }),
  // ————— Team building —————
  make({ id: 158, slug: 'offsite-escape', name: 'Offsite Escape', category: 'team-building', styleTags: ['playful', 'modern'], motif: 'botanical', tier: 'free', paletteId: 'sage', font: 'sans', sample: { eyebrow: 'TEAM OFFSITE', names: 'NodeX Goes to Bali', date: '7–9 Agustus 2026' }, tagline: { id: 'Sawah, udara segar, dan tim yang makin solid', en: 'Rice fields, fresh air, and a tighter team' } }),
  // ————— Investor & RUPS —————
  make({ id: 159, slug: 'boardroom-charter', name: 'Boardroom Charter', category: 'investor-meeting', styleTags: ['elegant', 'minimal'], motif: 'monogram', tier: 'premium', paletteId: 'slate', font: 'serif', sample: { eyebrow: 'ANNUAL SHAREHOLDERS MEETING', names: 'RUPS Tahunan 2027', date: 'Selasa, 23 Maret 2027' }, tagline: { id: 'Formal presisi untuk rapat pemegang saham', en: 'Precise formality for a shareholders meeting' } }),
  // ————— Gala & Fundraising —————
  make({ id: 160, slug: 'velvet-gala', name: 'Velvet Gala', category: 'gala', styleTags: ['luxury', 'elegant'], motif: 'deco', tier: 'signature', paletteId: 'gold-noir', font: 'serif', sample: { eyebrow: 'CHARITY GALA DINNER', names: 'A Night of Giving', date: 'BALLROOM · 12 . 12 . 2026' }, tagline: { id: 'Gala amal berbalut beludru hitam-emas', en: 'A charity gala dressed in black-and-gold velvet' } }),
  // ————— Klien & VIP —————
  make({ id: 161, slug: 'velvet-rope', name: 'Velvet Rope', category: 'client-vip', styleTags: ['luxury', 'modern'], motif: 'monogram', tier: 'premium', paletteId: 'gold-noir', font: 'serif', sample: { eyebrow: 'VIP APPRECIATION NIGHT', names: 'For Our Finest Partners', date: 'Kamis, 15 Oktober 2026' }, tagline: { id: 'Eksklusif seperti undangan di balik tali beludru', en: 'Exclusive, like an invite behind the velvet rope' } }),
  // ————— Apresiasi karyawan —————
  make({ id: 162, slug: 'bravo-team', name: 'Bravo Team', category: 'employee-appreciation', styleTags: ['playful', 'bold'], motif: 'confetti', tier: 'free', paletteId: 'sunshine', font: 'sans', sample: { eyebrow: 'EMPLOYEE APPRECIATION', names: 'Night of Champions', date: 'Jumat, 18 Desember 2026' }, tagline: { id: 'Kuning ceria untuk merayakan tim terbaik', en: 'Cheerful yellow to celebrate the best team' } }),
  // ————— Pertunjukan —————
  make({ id: 163, slug: 'grand-stage', name: 'Grand Stage', category: 'shows', styleTags: ['luxury', 'bold'], motif: 'deco', tier: 'premium', paletteId: 'midnight', font: 'serif', sample: { eyebrow: 'CHARITY CONCERT', names: 'Symphony Under the Stars', date: 'Sabtu, 29 Agustus 2026' }, tagline: { id: 'Panggung megah di bawah langit malam', en: 'A grand stage under the night sky' } }),
  // ————— Komunitas —————
  make({ id: 164, slug: 'kampung-fest', name: 'Kampung Fest', category: 'community-event', styleTags: ['playful', 'illustrated'], motif: 'confetti', tier: 'free', paletteId: 'terracotta', font: 'sans', sample: { eyebrow: 'FESTIVAL KOMUNITAS', names: 'Pasar Rakyat Ceria', date: 'Minggu, 26 April 2026' }, tagline: { id: 'Meriah membumi untuk acara warga dan komunitas', en: 'Festive and grounded for community gatherings' } }),
];

export const templateCategories = Object.keys(templateCategoryLabels) as TemplateCategory[];

export function getTemplateBySlug(slug: string): InvitationTemplate | undefined {
  return invitationTemplates.find((template) => template.slug === slug);
}

export function getTemplatesByCategory(category: TemplateCategory): InvitationTemplate[] {
  return invitationTemplates.filter((template) => template.category === category);
}
