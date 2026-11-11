/**
 * Database- and server-backed check of an uploaded logo's path through the product (E-021 / E-022), without a session.
 *
 *   POSTGRES_URL=postgres://postgres@127.0.0.1:5433/invitesion UPLOAD_ROOT=<the server's upload root> \
 *     npx tsx scripts/verify-upload-path.ts [--base http://127.0.0.1:3100] [--logo fictional-logo.png] [--keep]
 *
 * Runs every step of an editor logo save that follows the session and ownership checks: the upload route's storage call
 * (`saveImage` keyed to the invitation), the detail route's validation (`detailConfigSchema.partial()`) and persistence
 * (`updateDetailConfig`, which also writes the live version), the editor's reload (`getDetailConfig`) and the guest
 * page's lenient read (`normalizeStoredConfig`). With `--base` it also reads the served guest page and the media route.
 * It never signs in: Clerk, the route handlers' session and ownership checks and the editor UI stay unverified
 * (P-INV-010). Hostile values a stored config may still hold are checked against what the guest page requests.
 * Temporary rows and the stored file are removed at the end unless `--keep`.
 */
import Module from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {};
  return load.call(this, request, ...rest);
};

// A valid 2 × 1 PNG, used when no fictional logo file is given; enough for the type sniff and the served bytes.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVR4nGOQt4qXt4oHAASPAXF4yGkoAAAAAElFTkSuQmCC',
  'base64',
);

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const argValue = (flag: string) => (process.argv.indexOf(flag) > 0 ? process.argv[process.argv.indexOf(flag) + 1] : undefined);

async function main() {
  const { desc, eq } = await import('drizzle-orm');
  const { z } = await import('zod');
  const { client, db } = await import('../lib/db/drizzle');
  const { analyticsEvents, guests, invitations, invitationVersions, users } = await import('../lib/db/schema');
  const { detailConfigSchema } = await import('../lib/invitation/detail-config');
  const { normalizeStoredConfig } = await import('../lib/invitation/content-read');
  const { isUploadedMediaPath } = await import('../lib/invitation/image-url');
  const { getDetailConfig, updateDetailConfig } = await import('../lib/invitation/service');
  const { UPLOAD_ROOT, getStorage, invitationMediaKey, saveImage } = await import('../lib/storage');

  const base = argValue('--base')?.replace(/\/$/, '');
  const logoPath = argValue('--logo');
  const keep = process.argv.includes('--keep');
  const logoBytes = logoPath ? readFileSync(logoPath) : TINY_PNG;
  console.log(`storage root: ${UPLOAD_ROOT}${base ? `; server: ${base}` : '; no --base, served checks skipped'}`);

  const suffix = `${Date.now()}`;
  const organisation = 'PT Verifikasi Unggah Contoh (fiktif)';
  const [owner] =
    (await db.select().from(users).where(eq(users.email, 'verify.upload@example.test')).limit(1)).length > 0
      ? await db.select().from(users).where(eq(users.email, 'verify.upload@example.test')).limit(1)
      : await db.insert(users).values({ email: 'verify.upload@example.test', name: 'Upload Check (fixture)' }).returning();
  const startAt = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) + 'T09:00:00+08:00';
  const initial = detailConfigSchema.parse({
    corporateProfile: { organizationName: organisation, eventName: 'Rapat Contoh Unggahan', eventCategory: 'seminar' },
    theme: { paletteId: 'slate' },
    events: [{ title: 'Rapat Contoh', startAt, venueName: 'Ruang Contoh' }],
    guestbook: { enabled: false, moderation: false },
  });
  const [invitation] = await db
    .insert(invitations)
    .values({
      userId: owner.id,
      templateId: null,
      slug: `upload-check-${suffix}`,
      eventType: 'corporate',
      config: initial,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  await db.insert(guests).values({ invitationId: invitation.id, name: 'Budi Hartono', slug: 'budi-hartono', guestCount: 1 });
  let storedKey: string | undefined;

  try {
    // 1. The upload route, after its session and ownership checks: type allowlist, size, magic bytes, keyed storage.
    const file = new File([new Uint8Array(logoBytes)], 'logo.png', { type: 'image/png' });
    const url = await saveImage((ext) => invitationMediaKey(invitation.id, ext), file, 5 * 1024 * 1024);
    check('upload: saveImage stores the logo and returns a media path', typeof url === 'string', String(url));
    if (!url) throw new Error('nothing stored');
    storedKey = url.replace(/^\/media\//, '');
    check('upload: the returned value is an exact upload path', isUploadedMediaPath(url));
    check('upload: the path names this invitation', storedKey.startsWith(`${invitation.id}/`));
    const stored = await getStorage().read(storedKey);
    check('upload: the storage driver returns the bytes', Boolean(stored));
    check('contract before E-022: zod .url() refuses this path (why saves failed; the rollback hazard)', !z.string().url().safeParse(url).success);

    // 2. The detail route's validation and persistence with the value the editor sends after an upload.
    const before = await getDetailConfig(invitation.id, owner.id);
    const body = { corporateProfile: { ...before.corporateProfile, logoUrl: url } };
    const parsed = detailConfigSchema.partial().safeParse(body);
    check('save: detailConfigSchema.partial() accepts the upload path', parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues));
    if (!parsed.success) throw new Error('refused');
    const saved = await updateDetailConfig(invitation.id, owner.id, parsed.data);
    check('save: updateDetailConfig returns the path unchanged', saved.corporateProfile?.logoUrl === url);
    const [row] = await db.select({ config: invitations.config }).from(invitations).where(eq(invitations.id, invitation.id)).limit(1);
    const rowLogo = (row.config as { corporateProfile?: { logoUrl?: string } }).corporateProfile?.logoUrl;
    check('save: the invitation row holds the path', rowLogo === url);
    const [version] = await db
      .select()
      .from(invitationVersions)
      .where(eq(invitationVersions.invitationId, invitation.id))
      .orderBy(desc(invitationVersions.versionNo))
      .limit(1);
    const versionLogo = (version?.config as { corporateProfile?: { logoUrl?: string } } | undefined)?.corporateProfile?.logoUrl;
    check('save: the newest version is live and holds the path', Boolean(version?.isLive) && versionLogo === url);

    // 3. Reload in the editor and the guest page's lenient read: nothing dropped, nothing rewritten.
    const reloaded = await getDetailConfig(invitation.id, owner.id);
    check('reload: getDetailConfig returns the path', reloaded.corporateProfile?.logoUrl === url);
    const normalized = normalizeStoredConfig(row.config);
    check('guest read: no section dropped', normalized.dropped.length === 0, normalized.dropped.join(', '));
    check('guest read: the path survives', normalized.config.corporateProfile?.logoUrl === url);

    // 4. Stored-value compatibility versus what a guest page may request.
    const hostile = ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://example.test/logo.png'];
    for (const value of hostile) {
      check(`compatibility: an absolute ${value.split(':')[0]}: value still parses for storage`, detailConfigSchema.partial().safeParse({ corporateProfile: { logoUrl: value } }).success);
    }
    for (const value of ['/media/../etc/passwd', '/media/1/abc.png', 'logo.png']) {
      const result = detailConfigSchema.partial().safeParse({ corporateProfile: { logoUrl: value } });
      check(`save: ${value} is refused`, !result.success);
    }

    if (base) {
      const page = `${base}/i/${invitation.slug}/budi-hartono`;
      const html = await (await fetch(page)).text();
      const img = html.match(/<img[^>]*src="(\/media\/[^"]+)"[^>]*>/);
      check('served: the guest page requests the stored path', img?.[1] === url, img?.[1] ?? 'no <img> with a media path');
      check('served: alt text names the organisation', Boolean(img && img[0].includes(`alt="Logo ${organisation}"`)));
      check('served: intrinsic 160 × 64 frame size', Boolean(img && img[0].includes('width="160"') && img[0].includes('height="64"')));
      check('served: the logo comes before the headline', Boolean(img) && html.indexOf(img![0]) < html.indexOf('<h1'));
      check('served: the category is shown', html.includes('>Seminar<'));
      const media = await fetch(`${base}${url}`);
      const served = Buffer.from(await media.arrayBuffer());
      check('media route: 200 image/png', media.status === 200 && media.headers.get('content-type') === 'image/png', `${media.status} ${media.headers.get('content-type')}`);
      check('media route: nosniff and sandbox CSP', media.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(media.headers.get('content-security-policy') ?? ''));
      check('media route: the bytes are the uploaded bytes', sha256(served) === sha256(logoBytes));

      for (const value of hostile) {
        await updateDetailConfig(invitation.id, owner.id, { corporateProfile: { ...reloaded.corporateProfile, logoUrl: value } });
        const hostileHtml = await (await fetch(page)).text();
        check(`served: a stored ${value.split(':')[0]}: logo renders no image`, !hostileHtml.includes(`src="${value}`) && !/<img[^>]*alt="Logo /.test(hostileHtml));
      }
      await updateDetailConfig(invitation.id, owner.id, { corporateProfile: { ...reloaded.corporateProfile, logoUrl: url } });
    }
  } finally {
    if (!keep) {
      // Served page views write VIEW events that reference the guest, so they go first.
      await db.delete(analyticsEvents).where(eq(analyticsEvents.invitationId, invitation.id));
      await db.delete(invitationVersions).where(eq(invitationVersions.invitationId, invitation.id));
      await db.delete(guests).where(eq(guests.invitationId, invitation.id));
      await db.delete(invitations).where(eq(invitations.id, invitation.id));
      if (storedKey) await getStorage().remove(storedKey);
    }
    console.log(keep ? `kept: /i/${invitation.slug}/budi-hartono` : 'temporary rows and the stored file removed');
    await client.end();
  }
  console.log(failures ? `${failures} check(s) FAILED` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
