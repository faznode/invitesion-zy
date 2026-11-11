#!/usr/bin/env node
// Throwaway research tool (allowed by the run's scope guard): observe ONE public page the way a
// normal mobile visitor would, then record evidence with REA + a Lighthouse lab run.
//
//   node capture.mjs --id C-ENV-003 --competitor enviory --kind demo --url https://… \
//     [--open-cover] [--lighthouse] [--own] [--settle 5000] [--driver rea|cdp] [--profile v1-412|v2-412|v2-360|v2-390|v2-412-rm]
//
// --profile (s13, capture-profile.mjs) fixes viewport, scale factor, motion preference, protocol and method for every
// channel (CDP, REA, Lighthouse). The default v1-412 behaves exactly as before s13; v2 profiles add the layout and motion
// probes, verify the emulation the page actually saw, and record a `measurement` block in the summary.
//
// Driver (s06): by default REA `capture-browser-scenario` (connect mode) performs the visit (navigation, settle,
// keyboard scroll, network/console events); this script keeps only what REA does not cover: the optional cover click
// (REA scenarios have no conditional step, so a missing cover would abort the visit), mobile UA/touch emulation,
// the text-based structure/feature pass, animation-library detection, the WebP thumbnail and Lighthouse.
// If REA fails a step, the CDP path takes over and the summary records driver "rea+cdp-fallback" or "cdp-fallback".
//
// Rules enforced here (invitation-research/_rea-playbook.md):
//   R1  no form submission, no login, no probing — one navigation, optional cover click, scroll.
//   R7  competitor screenshots go to _private/ only; summaries in raw/ hold no page copy or PII.
//   R8  robots.txt is honoured and requests to one origin are spaced >= 1.5 s apart.
// Needs: a CDP browser on 127.0.0.1:9222, the pinned REA CLI, Lighthouse 12 (paths below).

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { robotsStatusVerdict, robotsUnreachable, robotsVerdict } from './robots.mjs';
import { hasToken, loadMap, pseudonymizeText, redactDemoNames, resolveTokens, saveMap } from '../safety/pseudonymize.mjs';
import {
  DEFAULT_PROFILE, EMULATION_PROBE_V2, LAYOUT_PROBE, MOTION_PROBE, deviceMetrics, emulationCommands, emulationMatches, getProfile,
  lighthouseArgs, measurementRecord, reaEnvironment, screenshotName,
} from './capture-profile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESEARCH = join(HERE, '..', '..');
// The hosting sandbox can overwrite .gitignore, so private evidence may live outside the project.
const PRIVATE = process.env.INVITESION_PRIVATE_DIR ?? join(RESEARCH, '_private');
const CDP = process.env.CDP_HTTP ?? 'http://127.0.0.1:9222';
const NODE24 = process.env.REA_NODE ?? '/vercel/share/work/tools/node-v24.22.2-linux-x64/bin/node';
const REA = process.env.REA_BIN ?? '/vercel/share/work/tools/rea-cli/node_modules/rea-agents/scripts/rea.mjs';
const LIGHTHOUSE = process.env.LH_BIN ?? '/vercel/share/work/tools/lh/node_modules/.bin/lighthouse';
const CHROME = process.env.CHROME_PATH ?? '/vercel/share/work/tools/ms-playwright/chromium-1248/chrome-linux64/chrome';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith('--')) pairs.push([token.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? true : all[index + 1]]);
    return pairs;
  }, []),
);
for (const required of ['id', 'competitor', 'url']) if (!args[required]) throw new Error(`--${required} is required`);
const own = Boolean(args.own);
const settle = Number(args.settle ?? 5000);
const profile = getProfile(typeof args.profile === 'string' ? args.profile : DEFAULT_PROFILE);
const v2 = profile.name !== DEFAULT_PROFILE;
// Committed queues carry pseudonymized slugs (rdct-…, _tools/safety/slug-rules.json): visit the real page, but
// everything written into the repo (summary, capture index) goes through pseudonymizeText.
const redactionMap = loadMap(PRIVATE);
const visitUrl = resolveTokens(String(args.url), redactionMap);
// s06 (REA verification Step 0.4): REA drives the visit by default. `--driver cdp` restores the pre-s06 behaviour.
const driver = args.driver === 'cdp' ? 'cdp' : 'rea';
const REA_VERSION = (spawnSync(NODE24, [REA, '--version'], { encoding: 'utf8' }).stdout || '').trim() || 'unknown';
// Extra settle time REA waits with --open-cover, so the CDP cover click (taken inside REA's settle window) has finished
// its opening animation before REA starts scrolling.
// The cover click waits up to COVER_SETTLE_MAX_MS for an animated control to settle (rocaille's intro runs 10+ s).
const COVER_SETTLE_MAX_MS = 9000;
const EMULATION_PROBE = `({ android: navigator.userAgent.includes('Android'), width: innerWidth, dpr: devicePixelRatio,
  coarsePointer: matchMedia('(pointer: coarse)').matches, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })`;
const safeParse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const wib = () => new Date(Date.now() + 7 * 3600e3).toISOString().replace('Z', '+07:00');

// ---------- politeness ----------
const statePath = '/tmp/capture-politeness.json';
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
async function polite(origin) {
  const wait = (state[origin] ?? 0) + 1500 - Date.now();
  if (wait > 0) await sleep(wait);
  state[origin] = Date.now();
  writeFileSync(statePath, JSON.stringify(state));
}
async function robotsAllows(url) {
  const { origin, pathname, search } = new URL(url);
  await polite(origin);
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': ANDROID_UA }, signal: AbortSignal.timeout(10000) });
    return robotsStatusVerdict(res.status) ?? robotsVerdict(await res.text(), pathname + search);
  } catch (error) {
    return robotsUnreachable(error.name);
  }
}

// ---------- minimal CDP client (Node 24 has a global WebSocket) ----------
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    } else if (message.method) listeners.forEach((listener) => listener(message));
  });
  const ready = new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  return {
    ready,
    send: (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }),
    on: (listener) => listeners.push(listener),
    close: () => socket.close(),
  };
}

// Structure-only fingerprint evaluated in the page. Returns no paragraphs, names or numbers.
const FINGERPRINT = `(() => {
  const redact = (s) => (s || '').replace(/\\d[\\d .-]{5,}\\d/g, '#').replace(/\\s+/g, ' ').trim().slice(0, 60);
  const w = window;
  const libs = {
    gsap: !!w.gsap, scrollTrigger: !!(w.ScrollTrigger || (w.gsap && w.gsap.plugins && w.gsap.plugins.scrollTrigger)),
    aos: !!w.AOS || !!document.querySelector('[data-aos]'), animateCss: !!document.querySelector('[class*="animate__"]'),
    wow: !!w.WOW, swiper: !!w.Swiper || !!document.querySelector('.swiper'), slick: !!(w.jQuery && w.jQuery.fn && w.jQuery.fn.slick),
    owl: !!document.querySelector('.owl-carousel'), lottie: !!w.lottie || !!w.bodymovin || !!document.querySelector('lottie-player,dotlottie-player'),
    three: !!w.THREE || !!document.querySelector('canvas[data-engine*="three"]'), pixi: !!w.PIXI, anime: !!w.anime, motionOne: !!w.Motion,
    howler: !!w.Howl, jquery: !!w.jQuery, bootstrap: !!document.querySelector('link[href*="bootstrap"],script[src*="bootstrap"]'),
    tailwind: !!document.querySelector('[class*="tw-"],[class*=" md:"],[class^="md:"]'), alpine: !!w.Alpine, vue: !!w.Vue || !!document.querySelector('[data-v-app],#__nuxt'),
    nuxt: !!w.__NUXT__ || !!document.querySelector('#__nuxt'), next: !!w.__NEXT_DATA__ || !!document.querySelector('#__next') || !!w.__next_f,
    react: !!document.querySelector('[data-reactroot]') || !!w.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size, svelte: !!document.querySelector('[class*="svelte-"]'),
    flutterWeb: !!document.querySelector('flt-glass-pane,flutter-view'), wordpress: !!document.querySelector('link[href*="wp-content"],script[src*="wp-content"]'),
    elementor: !!document.querySelector('[class*="elementor"]'), livewire: !!w.Livewire, inertia: !!document.querySelector('[data-page]'),
  };
  const sections = [...document.querySelectorAll('section, [class*="section"], [id*="section"]')]
    .filter((el) => el.getBoundingClientRect().height > 120 && !el.parentElement.closest('section'))
    .slice(0, 40)
    .map((el) => ({ tag: el.tagName.toLowerCase(), id: (el.id || '').slice(0, 40), cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').split(/\\s+/).slice(0, 4).join(' ').slice(0, 80),
      heading: redact((el.querySelector('h1,h2,h3')||{}).textContent), h: Math.round(el.getBoundingClientRect().height) }));
  const buttons = [...document.querySelectorAll('button, a[role="button"], .btn, [class*="button"]')].map((b) => redact(b.textContent) || redact(b.getAttribute('aria-label'))).filter(Boolean);
  const media = {
    audio: [...document.querySelectorAll('audio, audio source')].map((a) => ({ autoplay: a.autoplay || false, loop: a.loop || false, type: (a.src || a.getAttribute('src') || '').split('?')[0].split('.').pop().slice(0, 5) })),
    video: document.querySelectorAll('video').length, iframes: [...document.querySelectorAll('iframe')].map((f) => { try { return new URL(f.src, location.href).hostname; } catch { return 'invalid'; } }),
    canvases: document.querySelectorAll('canvas').length, svgs: document.querySelectorAll('svg').length, images: document.images.length,
    lazyImages: [...document.images].filter((i) => i.loading === 'lazy').length,
  };
  const forms = [...document.forms].map((f) => ({ fields: [...f.elements].map((e) => e.type || e.tagName.toLowerCase()).slice(0, 12), hasRadio: !!f.querySelector('input[type=radio]'), hasSelect: !!f.querySelector('select') }));
  const fontsUsed = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))].slice(0, 20);
  const text = document.body ? document.body.innerText : '';
  const has = (re) => re.test(text);
  // C-ENV-112: Enviory's rocaille gate is a photo-frame button named only by aria-label="Buka undangan" (no visible text).
  const coverWords = /buka undangan|open (the )?invitation|view (the )?invitation|lihat undangan|tap (to open|the envelope)|ketuk untuk (membuka|buka)/i;
  const features = {
    coverGate: has(coverWords) || [...document.querySelectorAll('[aria-label]')].some((el) => coverWords.test(el.getAttribute('aria-label'))), toGuest: has(/kepada yth|dear|to:/i) || /[?&](to|kpd|untuk|u)=/.test(location.search),
    countdown: !!document.querySelector('[class*="countdown"],[id*="countdown"]') || has(/\\b(hari|days)\\b[\\s\\S]{0,40}\\b(jam|hours)\\b/i),
    rsvp: has(/rsvp|konfirmasi kehadiran|kehadiran/i), wishes: has(/ucapan|doa|wishes|guestbook|buku tamu/i),
    gift: has(/amplop digital|kado digital|wedding gift|hadiah|rekening|transfer|qris|e-wallet|gopay|ovo|dana/i),
    copyButton: buttons.some((b) => /salin|copy/i.test(b)), maps: media.iframes.some((h) => /google\\.|maps/.test(h)) || has(/google maps|lihat lokasi|petunjuk arah/i),
    calendar: has(/save the date|simpan tanggal|add to calendar|tambah ke kalender|google calendar/i), livestream: has(/live ?stream|siaran langsung|youtube live/i),
    qr: has(/qr code|kode qr|check-in/i), loveStory: has(/love story|kisah cinta|cerita kami|our story/i), gallery: has(/galeri|gallery|moment/i),
    dressCode: has(/dress ?code/i), quranVerse: has(/QS\\.|Ar-Rum|surah|ayat/i), protocol: has(/protokol kesehatan|health protocol/i),
    timezoneLabel: (text.match(/\\b(WIB|WITA|WIT)\\b/g) || []).filter((v, i, a) => a.indexOf(v) === i), watermark: has(/powered by|dibuat (dengan|oleh)|made with|undangan digital oleh/i),
    instagramFilter: has(/instagram filter|filter instagram/i), musicControl: !!document.querySelector('[class*="music"],[id*="music"],[class*="audio"],[aria-label*="music" i]'),
  };
  return { title: redact(document.title), lang: document.documentElement.lang, generator: (document.querySelector('meta[name=generator]')||{}).content || null,
    viewport: (document.querySelector('meta[name=viewport]')||{}).content || null, og: { image: !!document.querySelector('meta[property="og:image"]'), title: !!document.querySelector('meta[property="og:title"]'), description: !!document.querySelector('meta[property="og:description"]') },
    reducedMotionCss: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.media && /prefers-reduced-motion/.test(r.media.mediaText)); } catch { return false; } }),
    libs, sections, sectionCount: sections.length, buttons: [...new Set(buttons)].slice(0, 25), media, forms, fontsUsed, features,
    domNodes: document.getElementsByTagName('*').length, docHeight: document.documentElement.scrollHeight };
})()`;

async function observe(url) {
  await polite(new URL(url).origin);
  const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = connect(target.webSocketDebuggerUrl);
  await page.ready;
  const requests = new Map();
  page.on((message) => {
    if (message.method === 'Network.responseReceived') {
      const { requestId, type, response } = message.params;
      requests.set(requestId, { type, url: response.url, mime: response.mimeType, status: response.status, protocol: response.protocol, bytes: 0, fromCache: response.fromDiskCache });
    } else if (message.method === 'Network.loadingFinished' && requests.has(message.params.requestId)) {
      requests.get(message.params.requestId).bytes = message.params.encodedDataLength;
    }
  });
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Network.setUserAgentOverride', { userAgent: ANDROID_UA, acceptLanguage: 'id-ID,id;q=0.9,en;q=0.6', platform: 'Android' });
  const applyEmulation = async () => {
    for (const [method, params] of emulationCommands(profile)) await page.send(method, params);
  };
  await applyEmulation();
  await page.send('Page.enable');
  const loadFired = () => new Promise((resolve) => page.on((m) => m.method === 'Page.loadEventFired' && resolve()));
  const evaluate = async (expression) => (await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  // The cover control is clicked like a visitor's tap: a trusted CDP mouse click at its centre once it has settled.
  // Enviory's rocaille gate ignores a synthetic el.click() (C-ENV-117) and audio unlock needs that user activation;
  // el.click() follows only when the control never settled and is still there afterwards. Only first-viewport controls
  // count, so a "Buka Peta" link further down can never be mistaken for the cover; a bare "OPEN" counts only as the whole
  // text or aria-label (Enviory velora-linear: a wax-seal button labelled aria-label="OPEN", C-ENV-118/120).
  const COVER_CONTROL = `[...document.querySelectorAll('button,a,div[role=button],.btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).find((b) => /buka undangan|open (the )?invitation|view (the )?invitation|lihat undangan|tap (to open|the envelope)|ketuk untuk|buka|^open$/i.test((b.textContent || '').trim()) || /buka undangan|open (the )?invitation|view (the )?invitation|lihat undangan|tap (to open|the envelope)|^open$/i.test((b.getAttribute('aria-label') || '').trim()))`;
  const locateCover = () => evaluate(`(() => { const el = ${COVER_CONTROL}; if (!el) return null; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y);
    return { x, y, w: r.width, h: r.height, opacity: Number(getComputedStyle(el).opacity), hittable: r.width > 0 && r.height > 0 && !!hit && (hit === el || el.contains(hit)), label: ((el.textContent || '').trim() || '[aria] ' + el.getAttribute('aria-label')).slice(0, 30) }; })()`);
  // Settled = hit-testable, opaque and the same size on two polls: rocaille's cover zooms in for 10+ s and ignores
  // clicks until then (probe 22:13Z: opacity 0 at 624×815 px at 9 s, a click opens it at 15 s at 317×414 px).
  const settled = (cover, previous) => !!cover && cover.hittable && cover.opacity >= 0.95 && !!previous && Math.abs(cover.w - previous.w) < 2 && Math.abs(cover.h - previous.h) < 2;
  let coverClickMethod = null;
  let coverClickLanding = null;
  const customCoverClick = async () => {
    let previous = null;
    let cover = await locateCover();
    for (let waited = 0; !settled(cover, previous) && waited < COVER_SETTLE_MAX_MS; waited += 500) { await sleep(500); previous = cover; cover = await locateCover(); }
    if (!cover) return false;
    const ready = settled(cover, previous);
    // Records whether the trusted press really landed inside the control (C-ENV-121: a settled control clicked during
    // REA's scenario did not open), so a missed gate can be told apart from a gate that ignores the click.
    await evaluate(`(() => { window.__coverLanding = 'none'; addEventListener('pointerdown', (e) => { const el = ${COVER_CONTROL}; window.__coverLanding = el && (el === e.target || el.contains(e.target)) ? 'inside' : 'outside: ' + e.target.tagName.toLowerCase(); }, { capture: true, once: true }); return true; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cover.x, y: cover.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cover.x, y: cover.y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cover.x, y: cover.y, button: 'left', clickCount: 1 });
    coverClickLanding = await evaluate('window.__coverLanding');
    coverClickMethod = ready ? 'trusted' : 'trusted (unsettled)';
    if (!ready) {
      await sleep(1500);
      const still = await locateCover();
      if (still && still.label === cover.label) { await evaluate(`(() => { const el = ${COVER_CONTROL}; if (el) el.click(); })()`); coverClickMethod += ' + synthetic'; }
    }
    return cover.label;
  };
  const customScroll = async () => {
    for (let y = 0; y < 14; y += 1) { await evaluate(`window.scrollBy(0, Math.round(innerHeight * 0.85))`); await sleep(700); }
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(800);
  };
  let loadMs = null;
  let beforeOpen = null;
  let coverClicked = null;
  let scenario = null;
  let emulation = null;
  let driverUsed = 'cdp';

  if (driver === 'rea') {
    // REA navigates, settles and scrolls; this CDP session observes (network listeners, read-only fingerprint and
    // emulation probe inside REA's settle window). The optional cover click and the scroll through the opened page
    // follow REA's scenario, when only this session's emulation is active.
    const scenarioPath = join(PRIVATE, 'rea', args.id, 'rea-scenario.json');
    mkdirSync(dirname(scenarioPath), { recursive: true });
    const loaded = loadFired();
    const started = Date.now();
    const run = runReaScenario(target.id, url, scenarioPath);
    await Promise.race([loaded, sleep(45000)]);
    loadMs = Date.now() - started;
    await sleep(Math.max(500, settle - 1500));
    beforeOpen = await evaluate(FINGERPRINT);
    if (v2) beforeOpen.motion = await evaluate(MOTION_PROBE);
    // REA's connect-mode viewport override lives in REA's own CDP session and is dropped when it disconnects, and its
    // scenario schema has no mobile/touch flag, so record what the page saw while REA drove it as well as afterwards.
    const emulationDuring = await evaluate(v2 ? EMULATION_PROBE_V2 : EMULATION_PROBE);
    const result = await run;
    writeFileSync(scenarioPath, result.stdout || '');
    const json = safeParse(result.stdout);
    const steps = json?.normalized_result?.steps ?? [];
    const failed = steps.filter((s) => s.status !== 'completed').map((s) => s.step_id);
    scenario = {
      ok: result.ok, exit: result.exit, ms: result.ms, evidenceId: json?.evidence_id ?? null, status: json?.normalized_result?.completeness?.status ?? null,
      stepsCompleted: steps.length - failed.length, stepsTotal: steps.length, failed: failed.slice(0, 10), events: json?.normalized_result?.events?.retained ?? null,
      error: result.ok ? null : result.stderr, sha256: result.stdout ? sha256(result.stdout) : null, file: `_private/rea/${args.id}/rea-scenario.json`,
    };
    emulation = { duringScenario: emulationDuring, afterScenario: await evaluate(v2 ? EMULATION_PROBE_V2 : EMULATION_PROBE) };
    if ((await evaluate('location.href')) === 'about:blank') {
      driverUsed = 'cdp-fallback';
    } else {
      driverUsed = result.ok && failed.length === 0 ? 'rea' : 'rea+cdp-fallback';
      // A REA click on a missing cover control fails its step and aborts every later action (C-IDI-102: 2/34 steps), and
      // a click from this session during REA's scenario did not open a settled gate (C-ENV-121), so the cover is opened
      // here, after REA disconnected, followed by this session's own scroll through the opened page.
      let scrolled = false;
      if (args['open-cover']) {
        await applyEmulation();
        await sleep(500);
        coverClicked = await customCoverClick();
        if (coverClicked) { await sleep(2500); await customScroll(); scrolled = true; }
      }
      if (driverUsed !== 'rea' && !scrolled) await customScroll();
    }
  }

  if (driver === 'cdp' || driverUsed === 'cdp-fallback') {
    const loaded = loadFired();
    const started = Date.now();
    await page.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(45000)]);
    loadMs = Date.now() - started;
    await sleep(settle);
    beforeOpen = await evaluate(FINGERPRINT);
    if (v2) beforeOpen.motion = await evaluate(MOTION_PROBE);
    if (args['open-cover']) { coverClicked = await customCoverClick(); await sleep(2500); }
    await customScroll();
  }

  // REA's disconnect wipes this session's emulation: re-apply it (v2 clears first, see emulationCommands) so every
  // afterOpen pass sees the profile; v2 then verifies what the page actually reports.
  await applyEmulation();
  await sleep(300);
  const afterOpen = await evaluate(FINGERPRINT);
  let verification = null;
  if (v2) {
    afterOpen.layout = await evaluate(LAYOUT_PROBE);
    afterOpen.motion = await evaluate(MOTION_PROBE);
    const final = await evaluate(EMULATION_PROBE_V2);
    verification = { ...emulationMatches(profile, final), final };
    if (emulation?.duringScenario) verification.duringScenario = emulationMatches(profile, emulation.duringScenario);
  }
  await page.send('Emulation.setDeviceMetricsOverride', deviceMetrics(profile, 1));
  const shot = await page.send('Page.captureScreenshot', { format: 'webp', quality: 55 });
  return { page, target, requests: [...requests.values()], loadMs, beforeOpen, afterOpen, coverClicked, coverClickMethod, coverClickLanding, shot: Buffer.from(shot.data, 'base64'), scenario, driverUsed, emulation, verification };
}

function runReaScenario(targetId, url, outPath) {
  const actions = [{ step_id: 'settle', action: 'wait_for_timeout', duration_ms: settle }];
  for (let n = 1; n <= 14; n += 1) {
    actions.push({ step_id: `scroll-${n}`, action: 'press', locator: { kind: 'css', selector: 'body' }, key: 'PageDown', timeout_ms: 8000 },
      { step_id: `pause-${n}`, action: 'wait_for_timeout', duration_ms: 700 });
  }
  actions.push({ step_id: 'to-top', action: 'press', locator: { kind: 'css', selector: 'body' }, key: 'Home', timeout_ms: 8000 },
    { step_id: 'final-settle', action: 'wait_for_timeout', duration_ms: 800 });
  const scenarioInput = {
    browser: { mode: 'connect', cdp_endpoint: CDP.replace('localhost', '127.0.0.1'), target_id: targetId },
    start_url: { url },
    // reduced_motion defaults to "reduce" in REA; a normal guest gets the full animation. Service workers are allowed
    // because REA's default "block" rejects captures of PWA-style invitation sites.
    environment: reaEnvironment(profile),
    actions,
    capture: { at_end: ['url', 'screenshot'], events: ['network', 'console', 'page-errors'] },
  };
  const inputPath = outPath.replace(/\.json$/, '.input.json');
  writeFileSync(inputPath, JSON.stringify(scenarioInput, null, 1));
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(NODE24, [REA, 'capture-browser-scenario', inputPath, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => { err += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 240000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, exit: code, stdout: Buffer.concat(out).toString('utf8'), stderr: err.slice(0, 400), ms: Date.now() - started });
    });
  });
}

function rea(subcommand, targetId, extra = []) {
  const run = spawnSync(NODE24, [REA, subcommand, CDP.replace('localhost', '127.0.0.1'), targetId, ...extra, '--json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180000 });
  return { ok: run.status === 0, stdout: run.stdout, stderr: (run.stderr || '').slice(0, 400) };
}

// One retry: a Lighthouse run can die on a transient CDP timeout (C-IDI-104: Page.captureScreenshot under CPU contention).
function lighthouse(url, outPath) {
  const first = lighthouseOnce(url, outPath);
  if (first.ok) return first;
  return { ...lighthouseOnce(url, outPath), attempts: 2, firstError: first.error };
}

function lighthouseOnce(url, outPath) {
  const run = spawnSync(LIGHTHOUSE, lighthouseArgs(profile, { url, outPath, userAgent: ANDROID_UA }),
    { encoding: 'utf8', env: { ...process.env, CHROME_PATH: CHROME }, timeout: 240000 });
  if (run.status !== 0 || !existsSync(outPath)) return { ok: false, error: (run.stderr || '').slice(-400) };
  const report = JSON.parse(readFileSync(outPath, 'utf8'));
  const audit = (id) => report.audits[id];
  const items = audit('resource-summary')?.details?.items ?? [];
  const byType = Object.fromEntries(items.map((i) => [i.resourceType, { requests: i.requestCount, bytes: i.transferSize }]));
  return {
    ok: true, lighthouseVersion: report.lighthouseVersion, finalUrl: report.finalDisplayedUrl,
    throttling: report.configSettings.throttling, screen: report.configSettings.screenEmulation,
    scores: Object.fromEntries(Object.entries(report.categories).map(([k, v]) => [k, v.score === null ? null : Math.round(v.score * 100)])),
    metrics: { fcpMs: audit('first-contentful-paint')?.numericValue, lcpMs: audit('largest-contentful-paint')?.numericValue, tbtMs: audit('total-blocking-time')?.numericValue,
      cls: audit('cumulative-layout-shift')?.numericValue, siMs: audit('speed-index')?.numericValue, ttiMs: audit('interactive')?.numericValue },
    byType, totalBytes: audit('total-byte-weight')?.numericValue, requests: byType.total?.requests,
    thirdParties: (audit('third-party-summary')?.details?.items ?? []).slice(0, 12).map((i) => ({ entity: i.entity?.text ?? i.entity, bytes: i.transferSize, blockingMs: i.blockingTime })),
    fontDisplayIssues: (audit('font-display')?.details?.items ?? []).length, unusedJsBytes: audit('unused-javascript')?.details?.overallSavingsBytes ?? null,
    a11yFailures: Object.values(report.audits).filter((a) => report.categories.accessibility?.auditRefs.some((r) => r.id === a.id) && a.score === 0).map((a) => a.id),
  };
}

const captureDir = own ? join(RESEARCH, 'raw', 'invitesion', args.id) : join(PRIVATE, 'rea', args.id);
const summaryPath = join(RESEARCH, 'raw', args.competitor, `${args.id}.json`);
mkdirSync(captureDir, { recursive: true });
mkdirSync(dirname(summaryPath), { recursive: true });

const robots = own ? { allowed: true, note: 'own instance' } : await robotsAllows(visitUrl);
if (!robots.allowed) {
  console.log(JSON.stringify({ id: args.id, skipped: 'robots.txt disallows', robots }));
  process.exit(0);
}
const observed = await observe(visitUrl);
const skipped = { ok: false, stdout: '', stderr: `skipped: lean profile ${profile.name}` };
const inspect = profile.lean ? skipped : rea('inspect-web-page', observed.target.id, ['--observation-ms', '1500']);
const bundle = profile.lean ? skipped : rea('analyze-web-bundle', observed.target.id);
observed.page.close();
await fetch(`${CDP}/json/close/${observed.target.id}`).catch(() => {});

const files = {};
for (const [name, result] of [['rea-inspect.json', inspect], ['rea-bundle.json', bundle]]) {
  if (result.ok) { writeFileSync(join(captureDir, name), result.stdout); files[name] = sha256(result.stdout); }
}
if (observed.scenario?.sha256) files[observed.scenario.file] = observed.scenario.sha256;
const shotPath = own ? join(captureDir, screenshotName(profile)) : join(PRIVATE, 'thumbs', `${args.id}.webp`);
mkdirSync(dirname(shotPath), { recursive: true });
writeFileSync(shotPath, observed.shot);

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const inspectJson = inspect.ok ? parse(inspect.stdout) : null;
const bundleJson = bundle.ok ? parse(bundle.stdout) : null;
const nr = inspectJson?.normalized_result ?? {};
const byType = {};
for (const r of observed.requests) {
  const t = r.type || 'Other';
  byType[t] ??= { requests: 0, bytes: 0 };
  byType[t].requests += 1;
  byType[t].bytes += r.bytes || 0;
}
const fontFiles = observed.requests.filter((r) => r.type === 'Font' || /\.(woff2?|ttf|otf)(\?|$)/.test(r.url)).map((r) => ({ host: new URL(r.url).hostname, file: new URL(r.url).pathname.split('/').pop().slice(0, 80), bytes: r.bytes }));
const scriptHosts = [...new Set(observed.requests.filter((r) => r.type === 'Script').map((r) => new URL(r.url).hostname))];
const scriptFiles = observed.requests.filter((r) => r.type === 'Script').map((r) => new URL(r.url).pathname.split('/').pop().slice(0, 70)).slice(0, 40);
let lh = null;
if (args.lighthouse) {
  await polite(new URL(visitUrl).origin);
  const lhPath = own ? join(captureDir, 'lighthouse.json') : join(PRIVATE, 'lh', `${args.id}.json`);
  mkdirSync(dirname(lhPath), { recursive: true });
  lh = lighthouse(visitUrl, lhPath);
  if (lh.ok) files[own ? 'lighthouse.json' : `_private/lh/${args.id}.json`] = sha256(readFileSync(lhPath));
}

const summary = {
  id: args.id, competitor: args.competitor, kind: args.kind ?? 'page', url: args.url, capturedAt: wib(), robots,
  method: `${observed.driverUsed === 'rea' ? 'REA capture-browser-scenario (connect mode) drives navigation, settle and keyboard scroll; optional cover click (trusted CDP mouse click on the settled control: coverClickMethod, coverClickLanding) and scroll through the opened page by CDP after REA\'s scenario' : `CDP drives navigation/click/scroll (driver ${observed.driverUsed})`}; CDP mobile emulation ${profile.width}x${profile.height} @${profile.dsf}${v2 ? ` + prefers-reduced-motion ${profile.motion}, re-applied (clear + set) after REA's scenario` : ''} + Android Chrome UA, cold cache (no throttling); ${profile.lean ? 'REA inspect/bundle skipped (lean)' : `REA ${REA_VERSION} inspect-web-page/analyze-web-bundle`}; custom structure pass (text features + animation libraries: no REA coverage)${v2 ? ' + layout and motion probes' : ''}; Lighthouse 12 mobile simulate (Slow 4G, 4x CPU) when present`,
  ...(v2 ? { measurement: { ...measurementRecord(profile, observed.verification), emulation_final: observed.verification?.final ?? null,
    emulation_during_scenario: observed.verification?.duringScenario ?? null } } : {}),
  driver: observed.driverUsed,
  rea: { version: REA_VERSION, scenario: observed.scenario, emulation: observed.emulation, inspectEvidenceId: inspectJson?.evidence_id ?? null, bundleEvidenceId: bundleJson?.evidence_id ?? null, inspectError: inspect.ok ? null : inspect.stderr, bundleError: bundle.ok ? null : bundle.stderr,
    domNodes: nr.dom?.total_nodes ?? null, scripts: nr.scripts?.total ?? null, resources: Array.isArray(nr.resources) ? nr.resources.length : null,
    completeness: inspectJson?.normalized_result?.completeness?.status ?? null, bundleChunks: bundleJson?.normalized_result?.observations?.chunks?.nodes?.length ?? null,
    bundleEndpoints: (bundleJson?.normalized_result?.observations?.endpoints ?? []).slice(0, 15).map((e) => e.value ?? e.pattern ?? e.url ?? e), bundleInferences: (bundleJson?.normalized_result?.inferences ?? []).slice(0, 10) },
  network: { loadEventMs: observed.loadMs, requests: observed.requests.length, bytes: observed.requests.reduce((s, r) => s + (r.bytes || 0), 0), byType, protocols: [...new Set(observed.requests.map((r) => r.protocol))].filter(Boolean),
    scriptHosts, scriptFiles, fontFiles, thirdPartyHosts: [...new Set(observed.requests.map((r) => new URL(r.url).hostname))].filter((h) => h !== new URL(visitUrl).hostname).slice(0, 30) },
  structure: { coverClicked: observed.coverClicked, coverClickMethod: observed.coverClickMethod, coverClickLanding: observed.coverClickLanding, beforeOpen: { sectionCount: observed.beforeOpen.sectionCount, features: observed.beforeOpen.features, buttons: observed.beforeOpen.buttons.slice(0, 10), ...(observed.beforeOpen.motion ? { motion: observed.beforeOpen.motion } : {}) }, afterOpen: observed.afterOpen },
  lighthouse: lh, files, screenshot: own ? `${screenshotName(profile)} (public, own product)` : '_private/thumbs (competitor, not committed)',
};
// D-017: a summary whose written URL carries a redaction token must not show the demo couple's names either.
// D-021: the same for every competitor demo, since a page alone cannot prove that its couple is a placeholder.
if (hasToken(pseudonymizeText(String(args.url), redactionMap)) || (summary.kind === 'demo' && !own)) redactDemoNames(summary.structure);
writeFileSync(summaryPath, pseudonymizeText(JSON.stringify(summary, null, 1), redactionMap));
const indexPath = join(RESEARCH, 'raw', '_captures.csv');
if (!existsSync(indexPath)) writeFileSync(indexPath, 'capture_id,captured_at_wib,competitor,kind,url,summary,lighthouse_ok\n');
appendFileSync(indexPath, pseudonymizeText(`${args.id},${summary.capturedAt},${args.competitor},${summary.kind},"${args.url}",raw/${args.competitor}/${args.id}.json,${lh ? lh.ok : 'n/a'}\n`, redactionMap));
saveMap(PRIVATE, redactionMap);
console.log(JSON.stringify({ id: args.id, ok: true, driver: observed.driverUsed, requests: summary.network.requests, kb: Math.round(summary.network.bytes / 1024), libs: Object.entries(observed.afterOpen.libs).filter(([, v]) => v).map(([k]) => k), sections: observed.afterOpen.sectionCount, lh: lh?.ok ? { ...lh.scores, lcp: Math.round(lh.metrics.lcpMs), kb: Math.round(lh.totalBytes / 1024) } : lh?.error?.slice(0, 120) ?? null }));
