import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signRequest, uriEncode, sha256Hex } from '../lib/storage/sigv4';

/**
 * Verified against AWS's published Signature Version 4 test suite
 * (`aws-sig-v4-test-suite`, case `get-vanilla`). The credentials and the
 * expected signature are the ones AWS documents for that case, so a passing
 * assertion here means the signer agrees with the reference implementation
 * rather than merely with itself.
 */
const AWS_EXAMPLE = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  date: new Date('2015-08-30T12:36:00Z'),
};

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('sha256Hex of the empty string matches the documented constant', () => {
  assert.equal(sha256Hex(''), EMPTY_SHA256);
});

test('get-vanilla reproduces the AWS reference signature', () => {
  const headers = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });

  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
      'SignedHeaders=host;x-amz-date, ' +
      'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  );
  assert.equal(headers['x-amz-date'], '20150830T123600Z');
  assert.equal(headers.host, 'example.amazonaws.com');
});

test('signature is deterministic for identical input', () => {
  const once = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });
  const twice = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });
  assert.equal(once.authorization, twice.authorization);
});

test('a different payload produces a different signature', () => {
  const empty = signRequest({
    method: 'PUT',
    url: 'https://bucket.s3.us-east-1.amazonaws.com/a/b.png',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });
  const withBody = signRequest({
    method: 'PUT',
    url: 'https://bucket.s3.us-east-1.amazonaws.com/a/b.png',
    payloadHash: sha256Hex('some bytes'),
    ...AWS_EXAMPLE,
  });
  assert.notEqual(empty.authorization, withBody.authorization);
});

test('query parameters are canonicalised in sorted order', () => {
  const a = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/?b=2&a=1',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });
  const b = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/?a=1&b=2',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });
  assert.equal(a.authorization, b.authorization, 'parameter order must not change the signature');
});

test('a session token is signed when present', () => {
  const without = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    payloadHash: EMPTY_SHA256,
    ...AWS_EXAMPLE,
  });
  const withToken = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    payloadHash: EMPTY_SHA256,
    sessionToken: 'token-value',
    ...AWS_EXAMPLE,
  });
  assert.match(withToken.authorization, /x-amz-security-token/);
  assert.notEqual(without.authorization, withToken.authorization);
});

test('uriEncode escapes what encodeURIComponent leaves alone', () => {
  assert.equal(uriEncode("a!b'c(d)e*f"), 'a%21b%27c%28d%29e%2Af');
  assert.equal(uriEncode('a/b', false), 'a/b', 'slashes survive in path mode');
  assert.equal(uriEncode('a/b'), 'a%2Fb', 'slashes are escaped by default');
});
