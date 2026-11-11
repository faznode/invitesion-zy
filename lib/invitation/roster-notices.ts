/**
 * B-033: what a host reads after a roster write, from its outcome (`roster-outcomes.ts`), whichever writer handled it.
 * Call sites redirect with `rosterNotice(outcome)`; pages show `rosterErrorMessage(searchParams.error)`. Client-safe.
 */

/** The query a refusal redirects with (`error=phone`, `error=full`, …), or null when the write succeeded. */
export function rosterNotice(outcome: { kind: string; reason?: string }): string | null {
  switch (outcome.kind) {
    case 'saved':
    case 'approved':
    case 'rejected':
    case 'undone':
    case 'imported':
      return null;
    case 'invalid':
      return `error=${outcome.reason ?? 'invalid'}`;
    case 'full':
    case 'duplicate':
    case 'notfound':
    case 'unconfirmed':
      return `error=${outcome.kind}`;
    default:
      return 'error=invalid';
  }
}

const MESSAGES: Record<string, string> = {
  name: 'Nama wajib diisi, paling banyak 150 karakter.',
  phone: 'Nomor WhatsApp tidak valid. Pakai nomor seluler, misalnya 0812-3456-7890 atau +62 812-3456-7890.',
  seats: 'Jumlah tamu harus angka 1 sampai 50.',
  category: 'Kategori paling banyak 50 karakter.',
  full: 'Daftar tamu undangan ini sudah mencapai 3.000 tamu, batas untuk satu undangan.',
  duplicate: 'Orang dengan nomor (atau nama) ini sudah ada di daftar tamu. Tolak permintaannya bila memang sama.',
  unconfirmed:
    'Perubahan belum bisa dipastikan tersimpan karena gangguan sambungan. Periksa daftar tamu, lalu ulangi bila belum berubah.',
  import: 'Impor ini sudah dibatalkan atau tidak ditemukan.',
  invalid: 'Data tidak valid atau tamu tidak ditemukan.',
};

/** The message for an `error` query value; unknown values read as the generic one. */
export function rosterErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.invalid;
}
