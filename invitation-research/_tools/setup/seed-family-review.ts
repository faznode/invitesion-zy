/**
 * Family review fixture (harness tooling, not product code): seeds a LOCAL database with fictional invitations that
 * exercise every guest-page layout through the real routes. Per layout: full content, full content over a cover photo,
 * sparse content, a non-wedding event, an expired (read-only) invitation and a dark palette, each with the five stress
 * guests of seed-local-demo.ts plus one opaque-link guest. Idempotent per slug: an existing invitation is updated in
 * place and only missing guests are added. Every person, number and place is fictional, and there is no religious text
 * (the verified corpus is empty, B-003). Event dates are relative to the run so the countdown and calendar links show.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/invitesion \
 *     npx tsx invitation-research/_tools/setup/seed-family-review.ts [--cover-url http://127.0.0.1:3100/review/cover.png] [--palettes] \
 *       [--logo-url /media/900001/b029b029b029b029b029b029.png]   (fictional logo on every corporate variant, B-029; an
 *       upload path as the editor stores it, or an http(s) URL)
 *
 * Guest pages: /i/review-<layout>-<variant>/<guest>. Layouts: legacy | gapura | kartu | riang | lontar. Variants: full | photo
 * (only with --cover-url) | sparse | birthday | corporate (B-029 programme stress) | expired | dark (legacy: full, photo,
 * corporate). Guests: budi-hartono, nama-panjang, hostile-name,
 * rtl-name, emoji-name; the opaque-link guest is printed per invitation (reachable by its token only, B-011).
 * `--palettes` adds /i/review-<layout>-p-<paletteId>/budi-hartono for every palette (rendered contrast sweep).
 *
 * `--mark-variants` (s17, B-029 organiser mark) adds per layout: corp-wide (wide logo over the cover photo when
 * --cover-url is given), corp-rtl (Arabic organisation name, tall logo), corp-nologo (category only) and corp-broken
 * (an upload path with no stored file). `--logo-files <square.png>,<wide.png>,<tall.png>` stores the fictional logos
 * through `saveImage` keyed to each invitation, the storage call of the upload route, and saves the returned media
 * path; set UPLOAD_ROOT to the server's upload root. The square logo goes on every `corporate` variant.
 *
 * `--ceremony` (s17, B-029 slice 3) adds per layout: aqiqah (every field the aqiqah tab offers), khitanan (stress: long
 * full name and school, Arabic parents' names), tasyakuran (housewarming) and share (the full wedding with a hashtag and
 * an http(s) filter link). Their texts are neutral wishes, checked against the religious-text heuristic like presets.
 * `--cover-low-url <url>` (s17, S16-X1) adds `photo-low` to every layout: the full wedding over a low-contrast cover.
 * `--questions` (s18, B-027 slice 2b) adds per layout: questions (registration form on, every question type, conditions,
 * a cycle; RSVP deadline ahead), questions-off (the same questions with the form switched off), questions-closed (deadline
 * passed) and questions-expired (read-only invitation).
 * `--match <regex>` seeds only the rows whose slug matches, so adding variants leaves every other review page (and its
 * run-relative dates) untouched, e.g. `--ceremony --match '-(aqiqah|khitanan|tasyakuran|share)$'`.
 * `--portraits <a.png>,<b.png>` (s20, D-038 person photos) stores two fictional portraits through `saveImage` keyed to each
 * invitation (as `--logo-files`; set UPLOAD_ROOT) and adds per layout: portraits (the full wedding with both photos and
 * parents lines), portraits-kid (an aqiqah photo the host switched on), portraits-kid-off (the same photo, switch off),
 * portraits-birthday (the celebrant's photo, switch on) and portraits-tasyakuran (an adult honouree, no switch needed).
 * `--music-url <url>` (s28, B-009) adds per layout: music (the full wedding with music that plays on opening: the cover
 * gate) and music-manual (play-on-open off: the control only). Point it at the generated tone, never a recording.
 * `--programme` (s23r, byte census) adds per layout: programme (a two-day corporate programme: 22 agenda rows, seven
 * speakers, two events, contact; no logo and no cover photo), the same content on every layout so `product-bytes.ts`
 * compares layouts rather than uploads, e.g. `--programme --match '-programme$'`.
 * `--new-invitations` (s29, F-02) adds /i/review-new-<eventType>/budi-hartono: what a new invitation of each type starts
 * as (first catalog template through `newInvitationConfig`), filled with review content; `--new-invitation-palettes` adds
 * /i/review-new-<family>-p-<paletteId>/budi-hartono for every family and palette a new invitation can start on.
 * `--profiles` (s29, B-023) adds per layout: profiles (the full wedding with stressed couple profiles and no photos).
 * `--photos <cover.jpg>,<bride.jpg>,<groom.jpg>[,<gallery.jpg>…]` (s30, B-019 / B-025) adds per layout: photos (the full
 * wedding whose cover, couple photos and gallery are host uploads stored through `saveImage` keyed to the invitation, as
 * the upload route stores them; set UPLOAD_ROOT), with the gallery listed in `media_assets` and one image-variant job
 * queued per upload exactly as the route queues it (`enqueueImageVariants`). Run `invitesion-jobs` afterwards to make the
 * variants. Use fictional, generated photos only; review assets never enter the repository.
 * `--photo-layouts` (s43, Q-D17; with `--photos`) adds per family photos-masonry and photos-carousel: the same uploads
 * under the masonry and carousel gallery, so photo-heavy page totals cover every gallery layout with host uploads (and
 * their variants) rather than fixture URLs, which the byte gate would count as design bytes.
 * `--gallery <url>,<url>[,…]` (s30, B-025) adds per family gallery-grid, gallery-masonry and gallery-carousel (the full
 * wedding with those photo URLs and the three fictional videos of `GALLERY_FIXTURE_VIDEOS` in `media_assets`; grid leaves
 * `gallery.layout` unset) and legacy gallery-carousel (D-041: still its grid, no video, no lightbox). The product-gates job
 * serves generated photos (`gallery-gate.ts --write-photos`) and runs `gallery-gate.ts` on these pages.
 * `--choices` (s44, G-041) adds per family choice-none (nothing stored), choice-default (the default ids the editor stores
 * when the host returns to them), choice-story-first, choice-photos-last, choice-sans and choice-retired (ids the contract
 * does not offer, as an old row may hold), and legacy choice-none and choice-story-first (D-041: a legacy page ignores
 * stored choices): the full wedding each time. With `--gallery <urls>` the choice rows get the gallery too, so
 * `photos-last` is visible, e.g. `--choices --gallery "$GALLERY_URLS" --match '-choice-'`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { eq } from 'drizzle-orm';
import { client, db } from '@/lib/db/drizzle';
import { guestMessages, guests, invitations, jobs, mediaAssets, users } from '@/lib/db/schema';
import { IMAGE_VARIANTS_JOB, variantSourceKey } from '@/lib/media/variants';
import { detailConfigSchema, type DetailConfig } from '@/lib/invitation/detail-config';
import { FAMILY_IDS, type FamilyId } from '@/lib/invitation/families';
import { newInvitationConfig } from '@/lib/invitation/new-invitation';
import { paletteIds } from '@/lib/invitation/palettes';
import { findUnverifiedReligiousText, loadCorpus, looksReligious } from '@/lib/invitation/religious-text';
import { catalogDefaultConfig, presetConfigFromTemplateDefaults } from '@/lib/invitation/template-defaults';
import { resolveEventType } from '@/lib/invitation/template-sync';
import { invitationTemplates, type InvitationTemplate } from '@/lib/invitation/templates';

type GuestSeed = { name: string; slug: string; guestCount: number; linkToken?: string | null };
export type ReviewInvitation = {
  slug: string;
  eventType: 'wedding' | 'birthday' | 'corporate' | 'aqiqah' | 'khitanan' | 'tasyakuran';
  expired: boolean;
  config: DetailConfig;
  guests: GuestSeed[];
  withMessages: boolean;
  /** Which fictional logo `--logo-files` stores for this invitation; `broken` saves an upload path with no file. */
  logo?: LogoKind;
  /** Which person photos `--portraits` stores for this invitation (D-038). */
  portrait?: PortraitKind;
  /** `--photos`: host uploads for the cover, the couple and the gallery (B-019 / B-025). */
  photos?: true;
  /** `--gallery`: the given photo URLs and the fixture's videos as the invitation's media (B-025). */
  gallery?: true;
};
type LogoKind = 'square' | 'wide' | 'tall' | 'broken';

/** `--gallery` (B-025): fictional videos only, one per kind the page offers; `gallery-gate.ts` answers the players itself. */
export const GALLERY_FIXTURE_VIDEOS = ['https://youtu.be/Contoh_0001', 'https://vimeo.com/123456789', 'https://video.contoh.example/acara/1'] as const;
type PortraitKind = 'couple' | 'kid' | 'kid-off' | 'birthday' | 'tasyakuran';

const STRESS_GUESTS: GuestSeed[] = [
  { name: 'Budi Hartono', slug: 'budi-hartono', guestCount: 2 },
  { name: 'Muhammad Fadhlurrahman Al-Ghifari & Putri Anindya Maharani Kusumawardhani', slug: 'nama-panjang', guestCount: 2 },
  { name: '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>', slug: 'hostile-name', guestCount: 1 },
  { name: 'عبد الله بن أحمد', slug: 'rtl-name', guestCount: 1 },
  { name: 'Sari 💐 & Keluarga 👨‍👩‍👧', slug: 'emoji-name', guestCount: 3 },
];

/** A stable 128-bit URL-safe token per invitation; link tokens are unique across all guests, so it cannot be shared. */
export const reviewToken = (slug: string) => createHash('sha256').update(`family-review:${slug}`).digest().subarray(0, 16).toString('base64url');

/** `YYYY-MM-DDTHH:MM:00+08:00` (WITA), `days` from now, so the fixture stays in the future whenever it is seeded. */
function witaAt(days: number, time: string): string {
  const date = new Date(Date.now() + days * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
  return `${date}T${time}:00+08:00`;
}

const COUPLE: DetailConfig['couple'] = {
  bride: { fullName: 'Laras Ayuningtyas', nickName: 'Laras', parents: 'Putri dari Bapak Fiktif & Ibu Contoh' },
  groom: { fullName: 'Dimas Prasetyo', nickName: 'Dimas', parents: 'Putra dari Bapak Rekaan & Ibu Sampel' },
  displayOrder: 'bride-first',
};

function weddingFull(paletteId: string, familyId?: FamilyId, imageUrl?: string): DetailConfig {
  return {
    couple: COUPLE,
    settings: { openingCopy: 'Dengan penuh rasa syukur, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan berbagi kebahagiaan di hari pernikahan kami.' },
    theme: { paletteId, familyId, cover: { headline: 'Pernikahan', imageUrl } },
    quote: { enabled: true, text: 'Rumah bukan soal tempat, melainkan soal siapa yang menunggu kita pulang.', author: 'Penulis Contoh (fiktif)' },
    events: [
      {
        title: 'Akad Nikah',
        startAt: witaAt(60, '09:00'),
        endAt: witaAt(60, '10:30'),
        venueName: 'Aula Contoh Makassar',
        address: 'Jl. Fiktif No. 1, Kecamatan Sampel, Makassar',
        mapUrl: 'https://maps.google.com/?q=-5.14,119.42',
        note: 'Mohon hadir 15 menit sebelum acara dimulai.',
      },
      { title: 'Resepsi', startAt: witaAt(60, '19:00'), endAt: witaAt(60, '21:00'), venueName: 'Gedung Sampel', address: 'Jl. Rekaan No. 2, Makassar' },
    ],
    story: {
      enabled: true,
      items: [
        { date: '2021', title: 'Pertama bertemu', body: 'Teks cerita fiktif untuk menguji tata letak: dua orang bertemu di sebuah perpustakaan kota.' },
        { date: '2025', title: 'Lamaran', body: 'Teks cerita fiktif kedua, sedikit lebih panjang agar baris kedua dan ketiga ikut teruji di layar sempit.' },
      ],
    },
    streaming: { enabled: true, platform: 'other', url: 'https://example.test/siaran' },
    gift: {
      enabled: true,
      accounts: [
        { kind: 'bank', label: 'Bank Contoh', holder: 'Laras Ayuningtyas', number: '0000 0000 0000 0000' },
        { kind: 'ewallet', label: 'Dompet Digital Contoh', holder: 'Dimas Prasetyo', number: '0800-0000-0000', note: 'Konfirmasi tidak diperlukan.' },
      ],
    },
    guestbook: { enabled: true, moderation: false, heading: 'Ucapan & Doa', prompt: 'Tuliskan pesan terbaikmu untuk kedua mempelai.' },
  };
}

function weddingSparse(familyId?: FamilyId): DetailConfig {
  return { couple: { bride: { nickName: 'Laras' }, groom: { nickName: 'Dimas' } }, theme: { paletteId: 'sand', familyId }, events: [{ title: 'Resepsi', startAt: witaAt(45, '19:00') }] };
}

function birthday(familyId?: FamilyId): DetailConfig {
  return {
    birthdayPerson: { fullName: 'Kirana Putri Maharani', nickName: 'Kirana', age: 7 },
    settings: { openingCopy: 'Ayo datang dan rayakan ulang tahun ketujuh Kirana bersama kami. Akan ada permainan, kue, dan banyak tawa.' },
    theme: { paletteId: 'confetti', familyId, cover: { headline: 'Ulang Tahun ke-7' } },
    events: [
      {
        title: 'Pesta Ulang Tahun',
        startAt: witaAt(30, '15:00'),
        endAt: witaAt(30, '17:30'),
        venueName: 'Taman Bermain Contoh',
        address: 'Jl. Fiktif No. 7, Makassar',
        note: 'Dresscode: warna cerah.',
      },
    ],
    gift: { enabled: true, accounts: [{ kind: 'address', label: 'Alamat kirim kado', holder: 'Keluarga Contoh', note: 'Jl. Fiktif No. 7, Makassar' }] },
    guestbook: { enabled: true, moderation: false, heading: 'Ucapan untuk Kirana' },
  };
}

/** B-029 stress: a long organisation name, 30 agenda rows (one very long), long and RTL speakers, contact links; logo only with --logo-url. */
function corporate(familyId?: FamilyId, logoUrl?: string): DetailConfig {
  const agenda = Array.from({ length: 30 }, (_, index) => {
    const minutes = 8 * 60 + index * 15;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}.${String(minutes % 60).padStart(2, '0')} WITA`;
    const title = index === 4 ? 'Diskusi Panel: Transformasi Digital Layanan Publik dan Kolaborasi Lintas Sektor di Kawasan Timur Indonesia' : `Sesi ${index + 1}: Materi Contoh`;
    return { time, title, speaker: index % 3 === 0 ? 'Narasumber Fiktif, M.Sc.' : undefined };
  });
  return {
    corporateProfile: {
      organizationName: 'PT Contoh Nusantara Sejahtera Abadi Makmur Sentosa (Persero) Tbk',
      eventName: 'Konferensi Mitra Tahunan 2026',
      eventCategory: 'conference',
      ...(logoUrl ? { logoUrl } : {}),
      description: 'Pertemuan tahunan mitra, pemasok, dan karyawan untuk meninjau capaian dan rencana tahun depan.\nSeluruh nama dan data dalam undangan ini fiktif.',
      agenda,
      speakers: [
        { name: 'Rina Wulandari', role: 'Direktur Utama', org: 'PT Contoh Nusantara' },
        { name: 'Dr. Ir. Bambang Sampel Rekaan Prasetyo Wibowo, M.Eng., IPU', role: 'Kepala Divisi Riset dan Pengembangan Teknologi Terapan', org: 'Lembaga Fiktif Nasional' },
        { name: 'عبد الله بن أحمد', role: 'Pembicara tamu', org: 'Institut Contoh' },
      ],
      dressCode: 'Batik formal',
      contactName: 'Panitia Acara (fiktif)',
      contactPhone: '+62 800-0000-0000',
      contactEmail: 'panitia@example.test',
    },
    theme: { paletteId: 'slate', familyId, cover: { headline: 'Undangan Resmi' } },
    events: [
      {
        title: 'Konferensi Mitra Tahunan',
        startAt: witaAt(40, '08:00'),
        endAt: witaAt(40, '16:00'),
        venueName: 'Balai Sidang Contoh',
        address: 'Jl. Fiktif No. 9, Makassar',
        mapUrl: 'https://maps.google.com/?q=-5.14,119.42',
      },
    ],
    guestbook: { enabled: false, moderation: false },
  };
}

/** `--mark-variants`: a short corporate programme that leaves the organiser mark, the cover and the headline in focus. */
function corporateMarkVariant(
  familyId: FamilyId | undefined,
  organizationName: string,
  eventCategory: 'product_launch' | 'seminar' | 'gala_award',
  imageUrl?: string,
): DetailConfig {
  return {
    corporateProfile: {
      organizationName,
      eventName: 'Peluncuran Layanan Contoh 2026',
      eventCategory,
      description: 'Acara fiktif untuk menguji logo, kategori, dan sampul undangan korporat.',
      agenda: [
        { time: '09.00 WITA', title: 'Registrasi' },
        { time: '09.30 WITA', title: 'Sambutan', speaker: 'Narasumber Fiktif' },
        { time: '10.00 WITA', title: 'Peluncuran' },
      ],
      contactName: 'Panitia Acara (fiktif)',
      contactEmail: 'panitia@example.test',
    },
    theme: { paletteId: 'slate', familyId, cover: { headline: 'Undangan Resmi', imageUrl } },
    events: [{ title: 'Peluncuran Layanan', startAt: witaAt(40, '09:00'), endAt: witaAt(40, '12:00'), venueName: 'Balai Sidang Contoh', address: 'Jl. Fiktif No. 9, Makassar' }],
    guestbook: { enabled: false, moderation: false },
  };
}

/**
 * `--programme` (s23r, census fixture): a two-day corporate programme with no host media. The agenda has no day field,
 * so the day travels in each row's time text, as a host has to type it today.
 */
function corporateProgramme(familyId?: FamilyId): DetailConfig {
  const day = (n: 1 | 2, rows: [time: string, title: string, speaker?: string][]) =>
    rows.map(([time, title, speaker]) => ({ time: `Hari ${n}, ${time} WITA`, title, ...(speaker ? { speaker } : {}) }));
  const venue = { venueName: 'Balai Sidang Contoh', address: 'Jl. Fiktif No. 9, Makassar', mapUrl: 'https://maps.google.com/?q=-5.14,119.42' };
  return {
    corporateProfile: {
      organizationName: 'PT Contoh Sinar Terang',
      eventName: 'Rapat Kerja dan Konferensi Mitra 2026',
      eventCategory: 'conference',
      description: 'Dua hari rapat kerja dan konferensi mitra untuk meninjau capaian, menyepakati rencana, dan memperkuat kerja sama.\nSeluruh nama dan data dalam undangan ini fiktif.',
      agenda: [
        ...day(1, [
          ['08.00', 'Registrasi dan sarapan'],
          ['08.45', 'Pembukaan', 'Pembawa Acara Fiktif'],
          ['09.00', 'Sambutan Direktur Utama', 'Sekar Ayu Pertiwi'],
          ['09.30', 'Paparan kinerja tahun berjalan', 'Bagus Wicaksono'],
          ['10.30', 'Rehat kopi'],
          ['10.45', 'Diskusi panel: rantai pasok yang tangguh', 'Nadia Rahmawati'],
          ['12.00', 'Makan siang'],
          ['13.00', 'Lokakarya kelompok A: layanan pelanggan', 'Fajar Nugroho'],
          ['13.00', 'Lokakarya kelompok B: operasional gudang', 'Intan Permatasari'],
          ['15.00', 'Rehat kopi'],
          ['15.15', 'Laporan lokakarya'],
          ['16.30', 'Penutupan hari pertama'],
        ]),
        ...day(2, [
          ['08.30', 'Registrasi'],
          ['09.00', 'Pidato utama: pasar Indonesia timur', 'Galih Saputra'],
          ['10.00', 'Sesi mitra: kisah kolaborasi', 'Wulan Anindita'],
          ['10.45', 'Rehat kopi'],
          ['11.00', 'Diskusi panel: transformasi digital', 'Nadia Rahmawati'],
          ['12.00', 'Makan siang'],
          ['13.00', 'Penandatanganan nota kesepahaman'],
          ['14.00', 'Rencana kerja tahun depan', 'Bagus Wicaksono'],
          ['15.00', 'Penghargaan mitra terbaik'],
          ['15.45', 'Penutupan', 'Sekar Ayu Pertiwi'],
        ]),
      ],
      speakers: [
        { name: 'Sekar Ayu Pertiwi', role: 'Direktur Utama', org: 'PT Contoh Sinar Terang' },
        { name: 'Bagus Wicaksono', role: 'Direktur Keuangan', org: 'PT Contoh Sinar Terang' },
        { name: 'Nadia Rahmawati', role: 'Moderator', org: 'Asosiasi Contoh Logistik' },
        { name: 'Fajar Nugroho', role: 'Kepala Layanan Pelanggan', org: 'PT Contoh Sinar Terang' },
        { name: 'Intan Permatasari', role: 'Kepala Operasional', org: 'PT Contoh Sinar Terang' },
        { name: 'Galih Saputra', role: 'Peneliti Ekonomi', org: 'Lembaga Fiktif Nasional' },
        { name: 'Wulan Anindita', role: 'Pemilik Usaha', org: 'CV Mitra Contoh' },
      ],
      dressCode: 'Hari 1: batik formal. Hari 2: kemeja berkerah.',
      contactName: 'Panitia Acara (fiktif)',
      contactPhone: '+62 800-0000-0000',
      contactEmail: 'panitia@example.test',
    },
    theme: { paletteId: 'slate', familyId, cover: { headline: 'Undangan Resmi' } },
    events: [
      { title: 'Hari 1: Rapat Kerja', startAt: witaAt(40, '08:00'), endAt: witaAt(40, '17:00'), ...venue },
      { title: 'Hari 2: Konferensi Mitra', startAt: witaAt(41, '08:30'), endAt: witaAt(41, '16:00'), ...venue },
    ],
    guestbook: { enabled: false, moderation: false },
  };
}

/** `--ceremony`: an aqiqah with every field the aqiqah tab offers. */
function aqiqahFull(familyId?: FamilyId): DetailConfig {
  return {
    ceremonyProfile: {
      honoureeName: 'Arka Pratama Wicaksono',
      gender: 'male',
      childOrder: 2,
      birthDate: '2026-10-03',
      birthPlace: 'Makassar',
      birthWeight: '3,2 kg',
      birthLength: '49 cm',
      fatherName: 'Dimas Prasetyo',
      motherName: 'Laras Ayuningtyas',
      nameMeaning: 'Arka berarti matahari, Pratama berarti yang pertama, dan Wicaksono berarti bijaksana (arti fiktif untuk pengujian).',
      prayer: 'Semoga tumbuh sehat, ceria, dan menjadi kebanggaan keluarga.',
    },
    settings: { openingCopy: 'Dengan penuh sukacita, kami mengundang Bapak/Ibu/Saudara/i untuk hadir pada syukuran kelahiran putra kedua kami.' },
    theme: { paletteId: 'mint', familyId, cover: { headline: 'Aqiqah' } },
    events: [{ title: 'Syukuran Aqiqah', startAt: witaAt(35, '10:00'), endAt: witaAt(35, '13:00'), venueName: 'Rumah Keluarga Contoh', address: 'Jl. Fiktif No. 3, Makassar' }],
    guestbook: { enabled: true, moderation: false, heading: 'Ucapan untuk Arka' },
  };
}

/** `--ceremony`: a khitanan profile under stress (long full name and school, Arabic parents' names). */
function khitananStress(familyId?: FamilyId): DetailConfig {
  return {
    ceremonyProfile: {
      honoureeName: 'Raka Aditya Nugraha Saputra Wijayakusuma',
      nickName: 'Raka',
      age: 10,
      school: 'Sekolah Dasar Negeri Contoh Nomor 1 Kecamatan Sampel Kabupaten Rekaan',
      circumcisionDate: '2026-12-20',
      fatherName: 'سامي',
      motherName: 'ليلى',
      prayer: 'Semoga lekas pulih dan segera kembali bermain bersama teman-teman.',
      recoveryNote: 'Raka belum bisa menerima tamu pada hari pertama. Terima kasih atas pengertiannya.',
    },
    theme: { paletteId: 'ocean', familyId, cover: { headline: 'Khitanan' } },
    events: [{ title: 'Syukuran Khitanan', startAt: witaAt(50, '10:00'), venueName: 'Rumah Keluarga Contoh', address: 'Jl. Fiktif No. 5, Makassar' }],
    guestbook: { enabled: false, moderation: false },
  };
}

/** `--ceremony`: a housewarming tasyakuran. */
function tasyakuranFull(familyId?: FamilyId): DetailConfig {
  return {
    ceremonyProfile: {
      honoureeName: 'Keluarga Hartono',
      thanksgivingCategory: 'housewarming',
      thanksgivingTitle: 'Syukuran Rumah Baru',
      achievement: 'Jl. Contoh Raya No. 12, Kelurahan Sampel, Makassar',
      ceremonyNote: 'Terima kasih atas dukungan selama kami pindah. Kami ingin berbagi kebahagiaan di rumah baru bersama Bapak/Ibu/Saudara/i.',
    },
    theme: { paletteId: 'sand', familyId, cover: { headline: 'Tasyakuran' } },
    events: [{ title: 'Syukuran Rumah Baru', startAt: witaAt(25, '16:00'), endAt: witaAt(25, '19:00'), venueName: 'Rumah Baru Keluarga Hartono', address: 'Jl. Contoh Raya No. 12, Makassar' }],
    guestbook: { enabled: true, moderation: false, heading: 'Ucapan untuk Keluarga Hartono' },
  };
}

/** `--ceremony`: the full wedding with the hashtag switched on and an http(s) filter link. */
function weddingShare(paletteId: string, familyId?: FamilyId): DetailConfig {
  return { ...weddingFull(paletteId, familyId), instagramStory: { enabled: true, hashtag: '#LarasDimas2026 #SampaiTuaBersama', filterUrl: 'https://example.test/filter-contoh' } };
}

/**
 * `--questions` (s18, B-027 slice 2b / E-029): every question type, required and optional, a condition on a choice, a
 * chained condition (on a conditional question), a two-question cycle the schema accepts (both ids exist) but which can
 * never apply, a long label, an RTL label and an RTL option. Fictional and neutral; nothing here is religious text.
 */
export const REVIEW_QUESTIONS: NonNullable<NonNullable<DetailConfig['registrationForm']>['customQuestions']> = [
  { id: 'menu', label: 'Pilihan menu', type: 'select', required: true, options: ['Nasi liwet', 'Vegetarian', 'Tanpa preferensi'] },
  { id: 'alergi', label: 'Bahan yang perlu kami hindari', type: 'text', required: false, conditional: { questionId: 'menu', equals: 'Vegetarian' } },
  { id: 'transport', label: 'Cara datang', type: 'radio', required: true, options: ['Kendaraan pribadi', 'Bus rombongan', 'Transportasi umum'] },
  { id: 'bus-titik', label: 'Titik jemput bus', type: 'select', required: true, options: ['Stasiun Contoh', 'Terminal Sampel'], conditional: { questionId: 'transport', equals: 'Bus rombongan' } },
  { id: 'bus-kursi', label: 'Jumlah kursi bus dari stasiun', type: 'number', required: false, conditional: { questionId: 'bus-titik', in: ['Stasiun Contoh'] } },
  { id: 'sesi', label: 'Sesi yang akan dihadiri', type: 'checkbox', required: true, options: ['Akad Nikah', 'Resepsi'] },
  { id: 'lagu', label: 'Lagu permintaan', type: 'multiselect', required: false, options: ['Keroncong', 'Pop', 'Jazz', 'أغنية تراثية من الشمال'] },
  {
    id: 'kenangan',
    label: 'Ceritakan satu kenangan singkat bersama mempelai yang boleh kami bacakan saat resepsi; beberapa kalimat sudah cukup, dan boleh dikosongkan bila tidak ada',
    type: 'textarea',
    required: false,
  },
  { id: 'anak', label: 'Jumlah anak di bawah lima tahun', type: 'number', required: false },
  { id: 'asal', label: 'من أين ستأتي؟', type: 'text', required: false },
  { id: 'siklus-a', label: 'Uji siklus A (tidak pernah berlaku)', type: 'text', required: false, conditional: { questionId: 'siklus-b', equals: 'ya' } },
  { id: 'siklus-b', label: 'Uji siklus B (tidak pernah berlaku)', type: 'text', required: true, conditional: { questionId: 'siklus-a', equals: 'ya' } },
];

/** `--questions`: the full wedding with the registration form, its questions and an RSVP deadline. */
function weddingQuestions(paletteId: string, familyId: FamilyId | undefined, formEnabled: boolean, deadline: string): DetailConfig {
  return {
    ...weddingFull(paletteId, familyId),
    rsvp: { enabled: true, deadline },
    registrationForm: { enabled: formEnabled, allowPlusOne: false, customQuestions: REVIEW_QUESTIONS },
  };
}

/** Host-text fields of the ceremony profile; fixture text there must not look religious (nothing is verified, B-003). */
const CEREMONY_TEXT_FIELDS = ['nameMeaning', 'prayer', 'recoveryNote', 'ceremonyNote'] as const;

/** `--palettes`: full content in every palette for every layout, one guest each (B-016 rendered contrast sweep). */
function paletteSweep(): ReviewInvitation[] {
  const layouts: (FamilyId | undefined)[] = [undefined, ...FAMILY_IDS];
  return layouts.flatMap((familyId) =>
    paletteIds.map((paletteId) => ({
      slug: `review-${familyId ?? 'legacy'}-p-${paletteId}`,
      eventType: 'wedding' as const,
      expired: false,
      config: weddingFull(paletteId, familyId),
      guests: [STRESS_GUESTS[0]],
      withMessages: true,
    })),
  );
}

export type ReviewOptions = {
  coverImageUrl?: string;
  /** `--cover-low-url`: a low-contrast cover for the `photo-low` variant of every layout (S16-X1 / taste candidate T1). */
  coverLowUrl?: string;
  palettes?: boolean;
  logoUrl?: string;
  markVariants?: boolean;
  ceremony?: boolean;
  /** `--questions` (s18): per layout `questions`, `questions-off` (form switched off), `questions-closed` (deadline passed), `questions-expired`. */
  questions?: boolean;
  /** `--portraits` (s20): per layout `portraits`, `portraits-kid`, `portraits-kid-off`, `portraits-birthday`, `portraits-tasyakuran`. */
  portraits?: boolean;
  /** `--programme` (s23r): per layout `programme`, the census's long corporate programme without host media. */
  programme?: boolean;
  /**
   * `--music-url <url>` (s28, B-009): per layout `music` (the full wedding with music that plays on opening, so the cover
   * gate shows) and `music-manual` (the same music with play-on-open off). The URL should serve the generated tone
   * (`tools/template-harness/cover-gate.ts --write-tone`), never a third-party recording.
   */
  musicUrl?: string;
  /**
   * `--new-invitations` (s29, F-02): per event type `new-<eventType>`, the config `createInvitation` starts that type with
   * (its first catalog template's preset through `newInvitationConfig`, `DEFAULT_FAMILY` on), filled with the type's
   * review content, so the rendered contrast of what a new invitation looks like is measured.
   */
  newInvitations?: boolean;
  /** `--new-invitation-palettes` (s29, F-02): `new-<family>-p-<paletteId>` for every family and palette a new invitation can start on. */
  newInvitationPalettes?: boolean;
  /**
   * `--profiles` (s29, B-023): per layout `profiles`, the full wedding whose couple profiles are under stress (a long full
   * name, an Arabic full name, emoji and markup in the parents, both child orders) and carry no photo, so the families'
   * text-only profiles are rendered and the legacy layout shows that it still needs a photo (D-041).
   */
  profiles?: boolean;
  /** `--photos <files>` (s30, B-019 / B-025): per layout `photos`, the full wedding with uploaded cover, couple and gallery photos. */
  photos?: boolean;
  /** `--photo-layouts` (s43, Q-D17; with `--photos`): per family `photos-masonry` and `photos-carousel` on the same uploads. */
  photoLayouts?: boolean;
  /** `--gallery <urls>` (s30, B-025): per family the three gallery layouts, plus legacy with a carousel stored. */
  gallery?: boolean;
  /** `--choices` (s44, G-041): the full wedding under every stored section order and font pairing, per family and legacy. */
  choices?: boolean;
};

/** `--choices` (G-041): what each choice row stores in `theme`; `retired` holds ids the contract never offered. */
const FAMILY_CHOICE_THEMES: Record<string, { sectionOrder?: string; fontPairing?: string }> = {
  none: {},
  default: { sectionOrder: 'standard', fontPairing: 'serif-display' },
  'story-first': { sectionOrder: 'story-first' },
  'photos-last': { sectionOrder: 'photos-last' },
  sans: { fontPairing: 'sans' },
  retired: { sectionOrder: 'gallery-first', fontPairing: 'comic-sans' },
};
const LEGACY_CHOICE_THEMES: Record<string, { sectionOrder?: string; fontPairing?: string }> = {
  none: {},
  'story-first': { sectionOrder: 'story-first', fontPairing: 'sans' },
};

/** `--profiles` (B-023): the couple under stress, without photos; every name is fictional. */
function weddingProfiles(paletteId: string, familyId?: FamilyId): DetailConfig {
  return {
    ...weddingFull(paletteId, familyId),
    couple: {
      bride: {
        nickName: 'Anindya',
        fullName: 'Putri Anindya Maharani Kusumawardhani Wicaksono Hadiningrat',
        parents: 'Bapak Fiktif Hadiwijaya <b>Sampel</b> & Ibu Contoh Sekar Kinasih',
        order: 1,
      },
      groom: { nickName: 'Sami', fullName: 'سامي الأحمد', parents: 'Keluarga 💐 Rekaan 👨‍👩‍👧', order: 3 },
      displayOrder: 'groom-first',
    },
  };
}

type ReviewEventType = ReviewInvitation['eventType'];
const NEW_INVITATION_TYPES: readonly ReviewEventType[] = ['wedding', 'birthday', 'aqiqah', 'tasyakuran', 'khitanan', 'corporate'];

/** What `createInvitation` starts an invitation of this type with from this catalog template (none: an empty preset). */
function newInvitationStart(eventType: ReviewEventType, template?: InvitationTemplate): DetailConfig {
  const preset = template ? presetConfigFromTemplateDefaults(catalogDefaultConfig(template)) : ({ ok: true, config: {} } as const);
  if (!preset.ok) throw new Error(`${template?.slug}: template defaults rejected: ${preset.issues.join('; ')}`);
  return detailConfigSchema.parse(newInvitationConfig(preset.config as Record<string, unknown>, eventType, { FLAG_DEFAULT_FAMILY: 'on' }));
}

export function familyReviewInvitations(options: ReviewOptions = {}): ReviewInvitation[] {
  const { coverImageUrl, coverLowUrl, logoUrl } = options;
  const withPaletteSweep = options.palettes ?? false;
  const withMarkVariants = options.markVariants ?? false;
  const withCeremony = options.ceremony ?? false;
  const withQuestions = options.questions ?? false;
  const withPortraits = options.portraits ?? false;
  const withProgramme = options.programme ?? false;
  const withToken = (slug: string): GuestSeed[] => [...STRESS_GUESTS, { name: 'Tamu Bertoken', slug: 'tamu-bertoken', guestCount: 2, linkToken: reviewToken(slug) }];
  const make = (
    slug: string,
    config: DetailConfig,
    options: Partial<Pick<ReviewInvitation, 'eventType' | 'expired' | 'withMessages' | 'logo' | 'portrait' | 'photos' | 'gallery'>> = {},
  ): ReviewInvitation => ({
    slug,
    eventType: options.eventType ?? 'wedding',
    expired: options.expired ?? false,
    config,
    guests: withToken(slug),
    withMessages: options.withMessages ?? true,
    ...(options.logo ? { logo: options.logo } : {}),
    ...(options.portrait ? { portrait: options.portrait } : {}),
    ...(options.photos ? { photos: options.photos } : {}),
    ...(options.gallery ? { gallery: options.gallery } : {}),
  });
  const corporateOptions = { eventType: 'corporate' as const, withMessages: false };
  const markVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] =>
    withMarkVariants
      ? [
          make(`review-${layout}-corp-wide`, corporateMarkVariant(familyId, 'PT Contoh Sinar Terang', 'product_launch', coverImageUrl), { ...corporateOptions, logo: 'wide' }),
          make(`review-${layout}-corp-rtl`, corporateMarkVariant(familyId, 'مؤسسة المثال للتنمية المستدامة', 'seminar'), { ...corporateOptions, logo: 'tall' }),
          make(`review-${layout}-corp-nologo`, corporateMarkVariant(familyId, 'Yayasan Contoh Lestari', 'gala_award'), corporateOptions),
          make(`review-${layout}-corp-broken`, corporateMarkVariant(familyId, 'CV Contoh Tautan Putus', 'seminar'), { ...corporateOptions, logo: 'broken' }),
        ]
      : [];
  const programmeVariant = (layout: string, familyId?: FamilyId): ReviewInvitation[] =>
    withProgramme ? [make(`review-${layout}-programme`, corporateProgramme(familyId), corporateOptions)] : [];
  const fullPalette: Record<FamilyId, string> = { gapura: 'ivory', kartu: 'terracotta', riang: 'ocean', lontar: 'sage' };
  const musicVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] => {
    if (!options.musicUrl) return [];
    const full = weddingFull(familyId ? fullPalette[familyId] : 'ivory', familyId);
    const music = { enabled: true, assetUrl: options.musicUrl, title: 'Nada uji (fiktif)' };
    return [
      make(`review-${layout}-music`, { ...full, music }),
      make(`review-${layout}-music-manual`, { ...full, music: { ...music, autoplay: false } }),
    ];
  };
  const ceremonyVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] =>
    withCeremony
      ? [
          make(`review-${layout}-aqiqah`, aqiqahFull(familyId), { eventType: 'aqiqah' }),
          make(`review-${layout}-khitanan`, khitananStress(familyId), { eventType: 'khitanan', withMessages: false }),
          make(`review-${layout}-tasyakuran`, tasyakuranFull(familyId), { eventType: 'tasyakuran', withMessages: false }),
          make(`review-${layout}-share`, weddingShare(familyId ? fullPalette[familyId] : 'ivory', familyId)),
        ]
      : [];
  const questionVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] => {
    if (!withQuestions) return [];
    const paletteId = familyId ? fullPalette[familyId] : 'ivory';
    const open = witaAt(50, '23:59');
    return [
      make(`review-${layout}-questions`, weddingQuestions(paletteId, familyId, true, open), { withMessages: false }),
      make(`review-${layout}-questions-off`, weddingQuestions(paletteId, familyId, false, open), { withMessages: false }),
      make(`review-${layout}-questions-closed`, weddingQuestions(paletteId, familyId, true, witaAt(-2, '12:00')), { withMessages: false }),
      make(`review-${layout}-questions-expired`, weddingQuestions(paletteId, familyId, true, open), { expired: true, withMessages: false }),
    ];
  };
  // `--portraits`: the photo URLs are added by `attachPortraits` once the invitation id (the media key) exists.
  const portraitVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] => {
    if (!withPortraits) return [];
    const paletteId = familyId ? fullPalette[familyId] : 'ivory';
    const couple = { ...weddingFull(paletteId, familyId), couple: { ...COUPLE, bride: { ...COUPLE?.bride, order: 2 }, groom: { ...COUPLE?.groom, order: 1 } } };
    return [
      make(`review-${layout}-portraits`, couple, { portrait: 'couple' }),
      make(`review-${layout}-portraits-kid`, aqiqahFull(familyId), { eventType: 'aqiqah', portrait: 'kid' }),
      make(`review-${layout}-portraits-kid-off`, aqiqahFull(familyId), { eventType: 'aqiqah', portrait: 'kid-off' }),
      make(`review-${layout}-portraits-birthday`, birthday(familyId), { eventType: 'birthday', portrait: 'birthday' }),
      make(`review-${layout}-portraits-tasyakuran`, tasyakuranFull(familyId), { eventType: 'tasyakuran', withMessages: false, portrait: 'tasyakuran' }),
    ];
  };
  const profileVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] =>
    options.profiles ? [make(`review-${layout}-profiles`, weddingProfiles(familyId ? fullPalette[familyId] : 'ivory', familyId), { withMessages: false })] : [];
  // `--photos`: the upload paths are added by `attachPhotos` once the invitation id (the media key) exists.
  // `--photo-layouts`: `attachPhotos` keeps the stored gallery layout, so masonry and carousel get the same uploads.
  const photoVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] => {
    if (!options.photos) return [];
    const full = weddingFull(familyId ? fullPalette[familyId] : 'ivory', familyId);
    const rows = [make(`review-${layout}-photos`, full, { photos: true })];
    if (options.photoLayouts && familyId) {
      for (const galleryLayout of ['masonry', 'carousel'] as const) {
        rows.push(make(`review-${layout}-photos-${galleryLayout}`, { ...full, gallery: { ...full.gallery, enabled: true, layout: galleryLayout } }, { photos: true }));
      }
    }
    return rows;
  };
  // `--gallery` (B-025): the media rows are added by `attachGallery`; "grid" is the family's own (no layout stored).
  const withGallery = (config: DetailConfig, layout?: 'masonry' | 'carousel'): DetailConfig => ({ ...config, gallery: { enabled: true, ...(layout && { layout }) } });
  const galleryVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] => {
    if (!options.gallery) return [];
    if (!familyId) return [make(`review-${layout}-gallery-carousel`, withGallery(weddingFull('ivory'), 'carousel'), { gallery: true, withMessages: false })];
    const full = weddingFull(fullPalette[familyId], familyId);
    return [
      make(`review-${layout}-gallery-grid`, withGallery(full), { gallery: true, withMessages: false }),
      make(`review-${layout}-gallery-masonry`, withGallery(full, 'masonry'), { gallery: true, withMessages: false }),
      make(`review-${layout}-gallery-carousel`, withGallery(full, 'carousel'), { gallery: true, withMessages: false }),
    ];
  };
  // `--choices` (G-041): the same full wedding under each stored choice; `--gallery` adds the media rows (`attachGallery`).
  const choiceVariants = (layout: string, familyId?: FamilyId): ReviewInvitation[] => {
    if (!options.choices) return [];
    const full = withGallery(weddingFull(familyId ? fullPalette[familyId] : 'ivory', familyId));
    const themes = familyId ? FAMILY_CHOICE_THEMES : LEGACY_CHOICE_THEMES;
    return Object.entries(themes).map(([name, choice]) =>
      make(`review-${layout}-choice-${name}`, { ...full, theme: { ...full.theme, ...choice } }, { gallery: true, withMessages: false }),
    );
  };
  // `--new-invitations` / `--new-invitation-palettes` (F-02): the review content of the type under a new invitation's theme
  // (the template's palette and the default family) and its B-026 gift default.
  const content: Record<ReviewEventType, (familyId: FamilyId) => DetailConfig> = {
    wedding: (familyId) => weddingFull('ivory', familyId),
    birthday: (familyId) => birthday(familyId),
    aqiqah: (familyId) => aqiqahFull(familyId),
    tasyakuran: (familyId) => tasyakuranFull(familyId),
    khitanan: (familyId) => khitananStress(familyId),
    corporate: (familyId) => corporate(familyId, logoUrl),
  };
  const filled = (eventType: ReviewEventType, start: DetailConfig): DetailConfig => {
    const familyId = start.theme?.familyId as FamilyId;
    const filledContent = content[eventType](familyId);
    // The new invitation's theme decides the palette: without one in the preset the page falls back to ivory, as it will.
    return {
      ...filledContent,
      theme: { ...filledContent.theme, paletteId: start.theme?.paletteId ?? 'ivory', ...start.theme },
      gift: { enabled: false, ...filledContent.gift, ...start.gift },
    };
  };
  const firstTemplate = (eventType: ReviewEventType) => invitationTemplates.find((template) => resolveEventType(template.category) === eventType);
  const newInvitationVariants = (): ReviewInvitation[] => {
    const rows: ReviewInvitation[] = [];
    if (options.newInvitations) {
      for (const eventType of NEW_INVITATION_TYPES) {
        rows.push(make(`review-new-${eventType}`, filled(eventType, newInvitationStart(eventType, firstTemplate(eventType))), { eventType, withMessages: false }));
      }
    }
    if (options.newInvitationPalettes) {
      const seen = new Set<string>();
      const starts = [
        ...invitationTemplates.flatMap((template) => {
          const eventType = resolveEventType(template.category) as ReviewEventType | null;
          return eventType ? [{ eventType, start: newInvitationStart(eventType, template) }] : [];
        }),
        ...NEW_INVITATION_TYPES.filter((eventType) => !firstTemplate(eventType)).map((eventType) => ({ eventType, start: newInvitationStart(eventType) })),
      ];
      for (const { eventType, start } of starts) {
        const key = `${start.theme?.familyId}-p-${start.theme?.paletteId ?? 'ivory'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(make(`review-new-${key}`, filled(eventType, start), { eventType, withMessages: false }));
      }
    }
    return rows;
  };
  const rows: ReviewInvitation[] = [make('review-legacy-full', weddingFull('ivory'))];
  rows.push(...ceremonyVariants('legacy'));
  rows.push(...questionVariants('legacy'));
  rows.push(...portraitVariants('legacy'));
  rows.push(...profileVariants('legacy'));
  rows.push(...photoVariants('legacy'));
  rows.push(...galleryVariants('legacy'));
  rows.push(...choiceVariants('legacy'));
  if (coverImageUrl) rows.push(make('review-legacy-photo', weddingFull('ivory', undefined, coverImageUrl)));
  if (coverLowUrl) rows.push(make('review-legacy-photo-low', weddingFull('ivory', undefined, coverLowUrl)));
  rows.push(make('review-legacy-corporate', corporate(undefined, logoUrl), { ...corporateOptions, logo: 'square' }));
  rows.push(...markVariants('legacy'));
  rows.push(...programmeVariant('legacy'));
  rows.push(...musicVariants('legacy'));
  for (const familyId of FAMILY_IDS) {
    rows.push(...musicVariants(familyId, familyId));
    rows.push(make(`review-${familyId}-full`, weddingFull(fullPalette[familyId], familyId)));
    if (coverImageUrl) rows.push(make(`review-${familyId}-photo`, weddingFull(fullPalette[familyId], familyId, coverImageUrl)));
    if (coverLowUrl) rows.push(make(`review-${familyId}-photo-low`, weddingFull(fullPalette[familyId], familyId, coverLowUrl)));
    rows.push(make(`review-${familyId}-sparse`, weddingSparse(familyId), { withMessages: false }));
    rows.push(make(`review-${familyId}-birthday`, birthday(familyId), { eventType: 'birthday' }));
    rows.push(make(`review-${familyId}-corporate`, corporate(familyId, logoUrl), { ...corporateOptions, logo: 'square' }));
    rows.push(...markVariants(familyId, familyId));
    rows.push(...programmeVariant(familyId, familyId));
    rows.push(make(`review-${familyId}-expired`, weddingFull(fullPalette[familyId], familyId), { expired: true }));
    rows.push(make(`review-${familyId}-dark`, weddingFull('midnight', familyId)));
    rows.push(...ceremonyVariants(familyId, familyId));
    rows.push(...questionVariants(familyId, familyId));
    rows.push(...portraitVariants(familyId, familyId));
    rows.push(...profileVariants(familyId, familyId));
    rows.push(...photoVariants(familyId, familyId));
    rows.push(...galleryVariants(familyId, familyId));
    rows.push(...choiceVariants(familyId, familyId));
  }
  rows.push(...newInvitationVariants());
  if (withPaletteSweep) rows.push(...paletteSweep());
  const corpus = loadCorpus();
  return rows.map((row) => {
    const config = detailConfigSchema.parse(row.config);
    const religious = findUnverifiedReligiousText(config, corpus);
    if (religious.length) throw new Error(`${row.slug}: unverified religious text at ${religious.map((finding) => finding.path).join(', ')}`);
    const ceremonyText = CEREMONY_TEXT_FIELDS.filter((field) => looksReligious(config.ceremonyProfile?.[field]));
    if (ceremonyText.length) throw new Error(`${row.slug}: fixture text looks religious at ceremonyProfile.${ceremonyText.join(', ceremonyProfile.')}`);
    return { ...row, config };
  });
}

async function upsertOwner() {
  const [existing] = await db.select().from(users).where(eq(users.email, 'demo.owner@example.test')).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(users).values({ email: 'demo.owner@example.test', name: 'Demo Owner (fixture)' }).returning();
  return created;
}

async function seed(row: ReviewInvitation, ownerId: number) {
  const now = Date.now();
  const values = {
    userId: ownerId,
    templateId: null,
    slug: row.slug,
    eventType: row.eventType,
    config: row.config,
    status: 'PUBLISHED',
    publishedAt: new Date(row.expired ? now - 400 * 86_400_000 : now),
    expiresAt: new Date(row.expired ? now - 35 * 86_400_000 : now + 365 * 86_400_000),
  };
  const [existing] = await db.select().from(invitations).where(eq(invitations.slug, row.slug)).limit(1);
  const [invitation] = existing
    ? await db.update(invitations).set(values).where(eq(invitations.id, existing.id)).returning()
    : await db.insert(invitations).values(values).returning();
  const present = new Set((await db.select({ slug: guests.slug }).from(guests).where(eq(guests.invitationId, invitation.id))).map((guest) => guest.slug));
  for (const guest of row.guests) if (!present.has(guest.slug)) await db.insert(guests).values({ invitationId: invitation.id, ...guest });
  if (row.withMessages) {
    const [message] = await db.select({ id: guestMessages.id }).from(guestMessages).where(eq(guestMessages.invitationId, invitation.id)).limit(1);
    const [first] = await db.select().from(guests).where(eq(guests.invitationId, invitation.id)).limit(1);
    if (!message && first) {
      await db.insert(guestMessages).values([
        { invitationId: invitation.id, guestId: first.id, name: first.name, message: 'Selamat berbahagia, semoga langgeng sampai kakek nenek.' },
        { invitationId: invitation.id, guestId: first.id, name: first.name, message: '<b>bold?</b> <script>alert("wish")</script> — uji markup di ucapan' },
      ]);
    }
  }
  return invitation;
}

/** lib/storage is marked server-only for the bundler; like scripts/verify-*.ts, this plain Node script neutralises it. */
async function loadStorage() {
  const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const load = loader._load;
  loader._load = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === 'server-only' ? {} : load.call(this, request, ...rest);
  };
  return import('@/lib/storage');
}

/** `--logo-files`: the fictional logo through the upload route's storage call, then the returned path saved in the config. */
async function attachLogo(invitationId: number, row: ReviewInvitation, files: string[]): Promise<string> {
  let url: string;
  if (row.logo === 'broken') {
    url = `/media/${invitationId}/${'0'.repeat(24)}.png`;
  } else {
    const { invitationMediaKey, saveImage } = await loadStorage();
    const path = files[{ square: 0, wide: 1, tall: 2 }[row.logo ?? 'square']];
    const file = new File([new Uint8Array(readFileSync(path))], 'logo.png', { type: 'image/png' });
    const stored = await saveImage((ext) => invitationMediaKey(invitationId, ext), file, 5 * 1024 * 1024);
    if (!stored) throw new Error(`${row.slug}: saveImage refused ${path}`);
    url = stored;
  }
  const config = detailConfigSchema.parse({ ...row.config, corporateProfile: { ...row.config.corporateProfile, logoUrl: url } });
  await db.update(invitations).set({ config }).where(eq(invitations.id, invitationId));
  return url;
}

/** `--portraits`: both fictional portraits through the upload route's storage call, then the paths saved in the config. */
async function attachPortraits(invitationId: number, row: ReviewInvitation, files: string[]): Promise<string[]> {
  const { invitationMediaKey, saveImage } = await loadStorage();
  const urls: string[] = [];
  for (const path of files) {
    const file = new File([new Uint8Array(readFileSync(path))], 'portrait.png', { type: 'image/png' });
    const stored = await saveImage((ext) => invitationMediaKey(invitationId, ext), file, 5 * 1024 * 1024);
    if (!stored) throw new Error(`${row.slug}: saveImage refused ${path}`);
    urls.push(stored);
  }
  const [a, b] = urls;
  const base = row.config;
  const patch: Partial<DetailConfig> =
    row.portrait === 'couple'
      ? { couple: { ...base.couple, bride: { ...base.couple?.bride, photoUrl: a }, groom: { ...base.couple?.groom, photoUrl: b } } }
      : row.portrait === 'birthday'
        ? { birthdayPerson: { ...base.birthdayPerson, photoUrl: a, showPhoto: true } }
        : { ceremonyProfile: { ...base.ceremonyProfile, photoUrl: row.portrait === 'tasyakuran' ? b : a, ...(row.portrait === 'kid' && { showPhoto: true }) } };
  const config = detailConfigSchema.parse({ ...base, ...patch });
  await db.update(invitations).set({ config }).where(eq(invitations.id, invitationId));
  return row.portrait === 'couple' ? urls : [row.portrait === 'tasyakuran' ? b : a];
}

/**
 * `--photos`: every file through the upload route's storage call, then: the cover and the couple photos in the config, the
 * rest as the gallery's `media_assets` rows in file order, and one image-variant job per upload queued as the route queues
 * it (kind, `{ key }`, the key as dedupe key, due now). A rerun replaces the invitation's gallery rows and stores the files
 * again (new keys); earlier objects stay in the scratch upload root.
 */
async function attachPhotos(invitationId: number, row: ReviewInvitation, files: string[]): Promise<string[]> {
  const { invitationMediaKey, saveImage } = await loadStorage();
  const urls: string[] = [];
  for (const path of files) {
    const file = new File([new Uint8Array(readFileSync(path))], 'photo.jpg', { type: 'image/jpeg' });
    const stored = await saveImage((ext) => invitationMediaKey(invitationId, ext), file, 5 * 1024 * 1024);
    if (!stored) throw new Error(`${row.slug}: saveImage refused ${path} (over 5 MB or not an image)`);
    urls.push(stored);
  }
  const [cover, bride, groom, ...gallery] = urls;
  const base = row.config;
  const config = detailConfigSchema.parse({
    ...base,
    theme: { ...base.theme, cover: { ...base.theme?.cover, imageUrl: cover } },
    couple: { ...base.couple, bride: { ...base.couple?.bride, photoUrl: bride }, groom: { ...base.couple?.groom, photoUrl: groom } },
    gallery: { ...base.gallery, enabled: true },
  });
  await db.update(invitations).set({ config }).where(eq(invitations.id, invitationId));
  await db.delete(mediaAssets).where(eq(mediaAssets.invitationId, invitationId));
  if (gallery.length) {
    await db.insert(mediaAssets).values(gallery.map((url, index) => ({ invitationId, type: 'photo', url, sortOrder: index, uploadSequence: index + 1, source: 'web' })));
  }
  for (const url of urls) {
    const key = variantSourceKey(url);
    if (!key) throw new Error(`${row.slug}: ${url} is not a variant source`);
    await db.insert(jobs).values({ kind: IMAGE_VARIANTS_JOB, payload: { key }, dedupeKey: key, runAt: new Date() }).onConflictDoNothing({ target: [jobs.kind, jobs.dedupeKey] });
  }
  return urls;
}

/**
 * `--gallery`: the invitation's media become the given photo URLs (in order) followed by the fixture's videos, exactly the
 * rows the editor's gallery tab adds (`type` photo / video, upload order). A rerun replaces them. No upload, no job.
 */
async function attachGallery(invitationId: number, urls: string[]): Promise<number> {
  await db.delete(mediaAssets).where(eq(mediaAssets.invitationId, invitationId));
  const rows = [...urls.map((url) => ({ type: 'photo', url })), ...GALLERY_FIXTURE_VIDEOS.map((url) => ({ type: 'video', url }))];
  await db.insert(mediaAssets).values(rows.map((row, index) => ({ invitationId, ...row, sortOrder: index, uploadSequence: index + 1, source: 'web' })));
  return rows.length;
}

async function main() {
  const argValue = (flag: string) => (process.argv.indexOf(flag) > 0 ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
  const all = familyReviewInvitations({
    coverImageUrl: argValue('--cover-url'),
    coverLowUrl: argValue('--cover-low-url'),
    palettes: process.argv.includes('--palettes'),
    logoUrl: argValue('--logo-url'),
    markVariants: process.argv.includes('--mark-variants'),
    ceremony: process.argv.includes('--ceremony'),
    questions: process.argv.includes('--questions'),
    portraits: process.argv.includes('--portraits'),
    programme: process.argv.includes('--programme'),
    musicUrl: argValue('--music-url'),
    newInvitations: process.argv.includes('--new-invitations'),
    newInvitationPalettes: process.argv.includes('--new-invitation-palettes'),
    profiles: process.argv.includes('--profiles'),
    photos: process.argv.includes('--photos'),
    photoLayouts: process.argv.includes('--photo-layouts'),
    gallery: process.argv.includes('--gallery'),
    choices: process.argv.includes('--choices'),
  });
  const match = argValue('--match');
  const rows = match ? all.filter((row) => new RegExp(match).test(row.slug)) : all;
  if (match && !rows.length) throw new Error(`--match ${match}: no review slug matches`);
  const logoFiles = argValue('--logo-files')?.split(',');
  if (logoFiles && logoFiles.length !== 3) throw new Error('--logo-files takes <square.png>,<wide.png>,<tall.png>');
  const portraitFiles = argValue('--portraits')?.split(',');
  if (portraitFiles && portraitFiles.length !== 2) throw new Error('--portraits takes <a.png>,<b.png>');
  const photoFiles = argValue('--photos')?.split(',');
  if (process.argv.includes('--photos') && (!photoFiles || photoFiles.length < 3)) throw new Error('--photos takes <cover>,<bride>,<groom>[,<gallery>…]');
  const galleryUrls = argValue('--gallery')?.split(',');
  if (process.argv.includes('--gallery') && (!galleryUrls || galleryUrls.length < 2)) throw new Error('--gallery takes <photo url>,<photo url>[,…]');
  const owner = await upsertOwner();
  const seeded: string[] = [];
  const logos: Record<string, string> = {};
  const portraits: Record<string, string[]> = {};
  const photos: Record<string, string[]> = {};
  const gallery: Record<string, number> = {};
  for (const row of rows) {
    const invitation = await seed(row, owner.id);
    seeded.push(invitation.slug);
    if (row.logo && logoFiles) logos[row.slug] = await attachLogo(invitation.id, row, logoFiles);
    if (row.portrait && portraitFiles) portraits[row.slug] = await attachPortraits(invitation.id, row, portraitFiles);
    if (row.photos && photoFiles) photos[row.slug] = await attachPhotos(invitation.id, row, photoFiles);
    if (row.gallery && galleryUrls) gallery[row.slug] = await attachGallery(invitation.id, galleryUrls);
  }
  console.log(
    JSON.stringify({ invitations: seeded, guests: STRESS_GUESTS.map((guest) => guest.slug), tokens: Object.fromEntries(rows.map((row) => [row.slug, reviewToken(row.slug)])), logos, portraits, photos, gallery }),
  );
}

if (require.main === module) {
  main()
    .then(() => client.end())
    .catch(async (error) => {
      console.error(error);
      await client.end();
      process.exit(1);
    });
}
