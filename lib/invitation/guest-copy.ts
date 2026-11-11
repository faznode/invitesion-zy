import { isFlagOn } from '@/lib/flags';
import { familyOf } from './families';
import { MEMORIAL_COPY } from './occasion';

/**
 * G-018 (I-31): the guest page's own words in the invitation's language (`settings.language`), Indonesian by default.
 *
 * One typed dictionary with the same keys in both languages; `tests/g018-guest-language.test.ts` checks completeness and
 * that no Indonesian is left in the English set. The Indonesian entries are exactly the words every layout printed before
 * G-018, so an Indonesian page renders byte-identically. Host-written content (names, titles, opening copy, questions,
 * venues), proper names, event time zones and approved quotation text are never translated: they are the host's words.
 *
 * Server-only by use: client islands receive just the strings they need as props, so a guest page's bundle never carries
 * this dictionary. The legacy layout is frozen (D-041) and always receives the Indonesian entries.
 */

export type GuestLanguage = 'id' | 'en';
export const GUEST_LANGUAGES: readonly GuestLanguage[] = ['id', 'en'];

/**
 * The language a guest page speaks: the invitation's `settings.language`; Indonesian when unset or unknown, and for every
 * invitation when `FLAG_GUEST_LANGUAGE=off` (the rollback to Indonesian).
 */
export function guestLanguageOf(language: string | null | undefined, env: Record<string, string | undefined> = process.env): GuestLanguage {
  return language === 'en' && isFlagOn('GUEST_LANGUAGE', env) ? 'en' : 'id';
}

/**
 * The one language every guest surface of an invitation speaks: the page, its document language (`<html lang>`), title,
 * link preview (Open Graph and `og.png`), calendar entry and guest pass. A design family follows `settings.language`
 * (`guestLanguageOf`); the classic layout is frozen (D-041) and renders Indonesian, so an invitation on it stays Indonesian
 * on every surface, whatever is stored. One invitation never mixes languages, and the document language always matches
 * the words on the page.
 */
export function guestPageLanguage(
  config: { theme?: { familyId?: string | null }; settings?: { language?: string | null } } | null | undefined,
  env: Record<string, string | undefined> = process.env,
): GuestLanguage {
  return familyOf(config?.theme?.familyId) ? guestLanguageOf(config?.settings?.language, env) : 'id';
}

/** Dates and times in the guest's language; event time zones (WIB / WITA / WIT) are labelled the same in both. */
export const GUEST_DATE_LOCALE: Record<GuestLanguage, string> = { id: 'id-ID', en: 'en-GB' };

/** Open Graph locale of the link preview. */
export const GUEST_OG_LOCALE: Record<GuestLanguage, string> = { id: 'id_ID', en: 'en_GB' };

type Pair = [before: string, after: string];
type Triple = [first: string, second: string, third: string];

const ID_ORDINALS = ['pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'keenam', 'ketujuh', 'kedelapan', 'kesembilan', 'kesepuluh'];
const EN_ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
/** 11th, 21st, 22nd, 23rd, 111th: past the spelled-out ten. */
const englishOrdinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;

const ID = {
  invitation: 'Undangan',
  pageTitle: 'Undangan Digital',
  /** A guest route's 404 title (unknown, unpublished or deleted invitation, unknown guest, no pass), in the visitor's locale. */
  notFoundTitle: 'Undangan tidak ditemukan',
  dear: 'Kepada Yth.',
  forYou: 'Untuk',
  youAreInvited: 'Kamu diundang',
  footer: 'Undangan digital oleh Invitesion',
  /** The cover gate's kicker per event type (B-009) and the link preview's label (B-010). */
  kickers: {
    wedding: 'Undangan Pernikahan',
    birthday: 'Undangan Ulang Tahun',
    aqiqah: 'Undangan Aqiqah',
    khitanan: 'Undangan Khitanan',
    tasyakuran: 'Undangan Tasyakuran',
    corporate: 'Undangan Acara',
  } as Record<string, string>,
  memorial: { invitation: MEMORIAL_COPY.invitation as string, heading: MEMORIAL_COPY.profileHeading as string },
  sections: {
    eventSeries: 'Rangkaian Acara',
    timeAndPlace: 'Waktu & Tempat',
    event: 'Acara',
    ourStory: 'Cerita Kami',
    story: 'Cerita',
    gallery: 'Galeri',
    liveStream: 'Siaran Langsung',
    tokenOfLove: 'Tanda Kasih',
    gifts: 'Hadiah',
    giftsCasual: 'Kado',
    rsvp: 'Konfirmasi Kehadiran',
    wishes: 'Ucapan & Doa',
    share: 'Bagikan Momen',
  },
  /** Kartu's small labels above its section titles. */
  kartuLabels: {
    timeAndPlace: 'Waktu & tempat',
    profile: 'Profil',
    journey: 'Perjalanan',
    moments: 'Momen',
    fromAfar: 'Dari jauh',
    social: 'Media sosial',
    tokenOfLove: 'Tanda kasih',
    rsvp: 'RSVP',
    guestbook: 'Buku tamu',
  },
  kartuProgramme: { about: 'Sekilas', agenda: 'Jadwal', speakers: 'Narasumber', info: 'Sebelum datang' },
  programme: { about: 'Tentang Acara', agenda: 'Susunan Acara', speakers: 'Pembicara', info: 'Informasi Tamu', dressCode: 'Dress code', contact: 'Narahubung' },
  until: 'sampai',
  watchStream: 'Tonton siaran',
  seeLocation: 'Lihat lokasi',
  calendarGoogle: 'Simpan ke Google Calendar',
  calendarFile: 'Unduh kalender (.ics)',
  readOnly: 'Undangan ini sudah melewati masa aktif. Kamu masih bisa melihat detailnya, tetapi RSVP dan buku tamu sudah ditutup.',
  retryIn: (minutes: number) => `Silakan coba lagi dalam ${minutes} menit.`,
  retryLater: 'Silakan coba lagi beberapa menit lagi.',
  share: { prompt: 'Unggah momenmu dengan tagar:', filter: 'Coba filter Instagram' },
  /** G-035 (I-16): the footer's share actions; the shared address is always the invitation link, never the guest's own. */
  inviteShare: {
    heading: 'Bagikan undangan ini',
    share: 'Bagikan undangan',
    whatsapp: 'Kirim lewat WhatsApp',
    story: 'Unduh gambar Status / Story',
    copied: 'Tautan undangan disalin.',
    manual: 'Salin tautan undangan dari kotak di bawah ini.',
    link: 'Tautan undangan',
  },
  /** G-036 (I-05): the cover's large-text switch, a toggle button whose pressed state is announced. */
  reading: {
    toggle: 'Huruf besar',
  },
  /** G-055 (I-30): the caption under a printable card's QR code. */
  card: {
    scan: 'Pindai kode ini untuk membuka undangan',
  },
  /** G-029: the location's map, shown in place only after the guest asks for it (a disclosure button). */
  map: {
    show: 'Tampilkan peta',
    hide: 'Sembunyikan peta',
    frame: 'Peta lokasi',
  },
  gift: {
    withheld: 'Detail rekening dan QRIS hanya tampil di tautan undangan pribadi yang dikirimkan kepada Anda.',
    qrisAlt: 'Kode QRIS untuk tanda kasih',
    qrisNote: 'QRIS statis dari tuan rumah. Pindai dengan aplikasi bank atau dompet digital.',
    /** Printed before the account holder's name as its own text node, exactly as the layouts printed "a.n. " before G-018. */
    holderPrefix: 'a.n. ',
  },
  rsvp: {
    refusedClosed: 'Konfirmasimu belum tersimpan karena RSVP untuk undangan ini sudah ditutup.',
    closed: 'RSVP untuk undangan ini sudah ditutup.',
    deadlinePassed: (deadline?: string) => `Batas waktu konfirmasi kehadiran sudah lewat${deadline ? ` (${deadline})` : ''}.`,
    personalOnly: 'Konfirmasi kehadiran tersedia melalui tautan undangan personal yang dikirimkan kepadamu.',
    saved: 'Terima kasih, konfirmasimu sudah kami terima.',
    invalid: 'Pilihan kehadiran tidak dikenali. Silakan coba lagi.',
    busy: 'Konfirmasimu belum tersimpan karena terlalu banyak percobaan dalam waktu singkat.',
    retry: 'Konfirmasimu belum bisa dipastikan tersimpan karena gangguan sambungan. Silakan kirim sekali lagi; jawaban yang sama tidak akan tercatat dua kali.',
    notSaved: 'Konfirmasimu belum tersimpan.',
    checkAnswerTo: ['Mohon periksa jawaban untuk “', '”.'] as Pair,
    checkAnswers: 'Mohon periksa jawabanmu.',
    chooseAnswerFor: ['Mohon pilih jawaban untuk “', '”.'] as Pair,
    chooseEveryEvent: 'Mohon pilih jawaban untuk setiap acara.',
    replyBy: ['Mohon konfirmasi sebelum ', '.'] as Pair,
    name: 'Nama',
    nameNote: 'Nama diambil dari undangan personalmu.',
    perEvent: 'Kehadiran per acara',
    perEventNote: ['Pilih jawaban untuk setiap acara. Maksimal ', ' orang per acara; jumlah dicatat untuk acara yang kamu hadiri.'] as Pair,
    count: 'Jumlah yang hadir',
    countNote: ['Maksimal ', ' orang untuk undangan ini. Jumlah ini dicatat untuk jawaban hadir.'] as Pair,
    hostQuestions: 'Pertanyaan dari tuan rumah',
    requiredNote: 'Tanda * wajib dijawab jika kamu hadir.',
    requiredSr: ' (wajib jika hadir)',
    fixAnswer: 'Mohon isi atau perbaiki jawaban ini.',
    chooseOption: 'Pilih jawaban',
    condition: (label: string, values: string[]) => `Isi jika jawaban untuk “${label}” adalah ${values.map((value) => `“${value}”`).join(' atau ')}.`,
    eventChoices: { CONFIRMED: 'Hadir', DECLINED: 'Tidak hadir', MAYBE: 'Mungkin' },
    eventInvalid: 'Mohon pilih jawaban untuk acara ini.',
    eventCount: 'Jumlah yang hadir di acara ini',
    submitEvents: 'Kirim konfirmasi',
    yes: 'Ya, saya hadir',
    no: 'Maaf, belum bisa',
    maybe: 'Mungkin hadir',
    lastAnswer: ['Jawaban terakhirmu: ', '. Kamu masih bisa mengubahnya.'] as Pair,
    /** The stored answer in the "last answer" line; the same words as `RSVP_ANSWER_TEXT` in Indonesian. */
    answers: { CONFIRMED: 'hadir', DECLINED: 'tidak hadir', MAYBE: 'mungkin hadir' },
    pass: 'Lihat QR pass untuk hari-H',
  },
  wishes: {
    refusedClosed: 'Ucapanmu belum tersimpan karena buku tamu undangan ini sudah ditutup.',
    delivered: 'Terima kasih. Ucapanmu sudah tersampaikan kepada tuan rumah.',
    saved: 'Terima kasih atas ucapanmu.',
    pending: 'Terima kasih. Ucapanmu akan tampil setelah disetujui tuan rumah.',
    invalid: 'Ucapan tidak boleh kosong atau lebih dari 1.000 karakter.',
    busy: 'Ucapanmu belum tersimpan karena terlalu banyak ucapan dalam waktu singkat.',
    retry: 'Ucapanmu belum bisa dipastikan tersimpan karena gangguan sambungan. Silakan kirim sekali lagi; ucapan yang sama tidak akan tercatat dua kali.',
    from: 'Ucapan dari ',
    placeholder: 'Tulis doa dan ucapan terbaikmu…',
    hostOnly: 'Ucapanmu hanya dibaca oleh tuan rumah.',
    moderated: 'Ucapan tampil di sini setelah disetujui tuan rumah.',
    submit: 'Kirim ucapan',
    showing: ['Menampilkan ', ' ucapan terbaru dari ', '.'] as Triple,
    hostReply: 'Balasan tuan rumah',
    empty: 'Belum ada ucapan. Jadilah yang pertama.',
  },
  /** Client islands: plain strings only (props cross to the browser). `{days}` and `{title}` are filled in the island. */
  countdown: { days: 'Hari', hours: 'Jam', minutes: 'Menit', seconds: 'Detik', toEvent: '{days} hari lagi menuju {title}', toEventOne: '{days} hari lagi menuju {title}' },
  giftCopy: { copy: 'Salin', number: 'nomor', copied: 'Nomor disalin', selected: 'Nomor sudah dipilih, salin dari menu' },
  gallery: { video: 'Video', watch: 'Tonton', open: 'Buka', swipe: (total: number) => `Galeri ${total} foto, geser untuk melihat semuanya` },
  /** `{n}` and `{total}` are filled in the island; "Foto 1 dari 5" is `photoLabel` in `gallery.ts`. */
  lightbox: { dialog: 'Galeri foto', close: 'Tutup galeri', previous: 'Foto sebelumnya', next: 'Foto berikutnya', play: 'Putar', loadsOnTap: 'dimuat setelah diketuk', photo: 'Foto {n} dari {total}' },
  cover: { dear: 'Kepada Yth.', open: 'Buka Undangan', withMusic: 'Dengan musik latar.', withoutMusic: 'Buka tanpa musik', music: 'Musik latar' },
  /** People sections (`portraits.ts`). */
  people: {
    couple: 'Mempelai',
    celebrant: 'Yang Berulang Tahun',
    photoOf: (name: string) => `Foto ${name}`,
    brideAlt: 'Foto mempelai wanita',
    groomAlt: 'Foto mempelai pria',
    celebrantAlt: 'Foto yang berulang tahun',
    babyAlt: 'Foto bayi',
    childAlt: 'Foto anak',
    photoAlt: 'Foto',
    /** "Putri kedua dari Bapak Budi & Ibu Ani". */
    parentsLine: (child: 'putra' | 'putri', names: string, order?: number) => {
      const rank = order && order >= 1 ? (ID_ORDINALS[order - 1] ?? `ke-${order}`) : undefined;
      return `${child === 'putri' ? 'Putri' : 'Putra'}${rank ? ` ${rank}` : ''} dari ${names}`;
    },
  },
  /** Ceremony profile rows (`ceremony-profile.ts`). */
  profile: {
    aboutThanksgiving: 'Tentang Syukuran',
    aboutChild: 'Tentang Ananda',
    fullName: 'Nama lengkap',
    gender: 'Jenis kelamin',
    genders: { male: 'Laki-laki', female: 'Perempuan' },
    childOrder: 'Urutan',
    childNumber: (order: number | string) => `Anak ke-${order}`,
    born: 'Lahir',
    bornAt: (place: string, time: string) => `${place}, pukul ${time}`,
    atTime: (time: string) => `Pukul ${time}`,
    birthWeight: 'Berat lahir',
    birthLength: 'Panjang lahir',
    parents: 'Orang tua',
    nameMeaning: 'Arti nama',
    prayer: 'Doa & harapan',
    age: 'Usia',
    years: (age: number | string) => `${age} tahun`,
    school: 'Sekolah',
    circumcisionDate: 'Tanggal khitan',
    note: 'Catatan',
    family: 'Keluarga',
    familyMessage: 'Pesan keluarga',
    occasion: 'Acara',
    thanksgivingType: 'Jenis syukuran',
    thanksgivingTypes: {
      housewarming: 'Rumah baru',
      promotion: 'Naik jabatan',
      graduation: 'Kelulusan / wisuda',
      new_business: 'Usaha baru',
      hajj_umrah: 'Haji / umrah',
      other: 'Lainnya',
    } as Record<string, string>,
    achievements: {
      housewarming: 'Alamat rumah baru',
      promotion: 'Jabatan & instansi',
      graduation: 'Institusi & gelar',
      new_business: 'Nama / jenis usaha',
      other: 'Pencapaian',
    } as Record<string, string>,
    thanksMessage: 'Pesan syukur',
  },
  /** Corporate cover (`corporate-mark.ts`). */
  corporate: {
    logoAlt: 'Logo penyelenggara',
    logoOf: (organisation: string) => `Logo ${organisation}`,
    categories: {
      gathering: 'Gathering',
      product_launch: 'Peluncuran produk',
      seminar: 'Seminar',
      conference: 'Konferensi',
      webinar: 'Webinar',
      gala_award: 'Gala / Award',
      rups: 'RUPS',
      training: 'Pelatihan',
    } as Record<string, string>,
  },
  /** I-11: the frame around an approved entry's provenance; the values are the corpus's own. */
  provenance: (source: string, verifiedBy: string, verifiedAt: string) => `Sumber: ${source}. Diperiksa oleh ${verifiedBy} (${verifiedAt}).`,
  /** The link-preview image (`og.png`). */
  ogFooter: 'Undangan digital · Invitesion',
  /** The guest pass page (B-024). */
  pass: {
    title: 'QR pass tamu',
    qrAlt: (name: string) => `QR pass untuk ${name}`,
    expired: 'Pass ini sudah tidak berlaku karena acaranya telah lewat.',
    instructions: 'Tunjukkan QR ini kepada penerima tamu saat tiba. Pass ini khusus untukmu, mohon tidak dibagikan.',
    back: 'Kembali ke undangan',
  },
  /** G-047: the cover-only page of an invitation its host protected with a passcode. */
  passcode: {
    heading: 'Undangan ini dilindungi kode akses',
    hint: 'Masukkan kode akses dari pengundang untuk membuka undangan.',
    label: 'Kode akses',
    submit: 'Buka undangan',
    wrong: 'Kode akses belum cocok. Periksa lagi kode dari pengundang, lalu coba lagi.',
    wait: (minutes: number) => `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`,
  },
  /** I-21: the post-event memory (the host's thank-you and the photos guests share). */
  memory: {
    heading: 'Terima kasih',
    photosHeading: 'Foto dari tamu',
    empty: 'Belum ada foto yang ditampilkan.',
    pending: 'Menunggu persetujuan pengundang',
    hidden: 'Disembunyikan oleh pengundang',
    yours: 'Foto Anda',
    remove: 'Hapus foto saya',
    uploadHeading: 'Bagikan foto dari acara',
    uploadHint: (remaining: number) =>
      `JPG, PNG, atau WebP sampai 5 MB. Foto tampil setelah disetujui pengundang. Anda masih bisa mengirim ${remaining} foto.`,
    uploadLabel: 'Pilih foto',
    submit: 'Kirim foto',
    photoAlt: (n: number) => `Foto dari tamu, ke-${n}`,
    notices: {
      sent: 'Foto terkirim. Foto tampil setelah disetujui pengundang.',
      removed: 'Foto Anda sudah dihapus.',
      invalid: 'Foto belum bisa dikirim. Gunakan JPG, PNG, atau WebP sampai 5 MB.',
      full: 'Batas foto Anda sudah tercapai. Hapus salah satu foto untuk mengirim yang baru.',
      closed: 'Pengiriman foto sudah ditutup.',
      wait: 'Terlalu banyak kiriman. Coba lagi nanti.',
    },
  },
};

export type GuestCopy = typeof ID;

const EN: GuestCopy = {
  invitation: 'Invitation',
  pageTitle: 'Digital Invitation',
  notFoundTitle: 'Invitation not found',
  dear: 'Dear',
  forYou: 'For',
  youAreInvited: "You're invited",
  footer: 'Digital invitation by Invitesion',
  kickers: {
    wedding: 'Wedding Invitation',
    birthday: 'Birthday Invitation',
    aqiqah: 'Aqiqah Invitation',
    khitanan: 'Khitanan Invitation',
    tasyakuran: 'Thanksgiving Invitation',
    corporate: 'Event Invitation',
  },
  memorial: { invitation: 'Memorial Prayer Invitation', heading: 'In Loving Memory' },
  sections: {
    eventSeries: 'The Events',
    timeAndPlace: 'When & Where',
    event: 'Event',
    ourStory: 'Our Story',
    story: 'Story',
    gallery: 'Gallery',
    liveStream: 'Live Stream',
    tokenOfLove: 'A Token of Love',
    gifts: 'Gifts',
    giftsCasual: 'Gifts',
    rsvp: 'Will You Attend?',
    wishes: 'Wishes & Prayers',
    share: 'Share the Moment',
  },
  kartuLabels: {
    timeAndPlace: 'When & where',
    profile: 'Profile',
    journey: 'Journey',
    moments: 'Moments',
    fromAfar: 'From afar',
    social: 'Social media',
    tokenOfLove: 'A token of love',
    rsvp: 'RSVP',
    guestbook: 'Guest book',
  },
  kartuProgramme: { about: 'At a glance', agenda: 'Schedule', speakers: 'Speakers', info: 'Before you come' },
  programme: { about: 'About the Event', agenda: 'Agenda', speakers: 'Speakers', info: 'Guest Information', dressCode: 'Dress code', contact: 'Contact' },
  until: 'until',
  watchStream: 'Watch the stream',
  seeLocation: 'View location',
  calendarGoogle: 'Save to Google Calendar',
  calendarFile: 'Download calendar (.ics)',
  readOnly: 'This invitation has passed its active period. You can still view the details, but RSVP and the guest book are closed.',
  retryIn: (minutes: number) => `Please try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  retryLater: 'Please try again in a few minutes.',
  share: { prompt: 'Share your photos with the hashtag:', filter: 'Try the Instagram filter' },
  inviteShare: {
    heading: 'Share this invitation',
    share: 'Share invitation',
    whatsapp: 'Send on WhatsApp',
    story: 'Download Status / Story image',
    copied: 'Invitation link copied.',
    manual: 'Copy the invitation link from the box below.',
    link: 'Invitation link',
  },
  reading: {
    toggle: 'Large text',
  },
  card: {
    scan: 'Scan this code to open the invitation',
  },
  map: {
    show: 'Show map',
    hide: 'Hide map',
    frame: 'Map of the venue',
  },
  gift: {
    withheld: 'Account details and the QRIS code appear only on the personal invitation link sent to you.',
    qrisAlt: 'QRIS code for gifts',
    qrisNote: "A static QRIS code from the host. Scan it with your bank's or e-wallet's app.",
    holderPrefix: 'Account name: ',
  },
  rsvp: {
    refusedClosed: 'Your reply was not saved because RSVP for this invitation is closed.',
    closed: 'RSVP for this invitation is closed.',
    deadlinePassed: (deadline?: string) => `The reply deadline has passed${deadline ? ` (${deadline})` : ''}.`,
    personalOnly: 'You can reply through the personal invitation link sent to you.',
    saved: 'Thank you, we have received your reply.',
    invalid: 'That reply was not recognised. Please try again.',
    busy: 'Your reply was not saved because of too many attempts in a short time.',
    retry: 'We could not confirm that your reply was saved because of a connection problem. Please send it once more; the same answer will not be counted twice.',
    notSaved: 'Your reply was not saved.',
    checkAnswerTo: ['Please check your answer to “', '”.'],
    checkAnswers: 'Please check your answers.',
    chooseAnswerFor: ['Please choose an answer for “', '”.'],
    chooseEveryEvent: 'Please choose an answer for each event.',
    replyBy: ['Please reply by ', '.'],
    name: 'Name',
    nameNote: 'Your name comes from your personal invitation.',
    perEvent: 'Attendance per event',
    perEventNote: ['Choose an answer for each event. Up to ', ' people per event; the number counts for the events you attend.'],
    count: 'Number attending',
    countNote: ['Up to ', ' people for this invitation. The number counts when you attend.'],
    hostQuestions: 'Questions from the host',
    requiredNote: 'Questions marked * must be answered if you attend.',
    requiredSr: ' (required if attending)',
    fixAnswer: 'Please fill in or correct this answer.',
    chooseOption: 'Choose an answer',
    condition: (label: string, values: string[]) => `Answer if your answer to “${label}” is ${values.map((value) => `“${value}”`).join(' or ')}.`,
    eventChoices: { CONFIRMED: 'Attending', DECLINED: 'Not attending', MAYBE: 'Maybe' },
    eventInvalid: 'Please choose an answer for this event.',
    eventCount: 'Number attending this event',
    submitEvents: 'Send reply',
    yes: "Yes, I'll be there",
    no: "Sorry, I can't make it",
    maybe: 'Maybe',
    lastAnswer: ['Your last reply: ', '. You can still change it.'],
    answers: { CONFIRMED: 'attending', DECLINED: 'not attending', MAYBE: 'maybe' },
    pass: 'View your QR pass for the day',
  },
  wishes: {
    refusedClosed: 'Your wish was not saved because the guest book for this invitation is closed.',
    delivered: 'Thank you. Your wish has been passed on to the host.',
    saved: 'Thank you for your wish.',
    pending: 'Thank you. Your wish will appear once the host approves it.',
    invalid: 'A wish cannot be empty or longer than 1,000 characters.',
    busy: 'Your wish was not saved because of too many wishes in a short time.',
    retry: 'We could not confirm that your wish was saved because of a connection problem. Please send it once more; the same wish will not be counted twice.',
    from: 'A wish from ',
    placeholder: 'Write your prayers and best wishes…',
    hostOnly: 'Only the host reads your wish.',
    moderated: 'Wishes appear here once the host approves them.',
    submit: 'Send wish',
    showing: ['Showing the ', ' latest wishes of ', '.'],
    hostReply: "Host's reply",
    empty: 'No wishes yet. Be the first.',
  },
  countdown: { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds', toEvent: '{days} days until {title}', toEventOne: '{days} day until {title}' },
  giftCopy: { copy: 'Copy', number: 'number', copied: 'Number copied', selected: 'Number selected; copy it from the menu' },
  gallery: { video: 'Video', watch: 'Watch', open: 'Open', swipe: (total: number) => `Gallery of ${total} ${total === 1 ? 'photo' : 'photos'}, swipe to see them all` },
  lightbox: { dialog: 'Photo gallery', close: 'Close gallery', previous: 'Previous photo', next: 'Next photo', play: 'Play', loadsOnTap: 'loads after you tap', photo: 'Photo {n} of {total}' },
  cover: { dear: 'Dear', open: 'Open Invitation', withMusic: 'With background music.', withoutMusic: 'Open without music', music: 'Background music' },
  people: {
    couple: 'The Couple',
    celebrant: 'The Birthday Celebrant',
    photoOf: (name: string) => `Photo of ${name}`,
    brideAlt: 'Photo of the bride',
    groomAlt: 'Photo of the groom',
    celebrantAlt: 'Photo of the birthday celebrant',
    babyAlt: 'Photo of the baby',
    childAlt: 'Photo of the child',
    photoAlt: 'Photo',
    parentsLine: (child: 'putra' | 'putri', names: string, order?: number) => {
      // A relation the host already typed in English ("Daughter of …") is the host's words.
      if (/^(?:son|daughter|child)\b/i.test(names)) return names;
      const word = child === 'putri' ? 'daughter' : 'son';
      const rank = order && order >= 1 ? (EN_ORDINALS[order - 1] ?? englishOrdinal(order)) : undefined;
      return rank ? `${rank} ${word} of ${names}` : `${word === 'daughter' ? 'Daughter' : 'Son'} of ${names}`;
    },
  },
  profile: {
    aboutThanksgiving: 'About the Thanksgiving',
    aboutChild: 'About Our Child',
    fullName: 'Full name',
    gender: 'Gender',
    genders: { male: 'Boy', female: 'Girl' },
    childOrder: 'Birth order',
    childNumber: (order: number | string) => `Child no. ${order}`,
    born: 'Born',
    bornAt: (place: string, time: string) => `${place}, at ${time}`,
    atTime: (time: string) => `At ${time}`,
    birthWeight: 'Birth weight',
    birthLength: 'Birth length',
    parents: 'Parents',
    nameMeaning: 'Meaning of the name',
    prayer: 'Prayers & hopes',
    age: 'Age',
    years: (age: number | string) => `${age} years old`,
    school: 'School',
    circumcisionDate: 'Circumcision date',
    note: 'Note',
    family: 'Family',
    familyMessage: 'A message from the family',
    occasion: 'Occasion',
    thanksgivingType: 'Type of thanksgiving',
    thanksgivingTypes: {
      housewarming: 'New home',
      promotion: 'Promotion',
      graduation: 'Graduation',
      new_business: 'New business',
      hajj_umrah: 'Hajj / umrah',
      other: 'Other',
    },
    achievements: {
      housewarming: 'New home address',
      promotion: 'Position & organisation',
      graduation: 'Institution & degree',
      new_business: 'Business name / type',
      other: 'Achievement',
    },
    thanksMessage: 'A message of thanks',
  },
  corporate: {
    logoAlt: "Organiser's logo",
    logoOf: (organisation: string) => `${organisation} logo`,
    categories: {
      gathering: 'Gathering',
      product_launch: 'Product launch',
      seminar: 'Seminar',
      conference: 'Conference',
      webinar: 'Webinar',
      gala_award: 'Gala / Award',
      rups: "Shareholders' meeting",
      training: 'Training',
    },
  },
  provenance: (source: string, verifiedBy: string, verifiedAt: string) => `Source: ${source}. Checked by ${verifiedBy} (${verifiedAt}).`,
  ogFooter: 'Digital invitation · Invitesion',
  pass: {
    title: 'Guest QR pass',
    qrAlt: (name: string) => `QR pass for ${name}`,
    expired: 'This pass is no longer valid because the event has passed.',
    instructions: 'Show this QR code at the reception desk when you arrive. This pass is just for you; please do not share it.',
    back: 'Back to the invitation',
  },
  passcode: {
    heading: 'This invitation is protected with an access code',
    hint: 'Enter the access code from your host to open the invitation.',
    label: 'Access code',
    submit: 'Open invitation',
    wrong: 'That access code does not match. Check the code from your host and try again.',
    wait: (minutes: number) => `Too many attempts. Try again in ${minutes} minutes.`,
  },
  memory: {
    heading: 'Thank you',
    photosHeading: 'Photos from guests',
    empty: 'No photos are shown yet.',
    pending: 'Waiting for the host to approve',
    hidden: 'Hidden by the host',
    yours: 'Your photo',
    remove: 'Delete my photo',
    uploadHeading: 'Share a photo from the event',
    uploadHint: (remaining: number) =>
      `JPG, PNG or WebP up to 5 MB. Photos appear once the host approves them. You can still send ${remaining} ${remaining === 1 ? 'photo' : 'photos'}.`,
    uploadLabel: 'Choose a photo',
    submit: 'Send photo',
    photoAlt: (n: number) => `Photo from a guest, number ${n}`,
    notices: {
      sent: 'Photo sent. It appears once the host approves it.',
      removed: 'Your photo has been deleted.',
      invalid: 'That photo could not be sent. Use JPG, PNG or WebP up to 5 MB.',
      full: 'You have reached your photo limit. Delete one of your photos to send a new one.',
      closed: 'Photo sharing is closed.',
      wait: 'Too many uploads. Try again later.',
    },
  },
};

export const GUEST_COPY: Record<GuestLanguage, GuestCopy> = { id: ID, en: EN };

export function guestCopy(language: GuestLanguage): GuestCopy {
  return GUEST_COPY[language];
}

/** The countdown island's strings (`components/invitation/countdown.tsx`). */
export type CountdownLabels = GuestCopy['countdown'];
/** The gift copy island's strings (`components/invitation/gift-copy.tsx`). */
export type GiftCopyLabels = GuestCopy['giftCopy'];
export type InviteShareLabels = GuestCopy['inviteShare'];
export type ReadingLabels = GuestCopy['reading'];
export type MapLabels = GuestCopy['map'];
/** The gallery lightbox island's strings (`components/invitation/gallery-lightbox.tsx`). */
export type LightboxLabels = GuestCopy['lightbox'];
/** The cover gate island's strings (`components/invitation/cover-audio.tsx`). */
export type CoverLabels = GuestCopy['cover'];
