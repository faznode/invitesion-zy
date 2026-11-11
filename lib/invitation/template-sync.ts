import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { templates, type Template } from '@/lib/db/schema';
import {
  getTemplateBySlug,
  invitationTemplates,
  type InvitationTemplate,
} from './templates';
import { catalogDefaultConfig } from './template-defaults';
import { getThemeArt } from './theme-art';

/**
 * Jembatan antara katalog kode dan tabel `templates` di database.
 *
 * - Katalog (lib/invitation/templates.ts) adalah sumber kebenaran DESAIN:
 *   63 tema lengkap dengan preset DetailConfig, palet, motif, dan tier.
 * - Tabel `templates` adalah sumber kebenaran IDENTITAS: id integer yang
 *   direferensikan `invitations.template_id` dan `orders.template_id`.
 *
 * Baris dicocokkan berdasarkan NAMA (unik di katalog), sama seperti seed lama,
 * sehingga sync aman diulang dan tidak menggandakan tema. `defaultConfig`
 * diisi preset katalog, jadi `createInvitation` men-seed draf undangan dengan
 * konfigurasi tema yang persis sama dengan preview publik — dan customer
 * tinggal mengubahnya sendiri lewat editor dashboard.
 *
 * Basis data aset foto (lib/invitation/theme-art.ts) juga ikut disimpan di
 * sini: cover unik tiap tema masuk ke kolom `thumbnail`, dan set lengkapnya
 * (cover + galeri) masuk ke `defaultConfig.art`. FE publik tidak membaca
 * basis data ini secara langsung — ini fondasi internal untuk editor dan
 * untuk men-generate template baru di masa depan.
 *
 * PENTING: file ini sengaja TIDAK meng-import 'server-only' ataupun
 * lib/invitation/create.ts supaya tetap bisa dijalankan scripts/seed-templates.ts
 * lewat tsx di luar runtime Next.
 */

// The category → event type mapping is pure and lives in `template-event-types.ts` (B-036), re-exported here for the
// existing callers.
export { resolveEventType, templateEventTypes, type CoreEventType } from './template-event-types';

function toRow(tpl: InvitationTemplate) {
  const art = getThemeArt(tpl);
  return {
    name: tpl.name,
    category: tpl.category,
    // premium & signature dua-duanya berbayar; kolom DB hanya kenal boolean.
    isPremium: tpl.tier !== 'free',
    // Basis data aset: cover unik per tema + galeri, tersimpan di DB.
    thumbnail: art.cover,
    // `art` is template-owned; createInvitation sets it aside before the strict schema (B-001).
    defaultConfig: catalogDefaultConfig(tpl),
  };
}

async function upsertCatalogTemplate(
  tpl: InvitationTemplate,
): Promise<{ row: Template; created: boolean }> {
  const [existing] = await db
    .select()
    .from(templates)
    .where(eq(templates.name, tpl.name))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(templates)
      .set(toRow(tpl))
      .where(eq(templates.id, existing.id))
      .returning();
    return { row, created: false };
  }

  const [row] = await db.insert(templates).values(toRow(tpl)).returning();
  return { row, created: true };
}

/** Upsert seluruh katalog ke DB. Aman diulang kapan pun katalog berubah. */
export async function syncTemplateCatalog(): Promise<{
  created: number;
  updated: number;
  total: number;
}> {
  let created = 0;
  let updated = 0;
  for (const tpl of invitationTemplates) {
    const result = await upsertCatalogTemplate(tpl);
    if (result.created) created++;
    else updated++;
  }
  return { created, updated, total: invitationTemplates.length };
}

/**
 * Resolve slug katalog (mis. dari /templates/[slug]) menjadi baris DB.
 * Kalau temanya belum pernah di-sync, baris dibuat saat itu juga — jadi
 * deep-link dari katalog publik tetap jalan meski seed belum dijalankan.
 */
export async function getTemplateRowBySlug(slug: string): Promise<Template | null> {
  const tpl = getTemplateBySlug(slug);
  if (!tpl) return null;
  const { row } = await upsertCatalogTemplate(tpl);
  return row;
}
