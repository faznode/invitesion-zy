// Editor uploads (s16, found while tracing the B-029 logo to its upload): `ImageUpload` stores the relative
// `/media/<key>` path the upload route returns, which the detail schema refused (`.url()` wants an absolute URL), so a
// host could not save an invitation after uploading a logo, a cover or a photo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailConfigSchema } from '../lib/invitation/detail-config';
import { isUploadedMediaPath, safeImageSrc } from '../lib/invitation/image-url';

// `lib/storage` is server-only; an empty module stands in for the guard, as in `tests/support/render-guest-page.ts`.
const serverOnly = require.resolve('server-only');
require.cache[serverOnly] ??= { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as unknown as NodeJS.Module;

const UPLOAD = '/media/12/0123456789abcdef01234567.png';
const IMAGE_FIELDS: readonly [string, (value: string) => Record<string, unknown>][] = [
  ['corporateProfile.logoUrl', (value) => ({ corporateProfile: { logoUrl: value } })],
  ['theme.cover.imageUrl', (value) => ({ theme: { cover: { imageUrl: value } } })],
  ['couple.bride.photoUrl', (value) => ({ couple: { bride: { photoUrl: value } } })],
  ['couple.groom.photoUrl', (value) => ({ couple: { groom: { photoUrl: value } } })],
  ['birthdayPerson.photoUrl', (value) => ({ birthdayPerson: { photoUrl: value } })],
  ['ceremonyProfile.photoUrl', (value) => ({ ceremonyProfile: { photoUrl: value } })],
];
const parse = (config: Record<string, unknown>) => detailConfigSchema.partial().safeParse(config);

test('uploads: every path the storage layer hands out is an upload path a guest page may request', async () => {
  const { ALLOWED_IMAGE_EXT, avatarKey, invitationMediaKey, mediaUrl } = await import('../lib/storage');
  for (const ext of Object.values(ALLOWED_IMAGE_EXT)) {
    for (const path of [mediaUrl(invitationMediaKey(12, ext)), mediaUrl(avatarKey(3, ext))]) {
      assert.ok(isUploadedMediaPath(path), path);
      assert.equal(safeImageSrc(path), path);
    }
  }
});

test('uploads: each image field the editor fills with ImageUpload saves an upload path and still takes absolute URLs', () => {
  for (const [field, at] of IMAGE_FIELDS) {
    for (const value of [UPLOAD, '/media/avatars/3/0123456789abcdef01234567.webp', 'https://cdn.contoh.test/a.png', 'http://127.0.0.1:3100/review/logo.png']) {
      const result = parse(at(value));
      assert.ok(result.success, `${field}: ${value} ${result.success ? '' : JSON.stringify(result.error.issues)}`);
    }
  }
});

test('uploads: a relative value that is not an upload path is refused with the same issue as before', () => {
  const near = [
    '/media/../api/invitations/1/detail',
    `${UPLOAD}?v=1`,
    '/media/12/0123456789abcdef01234567.svg',
    '/media/12/abc.png',
    '/media//12/0123456789abcdef01234567.png',
    'media/12/0123456789abcdef01234567.png',
    '//evil.test/a.png',
    '/api/upload.png',
    'logo.png',
  ];
  for (const [field, at] of IMAGE_FIELDS) {
    for (const value of near) {
      const result = parse(at(value));
      assert.equal(result.success, false, `${field}: ${value}`);
      assert.deepEqual(
        result.error?.issues.map(({ code, message }) => ({ code, message })),
        [{ code: 'invalid_string', message: 'Invalid url' }],
        `${field}: ${value}`,
      );
    }
  }
});

test('uploads: a guest page requests only upload paths and http(s) URLs', () => {
  assert.equal(safeImageSrc(UPLOAD), UPLOAD);
  assert.equal(safeImageSrc('https://cdn.contoh.test/a.png'), 'https://cdn.contoh.test/a.png');
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'blob:https://x.test/1', 'file:///etc/passwd', '//evil.test/a.png', '/media/../api/x', '/api/x.png', '', undefined]) {
    assert.equal(safeImageSrc(value), undefined, String(value));
  }
});
