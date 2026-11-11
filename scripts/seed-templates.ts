/**
 * Sinkronisasi katalog tema ke database.
 *
 * Sumber kebenaran desain adalah kode (lib/invitation/templates.ts — 47 tema);
 * skrip ini hanya memproyeksikannya ke tabel `templates` supaya
 * `invitations.template_id` dan `orders.template_id` punya baris untuk dirujuk.
 * Aman diulang — baris dicocokkan berdasarkan nama dan di-update di tempat.
 *
 * Jalankan: pnpm db:seed:templates
 */
import { client } from '@/lib/db/drizzle';
import { syncTemplateCatalog } from '@/lib/invitation/template-sync';

async function main() {
  const { created, updated, total } = await syncTemplateCatalog();
  console.log(`Theme catalog synced. created=${created} updated=${updated} total=${total}`);
}

main()
  .catch((error) => {
    console.error('Template sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
