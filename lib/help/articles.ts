import type { Locale } from '@/lib/i18n';
import { claimStatus, type CapabilityId } from '@/lib/marketing/capabilities';

/**
 * G-061 (B-022 rule): task-based help articles. Each article names the capabilities it describes and is published only
 * while every one of them is `available` in this deployment (`claimStatus`), so an article about a flag-gated feature
 * (the workspace, receipts, coupons) appears only once its flag is on for everyone, and nothing about a roadmap or
 * unsupported capability (credit prices, a licensed PJP, payouts) can be published. Unpublishing an article is removing
 * it from `HELP_ARTICLES` or switching its capability's flag off; its URL then answers 404.
 *
 * Quoted interface labels are written between “ and ”: every one must be listed in `uiTerms` with the file that renders
 * it, and `tests/g061-help-articles.test.ts` checks the label against that file and every route against `app/`.
 */

export type HelpTopic = 'getting-started' | 'guests' | 'payments' | 'workspace';

export type ArticleCopy = {
  title: string;
  summary: string;
  steps: readonly string[];
  notes?: readonly string[];
};

export type HelpArticle = {
  /** English kebab-case; the URL is `/resources/help-center/<slug>`. */
  slug: string;
  topic: HelpTopic;
  needs: readonly CapabilityId[];
  /** Dashboard or public routes the article sends readers to, as `app/` paths without route groups. */
  routes: readonly string[];
  uiTerms: readonly { text: string; source: string }[];
  copy: Record<Locale, ArticleCopy>;
};

export const HELP_TOPICS: Record<HelpTopic, Record<Locale, string>> = {
  'getting-started': { id: 'Mulai', en: 'Getting started' },
  guests: { id: 'Tamu & RSVP', en: 'Guests & RSVP' },
  payments: { id: 'Pembayaran', en: 'Payments' },
  workspace: { id: 'Ruang kerja reseller', en: 'Reseller workspace' },
};

const DASHBOARD = 'app/(customer)/dashboard';

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'create-your-first-invitation',
    topic: 'getting-started',
    needs: ['themeCatalog', 'themeSwitch', 'draftPreview', 'liveEdits'],
    routes: ['/dashboard/templates', '/dashboard/invitations/[id]/edit'],
    uiTerms: [
      { text: 'Pilih tema', source: 'lib/i18n.ts' },
      { text: 'Choose a theme', source: 'lib/i18n.ts' },
      { text: 'Gunakan tema', source: `${DASHBOARD}/templates/page.tsx` },
      { text: 'Use theme', source: `${DASHBOARD}/templates/page.tsx` },
      { text: 'Pratinjau undangan', source: `${DASHBOARD}/invitations/[id]/edit/editor-save.tsx` },
      { text: 'Invitation preview', source: `${DASHBOARD}/invitations/[id]/edit/editor-save.tsx` },
    ],
    copy: {
      id: {
        title: 'Membuat undangan pertama',
        summary: 'Pilih tema, isi data acara, lalu lihat hasilnya sebelum dibagikan. Draf dan pratinjau bisa dibuat tanpa biaya.',
        steps: [
          'Masuk ke akun Anda, lalu buka “Pilih tema” di menu dasbor.',
          'Pilih tema yang cocok dengan acara Anda dan tekan “Gunakan tema”. Undangan baru dimulai sebagai draf.',
          'Isi nama, tanggal, waktu dan lokasi acara di editor, lalu simpan perubahan.',
          'Buka “Pratinjau undangan” untuk melihat tampilan yang akan diterima tamu sebelum undangan diterbitkan.',
        ],
        notes: ['Tema masih bisa diganti dari editor selama tier undangan Anda mencakup tema tersebut.'],
      },
      en: {
        title: 'Create your first invitation',
        summary: 'Choose a theme, fill in your event, then see the result before you share it. Drafts and previews cost nothing.',
        steps: [
          'Sign in, then open “Choose a theme” in the dashboard menu.',
          'Pick a theme that suits your event and press “Use theme”. The new invitation starts as a draft.',
          'Fill in the names, date, time and venue in the editor, then save your changes.',
          'Open “Invitation preview” to see what your guests will receive before the invitation is published.',
        ],
        notes: ['You can still switch themes from the editor as long as your invitation’s tier includes the theme.'],
      },
    },
  },
  {
    slug: 'add-guests-and-send-personal-links',
    topic: 'guests',
    needs: ['guestList', 'personalLinks', 'whatsappLinks', 'rsvp'],
    routes: ['/dashboard/guests', '/dashboard/invitations/[id]/guests'],
    uiTerms: [
      { text: 'Tamu & RSVP', source: 'lib/i18n.ts' },
      { text: 'Guests & RSVP', source: 'lib/i18n.ts' },
      { text: 'Tambah tamu', source: `${DASHBOARD}/invitations/[id]/guests/page.tsx` },
      { text: 'Simpan tamu', source: `${DASHBOARD}/invitations/[id]/guests/page.tsx` },
      { text: 'Nomor WhatsApp tidak valid', source: 'components/dashboard/guest-whatsapp-action.tsx' },
      { text: 'Invalid WhatsApp number', source: 'components/dashboard/guest-whatsapp-action.tsx' },
    ],
    copy: {
      id: {
        title: 'Menambah tamu dan mengirim tautan personal',
        summary: 'Setiap tamu mendapat tautan personal yang menyapa namanya. Anda mengirimnya sendiri lewat WhatsApp.',
        steps: [
          'Buka “Tamu & RSVP” di menu dasbor, atau halaman tamu pada undangan Anda.',
          'Di bagian “Tambah tamu”, isi nama tamu dan nomor WhatsApp-nya bila ada, lalu tekan “Simpan tamu”.',
          'Tekan tombol WhatsApp di baris tamu. WhatsApp Anda terbuka dengan pesan yang sudah berisi tautan personal tamu itu; periksa lalu kirim.',
          'Bila muncul “Nomor WhatsApp tidak valid”, perbaiki nomornya di daftar tamu lalu coba lagi.',
        ],
        notes: ['Tamu tidak perlu akun: tautan personal cukup untuk membuka undangan dan menjawab RSVP.'],
      },
      en: {
        title: 'Add guests and send personal links',
        summary: 'Every guest gets a personal link that greets them by name. You send it yourself through WhatsApp.',
        steps: [
          'Open “Guests & RSVP” in the dashboard menu, or the guests page of your invitation.',
          'In “Tambah tamu” (add a guest), enter the guest’s name and WhatsApp number if you have it, then press “Simpan tamu” (save guest).',
          'Press the WhatsApp button on the guest’s row. Your WhatsApp opens with a message that already holds that guest’s personal link; check it and send it.',
          'If you see “Invalid WhatsApp number”, correct the number in the guest list and try again.',
        ],
        notes: ['Guests need no account: the personal link is enough to open the invitation and answer the RSVP.'],
      },
    },
  },
  {
    slug: 'follow-rsvps-and-opens',
    topic: 'guests',
    needs: ['rsvp', 'insights', 'openTracking', 'followUpLists', 'guestCsvExport', 'whatsappLinks'],
    routes: ['/dashboard/invitations/[id]/insights', '/dashboard/invitations/[id]/manage'],
    uiTerms: [
      { text: 'Analytics & Export', source: `${DASHBOARD}/invitations/[id]/manage/manage-center.tsx` },
      { text: 'Belum membuka', source: 'components/dashboard/host-insights.tsx' },
      { text: 'Belum menjawab', source: `${DASHBOARD}/invitations/[id]/guests/answer-summary.tsx` },
      { text: 'Unduh CSV', source: 'components/dashboard/host-insights.tsx' },
    ],
    copy: {
      id: {
        title: 'Memantau RSVP dan siapa yang sudah membuka',
        summary: 'Lihat jawaban RSVP, siapa yang belum membuka undangan dan siapa yang belum menjawab, lalu unduh daftarnya.',
        steps: [
          'Buka pusat kontrol undangan Anda, lalu kartu “Analytics & Export”.',
          'Lihat jumlah tamu yang sudah membuka undangan dan jawaban RSVP mereka.',
          'Gunakan daftar “Belum membuka” dan “Belum menjawab” untuk menindaklanjuti tamu lewat WhatsApp.',
          'Tekan “Unduh CSV” pada daftar untuk menyimpannya di perangkat Anda.',
        ],
        notes: ['Pembukaan dihitung oleh Invitesion sendiri, tanpa layanan analitik pihak ketiga.'],
      },
      en: {
        title: 'Follow RSVPs and who has opened',
        summary: 'See RSVP answers, who has not opened the invitation and who has not answered, then download the lists.',
        steps: [
          'Open your invitation’s control centre, then the “Analytics & Export” card.',
          'See how many guests have opened the invitation and their RSVP answers.',
          'Use the “Belum membuka” (not opened yet) and “Belum menjawab” (not answered yet) lists to follow up with guests through WhatsApp.',
          'Press “Unduh CSV” (download CSV) on a list to save it on your device.',
        ],
        notes: ['Opens are counted by Invitesion itself, without a third-party analytics service.'],
      },
    },
  },
  {
    slug: 'moderate-and-reply-to-wishes',
    topic: 'guests',
    needs: ['wishes'],
    routes: ['/dashboard/invitations/[id]/wishes'],
    uiTerms: [
      { text: 'Wishes', source: `${DASHBOARD}/invitations/[id]/manage/manage-center.tsx` },
      { text: 'Sembunyikan', source: `${DASHBOARD}/invitations/[id]/wishes/page.tsx` },
      { text: 'Tampilkan lagi', source: `${DASHBOARD}/invitations/[id]/wishes/page.tsx` },
      { text: 'Balas ucapan ini', source: `${DASHBOARD}/invitations/[id]/wishes/page.tsx` },
      { text: 'Hapus', source: `${DASHBOARD}/invitations/[id]/wishes/page.tsx` },
    ],
    copy: {
      id: {
        title: 'Mengelola dan membalas ucapan',
        summary: 'Atur ucapan yang tampil di undangan dan balas ucapan tamu dari halaman ucapan.',
        steps: [
          'Buka pusat kontrol undangan Anda, lalu kartu “Wishes”.',
          'Tekan “Sembunyikan” agar sebuah ucapan tidak tampil bagi tamu; “Tampilkan lagi” memunculkannya kembali.',
          'Tekan “Balas ucapan ini” untuk menulis balasan Anda.',
          'Tekan “Hapus” lalu konfirmasi untuk menghapus ucapan secara permanen.',
        ],
      },
      en: {
        title: 'Moderate and reply to wishes',
        summary: 'Choose which wishes appear on the invitation and reply to guests from the wishes page.',
        steps: [
          'Open your invitation’s control centre, then the “Wishes” card.',
          'Press “Sembunyikan” (hide) so a wish no longer appears to guests; “Tampilkan lagi” (show again) brings it back.',
          'Press “Balas ucapan ini” (reply to this wish) to write your reply.',
          'Press “Hapus” (delete) and confirm to delete a wish permanently.',
        ],
      },
    },
  },
  {
    slug: 'run-a-reseller-workspace',
    topic: 'workspace',
    // The manager and desk roles work the check-in desk, so the article also waits for the desk's flag (GUEST_PASS).
    needs: ['resellerWorkspace', 'checkInScanner', 'whatsappLinks'],
    routes: ['/dashboard/workspace', '/gabung/ruang/[token]'],
    uiTerms: [
      { text: 'Ruang kerja', source: `${DASHBOARD}/customer-shell.tsx` },
      { text: 'Workspace', source: `${DASHBOARD}/customer-shell.tsx` },
      { text: 'Buat ruang kerja', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Create workspace', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Jadikan undangan klien', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Make it a client invitation', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Pengelola klien', source: 'lib/invitation/members.ts' },
      { text: 'Client manager', source: 'lib/invitation/members.ts' },
      { text: 'Staf meja tamu', source: 'lib/invitation/members.ts' },
      { text: 'Guest desk staff', source: 'lib/invitation/members.ts' },
      { text: 'Buat tautan', source: `${DASHBOARD}/workspace/staff-link-form.tsx` },
      { text: 'Create link', source: `${DASHBOARD}/workspace/staff-link-form.tsx` },
      { text: 'Terima dan bergabung', source: 'app/gabung/ruang/[token]/page.tsx' },
      { text: 'Cabut', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Revoke', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Jadikan pribadi', source: `${DASHBOARD}/workspace/page.tsx` },
      { text: 'Make personal', source: `${DASHBOARD}/workspace/page.tsx` },
    ],
    copy: {
      id: {
        title: 'Menjalankan ruang kerja reseller',
        summary: 'Kelola undangan klien bersama staf. Anda tetap pemilik setiap undangan; staf hanya mendapat akses sesuai perannya.',
        steps: [
          'Buka “Ruang kerja” di menu dasbor, isi nama ruang kerja, lalu tekan “Buat ruang kerja”.',
          'Pilih salah satu undangan Anda, tulis nama klien, lalu tekan “Jadikan undangan klien”.',
          'Di bagian staf, tulis untuk siapa tautannya, pilih peran “Pengelola klien” (tamu, ucapan, insight dan meja check-in) atau “Staf meja tamu” (meja check-in saja), lalu tekan “Buat tautan”.',
          'Tautan hanya ditampilkan sekali. Kirim lewat WhatsApp; staf membukanya, masuk ke akunnya, lalu menekan “Terima dan bergabung”.',
          'Tekan “Cabut” untuk mengakhiri akses seorang staf, atau “Jadikan pribadi” agar undangan kembali menjadi undangan pribadi.',
        ],
        notes: ['Isi undangan, tema, pembayaran dan publikasi hanya bisa diubah dari akun pemilik. Tautan staf berlaku 7 hari untuk satu akun.'],
      },
      en: {
        title: 'Run a reseller workspace',
        summary: 'Manage client invitations with your staff. You stay the owner of every invitation; staff get only what their role allows.',
        steps: [
          'Open “Workspace” in the dashboard menu, enter a workspace name, then press “Create workspace”.',
          'Choose one of your invitations, write the client’s name, then press “Make it a client invitation”.',
          'In the staff section, write who the link is for, choose “Client manager” (guests, wishes, insights and the check-in desk) or “Guest desk staff” (the check-in desk only), then press “Create link”.',
          'The link is shown only once. Send it through WhatsApp; your staff member opens it, signs in, then presses “Terima dan bergabung” (accept and join).',
          'Press “Revoke” to end a staff member’s access, or “Make personal” to turn a client invitation back into a personal one.',
        ],
        notes: ['Content, theme, payment and publishing can only be changed from the owner’s account. A staff link works for 7 days and for one account.'],
      },
    },
  },
  {
    slug: 'download-a-payment-receipt',
    topic: 'payments',
    needs: ['receipts'],
    routes: ['/dashboard/receipts', '/dashboard/receipts/[number]'],
    uiTerms: [
      { text: 'Kuitansi', source: `${DASHBOARD}/customer-shell.tsx` },
      { text: 'Receipts', source: `${DASHBOARD}/customer-shell.tsx` },
      { text: 'Cetak atau simpan PDF', source: `${DASHBOARD}/receipts/[number]/page.tsx` },
      { text: 'Print or save as PDF', source: `${DASHBOARD}/receipts/[number]/page.tsx` },
      { text: 'Minta kuitansi', source: `${DASHBOARD}/receipts/page.tsx` },
      { text: 'Request receipt', source: `${DASHBOARD}/receipts/page.tsx` },
    ],
    copy: {
      id: {
        title: 'Mengunduh kuitansi pembayaran',
        summary: 'Setiap pembayaran yang lunas mendapat kuitansi bernomor yang bisa dicetak atau disimpan sebagai PDF.',
        steps: [
          'Buka “Kuitansi” di menu dasbor.',
          'Pilih nomor kuitansi untuk membukanya.',
          'Tekan “Cetak atau simpan PDF”, lalu pilih printer atau simpan sebagai PDF di dialog cetak.',
          'Pembayaran lama tanpa kuitansi menampilkan “Minta kuitansi”; kuitansinya terbit setelah diproses.',
        ],
        notes: ['Kuitansi hanya berisi data pembayaran dan bukan faktur pajak.'],
      },
      en: {
        title: 'Download a payment receipt',
        summary: 'Every paid order gets a numbered receipt that you can print or save as a PDF.',
        steps: [
          'Open “Receipts” in the dashboard menu.',
          'Choose a receipt number to open it.',
          'Press “Print or save as PDF”, then pick a printer or save as PDF in the print dialog.',
          'An earlier payment without a receipt shows “Request receipt”; its receipt is issued once it has been processed.',
        ],
        notes: ['A receipt holds only the payment record and is not a tax invoice.'],
      },
    },
  },
  {
    slug: 'use-a-coupon-code',
    topic: 'payments',
    needs: ['coupons'],
    routes: ['/dashboard/invitations/[id]/checkout'],
    uiTerms: [
      { text: 'Kode kupon (opsional)', source: `${DASHBOARD}/invitations/[id]/checkout/page.tsx` },
      { text: 'Coupon code (optional)', source: `${DASHBOARD}/invitations/[id]/checkout/page.tsx` },
      { text: 'Lanjut ke pembayaran', source: `${DASHBOARD}/invitations/[id]/checkout/page.tsx` },
      { text: 'Continue to payment', source: `${DASHBOARD}/invitations/[id]/checkout/page.tsx` },
    ],
    copy: {
      id: {
        title: 'Memakai kode kupon',
        summary: 'Kode kupon dari Invitesion memotong harga saat Anda mengaktifkan undangan.',
        steps: [
          'Buka halaman aktivasi undangan Anda.',
          'Isi “Kode kupon (opsional)” dengan kode yang Anda terima.',
          'Tekan “Lanjut ke pembayaran”. Potongan dihitung di server dan tampil pada order setelah order dibuat.',
          'Kode yang tidak berlaku ditolak dengan pesan, dan tidak ada order yang dibuat.',
        ],
        notes: ['Kode pada order yang belum dibayar tidak bisa diganti. Setiap kode punya aturan sendiri, misalnya masa berlaku dan batas pemakaian.'],
      },
      en: {
        title: 'Use a coupon code',
        summary: 'A coupon code from Invitesion lowers the price when you activate an invitation.',
        steps: [
          'Open your invitation’s activation page.',
          'Enter the code you received in “Coupon code (optional)”.',
          'Press “Continue to payment”. The discount is calculated on the server and shown on the order once it is made.',
          'A code that does not apply is refused with a message, and no order is made.',
        ],
        notes: ['The codes on an unpaid order cannot be changed. Each code has its own rules, such as a validity window and a usage limit.'],
      },
    },
  },
];

/** The articles this deployment publishes: every capability an article describes is `available` here. */
export function publishedHelpArticles(env: Record<string, string | undefined> = process.env): HelpArticle[] {
  return HELP_ARTICLES.filter((article) => claimStatus(article.needs, env) === 'available');
}

export function publishedHelpArticle(slug: string, env: Record<string, string | undefined> = process.env): HelpArticle | null {
  return publishedHelpArticles(env).find((article) => article.slug === slug) ?? null;
}
