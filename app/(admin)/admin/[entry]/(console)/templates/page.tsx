import Link from 'next/link';
import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin, assertPrivateAdminEntry } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { templates } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { catalogManifestReport } from '@/lib/invitation/catalog-manifest';
import { catalogAdminRows, catalogAdminSummary } from '@/lib/invitation/catalog-admin-view';
import { templateCategoryLabels } from '@/lib/invitation/templates';
import { ReviewBadge, SeededLabel, StatusBadge, SwatchRow } from './catalog-admin-ui';
import { CATALOG_ADMIN_COPY } from './copy';

export const dynamic = 'force-dynamic';

const link =
  'rounded font-medium text-slate-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

/**
 * G-062, read-only: every catalog template's manifest with its validation, entitlement, palette, art, review state and
 * seeded row. Checked here as well as in the console layout, because a page can be requested on its own.
 */
export default async function CatalogAdminPage({ params }: { params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  assertPrivateAdminEntry(entry);
  assertAuthorizedAdmin(await getUser());

  const locale = await getLocale();
  const copy = CATALOG_ADMIN_COPY[locale];
  const seeded = await db.select({ id: templates.id, name: templates.name, isPremium: templates.isPremium }).from(templates);
  const report = catalogManifestReport();
  const rows = catalogAdminRows(seeded, report);
  const summary = catalogAdminSummary(rows, report, seeded);
  const invalid = rows.filter((row) => !row.valid);
  const detailHref = (slug: string) => `/admin/${entry}/templates/${slug}`;

  return (
    <section className="p-4 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-medium text-brand-700">{copy.kicker}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-slate-600">
          {copy.lead} {copy.gate.before}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-800">pnpm harness catalog</code>
          {copy.gate.after}
        </p>
        <p className="mt-4 max-w-3xl rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{copy.readOnly}</p>

        <section aria-label={copy.summary.label} className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{copy.summary.entries}</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{copy.summary.valid}</dt>
              <dd className="mt-1 text-2xl font-semibold text-emerald-800">{summary.valid}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{copy.summary.invalid}</dt>
              <dd className={`mt-1 text-2xl font-semibold ${summary.invalid > 0 ? 'text-rose-800' : 'text-slate-900'}`}>{summary.invalid}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{copy.summary.artFiles}</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">{summary.artFiles}</dd>
            </div>
          </dl>
          <ul className="mt-4 flex flex-col gap-1 text-sm leading-6 text-slate-700">
            <li>{copy.summary.agentReviewed(summary.agentSelfReviewed, summary.artFiles)}</li>
            <li className={summary.ownerReviewPending > 0 ? 'font-medium text-amber-900' : undefined}>
              {copy.summary.ownerPending(summary.ownerReviewPending, summary.artFiles)}
            </li>
            <li>{copy.summary.seeded(summary.total - summary.notSeeded, summary.total)}</li>
            {summary.notSeeded > 0 && <li className="text-amber-900">{copy.summary.notSeeded(summary.notSeeded)}</li>}
            {summary.premiumMismatch > 0 && <li className="text-rose-800">{copy.summary.premiumMismatch(summary.premiumMismatch)}</li>}
          </ul>
        </section>

        {summary.identityProblems.length > 0 && (
          <section role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <h2 className="font-semibold">{copy.identityHeading}</h2>
            <ul className="mt-2 list-disc pl-5">
              {summary.identityProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </section>
        )}

        {invalid.length > 0 && (
          <section role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <h2 className="font-semibold">{copy.invalidHeading}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {invalid.map((row) => (
                <li key={row.slug}>
                  <Link href={detailHref(row.slug)} className={link}>
                    {row.name}
                  </Link>{' '}
                  <span className="font-mono text-xs">({row.slug})</span>
                  <ul className="mt-1 list-disc pl-5">
                    {row.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* `relative` makes the scroller the containing block of the swatches' absolutely positioned sr-only text, which
            otherwise escapes the clip and widens the page on phones (s46 R13). */}
        <div className="relative mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">{copy.tableCaption}</caption>
            <thead className="border-b bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">{copy.columns.theme}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.category}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.tier}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.palette}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.art}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.review}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.database}</th>
                <th scope="col" className="px-4 py-3">{copy.columns.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.slug} className={row.valid ? undefined : 'bg-rose-50/60'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.cardArt ? (
                        // Same-origin catalog art at its 4:5 card ratio; decorative next to the theme's name.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.cardArt} alt="" width={40} height={50} loading="lazy" decoding="async" className="h-[50px] w-10 shrink-0 rounded object-cover" />
                      ) : (
                        <span aria-hidden="true" className="h-[50px] w-10 shrink-0 rounded border border-dashed border-slate-300 bg-slate-50" />
                      )}
                      <div className="min-w-0">
                        <Link href={detailHref(row.slug)} className={link} aria-label={copy.inspect(row.name)}>
                          {row.name}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">
                          #{row.id} · {row.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{templateCategoryLabels[row.category]?.[locale] ?? row.category}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {copy.tiers[row.tier]}
                    {row.entitlement ? <span className="text-slate-500"> → {copy.entitlement[row.entitlement]}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <SwatchRow palette={row.swatches} />
                      <span className="font-mono text-xs text-slate-600">
                        {row.paletteId}
                        {row.paletteTier === 'premium' ? ` · ${copy.paletteTier.premium}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="font-mono text-xs">{row.artPool ?? '—'}</span>
                    <p className="text-xs text-slate-500">{copy.files(row.review.files)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ReviewBadge review={row.review} copy={copy} />
                  </td>
                  <td className="px-4 py-3">
                    <SeededLabel seeded={row.seeded} copy={copy} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge valid={row.valid} problems={row.problems.length} copy={copy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {summary.orphanRows.length > 0 && (
          <section className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{copy.orphanHeading}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{copy.orphanLead}</p>
            <ul className="mt-3 flex flex-col gap-1 font-mono text-xs text-slate-700">
              {summary.orphanRows.map((row) => (
                <li key={row.id}>{copy.orphanRow(row.id, row.name, row.isPremium)}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
