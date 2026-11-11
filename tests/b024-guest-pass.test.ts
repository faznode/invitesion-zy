// B-024 (I-01, D-056): the guest pass's rules and where it shows. Every vector in `contracts/vectors/guest-pass.json`
// is what the TypeScript rules decide (the Rust suite runs the same file); the browser's lookup key equals the server's;
// secrets below the minimum are ignored and the previous secret only verifies; the pass link appears in the RSVP block of
// every layout for a recognised guest and never on the shared invitation link or without the page's decision.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DetailConfig } from '../lib/invitation/detail-config';
import {
  checkInTime,
  GUEST_PASS_TOKEN_LENGTH,
  normalizedPassScans,
  passCheckInEnabled,
  passCheckinCanonical,
  passCheckinHash,
  passCheckinScope,
  passExpiresAt,
  passLookupKey,
  passLookupKeyFromToken,
  passManualAllowed,
  passSigningSecret,
  passVerifySecrets,
  readGuestPass,
  signGuestPass,
} from '../lib/invitation/guest-pass';
import { guestPassAvailable } from '../lib/invitation/guest-pass-page';
import { looksLikePass, passLookupKeyInBrowser } from '../lib/invitation/pass-lookup-client';
import { fixtureGuest, LAYOUTS, linkHrefs, renderGuestPage, withFamily } from './support/render-guest-page';

const vectors = JSON.parse(readFileSync(join(process.cwd(), 'contracts/vectors/guest-pass.json'), 'utf8'));
const secret = (name: string) => Buffer.from(vectors.secrets[name] as string);
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('every vector is what the rules decide: signs, reads, scan times, opt-ins, lookups and expiries', () => {
  assert.equal(vectors.reads.length, 20);
  for (const { secret: name, passId, expiresAt, token } of vectors.signs) {
    assert.equal(signGuestPass(secret(name), passId, expiresAt), token);
    assert.equal(token.length, GUEST_PASS_TOKEN_LENGTH);
  }
  for (const { name, token, secrets, now, expect } of vectors.reads) {
    assert.deepEqual(readGuestPass(token, (secrets as string[]).map(secret), now), expect, name);
  }
  for (const { name, scannedAt, now, expect } of vectors.scanTimes) {
    assert.equal(checkInTime(scannedAt ?? undefined, new Date(now)).toISOString(), expect, name);
  }
  for (const { name, config, expect } of vectors.enabled) assert.equal(passCheckInEnabled(config), expect, name);
  for (const { name, config, expect } of vectors.manual) assert.equal(passManualAllowed(config), expect, name);
  for (const { passId, key } of vectors.lookups) assert.equal(passLookupKey(passId), key);
  for (const { name, events, issuedAt, expect } of vectors.expiries) assert.equal(passExpiresAt(events, issuedAt), expect, name);
  // D-056: the batch's idempotency record is shared by both writers (the Rust suite serialises `sent` to `canonical`).
  assert.equal(vectors.requests.length, 6);
  for (const { name, scans, sent, canonical, hash } of vectors.requests) {
    assert.deepEqual(normalizedPassScans(scans), sent, name);
    assert.equal(passCheckinCanonical(scans), canonical, name);
    assert.equal(passCheckinHash(scans), hash, name);
    assert.equal(createHash('sha256').update(canonical).digest('hex'), hash, `${name}: the hash is the canonical JSON's`);
  }
  for (const { owner, invitation, scope } of vectors.scopes) assert.equal(passCheckinScope(owner, invitation), scope);
});

test('the vector file is current: regenerating it from the rules changes nothing', () => {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  assert.match(execFileSync('npx', ['tsx', 'scripts/api/guest-pass-vectors.ts', '--check'], { encoding: 'utf8' }), /guest-pass vectors current/);
});

test('a forged, tampered or expired pass never reads as genuine, and expiry is judged only after the MAC', () => {
  const key = secret('current');
  const token = signGuestPass(key, '0123456789abcdef0123456789abcdef', 2_000_000_000);
  assert.equal(readGuestPass(token, [key], 1_999_999_999).kind, 'valid');
  assert.equal(readGuestPass(token, [key], 2_000_000_001).kind, 'expired');
  assert.equal(readGuestPass(token, [secret('other')], 1).kind, 'invalid');
  for (let at = 5; at < token.length; at += 7) {
    const flipped = token.slice(0, at) + (token[at] === 'A' ? 'B' : 'A') + token.slice(at + 1);
    assert.equal(readGuestPass(flipped, [key], 1).kind, 'invalid', `character ${at}`);
  }
  assert.doesNotMatch(token, /guest|budi/i, 'the token carries no guest id or name');
});

test("the browser's lookup key is the server's, and looksLikePass is the reader's shape check", async () => {
  for (const { passId, key } of vectors.lookups) {
    const token = signGuestPass(secret('current'), passId, 1_800_000_000);
    assert.equal(await passLookupKeyInBrowser(token), key);
    assert.equal(passLookupKeyFromToken(token), key);
    assert.ok(looksLikePass(token));
  }
  for (const { token, expect } of vectors.reads) {
    if (expect.kind !== 'invalid') assert.ok(looksLikePass(token), 'a genuine shape');
  }
  assert.equal(await passLookupKeyInBrowser('https://example.invalid/not-a-pass'), null);
  assert.equal(looksLikePass(`${'IVP1.'}${'A'.repeat(47)}=`), false);
});

test('secrets: below 32 bytes ignored; the previous secret verifies but never signs', () => {
  const strong = 'k'.repeat(32);
  assert.equal(passSigningSecret({ GUEST_PASS_SECRET: 'short' }), null);
  assert.deepEqual(passVerifySecrets({ GUEST_PASS_SECRET: 'short', GUEST_PASS_SECRET_PREVIOUS: strong }), [Buffer.from(strong)]);
  assert.equal(passSigningSecret({ GUEST_PASS_SECRET_PREVIOUS: strong }), null);
  assert.deepEqual(passVerifySecrets({ GUEST_PASS_SECRET: strong, GUEST_PASS_SECRET_PREVIOUS: 'p'.repeat(40) }), [Buffer.from(strong), Buffer.from('p'.repeat(40))]);
});

const base: DetailConfig = {
  couple: { bride: { nickName: 'Sari' }, groom: { nickName: 'Budi' } },
  events: [{ title: 'Resepsi', startAt: '2027-02-14T19:00:00+07:00', venueName: 'Aula Contoh', address: 'Jalan Contoh 1' }],
};
const PASS = '/i/budi-sari/abcdefghijklmnopqrstuv/pass';

test('the pass link sits in the RSVP block of every layout, for a recognised guest, only when the page decided it', () => {
  for (const { label, familyId } of LAYOUTS) {
    const config = withFamily(base, familyId);
    const linked = renderGuestPage({ config, guest: fixtureGuest(), guestPassHref: PASS });
    assert.equal(linkHrefs(linked).filter((href) => href === PASS).length, 1, `${label}: one link`);
    assert.match(linked, /Lihat QR pass untuk hari-H/, label);
    assert.ok(!linked.includes('0123456789abcdef0123456789abcdef'), `${label}: the pass id never reaches the page`);
    assert.ok(!linkHrefs(renderGuestPage({ config, guest: fixtureGuest() })).includes(PASS), `${label}: no decision, no link`);
    assert.ok(!linkHrefs(renderGuestPage({ config, guest: null, guestPassHref: PASS })).includes(PASS), `${label}: the shared link never shows a pass`);
  }
});

test('layouts never decide the pass; the personal page does, from the flag, the opt-in and the secret', () => {
  for (const file of ['components/invitation/guest-blocks.tsx', 'components/invitation/public-renderer.tsx', ...LAYOUTS.flatMap(({ familyId }) => (familyId ? [`components/invitation/families/${familyId}.tsx`] : []))]) {
    assert.doesNotMatch(source(file), /GUEST_PASS|passCheckInEnabled|passSigningSecret/, file);
  }
  const page = source('app/i/[slug]/[guestSlug]/page.tsx');
  assert.match(page, /const guestPassHref = guestPassAvailable\(data\) \?/);
  const passPage = source('app/i/[slug]/[guestSlug]/pass/page.tsx');
  assert.match(passPage, /if \(!guestPassAvailable\(data\) \|\| !secret\) notFound\(\);/);
  assert.match(passPage, /signGuestPass\(secret, data\.guest\.passId, expiresAt\)/);
  assert.match(passPage, /robots: \{ index: false, follow: false \}/);
});

test('one rule decides whether a pass exists: a recognised guest, the flag, the opt-in and a secret', () => {
  const secret = 'x'.repeat(32);
  const on = { FLAG_GUEST_PASS: 'on', GUEST_PASS_SECRET: secret };
  const optedIn = { guest: { passId: 'p' }, invitation: { config: { checkInSettings: { enabled: true } } } };
  assert.equal(guestPassAvailable(optedIn, on), true);
  assert.equal(guestPassAvailable({ ...optedIn, guest: null }, on), false, 'the shared link has no guest');
  assert.equal(guestPassAvailable(null, on), false, 'an unknown link');
  assert.equal(guestPassAvailable(optedIn, { ...on, FLAG_GUEST_PASS: 'off' }), false, 'flag off');
  assert.equal(guestPassAvailable(optedIn, { GUEST_PASS_SECRET: secret }), false, 'the flag is off by default');
  assert.equal(guestPassAvailable(optedIn, { FLAG_GUEST_PASS: 'on' }), false, 'no secret');
  assert.equal(guestPassAvailable(optedIn, { ...on, GUEST_PASS_SECRET: 'x'.repeat(31) }), false, 'a secret under 32 bytes');
  assert.equal(guestPassAvailable({ ...optedIn, invitation: { config: {} } }, on), false, 'not opted in');
  assert.equal(guestPassAvailable({ ...optedIn, invitation: { config: { checkInSettings: { enabled: 'true' } } } }, on), false, 'the opt-in is the boolean true');
});
