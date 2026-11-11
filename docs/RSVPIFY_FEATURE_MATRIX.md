<!-- SUMMARY (first 7 lines — greppable) -->
# RSVPify public feature matrix → Invitesion
> WHAT: Pemetaan capability publik RSVPify ke Invitesion, bukan spesifikasi copy desain.
> STATUS: IN PROGRESS
> OWNER: Architect
> DEPS: PROJECT_OVERVIEW.md, DATABASE_SCHEMA.md
> GREP: rsvpify, feature matrix, event platform
> UPDATED: 2026-07-17

## Sumber publik yang dipakai
- https://rsvpify.com/features/
- https://rsvpify.com/event-registration/
- https://rsvpify.com/online-rsvp/
- https://rsvpify.com/guest-list-management/
- https://rsvpify.com/event-check-in-app/
- https://rsvpify.com/seating-chart-maker/
- https://rsvpify.com/menu-options/
- https://rsvpify.com/email-blasts/
- https://rsvpify.com/secondary-events/
- https://rsvpify.com/sell-tickets/
- https://rsvpify.com/event-website-builder/

Hanya halaman publik. Tidak ada akun, cookie, session token, demo private, atau bypass proteksi yang digunakan.

## Normalisasi menu/fitur publik
| Cluster RSVPify publik | Interpretasi Invitesion | Status saat ini | Implementasi Invitesion |
|---|---|---|---|
| Event website builder / online invitations | Website undangan per event | Aktif | Editor + public invitation renderer perlu terus dipastikan terhubung |
| Online RSVP / event registration / embedded RSVP | RSVP dan form registrasi | Sebagian aktif | Guest rows sudah simpan RSVP; config form/custom question dibangun additive |
| Guest list management / tags / filter | Database tamu per event | Aktif | `/dashboard/invitations/[id]/guests` scoped, dengan category/tag dasar |
| Menu options / dietary | Preferensi konsumsi dan alergi | Config foundation | Config per event; jawaban per guest butuh migration tabel/JSON setelah UX final |
| Email blasts / communications | Komunikasi, reminder, status delivery | Sebagian aktif | WA deeplink + sent state ada; provider blast/reminder belum boleh diklaim aktif |
| Event check-in app / QR | Check-in event | Aktif manual | Manual check-in scoped + analytics event; QR scanning perlu slice berikutnya |
| Seating chart maker | Denah meja dan seat assignment | Config foundation | Table/guest assignment config, drag/drop setelah data contract diuji |
| Secondary events | Sesi/agenda/event tambahan | Config foundation | Session config per undangan, eligibility guest follow-up |
| Sell tickets + collect donations | Tiket/donasi peserta | Integration required | Invitesion pembelian produk tetap one-time Midtrans; pembayaran attendee baru dikerjakan jika gateway/payout policy diputuskan |
| Event dashboard / analytics/export | Ringkasan dan export operasi event | Sebagian aktif | Metrics RSVPs/check-in tersedia; CSV/export operational data adalah next slice |
| Corporate/private/virtual event pages | Tipe penggunaan | Sebagian aktif | Event type Invitesion sudah wedding/birthday/aqiqah/tasyakuran/khitanan/corporate; tidak memaksa istilah wedding ke tipe lain |

## Keputusan arsitektur
1. Semua menu event bersifat **invitation-scoped**: `/dashboard/invitations/[id]/…`. Tidak boleh memakai “undangan terbaru” sebagai implicit context untuk mutasi data.
2. `invitations.config` menyimpan configuration/workflow yang belum butuh query live: form settings, meal options, seating draft, secondary sessions, ticketing policy, communication copy.
3. Tabel `guests` menyimpan data live per tamu: RSVP, jumlah pendamping, delivery/open state, check-in. Jangan dipindahkan ke config JSON.
4. `analytics_events` menyimpan event append-only seperti RSVP dan check-in; dashboard menghitung dari data scoped invitation.
5. Provider message delivery, QR scanner camera, payment attendee/ticketing, email gateway, dan payout tidak akan diberi status aktif sampai ada integrasi serta test end-to-end.

## Vertical slices
1. **Control center per undangan** — semua kemampuan reachable, status jujur. 
2. **Guests / RSVP / check-in** — tambah guest, update RSVP, sent state, manual check-in, analytics append.
3. **Registration configuration** — RSVP deadline, capacity, plus-one, question definitions; visitor answer persistence setelah UX disetujui.
4. **Meal, communications, seating, secondary events** — config panels dengan save/read back.
5. **Analytics/export + QR scanner + ticketing provider** — hanya setelah migration/API/provider contract tervalidasi.

## Batas produk
- Invitesion adalah one-time purchase untuk undangan. Itu bukan SaaS subscription RSVPify.
- Ticketing pembayaran tamu adalah capability terpisah; tidak boleh mengambil alih commerce order undangan.
- Semua copy/UI original Invitesion; referensi hanya feature taxonomy dan product hierarchy.
