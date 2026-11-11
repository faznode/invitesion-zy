import 'server-only';

import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assertSafeKey, type StorageDriver, type StoredObjectRead } from './driver';

/**
 * Local-disk driver.
 *
 * Correct for a single long-lived server or a mounted volume, and the default
 * for development. NOT suitable for serverless or multi-replica deployments —
 * see `lib/storage/index.ts`, which warns when this driver is selected in
 * production.
 *
 * The root is always absolute: a relative value resolves against whatever CWD
 * the process happens to have, which previously made every served asset fail.
 * It must also live outside `public/`, because `next start` indexes that
 * directory once at boot and runtime writes there 404 until a restart.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolves a key to an absolute path, refusing anything outside the root. */
  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(path.join(this.root, key));
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      // Unreachable given assertSafeKey, kept as a second, cheap barrier.
      throw new Error('Resolved path escaped the storage root');
    }
    return full;
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }

  async read(key: string): Promise<StoredObjectRead | null> {
    const full = this.resolve(key);
    let info;
    try {
      info = await stat(full);
    } catch {
      return null;
    }
    if (!info.isFile()) return null;

    // Streamed rather than buffered: a 5MB read per concurrent request is a
    // memory cliff under load and nothing here needs the whole file at once.
    const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
    return { body, size: info.size, contentType: contentTypeFor(key) };
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/**
 * Content type is derived from the stored key's extension, and the extension is
 * itself derived from the file's magic bytes at upload time. The browser's
 * declared type never reaches this decision.
 */
function contentTypeFor(key: string): string {
  const ext = path.extname(key).slice(1).toLowerCase();
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

/** Extensions this system knowingly stores, and how to serve them back. */
export const EXT_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
