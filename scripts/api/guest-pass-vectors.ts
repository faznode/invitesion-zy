/**
 * Generates `contracts/vectors/guest-pass.json` from the TypeScript guest-pass rules (B-024, D-056). Both writers' suites
 * run the file: `tests/b024-guest-pass.test.ts` and `services/api/tests/guest_pass_vectors.rs`. After a rule change,
 * regenerate it here and make the Rust port agree; `--check` fails instead of writing when the file is stale.
 *
 *   npx tsx scripts/api/guest-pass-vectors.ts [--check]   # from the repository root
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkInTime,
  GUEST_PASS_PREFIX,
  normalizedPassScans,
  passCheckInEnabled,
  passCheckinCanonical,
  passCheckinHash,
  passCheckinScope,
  passExpiresAt,
  passLookupKey,
  passManualAllowed,
  readGuestPass,
  signGuestPass,
} from '../../lib/invitation/guest-pass';

const OUT = join(process.cwd(), 'contracts/vectors/guest-pass.json');
const SECRETS = { current: 'vector-guest-pass-secret-current-0001', previous: 'vector-guest-pass-secret-previous-0002', other: 'vector-guest-pass-secret-forger-00003' };
type SecretName = keyof typeof SECRETS;
const bytes = (name: SecretName) => Buffer.from(SECRETS[name]);

const ID_A = '0123456789abcdef0123456789abcdef';
const ID_B = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';
const EXP = 1_800_000_000;

const signs = [
  { secret: 'current' as SecretName, passId: ID_A, expiresAt: EXP },
  { secret: 'current' as SecretName, passId: ID_B, expiresAt: 0 },
  { secret: 'previous' as SecretName, passId: ID_A, expiresAt: 0xffff_ffff },
  { secret: 'other' as SecretName, passId: ID_B, expiresAt: EXP },
].map((input) => ({ ...input, token: signGuestPass(bytes(input.secret), input.passId, input.expiresAt) }));

const genuine = signs[0].token;
const previous = signGuestPass(bytes('previous'), ID_A, EXP);
const forged = signGuestPass(bytes('other'), ID_A, EXP);
const flip = (token: string, at: number) => token.slice(0, at) + (token[at] === 'A' ? 'B' : 'A') + token.slice(at + 1);

const readCases: { name: string; token: string; secrets: SecretName[]; now: number }[] = [
  { name: 'genuine, current secret', token: genuine, secrets: ['current'], now: EXP - 1 },
  { name: 'genuine at its expiry second', token: genuine, secrets: ['current'], now: EXP },
  { name: 'genuine, one second past expiry', token: genuine, secrets: ['current'], now: EXP + 1 },
  { name: 'previous secret during a rotation', token: previous, secrets: ['current', 'previous'], now: EXP - 1 },
  { name: 'previous secret after the rotation', token: previous, secrets: ['current'], now: EXP - 1 },
  { name: 'forged with another secret', token: forged, secrets: ['current', 'previous'], now: EXP - 1 },
  { name: 'forged and past expiry: still invalid, expiry never revealed', token: forged, secrets: ['current'], now: EXP + 10 },
  { name: 'a pass id character changed', token: flip(genuine, GUEST_PASS_PREFIX.length + 3), secrets: ['current'], now: EXP - 1 },
  { name: 'an expiry character changed', token: flip(genuine, GUEST_PASS_PREFIX.length + 23), secrets: ['current'], now: EXP - 1 },
  { name: 'a MAC character changed', token: flip(genuine, genuine.length - 1), secrets: ['current'], now: EXP - 1 },
  { name: 'another version prefix', token: `IVP2.${genuine.slice(5)}`, secrets: ['current'], now: EXP - 1 },
  { name: 'lower-case prefix', token: `ivp1.${genuine.slice(5)}`, secrets: ['current'], now: EXP - 1 },
  { name: 'one character short', token: genuine.slice(0, -1), secrets: ['current'], now: EXP - 1 },
  { name: 'one character long', token: `${genuine}A`, secrets: ['current'], now: EXP - 1 },
  { name: 'standard base64 alphabet', token: genuine.slice(0, -2) + '+/', secrets: ['current'], now: EXP - 1 },
  { name: 'padding character', token: genuine.slice(0, -1) + '=', secrets: ['current'], now: EXP - 1 },
  { name: 'a non-ASCII character', token: genuine.slice(0, -1) + 'é', secrets: ['current'], now: EXP - 1 },
  { name: 'the empty string', token: '', secrets: ['current'], now: EXP - 1 },
  { name: 'a guest link, not a pass', token: 'https://invitesion.id/i/budi-sari/abcdefghijklmnopqrstuv', secrets: ['current'], now: EXP - 1 },
  { name: 'no accepted secret', token: genuine, secrets: [], now: EXP - 1 },
];
const reads = readCases.map((input) => ({ ...input, expect: readGuestPass(input.token, input.secrets.map(bytes), input.now) }));

const NOW = '2026-11-07T12:00:00.000Z';
const scanCases: { name: string; scannedAt: string | null; now: string }[] = [
  { name: 'within the day, milliseconds', scannedAt: '2026-11-07T11:30:00.250Z', now: NOW },
  { name: 'within the day, whole seconds', scannedAt: '2026-11-07T08:15:42Z', now: NOW },
  { name: 'within the day, one fraction digit', scannedAt: '2026-11-07T11:30:00.1Z', now: NOW },
  { name: 'exactly one day old', scannedAt: '2026-11-06T12:00:00.000Z', now: NOW },
  { name: 'older than a day: the oldest kept time', scannedAt: '2026-11-05T11:30:00Z', now: NOW },
  { name: 'in the future: now', scannedAt: '2026-11-07T13:00:00Z', now: NOW },
  { name: 'absent: now', scannedAt: null, now: NOW },
  { name: 'empty: now', scannedAt: '', now: NOW },
  { name: 'a leap second: now', scannedAt: '2026-11-07T11:30:60Z', now: NOW },
  { name: '30 February: now (no roll-over)', scannedAt: '2026-02-30T10:00:00Z', now: '2026-03-02T12:00:00.000Z' },
  { name: 'hour 24: now (no roll-over)', scannedAt: '2026-11-06T24:00:00Z', now: NOW },
  { name: 'a space separator: now', scannedAt: '2026-11-07 11:30:00Z', now: NOW },
  { name: 'lower-case z: now', scannedAt: '2026-11-07T11:30:00z', now: NOW },
  { name: 'an offset: now', scannedAt: '2026-11-07T18:30:00+07:00', now: NOW },
  { name: 'four fraction digits: now', scannedAt: '2026-11-07T11:30:00.1234Z', now: NOW },
];
const scanTimes = scanCases.map((input) => ({ ...input, expect: checkInTime(input.scannedAt ?? undefined, new Date(input.now)).toISOString() }));

const enabledCases: { name: string; config: unknown }[] = [
  { name: 'opted in', config: { checkInSettings: { enabled: true, allowManual: true, requireQr: false } } },
  { name: 'switched off', config: { checkInSettings: { enabled: false } } },
  { name: 'a string, not a boolean', config: { checkInSettings: { enabled: 'true' } } },
  { name: 'a number, not a boolean', config: { checkInSettings: { enabled: 1 } } },
  { name: 'no settings', config: { couple: { brideName: 'Sari' } } },
  { name: 'settings null', config: { checkInSettings: null } },
  { name: 'settings an array', config: { checkInSettings: [true] } },
  { name: 'no config', config: null },
];
const enabled = enabledCases.map((input) => ({ ...input, expect: passCheckInEnabled(input.config) }));
const manual = [
  { name: 'defaults', config: { checkInSettings: { enabled: true } } },
  { name: 'manual off', config: { checkInSettings: { enabled: true, allowManual: false } } },
  { name: 'QR required', config: { checkInSettings: { enabled: true, requireQr: true } } },
  { name: 'no settings', config: {} },
].map((input) => ({ ...input, expect: passManualAllowed(input.config) }));

const lookups = [ID_A, ID_B, '00000000000000000000000000000000'].map((passId) => ({ passId, key: passLookupKey(passId) }));
const expiries = [
  { name: 'two days after the last end', events: [{ startAt: '2027-02-14T10:00:00+07:00', endAt: '2027-02-14T13:00:00+07:00' }, { startAt: '2027-02-15T19:00:00+07:00' }], issuedAt: 1_794_052_800 },
  { name: 'an end before its start still counts its start', events: [{ startAt: '2027-02-14T10:00:00+07:00', endAt: '2027-02-13T10:00:00+07:00' }], issuedAt: 1_794_052_800 },
  { name: 'no dated event: 30 days from the next UTC midnight', events: [{ startAt: '' }, {}], issuedAt: 1_794_052_800 },
  { name: 'unparseable dates are skipped', events: [{ startAt: 'besok sore' }, { startAt: '2027-01-01T08:00:00Z' }], issuedAt: 1_794_052_800 },
].map((input) => ({ ...input, expect: passExpiresAt(input.events, input.issuedAt) }));

// A batch's idempotency record is shared by both writers (D-056): `sent` is what the API receives, `canonical` its
// serialised request and `hash` the record's request hash, so a batch one writer answered replays through the other.
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join('');
const requests = [
  { name: 'one scan with its time', scans: [{ token: genuine, scannedAt: '2026-11-07T11:30:00.250Z' }] },
  { name: 'a scan without a time', scans: [{ token: genuine }] },
  { name: 'an empty time is no time', scans: [{ token: genuine, scannedAt: '' }] },
  { name: 'two scans keep their order', scans: [{ token: previous, scannedAt: '2026-11-07T08:15:42Z' }, { token: genuine }] },
  { name: 'quotes and backslashes are escaped alike', scans: [{ token: 'a"b\\c', scannedAt: '"\\' }] },
  { name: 'every printable ASCII character', scans: [{ token: PRINTABLE, scannedAt: PRINTABLE.slice(0, 40) }] },
].map((input) => ({ ...input, sent: normalizedPassScans(input.scans), canonical: passCheckinCanonical(input.scans), hash: passCheckinHash(input.scans) }));
const scopes = [
  [7, 11],
  [2_147_483_647, 2_147_483_647],
].map(([owner, invitation]) => ({ owner, invitation, scope: passCheckinScope(owner, invitation) }));

const out = {
  description:
    'B-024 (D-056): the guest pass. Generated by scripts/api/guest-pass-vectors.ts from lib/invitation/guest-pass.ts; services/api/src/roster/pass.rs must agree (services/api/tests/guest_pass_vectors.rs).',
  secrets: SECRETS,
  signs,
  reads,
  scanTimes,
  enabled,
  manual,
  lookups,
  expiries,
  requests,
  scopes,
};
const text = `${JSON.stringify(out, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== text) {
    console.error(`stale: ${OUT} differs from the rules; run without --check`);
    process.exit(1);
  }
  console.log('guest-pass vectors current');
} else {
  writeFileSync(OUT, text);
  const kinds = reads.reduce<Record<string, number>>((count, { expect }) => ({ ...count, [expect.kind]: (count[expect.kind] ?? 0) + 1 }), {});
  console.log('reads', reads.length, JSON.stringify(kinds), 'scan times', scanTimes.length, 'enabled', enabled.length, 'signs', signs.length);
}
