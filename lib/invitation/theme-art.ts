import {
  invitationTemplates,
  type InvitationTemplate,
  type TemplateCategory,
  type TemplateMotif,
} from './templates';
import { THEME_ART_REGISTER, type ThemeArtAsset } from './theme-art-register';

/**
 * Theme art: each catalog template gets a cover and a six-photo gallery from one of 22 mood pools.
 *
 * G-016 (sessions 43–44): a pool listed in `theme-art-register.ts` is served from self-hosted, original WebP files under
 * `/theme-art/`; every pool that serves a catalog template is listed, so all 64 catalog templates are self-hosted. The
 * three pools no catalog template uses (watercolor, lavender, graduation) still name Unsplash photos for a template
 * outside the catalog; `REMOTE_THEME_ART_POOLS` names that boundary, and the remote ids stay for the rollback.
 *
 * BASIS DATA ASET FOTO TEMA — ±105 foto dari Unsplash (Unsplash License:
 * gratis komersial, tanpa atribusi), dikurasi ke 22 “mood pool”.
 *
 * Prinsip art direction:
 * 1. UNIK — setiap template diberi cover BERBEDA lewat penugasan round-robin
 *    per pool (lihat REGISTRY di bawah), jadi tidak ada dua tema dengan
 *    wajah yang sama.
 * 2. ELEGAN, BUKAN LEBAY — foto selalu dirender di bawah tint palet tema
 *    (duotone), bukan foto mentah warna-warni.
 * 3. TERSIMPAN DI DATABASE — template-sync menulis cover ke kolom
 *    `templates.thumbnail` dan seluruh set ke `defaultConfig.art`; FE tidak
 *    membaca basis data ini secara langsung.
 * 4. SIAP TUMBUH — pool jauh lebih besar dari kebutuhan 63 tema sekarang,
 *    jadi katalog bisa ditambah banyak template baru tanpa cari aset lagi.
 */

export type ThemeArt = {
  cover: string;
  gallery: string[];
  /** The catalog card's smaller cut. Only self-hosted art has one; the card falls back to `cover`. */
  card?: string;
};

// URL dirakit dari potongan agar tidak dirusak linkifier saat transfer file.
const asset = (id: string, width = 1200): string =>
  ['https:', '//unsplash.com/photos/', id, '/download?force=true&w=', String(width)].join('');

const POOLS = {
  /** Buket pengantin & bunga putih segar. */
  floral: ['M9plHtqtooo', 'y6Qj8MmFn_Y', 'jziexf1zCpE', 'U-ouhtPgHH4', 'LW5SptinceM', 'EqN9ZNTQL8A'],
  /** Peony pink — romantis, lembut. */
  peony: ['yH6pheDeWyU', 'BjvINSPxoOc', 'OwJQokh_1nE', '9QEgC4UrHDQ', 'VaTGtmvpwdU', 'UsGgbGAlNmg', 'RZDf061Fijo', 'gas1Mjc1qtk', 'b5MN1_rkCEo'],
  /** Mawar merah dark & moody — dramatis, mewah. */
  rose: ['TODIpV2vemM', 'dW4ANPdrCmE', 'exgKAjOQ_MA', 'Hee4oIesRzs', 'QqxzTna6Zo8'],
  /** Lukisan bunga cat air — lembut untuk acara keluarga. */
  watercolor: ['EqN9ZNTQL8A', 'U-ouhtPgHH4', 'dYI8Zuq6NKw', '3j1wHuGWyWo', 'y6Qj8MmFn_Y', 'LW5SptinceM'],
  /** Sakura — musim semi, merah muda. */
  sakura: ['bBWHtMOvxKY', 'jc7gs-3GIvU', 'rXP0_9J1fjU', 'rrtosiORvAI', 'McsNra2VRQQ', 'lFTtQqVfx6g', 'Ml8WeLdCnRU'],
  /** Ladang lavender — ungu kalem. */
  lavender: ['c1Jp-fo53U8', 'DY5uVaNm-gE', 'gnx_-muR0uw', 'OJimPBFyz6w', 'NrflUuJJK0I', 'nD9tEn63suc'],
  /** Eucalyptus & greenery minimal. */
  eucalyptus: ['735H1YX-5Wg', 'vFSq5jKgJcY', 'hX_hf2lPpUU', '9FgX4ESZt5A', 'jQeueSlRa5k'],
  /** Bulan purnama & langit malam. */
  night: ['ve_uN9V8xqU', '9ETLKjGT23s', 'gy_aWlGJ3OI'],
  /** Dedaunan tropis gelap — rimbun. */
  tropics: ['Z06J1uXTmE4', 'Xb-6me_7ppI', 'aTEZUXCkCa0', 'NY8rjKmuXKA', 'Zsq1vCXdkEY', 'Vi_I8vX65Hc'],
  /** Terasering sawah Bali — sangat Indonesia. */
  sawah: ['FlQeHeTPClU', 'D4gTA7MFv7g', 'b_4C5VyoJ2A'],
  /** Kain batik Indonesia asli. */
  batik: ['rIaTxHPwPQs', 'N7RwH3-iG-c', 'fCwagrCDsXE', 'Je5LAz-fTxk', '_udDObpRQeE', 'FAouwi10XCc'],
  /** Arsitektur & ornamen geometris Islam. */
  islamic: ['NzGCJCiQslU', '-oUlREmJ_VU', '1fc8VMZaJeo', 'qHzx-RY5h08', 'yj6nstGYdbo'],
  /** Dried flowers & pampas — boho krem. */
  boho: ['3pR7d-tIRx8', '3j1wHuGWyWo', 'LW5SptinceM', 'Fwvpv1SYeOo', '9mn4cCxprHs', 'y-IwXNMxN_o', '1JsFbR94CCQ'],
  /** Pantai golden hour. */
  beach: ['YVTgL0HquOQ', 'KMn4VEeEPR8', 'NwgnUajOL7Q'],
  /** Kabut hutan pagi — halus, puitis. */
  mist: ['3pW91fGAKiE', 'N6Hfx-W2tIk', 'tkoA1sWwHUg', 'vrzUbp1nCuA'],
  /** Tekstur kain emas — mewah. */
  gold: ['6vYqSpWjiaQ', 'hLJ0KNUcaLE', 'l4O01JjSGxw', '7WXsn8Rof-8', 'Qh8qQctzg-A'],
  /** Marmer putih — minimal, bersih. */
  marble: ['li0iC0rjvvg', 'EIYA7E626Xk', '1LsEMVqgY3Y', 'Oa38AE0E8W0', 'fcWAwPKpkTU', 'qc_MTi2640E'],
  /** Lilin & bokeh hangat — intim. */
  candle: ['t_FNrFEGkaI', 'HSSLmfWJgaA', 'YQnXnnbRXa8', 'KJndGPNN0Rw', 'wKkJ7exEJmI', 'Q7qr5v0XHaE', 'U9luDrrHdME'],
  /** Balon pastel — pesta ceria. */
  party: ['Hli3R6LKibo', 'egBDGW-fgF0', '2uEIkDj1ZkE', 'YX0rzQ-N6rc', 'a_vaToRnvPs', '5eRjQXca4ro'],
  /** Kembang api malam. */
  fireworks: ['QEOcq1OgUmA', 'E47cbxI3Tf0', 'TWkB2rKYQ5o', '9xPjoOnzsfA', 'qHgt7a68dR4', 'kNE4fC9wOZo', 'YZdyJGsgW68', 'aFg0DKV8ojk', 'nmIZ--tz1Qw'],
  /** Wisuda — toga & selebrasi. */
  graduation: ['_kd5cxwZOK4', 'iggWDxHTAUQ', '2RouMSg9Rnw', 'IK07skiu2QY', 'vtenHhT-iug', 'NXnX56qv2c0'],
  /** Ballroom & lampu gantung — formal. */
  elegant: ['V9MbvZdcjrA', 'ZsmGM195K1w', 'EJQnHC6GEe8'],
} satisfies Record<string, string[]>;

export type ThemeArtPoolKey = keyof typeof POOLS;
type PoolKey = ThemeArtPoolKey;

/** Override per tema signature — pasangan seni paling pas. */
const SLUG_POOLS: Record<string, PoolKey> = {
  'melati-suci': 'floral',
  'garden-rose': 'rose',
  'batik-kencana': 'batik',
  'frangipani-bali': 'tropics',
  'vine-ivy': 'eucalyptus',
  'teratai-subuh': 'night',
  'pearl-koi': 'mist',
  'bunga-kering': 'boho',
  'kurma-oasis': 'gold',
  'marigold-fiesta': 'party',
  'pink-or-blue': 'sakura',
  'purnabakti-emas': 'elegant',
  'ignition': 'fireworks',
  'kickoff-arena': 'fireworks',
  'after-hours-mixer': 'candle',
  'offsite-escape': 'sawah',
  'boardroom-charter': 'marble',
  'velvet-rope': 'rose',
  'bravo-team': 'party',
  'grand-stage': 'fireworks',
  'kampung-fest': 'party',
};

const MOTIF_POOLS: Partial<Record<TemplateMotif, PoolKey>> = {
  botanical: 'eucalyptus',
  deco: 'gold',
  stars: 'night',
  waves: 'beach',
  crescent: 'islamic',
  geometric: 'marble',
  confetti: 'fireworks',
  balloons: 'party',
  arch: 'marble',
  monogram: 'gold',
  rings: 'rose',
};

const CATEGORY_POOLS: Record<TemplateCategory, PoolKey> = {
  wedding: 'peony',
  anniversary: 'candle',
  'bridal-shower': 'peony',
  birthday: 'party',
  'aqiqah-khitanan': 'watercolor',
  syukuran: 'sawah',
  'baby-shower': 'watercolor',
  graduation: 'graduation',
  reunion: 'candle',
  'holiday-gathering': 'tropics',
  corporate: 'elegant',
  'gender-reveal': 'sakura',
  tahlilan: 'islamic',
  retirement: 'elegant',
  'product-launch': 'fireworks',
  conference: 'marble',
  tradeshow: 'marble',
  'sales-kickoff': 'fireworks',
  workshop: 'eucalyptus',
  networking: 'candle',
  'team-building': 'sawah',
  'investor-meeting': 'marble',
  gala: 'gold',
  'client-vip': 'gold',
  'employee-appreciation': 'party',
  shows: 'fireworks',
  'community-event': 'party',
};

const poolKeyFor = (
  template: Pick<InvitationTemplate, 'slug' | 'category' | 'motif'>,
): PoolKey =>
  SLUG_POOLS[template.slug] ??
  MOTIF_POOLS[template.motif] ??
  CATEGORY_POOLS[template.category] ??
  'floral';

const buildRemoteArt = (photos: string[], index: number): ThemeArt => ({
  cover: asset(photos[index % photos.length], 1400),
  gallery: Array.from({ length: 6 }, (_, g) =>
    asset(photos[(index + 1 + g) % photos.length], 800),
  ),
});

/** The same rotation as the remote pools, over the register's files. */
const buildLocalArt = (assets: readonly ThemeArtAsset[], index: number): ThemeArt => {
  const lead = assets[index % assets.length];
  return {
    cover: lead.files.cover.path,
    gallery: Array.from({ length: 6 }, (_, g) => assets[(index + 1 + g) % assets.length].files.gallery.path),
    card: lead.files.card.path,
  };
};

const groupByPool = (register: readonly ThemeArtAsset[]): Map<PoolKey, ThemeArtAsset[]> => {
  const pools = new Map<PoolKey, ThemeArtAsset[]>();
  for (const entry of register) pools.set(entry.pool, [...(pools.get(entry.pool) ?? []), entry]);
  return pools;
};

/**
 * Registry deterministik: iterasi katalog sekali, tiap pool punya counter
 * sendiri — template ke-n dalam satu pool memakai foto ke-n. Hasilnya
 * setiap tema mendapat cover unik (sampai pool-nya habis) dan urutan galeri
 * yang bergeser, tanpa random sehingga aman untuk SSR & seeding DB.
 *
 * A pool with register entries resolves to its self-hosted files; any other pool to its remote photos. Exported so a
 * test can prove that an empty register reproduces the pre-G-016 output (the rollback).
 */
export function buildThemeArtRegistry(register: readonly ThemeArtAsset[]): Map<string, ThemeArt> {
  const local = groupByPool(register);
  const registry = new Map<string, ThemeArt>();
  const counters = new Map<PoolKey, number>();
  for (const tpl of invitationTemplates) {
    const key = poolKeyFor(tpl);
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    const assets = local.get(key);
    registry.set(tpl.slug, assets ? buildLocalArt(assets, index) : buildRemoteArt(POOLS[key], index));
  }
  return registry;
}

const LOCAL_POOLS = groupByPool(THEME_ART_REGISTER);
const REGISTRY = buildThemeArtRegistry(THEME_ART_REGISTER);

/** Pools that still hotlink remote photos at runtime (the G-016 boundary). */
export const REMOTE_THEME_ART_POOLS: readonly PoolKey[] = (Object.keys(POOLS) as PoolKey[]).filter(
  (key) => !LOCAL_POOLS.has(key),
);

export function getThemeArt(
  template: Pick<InvitationTemplate, 'slug' | 'category' | 'motif'>,
): ThemeArt {
  const registered = REGISTRY.get(template.slug);
  if (registered) return registered;
  const key = poolKeyFor(template);
  const assets = LOCAL_POOLS.get(key);
  return assets ? buildLocalArt(assets, 0) : buildRemoteArt(POOLS[key], 0);
}

/** True when every image of an art set is served from this origin's `/theme-art/` files. */
export function isSelfHostedThemeArt(art: ThemeArt): boolean {
  return [art.cover, ...art.gallery, ...(art.card ? [art.card] : [])].every((src) => src.startsWith('/theme-art/'));
}
