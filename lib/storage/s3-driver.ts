import 'server-only';

import { assertSafeKey, type StorageDriver, type StoredObjectRead } from './driver';
import { EXT_MIME } from './local-driver';
import { sha256Hex, signRequest, uriEncode } from './sigv4';
import path from 'node:path';

export type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /**
   * Custom endpoint for S3-compatible providers (Cloudflare R2, MinIO,
   * Backblaze B2). Omit for AWS S3 itself.
   */
  endpoint?: string;
  /**
   * Path-style addressing (`endpoint/bucket/key`) instead of virtual-host
   * style (`bucket.endpoint/key`). Required by MinIO and most self-hosted
   * gateways; AWS and R2 prefer virtual-host.
   */
  forcePathStyle?: boolean;
};

/**
 * S3-compatible object storage.
 *
 * This is the driver that makes serverless and multi-replica hosting possible:
 * bytes live outside the instance, so nothing is lost when a container is
 * recycled and every replica sees the same objects.
 *
 * Only PUT, GET, and DELETE on a single object are implemented — that is the
 * entire surface this product needs, and it is why signing is done in-repo
 * rather than by pulling in the AWS SDK.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
  }

  private endpointFor(key: string): string {
    const { bucket, region, endpoint, forcePathStyle } = this.config;
    const encodedKey = uriEncode(key, false);
    const base = endpoint?.replace(/\/+$/, '') ?? `https://s3.${region}.amazonaws.com`;

    if (forcePathStyle || endpoint) {
      // A custom endpoint is assumed path-style unless the caller is explicit,
      // because that is what self-hosted gateways default to.
      if (forcePathStyle !== false) return `${base}/${bucket}/${encodedKey}`;
    }
    const url = new URL(base);
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = `/${encodedKey}`;
    return url.toString();
  }

  private sign(method: string, url: string, payloadHash: string, extra?: Record<string, string>) {
    return signRequest({
      method,
      url,
      region: this.config.region,
      service: 's3',
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      sessionToken: this.config.sessionToken,
      payloadHash,
      // S3 requires the payload digest to be a signed header; SigV4 in general
      // does not, so the signer stays generic and this belongs here.
      headers: { 'x-amz-content-sha256': payloadHash, ...extra },
      date: new Date(),
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    const url = this.endpointFor(key);
    const payloadHash = sha256Hex(bytes);
    const headers = this.sign('PUT', url, payloadHash, {
      'content-type': contentType,
      'content-length': String(bytes.length),
    });

    const response = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(bytes) });
    if (!response.ok) {
      throw new Error(`S3 PUT failed for ${key}: ${response.status} ${await safeText(response)}`);
    }
  }

  async read(key: string): Promise<StoredObjectRead | null> {
    assertSafeKey(key);
    const url = this.endpointFor(key);
    const headers = this.sign('GET', url, EMPTY_SHA256);

    const response = await fetch(url, { method: 'GET', headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 GET failed for ${key}: ${response.status} ${await safeText(response)}`);
    }
    if (!response.body) return null;

    // The stored extension decides the type, exactly as on local disk, so a
    // provider echoing back an attacker-influenced type cannot change it.
    const ext = path.extname(key).slice(1).toLowerCase();
    return {
      body: response.body as ReadableStream<Uint8Array>,
      size: Number(response.headers.get('content-length') ?? 0),
      contentType: EXT_MIME[ext] ?? 'application/octet-stream',
    };
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key);
    const url = this.endpointFor(key);
    const headers = this.sign('DELETE', url, EMPTY_SHA256);
    const response = await fetch(url, { method: 'DELETE', headers });
    // 404 means the object is already gone, which is the requested end state.
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 DELETE failed for ${key}: ${response.status}`);
    }
  }
}

/** SHA-256 of the empty string, required for bodyless signed requests. */
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}
