import 'server-only';

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { StorageDriver } from './driver';
import { LocalStorageDriver, EXT_MIME } from './local-driver';
import { S3StorageDriver } from './s3-driver';

export { EXT_MIME };
export type { StorageDriver } from './driver';
export { InvalidKeyError, assertSafeKey } from './driver';

/**
 * Default local root. Absolute, and outside `public/` — `next start` indexes
 * that directory once at boot, so runtime writes there 404 until a restart.
 *
 * The `process.cwd()` fallback is a convenience, not a contract: it resolves
 * against wherever the process was launched from, which is not necessarily the
 * project directory. Set `UPLOAD_ROOT` explicitly anywhere it matters — the
 * resolved value is logged on first use so it is never a mystery.
 *
 * Runtime storage, never a build input: `turbopackIgnore` keeps Next 16's file tracing from following this
 * env-dependent path, which otherwise traces the whole project (and any local uploads) into the server output (F-01).
 */
export const UPLOAD_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.env.UPLOAD_ROOT ?? path.join(process.cwd(), 'storage', 'uploads'),
);

/**
 * Upload MIME allowlist, mapped to the extension stored on disk.
 *
 * SVG is intentionally absent. An SVG is an executable document: served from
 * our own origin it runs script in our security context, which turns any
 * avatar upload into stored XSS against the dashboard. Raster formats only.
 */
export const ALLOWED_IMAGE_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const SIGNATURES: ReadonlyArray<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/**
 * The real extension implied by a file's bytes, or null.
 *
 * The browser-supplied `Content-Type` is attacker-controlled and decides
 * nothing: it only has to agree that the upload is an image at all. What gets
 * stored — and therefore what `/media` later serves it back as — comes from
 * the bytes.
 */
export function sniffImageExt(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((s) => s.test(bytes))?.ext ?? null;
}

// ── Driver selection ─────────────────────────────────────────

let driver: StorageDriver | null = null;

/**
 * Resolves the configured driver once per process.
 *
 * S3 is used when fully configured, local disk otherwise. Partial S3 config is
 * a hard error rather than a silent downgrade: quietly falling back to local
 * disk in production would "work" right up until the first redeploy wiped
 * every customer's photos.
 */
export function getStorage(): StorageDriver {
  if (driver) return driver;

  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const configured = [bucket, region, accessKeyId, secretAccessKey].filter(Boolean).length;

  if (configured > 0 && configured < 4) {
    throw new Error(
      '[storage] S3 is partially configured. S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and ' +
        'S3_SECRET_ACCESS_KEY are all required together. Refusing to fall back to local disk, ' +
        'which would lose uploads on the next deploy.',
    );
  }

  if (configured === 4) {
    driver = new S3StorageDriver({
      bucket: bucket!,
      region: region!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      sessionToken: process.env.S3_SESSION_TOKEN?.trim() || undefined,
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
    return driver;
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[storage] Using local disk in production. Uploads will not survive a redeploy and are ' +
        'invisible to other replicas. Configure S3_* to fix this.',
    );
  }
  if (!process.env.UPLOAD_ROOT) {
    // Where customer photos land should never be a surprise. Without an
    // explicit root this follows the launch directory, which differs between
    // `pnpm dev`, a monorepo script, and a container entrypoint.
    console.info(`[storage] local driver root: ${UPLOAD_ROOT} (derived from cwd; set UPLOAD_ROOT to pin it)`);
  }
  driver = new LocalStorageDriver(UPLOAD_ROOT);
  return driver;
}

/** Test seam: lets a suite install a fake driver. */
export function setStorageDriver(next: StorageDriver | null) {
  driver = next;
}

// ── Application-level helpers ────────────────────────────────

/** Random, non-enumerable object name. Client-supplied names are never reused. */
function randomName(ext: string) {
  return `${randomBytes(12).toString('hex')}.${ext}`;
}

export function avatarKey(userId: number, ext: string) {
  return `avatars/${userId}/${randomName(ext)}`;
}

export function invitationMediaKey(invitationId: number, ext: string) {
  return `${invitationId}/${randomName(ext)}`;
}

/**
 * D-040: a child's photo (birthday celebrant, aqiqah / khitanan honouree). `/media` serves this prefix to the
 * invitation's owner only (`lib/storage/serve-media.ts`); guests get it through their personal link's photo route.
 * With the S3 driver the bucket must not grant public reads (every read is proxied through this origin anyway).
 */
export function protectedInvitationMediaKey(invitationId: number, ext: string) {
  return `${PROTECTED_MEDIA_PREFIX}${invitationId}/${randomName(ext)}`;
}

export const PROTECTED_MEDIA_PREFIX = 'protected/';

/** Public URL for a stored key, served by `app/media/[...path]`. */
export function mediaUrl(key: string) {
  return `/media/${key}`;
}

/**
 * Validates and stores an image, returning its public URL.
 *
 * Returns `null` for anything rejected — wrong type, too large, or bytes that
 * disagree with the declared type — so callers surface one validation error
 * rather than distinguishing failure modes.
 */
export async function saveImage(
  key: (ext: string) => string,
  file: File,
  maxBytes: number,
  allowedExt: readonly string[] = Object.values(ALLOWED_IMAGE_EXT),
): Promise<string | null> {
  if (file.size === 0 || file.size > maxBytes) return null;
  const declared = ALLOWED_IMAGE_EXT[file.type];
  if (!declared || !allowedExt.includes(declared)) return null;

  const bytes = Buffer.from(await file.arrayBuffer());
  // Re-check after reading: `file.size` is a claim until the bytes are in hand.
  if (bytes.length === 0 || bytes.length > maxBytes) return null;

  const ext = sniffImageExt(bytes);
  if (!ext || !allowedExt.includes(ext)) return null;

  const objectKey = key(ext);
  await getStorage().put(objectKey, bytes, EXT_MIME[ext] ?? 'application/octet-stream');
  return mediaUrl(objectKey);
}

/** Stores a user avatar and returns the URL to persist on the user row. */
export async function saveAvatar(userId: number, file: File): Promise<string | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return saveImage((ext) => avatarKey(userId, ext), file, AVATAR_MAX_BYTES);
}
