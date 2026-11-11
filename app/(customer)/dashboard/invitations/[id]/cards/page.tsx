import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Download } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { isFlagOn } from '@/lib/flags';
import { normalizeStoredConfig } from '@/lib/invitation/content-read';
import { parseId } from '@/lib/invitation/host-logs';
import { accessFor } from '@/lib/invitation/members-db';
import { passcodeGateActive } from '@/lib/invitation/guest-passcode';
import { cardExportState, cardGuestName } from '@/lib/invitation/print-card';
import { loadCardGuests } from '@/lib/invitation/print-card-db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Kartu cetak & e-card', robots: { index: false, follow: false } };

/** Why the cards are not offered, in the owner's words: each reason names what would make them available. */
const UNAVAILABLE: Record<'draft' | 'expired' | 'off', string> = {
  draft: 'Kartu tersedia setelah undangan diaktifkan, karena kode QR di kartu harus membuka undangan yang sudah bisa dibuka tamu.',
  expired: 'Masa aktif undangan ini sudah berakhir, jadi kode QR tidak lagi membuka undangan yang aktif. Kartu tidak dibuat.',
  off: 'Kartu cetak & e-card belum diizinkan. Nyalakan di editor, bagian Tema & Cover, lalu simpan.',
};

/**
 * G-055 (I-30): the owner's printable cards. The public e-card (the invitation's data and a QR code to its general link,
 * safe to share with anyone) and one card per guest, whose code opens that guest's personal link. Owner only
 * (`manage`); flag off: 404. Each download is checked again by its route, so a link copied from here stops working once
 * access, the opt-in or the invitation's live status ends.
 */
export default async function PrintCardsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'ADMIN') redirect('/sign-in');
  if (!isFlagOn('CARD_EXPORT')) notFound();
  const id = parseId((await params).id);
  const access = id === null ? null : await accessFor(user.id, id, 'manage');
  if (!access || id === null) notFound();
  const { invitation } = access;
  const { config } = normalizeStoredConfig(invitation.config ?? {});
  const state = cardExportState(invitation, config);
  const available = state === 'available';
  const reason = state === 'available' ? 'off' : state;
  const guests = available ? await loadCardGuests(id) : [];
  const base = `/dashboard/invitations/${id}`;
  const eCard = `/i/${encodeURIComponent(invitation.slug)}/card.png`;

  return (
    <section className="min-h-full bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link href={`${base}/edit`} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-slate-600">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke editor
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">/{invitation.slug}</p>
          <h1 className="text-balance text-2xl font-bold text-slate-950">Kartu cetak & e-card</h1>
          <p className="text-pretty text-sm leading-6 text-slate-600">
            Kartu ukuran A6 (10,5 × 14,8 cm) siap cetak, dengan kode QR yang membuka undangan ini. Cocok untuk tamu yang lebih nyaman
            menerima undangan kertas.
          </p>
        </header>

        {!available ? (
          <div role="status" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="text-pretty">{UNAVAILABLE[reason]}</p>
            {reason === 'off' && (
              <Link href={`${base}/edit`} className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-2">
                Buka editor
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* G-047 (D-069): the public e-card shows the date to anyone it reaches, so a protected invitation has none. */}
            {passcodeGateActive(invitation) ? (
              <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-pretty text-sm leading-6 text-slate-700">
                E-card umum tidak tersedia selama kode akses tamu aktif, karena gambarnya bisa dibuka siapa saja tanpa kode. Kartu
                per tamu di bawah tetap bisa diunduh.
              </p>
            ) : (
            <section aria-labelledby="ecard-heading" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:p-6">
              <img
                src={eCard}
                alt="E-card undangan: nama, tanggal, dan kode QR ke tautan undangan umum"
                width={248}
                height={350}
                className="h-auto w-48 shrink-0 rounded-md border border-slate-200 sm:w-56"
              />
              <div className="flex flex-col gap-3">
                <h2 id="ecard-heading" className="text-lg font-bold text-slate-950">
                  E-card umum
                </h2>
                <p className="text-pretty text-sm leading-6 text-slate-600">
                  Boleh dibagikan ke siapa saja. Isinya hanya nama, tanggal, dan warna undangan, dan kode QR-nya membuka tautan
                  undangan umum, bukan tautan pribadi tamu.
                </p>
                <a
                  href={eCard}
                  download
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Unduh e-card
                </a>
              </div>
            </section>
            )}

            <section aria-labelledby="guest-cards-heading" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
              <h2 id="guest-cards-heading" className="text-lg font-bold text-slate-950">
                Kartu per tamu
              </h2>
              <p className="text-pretty text-sm leading-6 text-slate-600">
                Setiap kartu memuat nama tamu, dan kode QR-nya membuka tautan pribadi tamu itu (untuk RSVP dan ucapan). Berikan
                hanya kepada tamu yang bersangkutan.
              </p>
              {guests.length === 0 ? (
                <p className="text-sm text-slate-600">
                  Belum ada tamu.{' '}
                  <Link href={`${base}/guests`} className="font-semibold text-brand-700 underline underline-offset-2">
                    Tambah tamu
                  </Link>
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {guests.map((guest) => {
                    const printable = cardGuestName(guest.name) !== null;
                    return (
                      <li key={guest.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium text-slate-900 [overflow-wrap:anywhere]" dir="auto">
                            {guest.name}
                          </span>
                          {!printable && (
                            <span className="text-xs leading-5 text-slate-600">
                              Nama ini tidak bisa dicetak dengan huruf kartu; kartu tetap memuat kode QR pribadinya.
                            </span>
                          )}
                        </div>
                        <a
                          href={`${base}/cards/${guest.id}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          <span>
                            Unduh kartu<span className="sr-only"> untuk {guest.name}</span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
