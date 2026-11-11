/**
 * Throwaway audit fixture (not product code): seeds a LOCAL database with fake
 * invitations so the public renderer can be measured with the same protocol as
 * competitor demos. All people, numbers and places are fictional.
 *
 *   POSTGRES_URL=postgres://postgres@localhost:5433/invitesion \
 *     npx tsx invitation-research/_tools/setup/seed-local-demo.ts
 */
import { eq } from 'drizzle-orm';
import { db, client } from '@/lib/db/drizzle';
import { guestMessages, guests, invitations, templates, users } from '@/lib/db/schema';
import { getTemplateBySlug } from '@/lib/invitation/templates';
import { detailConfigSchema } from '@/lib/invitation/detail-config';

const STRESS_GUESTS = [
  { name: 'Budi Hartono', slug: 'budi-hartono', guestCount: 2 },
  { name: 'Muhammad Fadhlurrahman Al-Ghifari & Putri Anindya Maharani Kusumawardhani', slug: 'nama-panjang', guestCount: 2 },
  { name: '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>', slug: 'hostile-name', guestCount: 1 },
  { name: 'عبد الله بن أحمد', slug: 'rtl-name', guestCount: 1 },
  { name: 'Sari 💐 & Keluarga 👨‍👩‍👧', slug: 'emoji-name', guestCount: 3 },
];

async function upsertOwner() {
  const [existing] = await db.select().from(users).where(eq(users.email, 'demo.owner@example.test')).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(users).values({ email: 'demo.owner@example.test', name: 'Demo Owner (fixture)' }).returning();
  return created;
}

async function seedInvitation(ownerId: number, slug: string, templateSlug: string, overrides: Record<string, unknown>) {
  const template = getTemplateBySlug(templateSlug);
  if (!template) throw new Error(`unknown template ${templateSlug}`);
  const [row] = await db.select().from(templates).where(eq(templates.name, template.name)).limit(1);
  const config = detailConfigSchema.parse({ ...template.preset, ...overrides });
  await db.delete(invitations).where(eq(invitations.slug, slug)).catch(() => undefined);
  const now = new Date();
  const [invitation] = await db
    .insert(invitations)
    .values({
      userId: ownerId,
      templateId: row?.id ?? null,
      slug,
      eventType: 'wedding',
      config,
      status: 'PUBLISHED',
      publishedAt: now,
      expiresAt: new Date(now.getTime() + 365 * 24 * 3600 * 1000),
    })
    .returning();
  for (const guest of STRESS_GUESTS) {
    await db.insert(guests).values({ invitationId: invitation.id, ...guest });
  }
  const [firstGuest] = await db.select().from(guests).where(eq(guests.invitationId, invitation.id)).limit(1);
  await db.insert(guestMessages).values([
    { invitationId: invitation.id, guestId: firstGuest.id, name: firstGuest.name, message: 'Selamat menempuh hidup baru, semoga sakinah mawaddah warahmah.' },
    { invitationId: invitation.id, guestId: firstGuest.id, name: firstGuest.name, message: '<b>bold?</b> <script>alert("wish")</script> — wish markup stress test' },
  ]);
  return invitation;
}

const couple = {
  bride: { fullName: 'Sari Kusumawati, S.Ds.', nickName: 'Sari', parents: 'Putri dari Bapak Fiktif & Ibu Contoh' },
  groom: { fullName: 'Budi Pratama, S.T.', nickName: 'Budi', parents: 'Putra dari Bapak Rekaan & Ibu Sampel' },
  displayOrder: 'groom-first',
};

async function main() {
  const owner = await upsertOwner();
  const wib = await seedInvitation(owner.id, 'budi-sari', 'eternal-ivory', {
    couple,
    events: [
      { title: 'Akad Nikah', startAt: '2026-12-20T08:00:00+07:00', endAt: '2026-12-20T09:30:00+07:00', venueName: 'Masjid Contoh Raya', address: 'Jl. Fiktif No. 1, Jakarta Selatan', mapUrl: 'https://maps.google.com/?q=-6.2,106.8' },
      { title: 'Resepsi', startAt: '2026-12-20T11:00:00+07:00', endAt: '2026-12-20T14:00:00+07:00', venueName: 'Gedung Sampel', address: 'Jl. Rekaan No. 2, Jakarta Selatan' },
    ],
    gift: { enabled: true, accounts: [{ kind: 'bank', label: 'Bank Contoh', holder: 'Budi Pratama', number: '0000000000' }] },
    story: { enabled: true, items: [{ date: '2022', title: 'Pertama bertemu', body: 'Teks cerita fiktif untuk pengujian tata letak.' }] },
  });
  const wita = await seedInvitation(owner.id, 'dimas-laras-makassar', 'gold-noir-deco', {
    couple: { ...couple, displayOrder: 'bride-first' },
    events: [{ title: 'Resepsi (WITA)', startAt: '2026-12-27T19:00:00+08:00', venueName: 'Hotel Fiktif Makassar', address: 'Jl. Contoh, Makassar' }],
  });
  console.log(JSON.stringify({ owner: owner.id, invitations: [wib.slug, wita.slug], guests: STRESS_GUESTS.map((g) => g.slug) }));
  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
