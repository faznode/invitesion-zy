// G-062's read-only admin surface: the view over the catalog manifests (valid and refused), the console pages' server-side
// authorization, the absence of any write, privacy boundaries, and the sandbox gate refusing missing or changed art.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { catalogManifestReport, CATALOG_MANIFESTS } from '../lib/invitation/catalog-manifest';
import { artReviewState, catalogAdminDetail, catalogAdminRows, catalogAdminSummary, ownerReviewStatus } from '../lib/invitation/catalog-admin-view';
import { invitationTemplates } from '../lib/invitation/templates';
import { checkCatalogManifests } from '../tools/template-harness/catalog';
import { CATALOG_ADMIN_COPY } from '../app/(admin)/admin/[entry]/(console)/templates/copy';

const CONSOLE = 'app/(admin)/admin/[entry]/(console)/templates';
const source = (path: string) => readFileSync(path, 'utf8');

test('the console lists all 64 catalog templates as valid, with self-hosted card art and the owner review pending', () => {
  const report = catalogManifestReport();
  const rows = catalogAdminRows([], report);
  assert.equal(rows.length, 64);
  assert.deepEqual(rows.map((row) => row.slug), invitationTemplates.map((template) => template.slug));
  for (const row of rows) {
    assert.equal(row.valid, true, row.slug);
    assert.deepEqual(row.problems, []);
    assert.ok(row.entitlement === 'standard' || row.entitlement === 'premium', row.slug);
    assert.match(row.cardArt ?? '', /^\/theme-art\/[a-z0-9-]+\.webp$/, row.slug);
    assert.ok(row.review.files > 0, row.slug);
    assert.equal(row.review.agentSelfReviewed, row.review.files, row.slug);
    assert.equal(row.review.ownerReviewPending, row.review.files, `${row.slug}: no file may read as owner-approved`);
    assert.equal(row.seeded, null);
  }
  const summary = catalogAdminSummary(rows, report);
  const distinct = new Set(CATALOG_MANIFESTS.flatMap((manifest) => manifest.art.files.map((file) => file.path)));
  assert.deepEqual(
    { total: summary.total, valid: summary.valid, invalid: summary.invalid, identity: summary.identityProblems, files: summary.artFiles },
    { total: 64, valid: 64, invalid: 0, identity: [], files: distinct.size },
  );
  assert.equal(summary.agentSelfReviewed, distinct.size);
  assert.equal(summary.ownerReviewPending, distinct.size);
});

test('the seeded rows are cross-checked by name: missing, premium flag disagreeing, and rows no template carries', () => {
  const [free, paid] = [invitationTemplates.find((t) => t.tier === 'free')!, invitationTemplates.find((t) => t.tier !== 'free')!];
  const seeded = [
    { id: 11, name: free.name, isPremium: false },
    { id: 12, name: paid.name, isPremium: false },
    { id: 13, name: 'A Retired Theme', isPremium: true },
  ];
  const report = catalogManifestReport();
  const rows = catalogAdminRows(seeded, report);
  assert.deepEqual(rows.find((row) => row.slug === free.slug)?.seeded, { rowId: 11, premiumAgrees: true });
  assert.deepEqual(rows.find((row) => row.slug === paid.slug)?.seeded, { rowId: 12, premiumAgrees: false });
  const summary = catalogAdminSummary(rows, report, seeded);
  assert.equal(summary.notSeeded, 62);
  assert.equal(summary.premiumMismatch, 1);
  assert.deepEqual(summary.orphanRows, [{ id: 13, name: 'A Retired Theme', isPremium: true }]);
});

test('a refused manifest stays listed with its problems, and its detail shows the derived candidate', () => {
  const free = invitationTemplates.find((t) => t.tier === 'free')!;
  const tampered = { ...free, tier: 'premium' as const };
  const report = catalogManifestReport(invitationTemplates.map((template) => (template === free ? tampered : template)));
  const rows = catalogAdminRows([], report);
  const row = rows.find((candidate) => candidate.slug === free.slug)!;
  assert.equal(row.valid, false);
  assert.deepEqual(row.problems, ['entitlement does not follow the tier']);
  assert.equal(row.entitlement, null);
  assert.match(row.cardArt ?? '', /^\/theme-art\//);
  assert.ok(row.review.ownerReviewPending > 0);
  const summary = catalogAdminSummary(rows, report);
  assert.deepEqual([summary.valid, summary.invalid], [63, 1]);

  const detail = catalogAdminDetail(free.slug, [], report)!;
  assert.equal(detail.manifest, null);
  assert.deepEqual(detail.problems, ['entitlement does not follow the tier']);
  assert.equal((detail.candidate as { tier: string }).tier, 'premium');
  assert.ok(detail.assets.length > 0 && detail.assets.every((asset) => asset.source !== null && asset.file !== null));
});

test('the detail view carries palette, tier, choices, assets and provenance; unknown slugs have none', () => {
  for (const manifest of CATALOG_MANIFESTS) {
    const detail = catalogAdminDetail(manifest.slug)!;
    assert.ok(detail.manifest, manifest.slug);
    assert.deepEqual(detail.problems, []);
    const paths = new Set(detail.assets.map((asset) => asset.path));
    assert.deepEqual(paths, new Set(manifest.art.files.map((file) => file.path)), manifest.slug);
    for (const asset of detail.assets) {
      assert.ok(asset.file && asset.source, asset.path);
      assert.match(asset.source.prompt, /\S/);
      assert.match(asset.review ?? '', /Agent self-review .*owner review pending/);
    }
    if (manifest.art.gallery.includes(manifest.art.cover)) {
      assert.deepEqual(detail.assets.find((asset) => asset.path === manifest.art.cover)?.roles.sort(), ['cover', 'gallery']);
    }
    assert.equal(detail.provenance.license, 'own-work');
  }
  assert.equal(catalogAdminDetail('a-retired-template'), null);
});

test('the owner review reads approved only when every file records it; a missing record never reads as approved', () => {
  const pending = artReviewState(CATALOG_MANIFESTS[0].art.files);
  assert.equal(ownerReviewStatus(pending), 'pending');
  const approved = artReviewState([{ path: '/theme-art/x.webp', review: 'Owner approved on 2026-12-01' }]);
  assert.deepEqual(approved, { files: 1, agentSelfReviewed: 0, ownerReviewPending: 0, ownerApproved: 1 });
  assert.equal(ownerReviewStatus(approved), 'approved');
  // A refused entry whose art fell back to remote photos carries no review record at all.
  const remote = artReviewState([{ path: 'https://images.example.com/a.jpg' }, { path: 'https://images.example.com/b.jpg' }]);
  assert.deepEqual(remote, { files: 2, agentSelfReviewed: 0, ownerReviewPending: 0, ownerApproved: 0 });
  assert.equal(ownerReviewStatus(remote), 'unrecorded');
  assert.equal(ownerReviewStatus(artReviewState([...CATALOG_MANIFESTS[0].art.files, { path: '/theme-art/y.webp', review: 'Owner approved' }])), 'pending');
  assert.equal(ownerReviewStatus(artReviewState([])), 'no-files');
});

test('both console pages authorize on the server before reading anything, and neither writes', () => {
  for (const page of [`${CONSOLE}/page.tsx`, `${CONSOLE}/[slug]/page.tsx`]) {
    const text = source(page);
    assert.doesNotMatch(text, /['"]use (client|server)['"]/, page);
    const entryCheck = text.indexOf('assertPrivateAdminEntry(entry);');
    const adminCheck = text.indexOf('assertAuthorizedAdmin(await getUser());');
    assert.ok(entryCheck > 0 && adminCheck > entryCheck, `${page}: entry, then role`);
    for (const read of ['db.select(', 'getLocale(', 'catalogAdmin']) {
      const at = text.indexOf(read, text.indexOf('export default'));
      assert.ok(at > adminCheck, `${page}: ${read} runs only after the checks`);
    }
    assert.doesNotMatch(text, /\.(insert|update|delete)\(|syncTemplateCatalog|getTemplateRowBySlug|revalidate/, `${page} is read-only`);
    assert.match(text, /export const dynamic = 'force-dynamic';/);
  }
  assert.match(source(`${CONSOLE}/[slug]/page.tsx`), /if \(!detail\) notFound\(\);/);
  assert.doesNotMatch(source(`${CONSOLE}/catalog-admin-ui.tsx`), /['"]use client['"]/);
  assert.doesNotMatch(source('lib/invitation/catalog-admin-view.ts'), /from ['"]@\/lib\/db|drizzle|server-only/);
});

test('manifests and the admin view stay out of the public catalog, the guest page and every client component', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const importers = ['app', 'components', 'lib']
    .flatMap(files)
    .filter((path) => /from ['"][^'"]*catalog-(manifest|admin-view)['"]/.test(source(path)));
  const allowed = [
    join('lib', 'invitation', 'catalog-admin-view.ts'),
    join(CONSOLE, 'page.tsx'),
    join(CONSOLE, '[slug]', 'page.tsx'),
    join(CONSOLE, 'catalog-admin-ui.tsx'),
    join(CONSOLE, 'copy.ts'),
  ];
  assert.deepEqual(importers.filter((path) => !allowed.includes(path)), []);
  for (const path of importers) assert.doesNotMatch(source(path), /['"]use client['"]/, path);
});

test('the sandbox gate refuses a missing and a changed art file and names both', () => {
  const root = mkdtempSync(join(tmpdir(), 'g062-gate-'));
  try {
    const art = join(root, 'public', 'theme-art');
    mkdirSync(art, { recursive: true });
    const real = resolve('public', 'theme-art');
    const names = readdirSync(real).filter((name) => name.endsWith('.webp')).sort();
    const missing = CATALOG_MANIFESTS[0].art.files[0].path.replace('/theme-art/', '');
    const changed = CATALOG_MANIFESTS.at(-1)!.art.files.at(-1)!.path.replace('/theme-art/', '');
    assert.notEqual(missing, changed);
    for (const name of names) {
      if (name === missing) continue;
      if (name === changed) writeFileSync(join(art, name), Buffer.concat([readFileSync(join(real, name)), Buffer.from([0])]));
      else symlinkSync(join(real, name), join(art, name));
    }
    const gate = checkCatalogManifests(root);
    assert.equal(gate.ok, false);
    assert.ok(gate.lines.some((line) => line.includes(`/theme-art/${missing} is missing`)), 'names the missing file');
    assert.ok(gate.lines.some((line) => line.includes(`/theme-art/${changed} differs from its sha256`)), 'names the changed file');
    assert.match(gate.lines.at(-1) ?? '', /^catalog: FAIL \(64 manifests, [1-9]\d* failing\)$/);
    assert.ok(checkCatalogManifests().ok, 'the real tree still passes');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the console stays legible and inside a phone viewport (s46 R13, R14)', () => {
  const list = source(`${CONSOLE}/page.tsx`);
  // R13: the table's scroller must contain the swatches' absolutely positioned sr-only text.
  assert.match(list, /className="relative [^"]*overflow-x-auto/);
  assert.match(source(`${CONSOLE}/catalog-admin-ui.tsx`), /sr-only/);
  // R14: brand-600 measures 4.41:1 on the console's slate-50; brand-700 measures 6.13:1.
  for (const page of [`${CONSOLE}/page.tsx`, `${CONSOLE}/[slug]/page.tsx`]) assert.doesNotMatch(source(page), /text-brand-600/, page);
  // R15: no Markdown in the copy; the page sets the gate's command in <code>.
  const strings = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
  for (const locale of ['id', 'en'] as const) {
    assert.deepEqual(strings(CATALOG_ADMIN_COPY[locale]).filter((text) => text.includes('`')), [], locale);
  }
  assert.match(list, /<code[^>]*>pnpm harness catalog<\/code>/);
});

test('the sandbox app job runs the catalog gate before the build', () => {
  const job = source('scripts/ci/app.sh');
  const gate = job.indexOf('pnpm harness catalog');
  assert.ok(gate > job.indexOf('pnpm harness families') && gate < job.indexOf('pnpm build'));
});
