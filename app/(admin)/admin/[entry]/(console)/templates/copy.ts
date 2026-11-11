import type { Locale } from '@/lib/i18n';
import type { FontPairing, SectionOrderOption } from '@/lib/invitation/family-manifest';
import type { ArtRole, OwnerReviewStatus } from '@/lib/invitation/catalog-admin-view';
import type { TemplateTier } from '@/lib/invitation/templates';

type Copy = {
  kicker: string;
  title: string;
  lead: string;
  /** Text around the gate's command, which the page sets in `<code>`. */
  gate: { before: string; after: string };
  readOnly: string;
  summary: {
    label: string;
    entries: string;
    valid: string;
    invalid: string;
    artFiles: string;
    ownerPending: (pending: number, files: number) => string;
    agentReviewed: (reviewed: number, files: number) => string;
    seeded: (seeded: number, total: number) => string;
    notSeeded: (count: number) => string;
    premiumMismatch: (count: number) => string;
  };
  invalidHeading: string;
  identityHeading: string;
  tableCaption: string;
  columns: { theme: string; category: string; tier: string; palette: string; art: string; review: string; database: string; status: string };
  status: { valid: string; invalid: (problems: number) => string };
  review: Record<OwnerReviewStatus, string>;
  database: { row: (id: number) => string; notSeeded: string; premiumDiffers: string };
  files: (count: number) => string;
  tiers: Record<TemplateTier, string>;
  entitlement: Record<'standard' | 'premium', string>;
  paletteTier: Record<'standard' | 'premium', string>;
  orphanHeading: string;
  orphanLead: string;
  orphanRow: (id: number, name: string, premium: boolean) => string;
  inspect: (name: string) => string;
  detail: {
    back: string;
    publicPreview: string;
    newTab: string;
    problemsHeading: string;
    problemsLead: string;
    candidate: string;
    identity: string;
    fields: {
      templateId: string;
      slug: string;
      category: string;
      styleTags: string;
      motif: string;
      locales: string;
      defaultLocale: string;
      taglineId: string;
      taglineEn: string;
      schemaVersion: string;
    };
    tierHeading: string;
    tier: string;
    entitlement: string;
    entitlementNote: string;
    database: string;
    databaseAgrees: string;
    paletteHeading: string;
    paletteId: string;
    tokens: string;
    cardPalette: string;
    cardAccentNote: string;
    sectionsHeading: string;
    choicesHeading: string;
    choicesLead: string;
    families: string;
    legacyDefault: string;
    legacyDefaultValue: string;
    sectionOrders: string;
    defaultMarker: string;
    fontPairings: string;
    palettes: (count: number) => string;
    ownPalette: string;
    artHeading: string;
    artPool: string;
    selfHosted: string;
    selfHostedValue: string;
    roles: Record<ArtRole, string>;
    altFor: (roles: string, name: string) => string;
    size: (width: number, height: number, bytes: number) => string;
    sha256: string;
    sourceId: string;
    prompt: string;
    originalSha256: string;
    crop: string;
    notRegistered: string;
    provenanceHeading: string;
    provenance: {
      license: string;
      provenance: string;
      author: string;
      attribution: string;
      generator: string;
      created: string;
      derivation: string;
      review: string;
    };
    reviewHeading: string;
    reviewAgent: (reviewed: number, files: number) => string;
    reviewOwner: (status: OwnerReviewStatus, pending: number, files: number) => string;
    reviewPublishing: string;
    manifestHeading: string;
    manifestToggle: string;
  };
  orders: Record<SectionOrderOption, string>;
  pairings: Record<FontPairing, string>;
};

export const CATALOG_ADMIN_COPY: Record<Locale, Copy> = {
  id: {
    kicker: 'Katalog',
    title: 'Tema',
    lead: 'Manifest setiap tema katalog, diturunkan dari registri tema, token palet, dan register seni.',
    gate: { before: 'Gate rilis ', after: ' memeriksa manifest yang sama dan setiap berkas seni byte demi byte.' },
    readOnly: 'Hanya-baca. Konsol ini tidak mengubah tema, preset, atau undangan. Penerbitan tema dari konsol belum tersedia: perlu tinjauan pemilik yang tercatat.',
    summary: {
      label: 'Ringkasan katalog',
      entries: 'Entri',
      valid: 'Valid',
      invalid: 'Tidak valid',
      artFiles: 'Berkas seni',
      ownerPending: (pending, files) => `Tinjauan pemilik tertunda untuk ${pending} dari ${files} berkas`,
      agentReviewed: (reviewed, files) => `Tinjauan mandiri agen tercatat untuk ${reviewed} dari ${files} berkas (ADR-O09)`,
      seeded: (seeded, total) => `${seeded} dari ${total} tema punya baris di tabel templates`,
      notSeeded: (count) => `${count} tema belum disinkronkan ke database`,
      premiumMismatch: (count) => `${count} baris dengan tanda premium yang berbeda dari tier`,
    },
    invalidHeading: 'Manifest yang ditolak',
    identityHeading: 'Masalah identitas katalog',
    tableCaption: 'Semua tema katalog dengan status manifestnya',
    columns: { theme: 'Tema', category: 'Kategori', tier: 'Tier → hak akses', palette: 'Palet', art: 'Seni', review: 'Tinjauan', database: 'Database', status: 'Status' },
    status: { valid: 'Valid', invalid: (problems) => `Tidak valid (${problems} masalah)` },
    review: { pending: 'Pemilik: tertunda', approved: 'Pemilik: disetujui', unrecorded: 'Tanpa catatan tinjauan', 'no-files': 'Tanpa berkas' },
    database: { row: (id) => `Baris #${id}`, notSeeded: 'Belum disinkronkan', premiumDiffers: 'Tanda premium berbeda' },
    files: (count) => `${count} berkas`,
    tiers: { free: 'Gratis', premium: 'Premium', signature: 'Signature' },
    entitlement: { standard: 'Standard', premium: 'Premium' },
    paletteTier: { standard: 'palet Standard', premium: 'palet Premium' },
    orphanHeading: 'Baris database tanpa entri katalog',
    orphanLead: 'Undangan yang merujuk baris ini tetap dirender dari konfigurasi tersimpannya.',
    orphanRow: (id, name, premium) => `#${id} ${name} (${premium ? 'premium' : 'gratis'})`,
    inspect: (name) => `Periksa ${name}`,
    detail: {
      back: 'Semua tema',
      publicPreview: 'Buka pratinjau publik',
      newTab: '(tab baru)',
      problemsHeading: 'Masalah validasi',
      problemsLead: 'Manifest ini ditolak dan tidak ikut di katalog manifest. Kandidat turunannya ditampilkan apa adanya di bawah.',
      candidate: 'Kandidat manifest (JSON)',
      identity: 'Identitas',
      fields: {
        templateId: 'ID (config.theme.templateId)',
        slug: 'Slug publik',
        category: 'Kategori',
        styleTags: 'Gaya',
        motif: 'Motif',
        locales: 'Bahasa',
        defaultLocale: 'Bahasa bawaan',
        taglineId: 'Tagline (ID)',
        taglineEn: 'Tagline (EN)',
        schemaVersion: 'Versi skema',
      },
      tierHeading: 'Tier dan hak akses',
      tier: 'Tier',
      entitlement: 'Hak akses undangan',
      entitlementNote: 'Hak akses mengikuti tier, sama seperti harga di checkout.',
      database: 'Baris database',
      databaseAgrees: 'tanda premium sesuai tier',
      paletteHeading: 'Palet',
      paletteId: 'Palet',
      tokens: 'Token halaman tamu (palettes.ts)',
      cardPalette: 'Palet kartu katalog',
      cardAccentNote: 'Aksen kartu hanya dipakai untuk garis dan ornamen, tidak pernah untuk teks.',
      sectionsHeading: 'Bagian preset',
      choicesHeading: 'Pilihan tampilan (G-041)',
      choicesLead: 'Pilihan yang boleh dibuat undangan dari tema ini; penulis menolak selain ini.',
      families: 'Keluarga desain',
      legacyDefault: 'Tata letak tanpa keluarga',
      legacyDefaultValue: 'Klasik (bawaan)',
      sectionOrders: 'Urutan bagian',
      defaultMarker: 'bawaan',
      fontPairings: 'Pasangan huruf',
      palettes: (count) => `Palet yang ditawarkan (${count})`,
      ownPalette: 'palet tema',
      artHeading: 'Seni dan provenans (G-016)',
      artPool: 'Kumpulan seni',
      selfHosted: 'Penyajian',
      selfHostedValue: 'Dari situs sendiri (/theme-art/)',
      roles: { card: 'kartu', cover: 'sampul', gallery: 'galeri' },
      altFor: (roles, name) => `Seni ${roles} untuk tema ${name}`,
      size: (width, height, bytes) => `${width} × ${height} px · ${bytes.toLocaleString('id-ID')} byte`,
      sha256: 'SHA-256 berkas',
      sourceId: 'Entri register',
      prompt: 'Prompt generator',
      originalSha256: 'SHA-256 asli',
      crop: 'Potongan yang ditinjau',
      notRegistered: 'Tidak tercatat di register seni',
      provenanceHeading: 'Provenans',
      provenance: {
        license: 'Lisensi',
        provenance: 'Asal',
        author: 'Pembuat',
        attribution: 'Atribusi',
        generator: 'Generator',
        created: 'Dibuat',
        derivation: 'Turunan',
        review: 'Tinjauan',
      },
      reviewHeading: 'Status tinjauan',
      reviewAgent: (reviewed, files) => `Tinjauan mandiri agen tercatat untuk ${reviewed} dari ${files} berkas (ADR-O09).`,
      reviewOwner: (status, pending, files) =>
        status === 'approved'
          ? `Persetujuan pemilik tercatat untuk ${files} berkas.`
          : status === 'pending'
            ? `Tinjauan pemilik tertunda untuk ${pending} dari ${files} berkas.`
            : 'Tidak ada catatan tinjauan pemilik untuk berkas ini.',
      reviewPublishing: 'Penerbitan dari konsol memerlukan tinjauan pemilik yang tercatat dan belum tersedia.',
      manifestHeading: 'Manifest',
      manifestToggle: 'Tampilkan manifest (JSON)',
    },
    orders: { standard: 'Urutan bawaan', 'story-first': 'Cerita & galeri dulu', 'photos-last': 'Galeri di akhir' },
    pairings: { 'serif-display': 'Serif untuk judul', sans: 'Sans untuk semua teks' },
  },
  en: {
    kicker: 'Catalog',
    title: 'Themes',
    lead: 'Each catalog theme’s manifest, derived from the theme registry, the palette tokens and the art register.',
    gate: { before: 'The release gate ', after: ' checks the same manifests and every art file byte for byte.' },
    readOnly: 'Read-only. This console changes no theme, preset or invitation. Publishing themes from the console is not available yet: it needs a recorded owner review.',
    summary: {
      label: 'Catalog summary',
      entries: 'Entries',
      valid: 'Valid',
      invalid: 'Invalid',
      artFiles: 'Art files',
      ownerPending: (pending, files) => `Owner review pending for ${pending} of ${files} files`,
      agentReviewed: (reviewed, files) => `Agent self-review recorded for ${reviewed} of ${files} files (ADR-O09)`,
      seeded: (seeded, total) => `${seeded} of ${total} themes have a row in the templates table`,
      notSeeded: (count) => `${count} themes not synced to the database`,
      premiumMismatch: (count) => `${count} rows whose premium flag differs from the tier`,
    },
    invalidHeading: 'Refused manifests',
    identityHeading: 'Catalog identity problems',
    tableCaption: 'Every catalog theme with its manifest status',
    columns: { theme: 'Theme', category: 'Category', tier: 'Tier → entitlement', palette: 'Palette', art: 'Art', review: 'Review', database: 'Database', status: 'Status' },
    status: { valid: 'Valid', invalid: (problems) => `Invalid (${problems} ${problems === 1 ? 'problem' : 'problems'})` },
    review: { pending: 'Owner: pending', approved: 'Owner: approved', unrecorded: 'No review record', 'no-files': 'No files' },
    database: { row: (id) => `Row #${id}`, notSeeded: 'Not synced', premiumDiffers: 'Premium flag differs' },
    files: (count) => `${count} ${count === 1 ? 'file' : 'files'}`,
    tiers: { free: 'Free', premium: 'Premium', signature: 'Signature' },
    entitlement: { standard: 'Standard', premium: 'Premium' },
    paletteTier: { standard: 'Standard palette', premium: 'Premium palette' },
    orphanHeading: 'Database rows without a catalog entry',
    orphanLead: 'Invitations that reference these rows keep rendering from their stored configuration.',
    orphanRow: (id, name, premium) => `#${id} ${name} (${premium ? 'premium' : 'free'})`,
    inspect: (name) => `Inspect ${name}`,
    detail: {
      back: 'All themes',
      publicPreview: 'Open the public preview',
      newTab: '(new tab)',
      problemsHeading: 'Validation problems',
      problemsLead: 'This manifest is refused and left out of the catalog manifests. Its derived candidate is shown as is below.',
      candidate: 'Manifest candidate (JSON)',
      identity: 'Identity',
      fields: {
        templateId: 'ID (config.theme.templateId)',
        slug: 'Public slug',
        category: 'Category',
        styleTags: 'Styles',
        motif: 'Motif',
        locales: 'Languages',
        defaultLocale: 'Default language',
        taglineId: 'Tagline (ID)',
        taglineEn: 'Tagline (EN)',
        schemaVersion: 'Schema version',
      },
      tierHeading: 'Tier and entitlement',
      tier: 'Tier',
      entitlement: 'Invitation entitlement',
      entitlementNote: 'The entitlement follows the tier, exactly as checkout prices it.',
      database: 'Database row',
      databaseAgrees: 'premium flag agrees with the tier',
      paletteHeading: 'Palette',
      paletteId: 'Palette',
      tokens: 'Guest-page tokens (palettes.ts)',
      cardPalette: 'Catalog card palette',
      cardAccentNote: 'The card accent draws keylines and ornaments only, never text.',
      sectionsHeading: 'Preset sections',
      choicesHeading: 'Appearance choices (G-041)',
      choicesLead: 'The choices an invitation started from this theme may make; the writers refuse anything else.',
      families: 'Design families',
      legacyDefault: 'Layout without a family',
      legacyDefaultValue: 'Classic (default)',
      sectionOrders: 'Section orders',
      defaultMarker: 'default',
      fontPairings: 'Font pairings',
      palettes: (count) => `Palettes offered (${count})`,
      ownPalette: 'theme palette',
      artHeading: 'Art and provenance (G-016)',
      artPool: 'Art pool',
      selfHosted: 'Serving',
      selfHostedValue: 'Same origin (/theme-art/)',
      roles: { card: 'card', cover: 'cover', gallery: 'gallery' },
      altFor: (roles, name) => `${roles.charAt(0).toUpperCase()}${roles.slice(1)} art for the ${name} theme`,
      size: (width, height, bytes) => `${width} × ${height} px · ${bytes.toLocaleString('en-US')} bytes`,
      sha256: 'File SHA-256',
      sourceId: 'Register entry',
      prompt: 'Generator prompt',
      originalSha256: 'Original SHA-256',
      crop: 'Reviewed crop',
      notRegistered: 'Not recorded in the art register',
      provenanceHeading: 'Provenance',
      provenance: {
        license: 'Licence',
        provenance: 'Provenance',
        author: 'Author',
        attribution: 'Attribution',
        generator: 'Generator',
        created: 'Created',
        derivation: 'Derivation',
        review: 'Review',
      },
      reviewHeading: 'Review status',
      reviewAgent: (reviewed, files) => `Agent self-review recorded for ${reviewed} of ${files} files (ADR-O09).`,
      reviewOwner: (status, pending, files) =>
        status === 'approved'
          ? `Owner approval recorded for ${files} files.`
          : status === 'pending'
            ? `Owner review pending for ${pending} of ${files} files.`
            : 'No owner review is recorded for these files.',
      reviewPublishing: 'Publishing from the console needs a recorded owner review and is not available yet.',
      manifestHeading: 'Manifest',
      manifestToggle: 'Show the manifest (JSON)',
    },
    orders: { standard: 'Default order', 'story-first': 'Story & gallery first', 'photos-last': 'Gallery last' },
    pairings: { 'serif-display': 'Serif headings', sans: 'Sans for all text' },
  },
};
