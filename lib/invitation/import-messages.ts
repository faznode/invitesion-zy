import { ROSTER_LIMITS, type RowReason } from './roster-rules';

/**
 * B-033: the import's words for the host (Indonesian, the dashboard's language). Client-safe: the import page and its
 * client component share them.
 */

const number = (value: number) => value.toLocaleString('id-ID');

const ERRORS: Record<string, string> = {
  empty: 'Tidak ada baris tamu untuk diimpor.',
  too_large: 'Teksnya terlalu panjang. Bagi daftar menjadi beberapa impor.',
  unterminated_quote: 'Ada tanda kutip (") yang tidak ditutup. Periksa baris dengan tanda kutip.',
  no_name_column: 'Baris judul tidak punya kolom nama. Beri judul "Nama" pada kolom nama tamu.',
  too_many_rows: `Paling banyak ${number(ROSTER_LIMITS.maxImportRows)} baris per impor. Bagi daftar menjadi beberapa impor.`,
  roster_full: `Impor ini akan melewati batas ${number(ROSTER_LIMITS.maxGuests)} tamu per undangan. Tidak ada yang diimpor.`,
  nothing_to_import: 'Tidak ada baris yang lolos pemeriksaan, jadi tidak ada yang diimpor.',
  notfound: 'Undangan tidak ditemukan.',
  unconfirmed: 'Belum bisa dipastikan karena gangguan sambungan. Periksa daftar tamu sebelum mengimpor lagi.',
};

export function importErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return ERRORS[code] ?? 'Impor gagal. Periksa lagi datanya.';
}

export const REASON_LABELS: Record<RowReason, string> = {
  name: 'nama kosong atau terlalu panjang',
  phone: 'nomor WhatsApp tidak valid',
  seats: 'jumlah tamu bukan 1–50',
  category: 'kategori terlalu panjang',
};
