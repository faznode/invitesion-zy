import { desc, eq } from 'drizzle-orm';
import { Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getPrivateAdminPath } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { invitations, templates } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { activationPrice, currencyForLocale } from '@/lib/pricing';
import { formatMoney } from '@/lib/payment/money';
import { useTemplate } from './actions';

export const dynamic = 'force-dynamic';

export default async function CustomerTemplates({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role === 'ADMIN') redirect(getPrivateAdminPath() ?? '/sign-in');

  const en = (await getLocale()) === 'en';
  const query = await searchParams;
  // Billing currency follows the locale, so the price shown is the price
  // charged and the rail is implied by it: IDR over QRIS, USD over Stripe.
  // Previously this formatted IDR figures with en-US, showing an English visitor
  // Indonesian prices under a US format.
  const currency = currencyForLocale(en ? 'en' : 'id');
  const price = (isPremium: boolean) => formatMoney(activationPrice(isPremium, currency), en ? 'en' : 'id');

  const catalog = await db.select().from(templates).orderBy(desc(templates.createdAt));
  const mine = await db.select({ templateId: invitations.templateId }).from(invitations).where(eq(invitations.userId, user.id));
  const ownedIds = new Set(mine.map((row) => row.templateId));
  const owned = catalog.filter((template) => ownedIds.has(template.id));
  const available = catalog.filter((template) => !ownedIds.has(template.id));

  return (
    <section className="min-h-full bg-slate-50/70 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{en ? 'Catalog' : 'Katalog'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{en ? 'Choose a theme' : 'Pilih tema'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {en
              ? 'Pick a theme to start a draft invitation. The invitation goes live after payment.'
              : 'Pilih tema untuk memulai draf undangan. Undangan tayang setelah pembayaran.'}
          </p>
        </header>

        {query.error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {en ? 'That theme could not be used. Please pick another one.' : 'Tema itu tidak bisa digunakan. Silakan pilih tema lain.'}
          </p>
        )}

        {owned.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{en ? 'Your themes' : 'Tema kamu'}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {owned.map((template) => (
                <article key={template.id} className="overflow-hidden rounded-xl border-2 border-emerald-200 bg-white shadow-sm">
                  <div aria-hidden className="flex h-32 items-center justify-center bg-gradient-to-br from-emerald-50 to-brand-100 text-4xl">✦</div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{template.name}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                        <Check className="h-3 w-3" aria-hidden /> {en ? 'In use' : 'Dipakai'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs capitalize text-slate-500">{template.category}</p>
                    <Link
                      href="/dashboard/invitations"
                      className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      {en ? 'Open my invitations' : 'Buka undangan saya'}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            {en ? 'Available themes' : 'Tema tersedia'}
            <span className="ml-1 text-xs font-normal text-slate-500">{en ? 'activated after payment' : 'aktif setelah pembayaran'}</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((template) => (
              <article key={template.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div aria-hidden className="relative flex h-32 items-center justify-center bg-gradient-to-br from-brand-50 to-rose-100 text-4xl text-brand-500">
                  ✦
                  {template.isPremium && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-brand-700">
                      <Lock className="h-3 w-3" /> Premium
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900">{template.name}</h3>
                  <p className="mt-1 text-xs capitalize text-slate-500">{template.category}</p>
                  <form action={useTemplate} className="mt-4 flex items-center justify-between gap-3">
                    <input type="hidden" name="templateId" value={template.id} />
                    <span className="text-sm font-semibold text-slate-900">{price(template.isPremium)}</span>
                    <button
                      type="submit"
                      className="min-h-10 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {en ? 'Use theme' : 'Gunakan tema'}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>

          {/* Two genuinely different states: nothing published yet vs. everything already taken. */}
          {!available.length && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              {catalog.length === 0
                ? en
                  ? 'No themes are published yet. Please check back soon.'
                  : 'Belum ada tema yang tersedia. Silakan cek kembali nanti.'
                : en
                  ? 'You are already using every available theme.'
                  : 'Semua tema yang tersedia sudah kamu pakai.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
