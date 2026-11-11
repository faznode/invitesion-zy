import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { assertAuthorizedAdmin, assertPrivateAdminEntry } from '@/lib/auth/admin-access';
import { db } from '@/lib/db/drizzle';
import { templates } from '@/lib/db/schema';
import { getLocale } from '@/lib/locale-server';
import { catalogAdminDetail, ownerReviewStatus, type CatalogAdminDetail } from '@/lib/invitation/catalog-admin-view';
import { FAMILIES } from '@/lib/invitation/families';
import { paletteTier } from '@/lib/invitation/theme-entitlement';
import { templateCategoryLabels, templateStyleTagLabels } from '@/lib/invitation/templates';
import { ReviewBadge, SeededLabel, StatusBadge, Swatch } from '../catalog-admin-ui';
import { CATALOG_ADMIN_COPY } from '../copy';

export const dynamic = 'force-dynamic';

type Copy = (typeof CATALOG_ADMIN_COPY)['id'];

const card = 'rounded-xl border bg-white p-5 shadow-sm';
const heading = 'text-base font-semibold text-slate-900';
const term = 'text-xs font-medium uppercase tracking-wide text-slate-500';
const value = 'mt-1 text-sm leading-6 text-slate-900';
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={term}>{label}</dt>
      <dd className={value}>{children}</dd>
    </div>
  );
}

function Problems({ detail, copy }: { detail: CatalogAdminDetail; copy: Copy }) {
  return (
    <section role="alert" aria-labelledby="problems-heading" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
      <h2 id="problems-heading" className="text-base font-semibold">{copy.detail.problemsHeading}</h2>
      <p className="mt-1 leading-6">{copy.detail.problemsLead}</p>
      <ul className="mt-3 list-disc pl-5 leading-6">
        {detail.problems.map((problem) => (
          <li key={problem} className="font-mono text-xs">{problem}</li>
        ))}
      </ul>
      <details className="mt-4">
        <summary className={`cursor-pointer rounded font-medium ${focusRing}`}>{copy.detail.candidate}</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-white p-3 font-mono text-xs leading-5 text-slate-800">
          {JSON.stringify(detail.candidate, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function ArtSection({ detail, copy }: { detail: CatalogAdminDetail; copy: Copy }) {
  const { template, manifest } = detail;
  return (
    <section aria-labelledby="art-heading" className={card}>
      <h2 id="art-heading" className={heading}>{copy.detail.artHeading}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={copy.detail.artPool}>
          <span className="font-mono">{manifest?.art.pool ?? '—'}</span>
        </Field>
        <Field label={copy.detail.selfHosted}>{manifest?.art.selfHosted ? copy.detail.selfHostedValue : '—'}</Field>
      </dl>
      <ul className="mt-6 grid gap-6 lg:grid-cols-2">
        {detail.assets.map((asset) => {
          const roles = asset.roles.map((role) => copy.detail.roles[role]).join(', ');
          const selfHosted = /^\/theme-art\/[a-z0-9-]+\.webp$/.test(asset.path);
          return (
            <li key={asset.path} className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 sm:flex-row">
              {selfHosted ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.path}
                  alt={copy.detail.altFor(roles, template.name)}
                  width={asset.file?.width ?? 480}
                  height={asset.file?.height ?? 600}
                  loading="lazy"
                  decoding="async"
                  className="h-40 w-32 shrink-0 rounded-md border border-slate-200 object-cover"
                />
              ) : (
                <span aria-hidden="true" className="h-40 w-32 shrink-0 rounded-md border border-dashed border-slate-300 bg-slate-50" />
              )}
              <dl className="flex min-w-0 flex-col gap-3">
                <Field label={roles}>
                  <span className="break-all font-mono text-xs">{asset.path}</span>
                </Field>
                {asset.file ? (
                  <Field label={copy.detail.sha256}>
                    <span className="block text-xs text-slate-600">{copy.detail.size(asset.file.width, asset.file.height, asset.file.bytes)}</span>
                    <span className="block break-all font-mono text-xs text-slate-700">{asset.file.sha256}</span>
                  </Field>
                ) : (
                  <Field label={copy.detail.sourceId}>
                    <span className="text-rose-800">{copy.detail.notRegistered}</span>
                  </Field>
                )}
                {asset.source && (
                  <>
                    <Field label={copy.detail.sourceId}>
                      <span className="font-mono text-xs">{asset.source.id}</span>
                    </Field>
                    <Field label={copy.detail.prompt}>
                      <q className="text-pretty text-xs leading-5 text-slate-700">{asset.source.prompt}</q>
                    </Field>
                    <Field label={copy.detail.originalSha256}>
                      <span className="break-all font-mono text-xs text-slate-700">{asset.source.sourceSha256}</span>
                    </Field>
                    <Field label={copy.detail.crop}>
                      <span className="font-mono text-xs">[{asset.source.crop.join(', ')}]</span>
                    </Field>
                  </>
                )}
                {asset.review && (
                  <Field label={copy.detail.provenance.review}>
                    <span className="text-xs leading-5 text-slate-700">{asset.review}</span>
                  </Field>
                )}
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * G-062, read-only: one catalog template's manifest (identity, tier and entitlement, palette tokens, G-041 choices,
 * G-016 art and provenance, review state) or, when validation refuses it, the problems and the derived candidate.
 */
export default async function CatalogAdminDetailPage({ params }: { params: Promise<{ entry: string; slug: string }> }) {
  const { entry, slug } = await params;
  assertPrivateAdminEntry(entry);
  assertAuthorizedAdmin(await getUser());

  const locale = await getLocale();
  const copy = CATALOG_ADMIN_COPY[locale];
  const seeded = await db.select({ id: templates.id, name: templates.name, isPremium: templates.isPremium }).from(templates);
  const detail = catalogAdminDetail(slug, seeded);
  if (!detail) notFound();

  const { template, manifest } = detail;
  const listHref = `/admin/${entry}/templates`;
  const ownerStatus = ownerReviewStatus(detail.review);

  return (
    <section className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div>
          <Link href={listHref} className={`inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-700 hover:text-slate-900 ${focusRing}`}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            {copy.detail.back}
          </Link>
          <p className="mt-4 text-sm font-medium text-brand-700">{copy.kicker}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-balance text-2xl font-semibold text-slate-900">{template.name}</h1>
            <StatusBadge valid={manifest !== null} problems={detail.problems.length} copy={copy} />
            <ReviewBadge review={detail.review} copy={copy} />
          </div>
          <p className="mt-1 font-mono text-sm text-slate-600">
            #{template.id} · /templates/{template.slug}
          </p>
          <a
            href={`/templates/${template.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 ${focusRing}`}
          >
            {copy.detail.publicPreview}
            <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only">{copy.detail.newTab}</span>
          </a>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{copy.readOnly}</p>

        {manifest === null && <Problems detail={detail} copy={copy} />}

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="identity-heading" className={card}>
            <h2 id="identity-heading" className={heading}>{copy.detail.identity}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={copy.detail.fields.templateId}>
                <span className="font-mono">{template.id}</span>
              </Field>
              <Field label={copy.detail.fields.slug}>
                <span className="font-mono">{template.slug}</span>
              </Field>
              <Field label={copy.detail.fields.category}>{templateCategoryLabels[template.category]?.[locale] ?? template.category}</Field>
              <Field label={copy.detail.fields.styleTags}>
                {template.styleTags.map((tag) => templateStyleTagLabels[tag]?.[locale] ?? tag).join(', ')}
              </Field>
              <Field label={copy.detail.fields.motif}>
                <span className="font-mono">{template.motif}</span>
              </Field>
              <Field label={copy.detail.fields.locales}>{(manifest?.locales ?? ['id', 'en']).join(', ').toUpperCase()}</Field>
              <Field label={copy.detail.fields.defaultLocale}>{(manifest?.defaultLocale ?? '—').toUpperCase()}</Field>
              <Field label={copy.detail.fields.schemaVersion}>{manifest?.schemaVersion ?? '—'}</Field>
              <Field label={copy.detail.fields.taglineId}>
                <span lang="id">{template.tagline.id}</span>
              </Field>
              <Field label={copy.detail.fields.taglineEn}>
                <span lang="en">{template.tagline.en}</span>
              </Field>
            </dl>
          </section>

          <section aria-labelledby="tier-heading" className={card}>
            <h2 id="tier-heading" className={heading}>{copy.detail.tierHeading}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={copy.detail.tier}>{copy.tiers[template.tier]}</Field>
              <Field label={copy.detail.entitlement}>{manifest ? copy.entitlement[manifest.entitlement] : '—'}</Field>
              <Field label={copy.detail.database}>
                <SeededLabel seeded={detail.seeded} copy={copy} />
                {detail.seeded?.premiumAgrees && <span className="mt-1 block text-xs text-slate-600">{copy.detail.databaseAgrees}</span>}
              </Field>
            </dl>
            <p className="mt-4 text-xs leading-5 text-slate-600">{copy.detail.entitlementNote}</p>
          </section>

          <section aria-labelledby="palette-heading" className={card}>
            <h2 id="palette-heading" className={heading}>{copy.detail.paletteHeading}</h2>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-mono">{template.paletteId}</span>
              {manifest ? ` · ${copy.paletteTier[manifest.palette.tier]}` : ''}
            </p>
            {manifest && (
              <>
                <h3 className="mt-4 text-sm font-medium text-slate-800">{copy.detail.tokens}</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  <li className="text-xs text-slate-600">
                    scheme <span className="font-mono text-slate-800">{manifest.palette.tokens.scheme}</span>
                  </li>
                  {(['bg', 'ink', 'accent', 'muted', 'soft', 'card', 'field', 'line'] as const).map((token) => (
                    <li key={token}>
                      <Swatch color={manifest.palette.tokens[token]} label={token} />
                    </li>
                  ))}
                </ul>
                <h3 className="mt-5 text-sm font-medium text-slate-800">{copy.detail.cardPalette}</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(['bg', 'ink', 'accent', 'soft'] as const).map((token) => (
                    <li key={token}>
                      <Swatch color={manifest.card.palette[token]} label={token} />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-5 text-slate-600">{copy.detail.cardAccentNote}</p>
              </>
            )}
          </section>

          <section aria-labelledby="choices-heading" className={card}>
            <h2 id="choices-heading" className={heading}>{copy.detail.choicesHeading}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{copy.detail.choicesLead}</p>
            {manifest && (
              <dl className="mt-4 flex flex-col gap-4">
                <Field label={copy.detail.families}>{manifest.choices.families.map((id) => FAMILIES[id].name).join(', ')}</Field>
                <Field label={copy.detail.legacyDefault}>{copy.detail.legacyDefaultValue}</Field>
                <Field label={copy.detail.sectionOrders}>
                  {manifest.choices.sectionOrders
                    .map((order) => `${copy.orders[order]}${order === manifest.choices.defaultSectionOrder ? ` (${copy.detail.defaultMarker})` : ''}`)
                    .join(', ')}
                </Field>
                <Field label={copy.detail.fontPairings}>{manifest.choices.fontPairings.map((pairing) => copy.pairings[pairing]).join(', ')}</Field>
                <Field label={copy.detail.palettes(manifest.choices.palettes.length)}>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {manifest.choices.palettes.map((id) => (
                      <li
                        key={id}
                        className={`rounded-full border px-2 py-0.5 font-mono text-xs ${id === manifest.palette.id ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-700'}`}
                      >
                        {id}
                        {paletteTier(id) === 'premium' ? ' ★' : ''}
                        {id === manifest.palette.id ? <span className="sr-only"> ({copy.detail.ownPalette})</span> : null}
                      </li>
                    ))}
                  </ul>
                </Field>
              </dl>
            )}
          </section>
        </div>

        <section aria-labelledby="sections-heading" className={card}>
          <h2 id="sections-heading" className={heading}>{copy.detail.sectionsHeading}</h2>
          <ol className="mt-3 flex flex-wrap gap-2">
            {(manifest?.sections ?? []).map((section) => (
              <li key={section} className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-800">
                {section}
              </li>
            ))}
          </ol>
        </section>

        <ArtSection detail={detail} copy={copy} />

        <section aria-labelledby="provenance-heading" className={card}>
          <h2 id="provenance-heading" className={heading}>{copy.detail.provenanceHeading}</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={copy.detail.provenance.license}>
              <span className="font-mono">{detail.provenance.license}</span>
            </Field>
            <Field label={copy.detail.provenance.provenance}>
              <span className="font-mono">{detail.provenance.provenance}</span>
            </Field>
            <Field label={copy.detail.provenance.author}>{detail.provenance.author}</Field>
            <Field label={copy.detail.provenance.attribution}>{detail.provenance.attribution}</Field>
            <Field label={copy.detail.provenance.generator}>{detail.provenance.generator}</Field>
            <Field label={copy.detail.provenance.created}>{detail.provenance.created}</Field>
            <Field label={copy.detail.provenance.derivation}>{detail.provenance.derivation}</Field>
            <Field label={copy.detail.provenance.review}>{detail.provenance.review}</Field>
          </dl>
        </section>

        <section aria-labelledby="review-heading" className={card}>
          <h2 id="review-heading" className={heading}>{copy.detail.reviewHeading}</h2>
          <ul className="mt-3 flex flex-col gap-1 text-sm leading-6 text-slate-700">
            <li>{copy.detail.reviewAgent(detail.review.agentSelfReviewed, detail.review.files)}</li>
            <li className={ownerStatus === 'approved' ? undefined : 'font-medium text-amber-900'}>
              {copy.detail.reviewOwner(ownerStatus, detail.review.ownerReviewPending, detail.review.files)}
            </li>
            <li>{copy.detail.reviewPublishing}</li>
          </ul>
        </section>

        {manifest && (
          <section aria-labelledby="manifest-heading" className={card}>
            <h2 id="manifest-heading" className={heading}>{copy.detail.manifestHeading}</h2>
            <details className="mt-3">
              <summary className={`cursor-pointer rounded text-sm font-medium text-slate-800 ${focusRing}`}>{copy.detail.manifestToggle}</summary>
              <pre className="mt-2 max-h-[32rem] overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            </details>
          </section>
        )}
      </div>
    </section>
  );
}
