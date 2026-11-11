import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 request signing.
 *
 * Written by hand rather than pulled from `@aws-sdk/*` because the only thing
 * this project needs from S3 is PUT/GET/DELETE on a single object, and the SDK
 * is a large dependency to carry for three verbs. The algorithm is fully
 * specified and stable, so the cost is a hundred lines that are covered by
 * AWS's own published test vectors (see `tests/sigv4.test.ts`).
 *
 * Kept free of `server-only` and of any S3 detail so it stays directly
 * testable.
 */

export type SignInput = {
  method: string;
  /** Full request URL, including any query string. */
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Hex SHA-256 of the request body. */
  payloadHash: string;
  /** Extra headers to sign. `host` is derived from the URL. */
  headers?: Record<string, string>;
  /** Signing instant. Injected so tests are deterministic. */
  date: Date;
};

const ALGORITHM = 'AWS4-HMAC-SHA256';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** `20150830T123600Z` and `20150830`. */
function amzDate(date: Date): { long: string; short: string } {
  const long = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { long, short: long.slice(0, 8) };
}

/**
 * RFC 3986 encoding.
 *
 * `encodeURIComponent` leaves `!'()*` unescaped, which AWS expects escaped.
 * Path segments are encoded individually so `/` survives.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return encodeSlash ? encoded : encoded.replace(/%2F/g, '/');
}

function canonicalQuery(url: URL): string {
  const pairs: [string, string][] = [];
  url.searchParams.forEach((value, key) => pairs.push([key, value]));
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');
}

/** Signs a request and returns the headers to send, Authorization included. */
export function signRequest(input: SignInput): Record<string, string> {
  const url = new URL(input.url);
  const { long, short } = amzDate(input.date);

  // Only `host` and `x-amz-date` are added here — they are required by SigV4
  // itself. Service-specific headers such as S3's `x-amz-content-sha256` are
  // the caller's business, which is what keeps this function comparable against
  // AWS's generic test vectors.
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-date': long,
    ...lowercaseKeys(input.headers ?? {}),
  };
  if (input.sessionToken) headers['x-amz-security-token'] = input.sessionToken;

  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${collapseWhitespace(headers[name])}\n`)
    .join('');
  const signedHeaders = sortedNames.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    // S3 keys are already safe characters, but encode defensively. The path is
    // NOT normalised: S3 signs the literal path it is given.
    uriEncode(decodeURIComponent(url.pathname), false),
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');

  const scope = `${short}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [ALGORITHM, long, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, short);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    ...headers,
    authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function lowercaseKeys(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k.toLowerCase(), v]));
}

/** Canonical headers collapse internal runs of whitespace and trim the edges. */
function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
