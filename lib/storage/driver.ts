/**
 * Storage boundary.
 *
 * Deliberately NOT marked `server-only`: this file holds the interface and the
 * key-safety rule, neither of which touches the filesystem, credentials, or
 * environment. The `server-only` guards belong on the concrete drivers and on
 * `index.ts`, which do. Keeping this module pure is what makes key validation
 * directly testable.
 *
 * Uploads used to be written straight to instance-local disk. That works on a
 * single long-lived server and nowhere else: on serverless the filesystem is
 * per-invocation, and behind more than one replica a file written to instance A
 * is a 404 on instance B. It was the single constraint deciding where this
 * product could be hosted.
 *
 * Everything above this interface deals in opaque keys. Only a driver knows
 * where bytes physically live, so changing hosting means selecting a different
 * driver, not auditing call sites.
 *
 * Keys are POSIX-style relative paths (`avatars/12/ab34.png`). They never begin
 * with a slash and never contain `..` — `assertSafeKey` is the single gate.
 */
export interface StorageDriver {
  readonly name: string;

  /** Writes (or overwrites) an object. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;

  /**
   * Opens an object for reading, or resolves null when it does not exist.
   * A missing object is an ordinary 404, not an exception.
   */
  read(key: string): Promise<StoredObjectRead | null>;

  /** Removes an object. Deleting something absent is not an error. */
  remove(key: string): Promise<void>;
}

export type StoredObjectRead = {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: string;
};

export class InvalidKeyError extends Error {
  constructor(key: string) {
    super(`Unsafe storage key: ${JSON.stringify(key)}`);
    this.name = 'InvalidKeyError';
  }
}

/**
 * Rejects anything that could escape the storage root or be reinterpreted by a
 * filesystem. Applied by every driver rather than by callers, so a new call
 * site cannot forget it.
 */
export function assertSafeKey(key: string): string {
  if (!key || key.length > 512) throw new InvalidKeyError(key);
  if (key.startsWith('/') || key.includes('\\')) throw new InvalidKeyError(key);
  if (key.includes('\0')) throw new InvalidKeyError(key);

  const segments = key.split('/');
  for (const segment of segments) {
    // Empty segments come from '//' or a trailing slash; both are ambiguous.
    if (!segment || segment === '.' || segment === '..') throw new InvalidKeyError(key);
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) throw new InvalidKeyError(key);
  }
  return key;
}
