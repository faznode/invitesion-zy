// R-03 (D-043): the trusted-proxy contract for the per-address RSVP limit. Only entries written by trusted proxies are
// read; anything a client put to their left never decides the address.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_TRUSTED_PROXY_HOPS, clientAddressFrom, trustedProxyHops } from '../lib/net/client-address';

test('TRUSTED_PROXY_HOPS: unset is one hop (Vercel), an unreadable value trusts nothing', () => {
  assert.equal(DEFAULT_TRUSTED_PROXY_HOPS, 1);
  assert.equal(trustedProxyHops({}), 1);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: '' }), 1);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: '0' }), 0);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: ' 2 ' }), 2);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: '10' }), 10);
  for (const odd of ['11', '-1', '1.5', 'two', '1e1', '099']) assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: odd }), 0, odd);
});

test('the address is the entry written by the outermost trusted proxy, never one a client supplied', () => {
  // Vercel replaces the header with the client's address alone.
  assert.equal(clientAddressFrom('203.0.113.7', 1), '203.0.113.7');
  // A proxy that appends: the client's own "198.51.100.9" is to the left of what the proxy saw.
  assert.equal(clientAddressFrom('198.51.100.9, 203.0.113.7', 1), '203.0.113.7');
  assert.equal(clientAddressFrom('198.51.100.9,203.0.113.7,192.0.2.1', 2), '203.0.113.7');
  assert.equal(clientAddressFrom('203.0.113.7', 2), null, 'fewer entries than trusted hops: the header cannot answer');
  assert.equal(clientAddressFrom('203.0.113.7', 0), null, 'no trusted proxy: no header is believed');
  assert.equal(clientAddressFrom(null, 1), null);
  assert.equal(clientAddressFrom(undefined, 1), null);
});

test('entries are IP literals: ports and brackets are removed, anything else is refused', () => {
  assert.equal(clientAddressFrom('203.0.113.7:443', 1), '203.0.113.7');
  assert.equal(clientAddressFrom('[2001:DB8::1]:443', 1), '2001:db8::1');
  assert.equal(clientAddressFrom('[2001:db8::1]', 1), '2001:db8::1');
  assert.equal(clientAddressFrom(' 2001:DB8:0:0::7 ', 1), '2001:db8:0:0::7');
  assert.equal(clientAddressFrom('::ffff:203.0.113.7', 1), '::ffff:203.0.113.7');
  for (const junk of ['', ' , ', 'unknown', '203.0.113.256', '203.0.113', '01.2.3.4', 'fe80::1%eth0', '[fe80::1%25eth0]', 'example.com']) {
    assert.equal(clientAddressFrom(junk, 1), null, JSON.stringify(junk));
  }
  assert.equal(clientAddressFrom('203.0.113.7, unknown', 1), null, 'a malformed trusted entry is not replaced by a client one');
});

test('the RSVP action reads the address only through the contract', () => {
  const action = readFileSync(join(process.cwd(), 'app/i/[slug]/actions.ts'), 'utf8');
  assert.match(action, /clientAddressFrom\(forwarded\.get\('x-forwarded-for'\), trustedProxyHops\(\)\)/);
  assert.doesNotMatch(action, /x-real-ip/, 'a header no trusted proxy is contracted to set is never read');
  assert.doesNotMatch(action, /split\(','\)\[0\]/, 'the leftmost entry is client-supplied');
});
