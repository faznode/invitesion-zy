// capture-profile.mjs — measurement profiles for capture.mjs (protocol v1.2 and v2, session 13).
//
// A profile fixes everything that defines a measurement population: CSS viewport, device scale factor, motion
// preference, protocol version and method. Captures of different profiles are different populations: they are never
// merged into one median (protocol.md §2.3, eligibility.py PROFILES, benchmark-pack.md §7).
//
// v1-412 reproduces the pre-s13 capture exactly (the regression test pins its Lighthouse arguments). The v2 profiles
// share one method: the REA scenario drives the visit, CDP adds the structure, layout and motion probes, Lighthouse
// measures the cold load; REA inspect-web-page / analyze-web-bundle are skipped ("lean") to keep a four-profile batch
// inside a session. v2-412 is the same-session control, so viewport and motion effects are paired per theme.

export const DEFAULT_PROFILE = 'v1-412';

export const PROFILES = Object.freeze({
  'v1-412': Object.freeze({ protocol: 'v1.2', width: 412, height: 915, dsf: 2.625, motion: 'no-preference', lean: false }),
  'v2-412': Object.freeze({ protocol: 'v2', width: 412, height: 915, dsf: 2.625, motion: 'no-preference', lean: true }),
  'v2-360': Object.freeze({ protocol: 'v2', width: 360, height: 800, dsf: 3, motion: 'no-preference', lean: true }),
  'v2-390': Object.freeze({ protocol: 'v2', width: 390, height: 844, dsf: 3, motion: 'no-preference', lean: true }),
  'v2-412-rm': Object.freeze({ protocol: 'v2', width: 412, height: 915, dsf: 2.625, motion: 'reduce', lean: true }),
});

export function getProfile(name = DEFAULT_PROFILE) {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`unknown --profile ${name} (known: ${Object.keys(PROFILES).join(', ')})`);
  return { name, ...profile };
}

/** CDP Emulation.setDeviceMetricsOverride parameters. The screenshot pass uses scale factor 1 to keep thumbnails small. */
export const deviceMetrics = (profile, deviceScaleFactor = profile.dsf) =>
  ({ width: profile.width, height: profile.height, deviceScaleFactor, mobile: true });

/** CDP Emulation.setEmulatedMedia parameters: the motion preference is set explicitly in both directions. */
export const emulatedMedia = (profile) => ({ features: [{ name: 'prefers-reduced-motion', value: profile.motion }] });

/** The CDP commands, in order, that (re)apply a profile's emulation in the capture session. REA's connect-mode scenario
 *  wipes this session's device metrics and emulated media when it disconnects, and Chrome treats a re-sent
 *  setDeviceMetricsOverride with unchanged parameters as already applied, so the page kept devicePixelRatio 1 and an
 *  800 × 600 screen (s13 pilot C-WEV-201..204; reproduced on a local page, verify-profiles.mjs channel cdp-after-rea).
 *  v2 therefore clears before it sets. v1-412 keeps its pre-s13 single call so v1.2 captures stay reproducible. */
export function emulationCommands(profile) {
  if (profile.protocol !== 'v2') return [['Emulation.setDeviceMetricsOverride', deviceMetrics(profile)]];
  return [['Emulation.clearDeviceMetricsOverride', {}], ['Emulation.setDeviceMetricsOverride', deviceMetrics(profile)],
    ['Emulation.setEmulatedMedia', emulatedMedia(profile)]];
}

/** REA capture-browser-scenario `environment` (REA defaults reduced_motion to "reduce"; a normal guest has no preference). */
export const reaEnvironment = (profile) => ({
  viewport: { width: profile.width, height: profile.height, device_scale_factor: profile.dsf },
  locale: 'id-ID', timezone: 'Asia/Jakarta', reduced_motion: profile.motion, service_workers: 'allow',
});

/** Lighthouse CLI arguments. Lighthouse has no motion setting, so the reduce profile starts its Chrome with the
 *  `--force-prefers-reduced-motion` switch (verified s13: matchMedia reports reduce under Lighthouse's own Chrome). */
export function lighthouseArgs(profile, { url, outPath, userAgent }) {
  const chromeFlags = ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--lang=id-ID'];
  if (profile.motion === 'reduce') chromeFlags.push('--force-prefers-reduced-motion');
  return [url, '--quiet', '--output=json', `--output-path=${outPath}`, '--form-factor=mobile', '--screenEmulation.mobile',
    `--screenEmulation.width=${profile.width}`, `--screenEmulation.height=${profile.height}`,
    `--screenEmulation.deviceScaleFactor=${profile.dsf}`, '--throttling-method=simulate', `--emulated-user-agent=${userAgent}`,
    '--only-categories=performance,accessibility,best-practices,seo', `--chrome-flags=${chromeFlags.join(' ')}`];
}

export const screenshotName = (profile) => (profile.name === DEFAULT_PROFILE ? 'viewport-412.webp' : `viewport-${profile.name}.webp`);

export const methodText = (profile) => (profile.lean
  ? `protocol ${profile.protocol} (lean): REA scenario + CDP structure / layout / motion probes + Lighthouse; no REA inspect or bundle analysis`
  : `protocol ${profile.protocol}: REA scenario + REA inspect-web-page / analyze-web-bundle + CDP structure pass + Lighthouse`);

/** The `measurement` block written into every capture summary since s13. */
export function measurementRecord(profile, verification = null) {
  return {
    protocol: profile.protocol, profile: profile.name,
    viewport: { width: profile.width, height: profile.height, device_scale_factor: profile.dsf },
    reduced_motion: profile.motion, method: methodText(profile),
    lighthouse_screen: { width: profile.width, height: profile.height, deviceScaleFactor: profile.dsf, mobile: true },
    lighthouse_motion: profile.motion === 'reduce' ? 'chrome --force-prefers-reduced-motion' : 'no-preference (default)',
    cdp_reapply: profile.protocol === 'v2' ? 'clear + set' : 'set (pre-s13)',
    emulation_verified: verification ? verification.ok : null, emulation_mismatches: verification ? verification.mismatches : null,
  };
}

/** Emulation actually seen by the page. screen.* follows the emulated device; innerWidth follows the page's own viewport
 *  meta (a page without one lays out at 980 px), so innerWidth is recorded but never used to verify the emulation. */
export const EMULATION_PROBE_V2 = `({ android: navigator.userAgent.includes('Android'), screenWidth: screen.width, screenHeight: screen.height,
  width: innerWidth, dpr: devicePixelRatio, coarsePointer: matchMedia('(pointer: coarse)').matches,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })`;

/** Compare an EMULATION_PROBE_V2 result with the profile. */
export function emulationMatches(profile, probe) {
  const mismatches = [];
  if (!probe) return { ok: false, mismatches: ['no probe result'] };
  if (probe.screenWidth !== profile.width) mismatches.push(`screen.width ${probe.screenWidth} != ${profile.width}`);
  if (probe.screenHeight !== profile.height) mismatches.push(`screen.height ${probe.screenHeight} != ${profile.height}`);
  if (Math.abs((probe.dpr ?? 0) - profile.dsf) > 0.001) mismatches.push(`devicePixelRatio ${probe.dpr} != ${profile.dsf}`);
  if (probe.reducedMotion !== (profile.motion === 'reduce')) mismatches.push(`prefers-reduced-motion ${probe.reducedMotion ? 'reduce' : 'no-preference'} != ${profile.motion}`);
  if (!probe.android) mismatches.push('user agent is not the Android UA');
  return { ok: mismatches.length === 0, mismatches };
}

// Layout at the emulated viewport, structure only (no copy). Horizontal overflow counts elements that extend past the
// viewport without an ancestor that clips or scrolls them; small text = visible text below 12 px; small targets =
// visible interactive elements under 24 × 24 CSS px (WCAG 2.2 SC 2.5.8 minimum, spacing exceptions not evaluated).
export const LAYOUT_PROBE = `(() => {
  const vw = innerWidth, scan = [...document.body ? document.body.querySelectorAll('*') : []].slice(0, 4000);
  const visible = (el, r) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true; } return false; };
  let overflowing = 0, smallText = 0, smallTargets = 0, targets = 0;
  for (const el of scan) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    if (r.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !clipped(el)) overflowing += 1;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (ownText && parseFloat(getComputedStyle(el).fontSize) < 12) smallText += 1;
    if (el.matches('a[href],button,[role=button],input:not([type=hidden]),select,textarea,summary')) { targets += 1; if (r.width < 24 || r.height < 24) smallTargets += 1; }
  }
  const meta = (document.querySelector('meta[name=viewport]') || {}).content || '';
  const compact = meta.replace(/\\s/g, '').toLowerCase();
  return { innerWidth: vw, scrollWidth: document.documentElement.scrollWidth, horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
    overflowingElements: overflowing, smallTextElements: smallText, interactiveTargets: targets, smallTargets,
    viewportMeta: meta.slice(0, 120), zoomBlocked: /user-scalable=(no|0)/.test(compact) || /maximum-scale=1(\\.0*)?(,|$)/.test(compact) };
})()`;

// Motion actually running in the page, structure only. getAnimations() covers CSS animations, CSS transitions and Web
// Animations; library timelines (GSAP) are counted separately because they may drive styles without WAAPI objects.
export const MOTION_PROBE = `(() => {
  const all = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
  const running = all.filter((a) => a.playState === 'running');
  const kind = (a) => (a.constructor && a.constructor.name) || 'Animation';
  const infinite = running.filter((a) => { try { return a.effect && a.effect.getTiming().iterations === Infinity; } catch { return false; } }).length;
  const gsap = window.gsap && window.gsap.globalTimeline && typeof window.gsap.globalTimeline.getChildren === 'function'
    ? window.gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.isActive && t.isActive()).length : null;
  return { reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches, animations: all.length, running: running.length,
    runningCssAnimations: running.filter((a) => kind(a) === 'CSSAnimation').length, runningCssTransitions: running.filter((a) => kind(a) === 'CSSTransition').length,
    runningWebAnimations: running.filter((a) => kind(a) === 'Animation').length, runningInfinite: infinite, gsapActiveTweens: gsap,
    playingVideos: [...document.querySelectorAll('video')].filter((v) => !v.paused).length };
})()`;
