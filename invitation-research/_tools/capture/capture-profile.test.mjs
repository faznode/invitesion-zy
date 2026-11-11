// Offline tests for capture-profile.mjs (no browser, no network): node --test invitation-research/_tools/capture/capture-profile.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PROFILE, PROFILES, deviceMetrics, emulatedMedia, emulationCommands, emulationMatches, getProfile, lighthouseArgs,
  measurementRecord, reaEnvironment, screenshotName,
} from './capture-profile.mjs';

const UA = 'Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';

test('v1-412 is the default and reproduces the pre-s13 Lighthouse arguments exactly', () => {
  assert.equal(DEFAULT_PROFILE, 'v1-412');
  const pre = ['https://x.test/', '--quiet', '--output=json', '--output-path=/tmp/o.json', '--form-factor=mobile', '--screenEmulation.mobile',
    '--screenEmulation.width=412', '--screenEmulation.height=915', '--screenEmulation.deviceScaleFactor=2.625', '--throttling-method=simulate',
    `--emulated-user-agent=${UA}`, '--only-categories=performance,accessibility,best-practices,seo',
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --lang=id-ID'];
  assert.deepEqual(lighthouseArgs(getProfile(), { url: 'https://x.test/', outPath: '/tmp/o.json', userAgent: UA }), pre);
  assert.deepEqual(deviceMetrics(getProfile()), { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  assert.equal(screenshotName(getProfile()), 'viewport-412.webp');
  assert.deepEqual(reaEnvironment(getProfile()), { viewport: { width: 412, height: 915, device_scale_factor: 2.625 }, locale: 'id-ID',
    timezone: 'Asia/Jakarta', reduced_motion: 'no-preference', service_workers: 'allow' });
});

test('the v2 profiles carry the required viewports, scale factors and motion preferences', () => {
  const expected = { 'v2-412': [412, 915, 2.625, 'no-preference'], 'v2-360': [360, 800, 3, 'no-preference'],
    'v2-390': [390, 844, 3, 'no-preference'], 'v2-412-rm': [412, 915, 2.625, 'reduce'] };
  for (const [name, [w, h, dsf, motion]] of Object.entries(expected)) {
    const p = getProfile(name);
    assert.deepEqual([p.width, p.height, p.dsf, p.motion, p.protocol, p.lean], [w, h, dsf, motion, 'v2', true], name);
  }
  assert.throws(() => getProfile('v2-375'), /unknown --profile v2-375/);
  assert.ok(Object.isFrozen(PROFILES) && Object.isFrozen(PROFILES['v2-360']));
});

test('every channel gets the same profile: CDP metrics, emulated media, REA environment, Lighthouse', () => {
  for (const name of Object.keys(PROFILES)) {
    const p = getProfile(name);
    const args = lighthouseArgs(p, { url: 'u', outPath: 'o', userAgent: UA });
    assert.ok(args.includes(`--screenEmulation.width=${p.width}`) && args.includes(`--screenEmulation.height=${p.height}`), name);
    assert.ok(args.includes(`--screenEmulation.deviceScaleFactor=${p.dsf}`), name);
    assert.equal(args.at(-1).includes('--force-prefers-reduced-motion'), p.motion === 'reduce', name);
    assert.deepEqual(emulatedMedia(p), { features: [{ name: 'prefers-reduced-motion', value: p.motion }] });
    assert.equal(reaEnvironment(p).reduced_motion, p.motion);
    assert.equal(reaEnvironment(p).viewport.width, p.width);
    assert.deepEqual(deviceMetrics(p, 1), { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: true });
  }
  assert.equal(screenshotName(getProfile('v2-360')), 'viewport-v2-360.webp');
});

test('emulation verification uses screen size, scale factor, motion and UA, never the page-controlled innerWidth', () => {
  const p = getProfile('v2-360');
  const good = { android: true, screenWidth: 360, screenHeight: 800, width: 980, dpr: 3, reducedMotion: false };
  assert.deepEqual(emulationMatches(p, good), { ok: true, mismatches: [] }); // innerWidth 980 = page without a viewport meta
  assert.match(emulationMatches(p, { ...good, screenWidth: 412 }).mismatches.join(), /screen.width 412 != 360/);
  assert.match(emulationMatches(p, { ...good, dpr: 2.625 }).mismatches.join(), /devicePixelRatio/);
  assert.match(emulationMatches(p, { ...good, reducedMotion: true }).mismatches.join(), /prefers-reduced-motion reduce != no-preference/);
  assert.match(emulationMatches(getProfile('v2-412-rm'), { ...good, screenWidth: 412, screenHeight: 915, dpr: 2.625 }).mismatches.join(), /no-preference != reduce/);
  assert.match(emulationMatches(p, { ...good, android: false }).mismatches.join(), /Android UA/);
  assert.equal(emulationMatches(p, null).ok, false);
});

test('v2 re-applies emulation by clearing the device metrics first; v1-412 keeps its single pre-s13 call', () => {
  // Chrome ignores a re-sent identical setDeviceMetricsOverride after REA's disconnect wiped it (s13 pilot C-WEV-201..204).
  assert.deepEqual(emulationCommands(getProfile()),
    [['Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }]]);
  for (const name of Object.keys(PROFILES).filter((n) => n !== DEFAULT_PROFILE)) {
    const p = getProfile(name);
    const commands = emulationCommands(p);
    assert.deepEqual(commands.map(([method]) => method),
      ['Emulation.clearDeviceMetricsOverride', 'Emulation.setDeviceMetricsOverride', 'Emulation.setEmulatedMedia'], name);
    assert.deepEqual(commands[1][1], deviceMetrics(p), name);
    assert.deepEqual(commands[2][1], emulatedMedia(p), name);
  }
  assert.equal(measurementRecord(getProfile('v2-360')).cdp_reapply, 'clear + set');
  assert.equal(measurementRecord(getProfile()).cdp_reapply, 'set (pre-s13)');
});

test('the measurement record names protocol, profile, viewport, motion, method and the verification result', () => {
  const p = getProfile('v2-412-rm');
  const rec = measurementRecord(p, { ok: true, mismatches: [] });
  assert.deepEqual([rec.protocol, rec.profile, rec.reduced_motion, rec.emulation_verified], ['v2', 'v2-412-rm', 'reduce', true]);
  assert.deepEqual(rec.viewport, { width: 412, height: 915, device_scale_factor: 2.625 });
  assert.deepEqual(rec.lighthouse_screen, { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  assert.match(rec.lighthouse_motion, /force-prefers-reduced-motion/);
  assert.match(rec.method, /lean/);
  assert.equal(measurementRecord(getProfile()).emulation_verified, null);
  assert.doesNotMatch(measurementRecord(getProfile()).method, /lean/);
});
