import type { Metadata } from 'next';
import { claimStatus, type CapabilityId, type ClaimStatus } from '@/lib/marketing/capabilities';

export type MarketingCategory = 'event-types' | 'features' | 'resources';
/** What a page is about: something shipped, something planned, or something Invitesion does not do. */
export type PageAvailability = 'available' | 'roadmap' | 'unsupported';
export type HighlightCopy = { title: string; text: string; needs: readonly CapabilityId[] };
export type MarketingHighlight = HighlightCopy & { status: ClaimStatus };
type PageCopy = {
  availability?: PageAvailability;
  summary: string;
  /** Capabilities the summary claims. An unavailable page's summary describes the absence and claims nothing. */
  summaryNeeds: readonly CapabilityId[];
  highlights: readonly HighlightCopy[];
};
export type MarketingPage = {
  title: string;
  slug: string;
  category: MarketingCategory;
  eyebrow: string;
  summary: string;
  summaryNeeds: readonly CapabilityId[];
  availability: PageAvailability;
  /** available, conditional (its summary needs a flag that is off here), roadmap or unsupported. */
  status: ClaimStatus;
  highlights: readonly MarketingHighlight[];
};

const EYEBROWS: Record<MarketingCategory, string> = {
  'event-types': 'JENIS ACARA',
  features: 'FITUR INVITESION',
  resources: 'RESOURCE & COMPANY',
};

const NOT_PLANNED = 'Belum tersedia dan belum direncanakan.';
const contactHighlight: HighlightCopy = { title: 'Hubungi tim', text: 'Kirim pertanyaanmu ke hello@invitesion.id.', needs: ['supportEmail'] };
const csvHighlight = (text: string): HighlightCopy => ({ title: 'Ekspor CSV', text, needs: ['guestCsvExport'] });
const notPublished = (summary: string): PageCopy => ({ availability: 'unsupported', summary, summaryNeeds: [], highlights: [contactHighlight] });

/**
 * Long-tail event types without hand-written copy. Every line is a shipped capability (B-022), so the generic pages
 * stay true whatever the event.
 */
const eventTypeFallback: PageCopy = {
  summary: 'Susun halaman undangan, tautan personal, dan konfirmasi kehadiran yang sesuai dengan karakter acara ini.',
  summaryNeeds: ['invitationPage', 'personalLinks', 'rsvp'],
  highlights: [
    { title: 'Form RSVP yang fleksibel', text: 'Tanyakan kehadiran, jumlah pendamping, hingga pertanyaan khusus sesuai kebutuhan acara.', needs: ['rsvp', 'rsvpQuestions'] },
    { title: 'Tautan personal untuk tiap tamu', text: 'Kirim tautan personal lewat WhatsApp satu per satu, atau salin tautannya ke kanal lain.', needs: ['personalLinks', 'whatsappLinks'] },
    { title: 'Pantauan kehadiran real-time', text: 'Lihat siapa yang sudah membuka undangan dan mengonfirmasi kehadiran langsung dari dashboard.', needs: ['openTracking', 'rsvp', 'insights'] },
  ],
};

/**
 * Hand-written copy per category and slug. Every feature and resource has an entry (the cross-check test enforces it),
 * so no generic text can make an integration or a policy look real; event types fall back to `eventTypeFallback`.
 */
const handWritten: Record<MarketingCategory, Record<string, PageCopy>> = {
  'event-types': {
    weddings: {
      summary: 'Undangan pernikahan digital yang elegan: love story, galeri prewedding, detail akad dan resepsi, RSVP dengan jumlah pendamping, sampai ucapan dan info hadiah — semua dalam satu tautan personal.',
      summaryNeeds: ['loveStory', 'gallery', 'eventDetails', 'rsvp', 'wishes', 'giftAccounts', 'personalLinks'],
      highlights: [
        { title: 'Love story & galeri prewedding', text: 'Ceritakan perjalanan kalian lewat timeline, foto, dan video yang tampil mengikuti tema pilihan.', needs: ['loveStory', 'gallery', 'videoEmbeds'] },
        { title: 'RSVP dengan plus-one', text: 'Tamu mengonfirmasi kehadiran dan jumlah pendamping lewat tautan pribadinya, hasilnya langsung masuk dashboard.', needs: ['rsvp', 'personalLinks', 'guestList'] },
        { title: 'Ucapan & info hadiah', text: 'Tamu menitipkan doa dan ucapan di halaman undangan. Nomor rekening atau QRIS kalian bisa ditampilkan untuk tamu yang ingin memberi hadiah; transfernya langsung ke kalian, tidak melalui Invitesion.', needs: ['wishes', 'giftAccounts'] },
      ],
    },
    'wedding-anniversaries': {
      summary: 'Rayakan tahun-tahun kebersamaan dengan undangan yang hangat — galeri kenangan, agenda syukuran, dan konfirmasi kehadiran keluarga serta sahabat.',
      summaryNeeds: ['gallery', 'eventDetails', 'rsvp'],
      highlights: [
        { title: 'Galeri kenangan', text: 'Tampilkan foto perjalanan pernikahan dari tahun ke tahun sebagai cerita pembuka undangan.', needs: ['gallery'] },
        { title: 'Acara intim, daftar tamu rapi', text: 'Undang keluarga dan sahabat terdekat dengan tautan personal dan daftar tamu yang terkontrol.', needs: ['personalLinks', 'guestList'] },
        { title: 'Konfirmasi tanpa ribet', text: 'Cukup satu ketuk bagi tamu untuk memberi kabar hadir, hasilnya terlihat real-time di dashboard.', needs: ['rsvp', 'insights'] },
      ],
    },
    'bridal-showers': {
      summary: 'Kejutan manis sebelum hari-H: undangan bridal shower dengan hitung mundur, halaman yang tidak diindeks mesin pencari, dan rekap konfirmasi yang gampang dipantau.',
      summaryNeeds: ['countdownCalendar', 'unlistedPages', 'rsvp', 'insights'],
      highlights: [
        { title: 'Tema ceria & hitung mundur', text: 'Pilih tampilan yang cocok untuk pesta lajang, lengkap dengan hitung mundur menuju acara.', needs: ['themeCatalog', 'countdownCalendar'] },
        { title: 'Tidak muncul di mesin pencari', text: 'Halaman undangan tidak diindeks mesin pencari, jadi hanya orang yang menerima tautannya yang bisa membukanya. Siapa pun yang memegang tautan tetap bisa meneruskannya.', needs: ['unlistedPages'] },
        { title: 'Koordinasi panitia mudah', text: 'Pantau siapa yang sudah konfirmasi supaya games dan konsumsi bisa disiapkan pas.', needs: ['rsvp', 'insights'] },
      ],
    },
    birthdays: {
      summary: 'Dari ulang tahun anak sampai pesta dewasa — undangan digital dengan hitung mundur, lokasi, dan RSVP yang gampang diisi siapa pun.',
      summaryNeeds: ['countdownCalendar', 'eventDetails', 'mapLink', 'rsvp'],
      highlights: [
        { title: 'Tema untuk segala usia', text: 'Pilih dari puluhan tema di katalog, dari yang ceria sampai yang elegan.', needs: ['themeCatalog'] },
        { title: 'Hitung mundur hari-H', text: 'Bangun antusiasme tamu dengan countdown di halaman undangan dan tombol simpan ke kalender.', needs: ['countdownCalendar'] },
        { title: 'RSVP super sederhana', text: 'Orang tua atau teman cukup membuka tautan personalnya dan menekan satu tombol untuk konfirmasi.', needs: ['rsvp', 'personalLinks'] },
      ],
    },
    'aqiqah-and-khitanan': {
      summary: 'Sampaikan kabar bahagia keluarga — profil sang anak, doa, informasi acara, dan konfirmasi kehadiran keluarga besar dalam satu halaman.',
      summaryNeeds: ['ceremonyProfiles', 'openingWords', 'eventDetails', 'rsvp'],
      highlights: [
        { title: 'Profil sang anak', text: 'Nama, orang tua, tanggal lahir, dan makna nama tampil rapi. Foto anak hanya muncul bila kalian mengizinkannya, dan hanya di tautan personal.', needs: ['ceremonyProfiles'] },
        { title: 'Informasi lengkap untuk keluarga', text: 'Cantumkan waktu, lokasi, dan susunan acara agar keluarga besar tidak salah jadwal.', needs: ['eventDetails', 'mapLink'] },
        { title: 'Konfirmasi lintas generasi', text: 'Tautan cukup dibuka dari WhatsApp — mudah bahkan untuk anggota keluarga yang jarang pakai aplikasi.', needs: ['personalLinks', 'whatsappLinks', 'rsvp'] },
      ],
    },
    'baby-showers': {
      summary: 'Umumkan kedatangan si kecil dengan halaman yang menggemaskan — cerita singkat, galeri, dan RSVP untuk orang-orang terdekat.',
      summaryNeeds: ['loveStory', 'gallery', 'rsvp'],
      highlights: [
        { title: 'Pengumuman yang personal', text: 'Tulis cerita menanti si kecil dan tampilkan foto maternity di galeri.', needs: ['loveStory', 'gallery'] },
        { title: 'Daftar tamu terdekat', text: 'Acara kecil tetap butuh kepastian — lihat siapa saja yang datang sebelum hari-H.', needs: ['rsvp', 'guestList'] },
        { title: 'Bagikan ke grup keluarga', text: 'Kirim tautan undangan ke grup WhatsApp keluarga dan sahabat tanpa cetak apa pun.', needs: ['invitationPage'] },
      ],
    },
    'gender-reveals': {
      summary: 'Bikin momen pengumuman si kecil makin seru — hitung mundur menuju reveal, pertanyaan tebakan di form RSVP, dan konfirmasi orang-orang terdekat.',
      summaryNeeds: ['countdownCalendar', 'rsvpQuestions', 'rsvp'],
      highlights: [
        { title: 'Tema sesuai suasana', text: 'Pilih tema dan palet warna dari katalog yang cocok dengan suasana acara.', needs: ['themeCatalog'] },
        { title: 'Ajak tamu ikut menebak', text: 'Tambahkan pertanyaan tebakan “cowok atau cewek?” di form RSVP dan lihat rekap jawabannya di dashboard.', needs: ['rsvpQuestions', 'answerSummary'] },
        { title: 'Countdown menuju reveal', text: 'Hitung mundur di halaman undangan membangun antisipasi sebelum momen puncak.', needs: ['countdownCalendar'] },
      ],
    },
    syukuran: {
      summary: 'Syukuran rumah baru, kelahiran, jabatan, atau nazar — sampaikan rasa syukur lewat undangan hangat dengan doa, agenda, dan konfirmasi keluarga besar.',
      summaryNeeds: ['openingWords', 'eventDetails', 'rsvp'],
      highlights: [
        { title: 'Pembuka penuh makna', text: 'Awali undangan dengan doa, kutipan, atau kata pengantar yang kamu tulis sendiri.', needs: ['openingWords'] },
        { title: 'Fleksibel untuk segala syukuran', text: 'Satu format untuk syukuran rumah, kelahiran, promosi, hingga keberangkatan haji.', needs: ['ceremonyProfiles'] },
        { title: 'Kepastian jumlah tamu', text: 'Konfirmasi kehadiran masuk real-time supaya konsumsi dan tempat bisa disiapkan pas.', needs: ['rsvp', 'insights'] },
      ],
    },
    'celebrations-of-life': {
      summary: 'Undangan tahlilan, haul, dan doa bersama yang khidmat — kabar tersampaikan dengan hormat tanpa harus menghubungi kerabat satu per satu.',
      summaryNeeds: ['invitationPage', 'eventDetails'],
      highlights: [
        { title: 'Nuansa tenang & hormat', text: 'Pilih tema yang teduh dan sederhana, sesuai untuk momen mengenang dan mendoakan.', needs: ['themeCatalog'] },
        { title: 'Informasi jelas untuk kerabat', text: 'Waktu, lokasi, dan rangkaian tahlilan hari ke-7 hingga haul tersusun sebagai beberapa acara di satu halaman.', needs: ['eventDetails', 'mapLink'] },
        { title: 'Satu tautan untuk semua', text: 'Bagikan satu tautan undangan ke keluarga besar dan jamaah lewat WhatsApp, tanpa perlu broadcast berulang.', needs: ['invitationPage'] },
      ],
    },
    reunions: {
      summary: 'Kumpulkan kembali teman lama: halaman reuni dengan agenda dan lokasi, tautan personal untuk tiap alumni, dan rekap kehadiran yang terkumpul sendiri.',
      summaryNeeds: ['eventDetails', 'personalLinks', 'rsvp', 'insights'],
      highlights: [
        { title: 'Tautan personal untuk tiap alumni', text: 'Impor daftar angkatan dari spreadsheet, lalu kirim tautan personal tiap orang lewat WhatsApp — satu ketuk per alumni.', needs: ['guestImport', 'personalLinks', 'whatsappLinks'] },
        { title: 'Pendaftaran lewat satu tautan', text: 'Satu tautan pendaftaran untuk grup angkatan; panitia meninjau permintaan yang masuk sebelum tautan personal dibuat.', needs: ['selfRegistration'] },
        { title: 'Info iuran dari panitia', text: 'Tampilkan rekening atau QRIS panitia di halaman reuni. Pembayaran langsung ke panitia; Invitesion tidak menerima, memproses, atau mencocokkan dana.', needs: ['giftAccounts'] },
        { title: 'Data hadir lintas kota', text: 'Tambahkan pertanyaan asal kota di form RSVP untuk mengatur rundown dan konsumsi.', needs: ['rsvpQuestions', 'answerSummary'] },
      ],
    },
    graduations: {
      summary: 'Rayakan kelulusan dengan halaman yang membanggakan — momen perjalanan studi, detail seremoni, dan undangan untuk keluarga serta sahabat.',
      summaryNeeds: ['gallery', 'eventDetails', 'personalLinks'],
      highlights: [
        { title: 'Cerita perjalanan studi', text: 'Tampilkan galeri dan cerita dari hari pertama sampai sidang sebagai pembuka undangan wisuda.', needs: ['gallery', 'loveStory'] },
        { title: 'Detail acara yang jelas', text: 'Waktu seremoni, lokasi, dan catatan seperti dress code tersampaikan rapi ke semua tamu.', needs: ['eventDetails', 'mapLink'] },
        { title: 'Ucapan dari jauh', text: 'Keluarga di luar kota tetap bisa memberi ucapan langsung dari halaman undangan.', needs: ['wishes'] },
      ],
    },
    'holiday-gatherings': {
      summary: 'Halal bihalal, natal keluarga, atau kumpul akhir tahun — satu halaman untuk agenda, lokasi, dan konfirmasi cepat seluruh keluarga.',
      summaryNeeds: ['eventDetails', 'mapLink', 'rsvp'],
      highlights: [
        { title: 'Cocok untuk semua perayaan', text: 'Pilih tema hangat dari katalog untuk halal bihalal, natal, tahun baru, hingga arisan keluarga.', needs: ['themeCatalog'] },
        { title: 'Agenda & lokasi jelas', text: 'Susunan acara dan tautan peta lokasi ada di satu tempat, tidak tenggelam di chat grup.', needs: ['eventDetails', 'mapLink'] },
        { title: 'Konfirmasi kilat', text: 'Anggota keluarga cukup sekali ketuk di tautan personalnya untuk memberi kabar hadir atau berhalangan.', needs: ['rsvp', 'personalLinks'] },
      ],
    },
    'product-launches': {
      summary: 'Perkenalkan produk, brand, atau gerai baru dengan halaman peluncuran yang berkesan — countdown, agenda, dan undangan personal untuk media, mitra, dan tamu VIP.',
      summaryNeeds: ['countdownCalendar', 'corporateProgramme', 'personalLinks'],
      highlights: [
        { title: 'Kesan pertama yang kuat', text: 'Halaman bergaya premium dengan hitung mundur menuju momen peluncuran atau grand opening.', needs: ['themeCatalog', 'countdownCalendar'] },
        { title: 'Undangan terkurasi', text: 'Kirim tautan personal ke media, mitra, dan pelanggan setia — daftar hadir terkontrol penuh.', needs: ['personalLinks', 'guestList'] },
        { title: 'Detail acara satu pintu', text: 'Rundown, lokasi, dan dress code tersampaikan rapi tanpa perlu balas pesan satu-satu.', needs: ['corporateProgramme', 'eventDetails'] },
      ],
    },
    conferences: {
      summary: 'Konferensi dan seminar butuh informasi yang rapi — agenda dan pembicara di satu halaman, tautan personal untuk peserta terdaftar, dan data peserta terpusat.',
      summaryNeeds: ['corporateProgramme', 'personalLinks', 'guestList'],
      highlights: [
        { title: 'Agenda & pembicara', text: 'Susun agenda, daftar pembicara, dan kontak panitia dalam satu halaman yang mudah dipindai peserta.', needs: ['corporateProgramme'] },
        { title: 'Data peserta terpusat', text: 'Tanyakan instansi dan kebutuhan khusus lewat pertanyaan RSVP; jawabannya terkumpul di dashboard dan bisa diekspor ke CSV.', needs: ['rsvpQuestions', 'answerSummary', 'guestCsvExport'] },
        { title: 'Check-in QR di lokasi', text: 'Setiap peserta membawa QR unik di tautan personalnya untuk dipindai panitia di pintu masuk.', needs: ['guestPass', 'checkInScanner'] },
      ],
    },
    'workshops-and-classes': {
      summary: 'Undang peserta workshop, kelas, atau pelatihan dengan halaman info yang meyakinkan, batas waktu konfirmasi, dan pengingat lewat WhatsApp.',
      summaryNeeds: ['corporateProgramme', 'rsvpDeadline', 'followUpLists', 'whatsappLinks'],
      highlights: [
        { title: 'Halaman info yang meyakinkan', text: 'Materi, pemateri, dan benefit kelas tersaji rapi sehingga calon peserta yakin hadir.', needs: ['corporateProgramme'] },
        { title: 'Batas waktu konfirmasi', text: 'Tentukan tenggat RSVP; setelah lewat, form konfirmasi tertutup dengan sendirinya.', needs: ['rsvpDeadline'] },
        { title: 'Pengingat lewat WhatsApp', text: 'Dashboard menyusun daftar peserta yang belum menjawab beserta tautan WhatsApp berisi pesan pengingat, untuk dikirim panitia satu per satu.', needs: ['followUpLists', 'whatsappLinks'] },
      ],
    },
    'networking-events': {
      summary: 'Undang komunitas profesional untuk saling terhubung — halaman acara yang kredibel, konfirmasi tanpa akun, dan daftar peserta yang terkontrol.',
      summaryNeeds: ['themeCatalog', 'rsvp', 'guestList'],
      highlights: [
        { title: 'Tampil profesional', text: 'Halaman bergaya bersih dan modern yang pantas dibagikan ke jejaring bisnis.', needs: ['themeCatalog'] },
        { title: 'Konfirmasi tanpa akun', text: 'Peserta cukup membuka tautan personalnya dan menjawab — tanpa membuat akun.', needs: ['personalLinks', 'rsvp'] },
        { title: 'Kenali siapa yang datang', text: 'Tanyakan instansi atau jabatan di form RSVP agar sesi perkenalan lebih mudah disiapkan.', needs: ['rsvpQuestions', 'answerSummary'] },
      ],
    },
    'galas-and-benefit-dinners': {
      summary: 'Gala dinner, malam penghargaan, dan galang dana menuntut kesan mewah — undangan elegan, tautan personal atas nama tiap tamu, dan pengelolaan konfirmasi yang presisi.',
      summaryNeeds: ['themeCatalog', 'personalLinks', 'rsvp'],
      highlights: [
        { title: 'Undangan bernuansa mewah', text: 'Pilih tema elegan dari katalog yang selaras dengan acara black-tie.', needs: ['themeCatalog'] },
        { title: 'Perlakuan khusus tamu VIP', text: 'Tautan personal atas nama tiap tamu membuat undangan terasa eksklusif, bukan broadcast.', needs: ['personalLinks'] },
        { title: 'Info donasi', text: 'Tampilkan rekening atau QRIS penyelenggara untuk tamu yang ingin berdonasi. Transfer langsung ke penyelenggara; Invitesion tidak memproses atau mencatat dana.', needs: ['giftAccounts'] },
      ],
    },
    'retirement-parties': {
      summary: 'Lepas masa purnabakti dengan penghormatan yang layak — perjalanan karier, ucapan rekan kerja, dan undangan acara perpisahan dalam satu halaman.',
      summaryNeeds: ['gallery', 'wishes', 'eventDetails'],
      highlights: [
        { title: 'Kilas balik perjalanan karier', text: 'Tampilkan galeri dan cerita pengabdian dari tahun pertama hingga purnatugas.', needs: ['gallery', 'loveStory'] },
        { title: 'Ucapan dari rekan kerja', text: 'Kolega lintas kota bisa menitipkan pesan dan doa langsung dari halaman undangan.', needs: ['wishes'] },
        { title: 'Formal namun hangat', text: 'Pilih tema elegan yang cocok untuk acara instansi, BUMN, maupun perusahaan swasta.', needs: ['themeCatalog'] },
      ],
    },
    'client-and-vip-events': {
      summary: 'Apresiasi klien, pelanggan setia, dan tamu VIP dengan undangan personal atas nama masing-masing — eksklusif, rapi, dan mudah dikonfirmasi.',
      summaryNeeds: ['personalLinks', 'rsvp'],
      highlights: [
        { title: 'Personal, bukan broadcast', text: 'Setiap undangan menyapa nama tamu — detail kecil yang menunjukkan penghargaan besar.', needs: ['personalLinks'] },
        { title: 'Daftar tamu terkurasi', text: 'Kelompokkan tamu per segmen dengan kategori dan pantau konfirmasinya per kelompok.', needs: ['guestCategory', 'insights'] },
        { title: 'Citra brand terjaga', text: 'Halaman undangan dengan logo dan tema yang halus memperkuat kesan perusahaan kamu.', needs: ['themeCatalog', 'corporateProgramme'] },
      ],
    },
    'team-building-and-offsites': {
      summary: 'Ajak tim keluar kantor tanpa drama koordinasi — agenda kegiatan, lokasi, dan konfirmasi kehadiran karyawan terkumpul dalam satu tempat.',
      summaryNeeds: ['corporateProgramme', 'eventDetails', 'rsvp'],
      highlights: [
        { title: 'Rundown kegiatan jelas', text: 'Jadwal, titik kumpul, dan barang bawaan tersampaikan sekali — tidak tenggelam di grup chat.', needs: ['corporateProgramme', 'eventDetails'] },
        { title: 'Konfirmasi per divisi', text: 'Beri kategori per divisi untuk melihat siapa yang ikut dari tiap tim.', needs: ['guestCategory', 'insights'] },
        { title: 'Kebutuhan khusus tercatat', text: 'Tanyakan preferensi makanan dan kebutuhan khusus lewat pertanyaan RSVP.', needs: ['rsvpQuestions'] },
      ],
    },
  },

  features: {
    'event-registration': {
      summary: 'Kumpulkan konfirmasi peserta lewat tautan personal: hadir atau tidak, jumlah pendamping, dan jawaban atas pertanyaan khusus — semuanya masuk ke dashboard.',
      summaryNeeds: ['personalLinks', 'rsvp', 'rsvpQuestions', 'guestList'],
      highlights: [
        { title: 'Tautan personal per peserta', text: 'Tambahkan peserta satu per satu atau impor dari spreadsheet; tiap orang menerima tautan dengan namanya sendiri.', needs: ['guestImport', 'personalLinks'] },
        { title: 'Pertanyaan pendaftaran', text: 'Tambahkan pertanyaan pilihan atau isian, wajib atau opsional, bahkan yang muncul sesuai jawaban sebelumnya.', needs: ['rsvpQuestions'] },
        { title: 'Pendaftaran terbuka', text: 'Satu tautan pendaftaran untuk disebar luas, dengan antrean permintaan yang ditinjau penyelenggara.', needs: ['selfRegistration'] },
      ],
    },
    'online-rsvps': {
      summary: 'Kumpulkan kepastian hadir tanpa menagih satu-satu — tamu konfirmasi lewat tautan personalnya, hasilnya masuk dashboard saat itu juga.',
      summaryNeeds: ['rsvp', 'personalLinks', 'insights'],
      highlights: [
        { title: 'Form yang bisa diatur', text: 'Tanya jumlah pendamping, preferensi makanan, atau pertanyaan khusus lainnya.', needs: ['rsvp', 'rsvpQuestions'] },
        { title: 'Ingatkan yang belum menjawab', text: 'Daftar tamu yang belum menjawab tersedia lengkap dengan tautan WhatsApp berisi pesan pengingat, untuk dikirim satu per satu.', needs: ['followUpLists', 'whatsappLinks'] },
        { title: 'Rekap real-time', text: 'Angka hadir, mungkin, dan berhalangan selalu terkini untuk keputusan katering.', needs: ['rsvp', 'rsvpMaybe', 'insights'] },
      ],
    },
    'form-builder': {
      summary: 'Tambahkan pertanyaan sendiri ke form RSVP — pilihan atau isian, wajib atau opsional — dan lihat rekap jawabannya di dashboard.',
      summaryNeeds: ['rsvpQuestions', 'answerSummary'],
      highlights: [
        { title: 'Jenis pertanyaan', text: 'Pertanyaan pilihan atau isian teks, masing-masing bisa dijadikan wajib.', needs: ['rsvpQuestions'] },
        { title: 'Pertanyaan bersyarat', text: 'Tampilkan pertanyaan hanya bila jawaban sebelumnya cocok, supaya form tetap singkat.', needs: ['rsvpQuestions'] },
        { title: 'Rekap & ekspor', text: 'Ringkasan jawaban tampil di daftar tamu dan ikut terunduh di ekspor CSV.', needs: ['answerSummary', 'guestCsvExport'] },
      ],
    },
    'embeddable-forms': {
      availability: 'unsupported',
      summary: 'Form Invitesion belum bisa disematkan di situs lain: halaman Invitesion menolak dibingkai situs lain demi keamanan. Tamu menjawab RSVP langsung di tautan personalnya.',
      summaryNeeds: [],
      highlights: [
        { title: 'Menyematkan form', text: NOT_PLANNED, needs: ['embeddableForms'] },
        { title: 'Yang tersedia sekarang', text: 'Form RSVP di halaman undangan, dibuka lewat tautan personal tiap tamu.', needs: ['rsvp', 'personalLinks'] },
      ],
    },
    'event-ticketing': {
      availability: 'unsupported',
      summary: 'Invitesion tidak menjual tiket dan tidak memproses pembayaran dari tamu. Undangan bersifat personal dan konfirmasinya tanpa biaya bagi tamu.',
      summaryNeeds: [],
      highlights: [
        { title: 'Penjualan tiket', text: NOT_PLANNED, needs: ['ticketing'] },
        { title: 'Yang tersedia sekarang', text: 'Kirim tautan personal ke daftar tamu yang sudah kamu tentukan, lalu pantau konfirmasinya.', needs: ['personalLinks', 'rsvp'] },
      ],
    },
    donations: {
      availability: 'unsupported',
      summary: 'Invitesion tidak menerima atau memproses donasi. Penyelenggara bisa menampilkan rekening atau QRIS sendiri di halaman acara; transfer langsung ke penyelenggara.',
      summaryNeeds: [],
      highlights: [
        { title: 'Pemrosesan & rekap donasi', text: 'Belum tersedia: Invitesion tidak menerima dana, tidak mengirim tanda terima, dan tidak mencocokkan transfer.', needs: ['cashlessCollection'] },
        { title: 'Info rekening & QRIS', text: 'Tampilkan nomor rekening atau gambar QRIS penyelenggara, bisa hanya untuk tamu dengan tautan personal.', needs: ['giftAccounts'] },
      ],
    },
    'appointment-scheduling': {
      availability: 'unsupported',
      summary: 'Invitesion tidak menyediakan penjadwalan janji temu. Setiap undangan memuat acara dengan waktu yang ditentukan penyelenggara.',
      summaryNeeds: [],
      highlights: [
        { title: 'Pemesanan slot waktu', text: NOT_PLANNED, needs: ['appointmentScheduling'] },
        { title: 'Jadwal acara', text: 'Satu undangan bisa memuat beberapa acara dengan waktu, lokasi, dan catatan masing-masing.', needs: ['eventDetails'] },
      ],
    },
    'payment-processing': {
      availability: 'unsupported',
      summary: 'Invitesion tidak memproses pembayaran dari tamu. Hadiah dan iuran ditransfer tamu langsung ke rekening atau QRIS yang kamu tampilkan.',
      summaryNeeds: [],
      highlights: [
        { title: 'Amplop digital & rekap otomatis', text: 'Belum tersedia: tidak ada pembayaran tamu yang diproses dan tidak ada pencocokan transfer otomatis.', needs: ['cashlessCollection'] },
        { title: 'Info rekening & QRIS', text: 'Tampilkan rekening bank, e-wallet, atau gambar QRIS di halaman undangan.', needs: ['giftAccounts'] },
        { title: 'Catatan hadiah manual', text: 'Penyelenggara bisa mencatat sendiri hadiah yang diterima di log hari-H.', needs: ['giftLog'] },
      ],
    },
    'guest-list-management': {
      summary: 'Semua tamu dalam satu daftar yang hidup — status undangan, konfirmasi, dan kategori tanpa spreadsheet berantakan.',
      summaryNeeds: ['guestList', 'openTracking', 'rsvp', 'guestCategory'],
      highlights: [
        { title: 'Impor & kelompokkan tamu', text: 'Tempel dari spreadsheet atau unggah CSV, pratinjau dulu, lalu kelompokkan dengan kategori keluarga, kantor, atau komunitas.', needs: ['guestImport', 'guestCategory'] },
        { title: 'Status per tamu', text: 'Lihat siapa yang sudah membuka undangan, membalas, atau perlu di-follow-up.', needs: ['openTracking', 'rsvp', 'followUpLists'] },
        { title: 'Kategori & jawaban khusus', text: 'Tandai VIP atau keluarga lewat kategori; alergi dan kebutuhan khusus ditanyakan di form RSVP.', needs: ['guestCategory', 'rsvpQuestions'] },
      ],
    },
    'seating-charts': {
      summary: 'Catat meja dan kursi tiap tamu, serta suvenir yang sudah diberikan, di log hari-H milik penyelenggara.',
      summaryNeeds: ['seatingLog'],
      highlights: [
        { title: 'Meja & kursi per tamu', text: 'Buat daftar meja, lalu tetapkan meja dan kursi tiap tamu; bisa diekspor ke CSV.', needs: ['seatingLog'] },
        { title: 'Suvenir terdata', text: 'Tandai tamu yang sudah menerima suvenir di hari-H.', needs: ['seatingLog'] },
        { title: 'Denah drag-and-drop', text: NOT_PLANNED, needs: ['seatingChartEditor'] },
      ],
    },
    'menu-and-dietary': {
      summary: 'Tanyakan pilihan menu dan pantangan makanan lewat pertanyaan RSVP, lalu lihat rekapnya untuk katering.',
      summaryNeeds: ['rsvpQuestions', 'answerSummary'],
      highlights: [
        { title: 'Pertanyaan menu', text: 'Tambahkan pertanyaan pilihan menu atau alergi ke form RSVP.', needs: ['rsvpQuestions'] },
        { title: 'Rekap untuk katering', text: 'Hitungan jawaban tampil di daftar tamu dan ikut di ekspor CSV.', needs: ['answerSummary', 'guestCsvExport'] },
      ],
    },
    'contact-tagging': {
      summary: 'Beri setiap tamu satu kategori — keluarga, kantor, VIP — untuk memfilter daftar dan membaca konfirmasi per kelompok.',
      summaryNeeds: ['guestCategory', 'insights'],
      highlights: [
        { title: 'Kategori per tamu', text: 'Satu kategori per tamu, bisa diisi saat menambah atau mengimpor tamu.', needs: ['guestCategory', 'guestImport'] },
        { title: 'Rekap per kelompok', text: 'Halaman insight menghitung kehadiran per kategori dan per acara.', needs: ['insights'] },
      ],
    },
    'email-communications': {
      availability: 'unsupported',
      summary: 'Invitesion belum mengirim email. Tautan personal dibagikan lewat WhatsApp atau disalin ke kanal lain, termasuk email pribadimu.',
      summaryNeeds: [],
      highlights: [
        { title: 'Pengiriman email dari Invitesion', text: NOT_PLANNED, needs: ['emailSending'] },
        { title: 'Yang tersedia sekarang', text: 'Tautan WhatsApp per tamu berisi pesanmu, dan tautan personal yang bisa disalin ke kanal mana pun.', needs: ['whatsappLinks', 'personalLinks'] },
      ],
    },
    'event-website-builder': {
      summary: 'Susun halaman acara lengkap tanpa koding — agenda, lokasi, galeri, countdown, love story, dan ucapan dalam satu halaman yang rapi.',
      summaryNeeds: ['eventDetails', 'mapLink', 'gallery', 'countdownCalendar', 'loveStory', 'wishes'],
      highlights: [
        { title: 'Bagian yang bisa diatur', text: 'Aktifkan hanya bagian yang acara kamu butuhkan, dari love story sampai catatan dress code.', needs: ['loveStory', 'eventDetails'] },
        { title: 'Tampil baik di ponsel', text: 'Mayoritas tamu membuka lewat WhatsApp — tema dirancang untuk layar kecil.', needs: ['themeCatalog', 'invitationPage'] },
        { title: 'Perubahan langsung tayang', text: 'Ubah jam atau lokasi kapan saja; tamu melihat versi terbaru saat membuka tautannya.', needs: ['liveEdits'] },
      ],
    },
    'online-invitations': {
      summary: 'Buat undangan digital yang bisa dibuka di perangkat mana pun — pilih tema, isi detail acara, dan sebar dalam hitungan menit.',
      summaryNeeds: ['themeCatalog', 'eventDetails', 'personalLinks'],
      highlights: [
        { title: 'Puluhan tema siap pakai', text: 'Desain untuk pernikahan hingga acara komunitas, tinggal ganti isi.', needs: ['themeCatalog'] },
        { title: 'Musik & sampul pembuka', text: 'Beri kesan pertama dengan sampul “Buka Undangan” yang memutar musik latar pilihanmu.', needs: ['music'] },
        { title: 'Tautan personal per tamu', text: 'Setiap tamu menerima tautan dengan namanya sendiri — terasa diundang, bukan di-broadcast.', needs: ['personalLinks'] },
      ],
    },
    'qr-code-rsvps': {
      summary: 'Setiap tamu mendapat QR unik di tautan personalnya untuk check-in di lokasi — antrean masuk cepat dan data kehadiran akurat.',
      summaryNeeds: ['guestPass', 'checkInScanner'],
      highlights: [
        { title: 'QR unik per tamu', text: 'Kode dibuat dari tautan personal tiap tamu dan ditandatangani, sehingga tidak bisa dipalsukan.', needs: ['guestPass'] },
        { title: 'Check-in hitungan detik', text: 'Pindai dengan kamera ponsel panitia atau pemindai genggam; tetap berjalan saat sinyal putus dan punya cara manual.', needs: ['checkInScanner'] },
        { title: 'Data hadir aktual', text: 'Bandingkan konfirmasi dengan kehadiran nyata untuk laporan pasca-acara.', needs: ['checkInScanner', 'insights'] },
      ],
    },
    'guest-list-app': {
      summary: 'Kelola daftar tamu dari browser ponsel — tanpa memasang aplikasi. Tambah tamu, kirim tautan, dan pantau konfirmasi di mana saja.',
      summaryNeeds: ['guestList', 'whatsappLinks', 'insights'],
      highlights: [
        { title: 'Tanpa aplikasi', text: 'Dashboard berjalan di browser ponsel maupun laptop.', needs: ['guestList'] },
        { title: 'Kirim dari ponsel', text: 'Ketuk tombol WhatsApp di tiap tamu untuk mengirim tautan personalnya.', needs: ['whatsappLinks'] },
        { title: 'Bersama tim', text: 'Ajak co-host ikut mengelola daftar tamu dan check-in.', needs: ['teamAccess', 'checkInScanner'] },
      ],
    },
    'multi-language': {
      summary: 'Dashboard dan situs Invitesion tersedia dalam Bahasa Indonesia dan Inggris, dan halaman undangan untuk tamu bisa tampil dalam salah satunya.',
      summaryNeeds: ['interfaceBilingual', 'guestPageBilingual'],
      highlights: [
        { title: 'Bahasa sesuai pengunjung', text: 'Bahasa situs dan dashboard dipilih otomatis dari negara dan pengaturan browser, dan bisa diganti kapan saja.', needs: ['interfaceBilingual'] },
        { title: 'Undangan dwibahasa untuk tamu', text: 'Pilih Bahasa Indonesia atau Inggris untuk label, tanggal, dan pemberitahuan di halaman tamu pada desain Gapura, Kartu, Riang, dan Lontar. Teks yang kamu tulis tidak diterjemahkan, dan tata letak klasik tetap berbahasa Indonesia.', needs: ['guestPageBilingual'] },
      ],
    },
    'event-check-in-app': {
      summary: 'Pemindai check-in di browser ponsel panitia: pindai QR tamu, sambut dengan namanya, dan catat kehadiran — tanpa aplikasi tambahan.',
      summaryNeeds: ['checkInScanner'],
      highlights: [
        { title: 'Kamera atau pemindai genggam', text: 'Gunakan kamera ponsel atau pemindai genggam di meja penerima tamu.', needs: ['checkInScanner'] },
        { title: 'Tahan sinyal putus', text: 'Pindaian disimpan dulu saat koneksi hilang dan dikirim begitu tersambung lagi.', needs: ['checkInScanner'] },
        { title: 'Petugas penerima tamu', text: 'Ajak petugas dengan akses khusus meja check-in.', needs: ['teamAccess', 'checkInScanner'] },
      ],
    },
    'badge-printing': {
      availability: 'unsupported',
      summary: 'Invitesion tidak mencetak name tag atau badge. QR tamu ada di tautan personal untuk dipindai saat check-in.',
      summaryNeeds: [],
      highlights: [
        { title: 'Cetak badge', text: NOT_PLANNED, needs: ['badgePrinting'] },
        { title: 'QR di tautan personal', text: 'Tamu menunjukkan QR dari ponselnya untuk check-in.', needs: ['guestPass'] },
      ],
    },
    'live-attendance': {
      summary: 'Lihat tamu yang sudah check-in selama acara berlangsung, langsung dari pemindai panitia.',
      summaryNeeds: ['checkInScanner'],
      highlights: [
        { title: 'Kehadiran tercatat seketika', text: 'Setiap pindaian langsung tercatat sebagai kehadiran tamu.', needs: ['checkInScanner'] },
        { title: 'Konfirmasi vs kehadiran', text: 'Bandingkan konfirmasi RSVP dengan kehadiran nyata setelah acara.', needs: ['checkInScanner', 'insights'] },
      ],
    },
    'analytics-and-reporting': {
      summary: 'Pahami perjalanan tamu dari undangan dibuka sampai menjawab RSVP — angka penting dalam satu dashboard, lengkap dengan ekspor CSV.',
      summaryNeeds: ['insights', 'openTracking', 'guestCsvExport'],
      highlights: [
        { title: 'Statistik pembukaan', text: 'Ketahui berapa tamu yang sudah membuka undangan, dan lihat pembukaan 14 hari terakhir.', needs: ['openTracking', 'insights'] },
        { title: 'Daftar follow-up', text: 'Daftar “belum membuka” dan “belum menjawab” siap ditindaklanjuti lewat WhatsApp.', needs: ['followUpLists', 'whatsappLinks', 'openTracking'] },
        csvHighlight('Unduh data tamu, jawaban RSVP, dan jawaban pertanyaan khusus untuk laporan panitia.'),
      ],
    },
    salesforce: {
      availability: 'unsupported',
      summary: 'Invitesion tidak terhubung ke Salesforce. Data tamu bisa diunduh sebagai CSV lalu diimpor ke CRM pilihanmu.',
      summaryNeeds: [],
      highlights: [{ title: 'Integrasi Salesforce', text: NOT_PLANNED, needs: ['crmIntegrations'] }, csvHighlight('Unduh daftar tamu dan jawaban RSVP sebagai CSV.')],
    },
    hubspot: {
      availability: 'unsupported',
      summary: 'Invitesion tidak terhubung ke HubSpot. Data tamu bisa diunduh sebagai CSV lalu diimpor ke CRM pilihanmu.',
      summaryNeeds: [],
      highlights: [{ title: 'Integrasi HubSpot', text: NOT_PLANNED, needs: ['crmIntegrations'] }, csvHighlight('Unduh daftar tamu dan jawaban RSVP sebagai CSV.')],
    },
    stripe: {
      availability: 'unsupported',
      summary: 'Invitesion tidak memproses pembayaran tamu, baik lewat Stripe maupun penyedia lain. Rekening atau QRIS milikmu bisa ditampilkan di halaman undangan.',
      summaryNeeds: [],
      highlights: [
        { title: 'Pembayaran tamu lewat Stripe', text: NOT_PLANNED, needs: ['cashlessCollection'] },
        { title: 'Info rekening & QRIS', text: 'Tampilkan rekening atau gambar QRIS untuk hadiah.', needs: ['giftAccounts'] },
      ],
    },
    'google-analytics': {
      availability: 'unsupported',
      summary: 'Halaman undangan tidak memasang Google Analytics. Pembukaan undangan dihitung oleh Invitesion sendiri dan tampil di dashboard.',
      summaryNeeds: [],
      highlights: [
        { title: 'Integrasi Google Analytics', text: NOT_PLANNED, needs: ['thirdPartyAnalytics'] },
        { title: 'Statistik bawaan', text: 'Jumlah tamu yang sudah membuka undangan dan yang sudah menjawab tampil di halaman insight.', needs: ['openTracking', 'insights'] },
      ],
    },
    zapier: {
      availability: 'unsupported',
      summary: 'Invitesion belum punya integrasi Zapier atau webhook keluar. Data tamu bisa diunduh sebagai CSV untuk diolah di alat lain.',
      summaryNeeds: [],
      highlights: [{ title: 'Integrasi Zapier', text: NOT_PLANNED, needs: ['automationIntegrations'] }, csvHighlight('Unduh data tamu untuk diolah di alat lain.')],
    },
    'api-and-export': {
      summary: 'Unduh data tamu dan jawaban RSVP sebagai CSV kapan saja. API publik belum tersedia.',
      summaryNeeds: ['guestCsvExport'],
      highlights: [
        csvHighlight('Daftar tamu, status, jumlah pendamping, dan jawaban pertanyaan khusus dalam satu berkas.'),
        { title: 'Ekspor log hari-H', text: 'Unduh data meja, suvenir, dan catatan hadiah dari log hari-H.', needs: ['seatingLog', 'giftLog'] },
        { title: 'API publik', text: NOT_PLANNED, needs: ['publicApi'] },
      ],
    },
  },

  resources: {
    'case-studies': notPublished('Belum ada studi kasus yang dipublikasikan.'),
    'event-spotlights': notPublished('Belum ada sorotan acara yang dipublikasikan.'),
    reviews: notPublished('Belum ada ulasan pelanggan yang dipublikasikan di halaman ini.'),
    'privacy-and-security': {
      summary: 'Data acara dan tamu adalah milikmu — begini Invitesion menjaga halaman undangan dan data tamu saat ini.',
      summaryNeeds: ['unlistedPages', 'personalLinks'],
      highlights: [
        { title: 'Koneksi HTTPS', text: 'Halaman Invitesion dilayani lewat koneksi HTTPS yang terenkripsi.', needs: ['invitationPage'] },
        { title: 'Tidak diindeks mesin pencari', text: 'Halaman undangan dan tautan personal tidak diindeks mesin pencari; hanya yang menerima tautannya yang bisa membukanya.', needs: ['unlistedPages', 'personalLinks'] },
        { title: 'Detail hadiah bisa dibatasi', text: 'Nomor rekening dan QRIS bisa ditampilkan hanya di tautan personal, tidak di tautan umum.', needs: ['giftAccounts'] },
        { title: 'Pembukaan dihitung sendiri', text: 'Invitesion mencatat kapan tautan personal dibuka untuk dashboard penyelenggara, tanpa layanan analitik pihak ketiga.', needs: ['openTracking'] },
      ],
    },
    'event-roi-calculator': notPublished('Kalkulator ROI acara belum tersedia.'),
    sales: {
      summary: 'Untuk kebutuhan acara khusus atau pembelian dalam jumlah banyak, hubungi tim Invitesion lewat email.',
      summaryNeeds: ['supportEmail'],
      highlights: [
        contactHighlight,
        { title: 'Ruang kerja reseller', text: 'Kelola undangan klien bersama staf: pengelola klien dan staf meja tamu, dengan akses yang bisa dicabut.', needs: ['resellerWorkspace'] },
        { title: 'Kredit reseller', text: 'Kredit dan paket untuk reseller sedang direncanakan.', needs: ['workspaceCredits'] },
      ],
    },
    // G-061: /resources/help-center is its own route (app/resources/help-center); this entry feeds the resources index card.
    'help-center': {
      summary: 'Panduan langkah demi langkah untuk fitur yang sudah tersedia: membuat undangan, mengelola tamu dan ucapan. Tim kami juga bisa dihubungi lewat email.',
      summaryNeeds: ['helpArticles', 'supportEmail'],
      highlights: [
        contactHighlight,
        { title: 'Panduan per tugas', text: 'Setiap panduan hanya terbit bila fitur yang dijelaskannya sudah tersedia untuk semua pengguna.', needs: ['helpArticles'] },
      ],
    },
    'community-forum': notPublished('Belum ada forum komunitas.'),
    'press-and-blog': notPublished('Belum ada artikel atau siaran pers yang dipublikasikan.'),
    faq: {
      summary: 'Jawaban singkat untuk pertanyaan yang paling sering diajukan tentang harga, masa aktif, tema, dan tamu.',
      summaryNeeds: ['draftPreview', 'themeCatalog'],
      highlights: [
        { title: 'Berapa lama undangan aktif?', text: 'Sekali bayar per undangan, aktif 12 bulan. Draf dan pratinjau bisa dibuat tanpa biaya.', needs: ['draftPreview'] },
        { title: 'Apakah tamu perlu akun?', text: 'Tidak. Tamu cukup membuka tautan personalnya untuk melihat undangan dan menjawab RSVP.', needs: ['personalLinks', 'rsvp'] },
        { title: 'Bisakah ganti tema?', text: 'Bisa. Paket Standard berganti antar tema Standard; Premium membuka semua tema premium.', needs: ['themeSwitch'] },
      ],
    },
    contact: {
      summary: 'Hubungi tim Invitesion lewat email di hello@invitesion.id.',
      summaryNeeds: ['supportEmail'],
      highlights: [contactHighlight],
    },
    'app-status': notPublished('Halaman status layanan belum tersedia.'),
    careers: notPublished('Belum ada lowongan yang dipublikasikan.'),
    affiliates: notPublished('Program afiliasi belum tersedia.'),
  },
};

const eventTypesTitles = [
  'Client & VIP events',
  'Customer appreciation',
  'Employee appreciation',
  'Brand activations',
  'Product launches',
  'Conferences',
  'Summits & forums',
  'Tradeshows & expos',
  'Sales kickoffs',
  'Workshops & classes',
  'Field marketing',
  'Networking events',
  'Internal meetings & trainings',
  'Team building & offsites',
  'Investor & shareholder',
  'Holiday parties',
  'Galas & benefit dinners',
  'Donor stewardship',
  'Shows & performances',
  'Community events',
  'Enterprise',
  'Businesses',
  'Financial services',
  'Agencies',
  'Nonprofits & foundations',
  'Healthcare',
  'Associations & membership',
  'Government & NGO',
  'Higher education',
  'K–12 schools',
  'Independent schools',
  'Religious organizations',
  'Hospitality & venues',
  'Bars & restaurants',
  'Real estate',
  'Media & publishing',
  'Weddings',
  'Wedding anniversaries',
  'Bridal showers',
  'Birthdays',
  'Anniversary parties',
  'Reunions',
  'Graduations',
  'Aqiqah & Khitanan',
  'Syukuran',
  'Baby showers',
  'Gender reveals',
  'Holiday gatherings',
  'Retirement parties',
  'Celebrations of life',
] as const;

const featuresTitles = [
  'Event registration',
  'Online RSVPs',
  'Form builder',
  'Embeddable forms',
  'Event ticketing',
  'Donations',
  'Appointment scheduling',
  'Payment processing',
  'Guest list management',
  'Seating charts',
  'Menu & dietary',
  'Contact tagging',
  'Email communications',
  'Event website builder',
  'Online invitations',
  'QR code RSVPs',
  'Guest list app',
  'Multi-language',
  'Event check-in app',
  'Badge printing',
  'Live attendance',
  'Analytics & reporting',
  'Salesforce',
  'HubSpot',
  'Stripe',
  'Google Analytics',
  'Zapier',
  'API & export',
] as const;

const resourcesTitles = [
  'Case studies',
  'Event spotlights',
  'Reviews',
  'Privacy & security',
  'Event ROI calculator',
  'Sales',
  'Help Center',
  'Community forum',
  'Press & Blog',
  'FAQ',
  'Contact',
  'App status',
  'Careers',
  'Affiliates',
] as const;

export const marketingTitles: Record<MarketingCategory, readonly string[]> = { 'event-types': eventTypesTitles, features: featuresTitles, resources: resourcesTitles };
export const marketingIndexPaths: Record<MarketingCategory, string> = { 'event-types': '/event-types', features: '/features', resources: '/resources' };
/** Hand-written copy by category and slug, for the B-022 cross-check. */
export const marketingPageCopy: Readonly<Record<MarketingCategory, Readonly<Record<string, PageCopy>>>> = handWritten;

export function slugifyMarketingTitle(title: string) {
  return title.toLowerCase().replace(/–/g, '-').replace(/&/g, ' and ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export function marketingHref(category: MarketingCategory, title: string) {
  if (category === 'resources' && title === 'Contact') return 'mailto:hello@invitesion.id';
  return `${marketingIndexPaths[category]}/${slugifyMarketingTitle(title)}`;
}

function resolvePage(category: MarketingCategory, title: string, env: Record<string, string | undefined>): MarketingPage {
  const slug = slugifyMarketingTitle(title);
  const copy = handWritten[category][slug] ?? (category === 'event-types' ? eventTypeFallback : undefined);
  if (!copy) throw new Error(`B-022: ${category}/${slug} has no hand-written copy`);
  const availability = copy.availability ?? 'available';
  return {
    title,
    slug,
    category,
    eyebrow: EYEBROWS[category],
    summary: copy.summary,
    summaryNeeds: copy.summaryNeeds,
    availability,
    status: availability === 'available' ? claimStatus(copy.summaryNeeds, env) : availability,
    highlights: copy.highlights.map((highlight) => ({ ...highlight, status: claimStatus(highlight.needs, env) })),
  };
}

/** Every marketing page with its claims resolved against the flags in `env` (the build's environment by default). */
export function buildMarketingPages(env: Record<string, string | undefined> = process.env): Record<MarketingCategory, readonly MarketingPage[]> {
  return {
    'event-types': eventTypesTitles.map((title) => resolvePage('event-types', title, env)),
    features: featuresTitles.map((title) => resolvePage('features', title, env)),
    resources: resourcesTitles.map((title) => resolvePage('resources', title, env)),
  };
}

export const marketingPages = buildMarketingPages();
export function getMarketingPage(category: MarketingCategory, slug: string) { return marketingPages[category].find(page => page.slug === slug); }

/** B-022: the page's title and summary as metadata; only pages whose claims are available are offered to search engines. */
export function marketingPageMetadata(page: MarketingPage): Metadata {
  return {
    title: `${page.title} — Invitesion`,
    description: page.summary,
    robots: page.status === 'available' ? undefined : { index: false, follow: true },
  };
}
