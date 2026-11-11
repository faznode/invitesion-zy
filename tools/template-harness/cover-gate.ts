/**
 * Cover-gate acceptance (B-009, D-045; I-15's rules as acceptance): the "Buka Undangan" cover and the background music of
 * an invitation, in headless Chrome against the real routes.
 *
 *   npx tsx tools/template-harness/cover-gate.ts --out <dir> --base http://127.0.0.1:3100 \
 *     --pages review-legacy-music,review-gapura-music --manual review-gapura-music-manual --plain review-gapura-full \
 *     [--guest budi-hartono]
 *   npx tsx tools/template-harness/cover-gate.ts --write-tone <file.wav>   # the fixture's audio: generated here, no licence
 *
 * Per music page (Chrome with `--autoplay-policy=user-gesture-required`, so sound needs the guest's own gesture):
 *   first-paint  the gate shows at 360 × 800; its open link is a link named "Buka Undangan" in Chrome's accessibility tree;
 *                nothing of the audio is fetched; after hydration the page behind is inert and the document does not scroll.
 *   no-js        with JavaScript off, Tab reaches "Buka Undangan" first and a click on it opens the invitation.
 *   tap          one click starts the music, the gate is gone within 1.5 s (I-15) and focus moves into the page.
 *   reduced      under prefers-reduced-motion the gate has no transition and is gone at once.
 *   toggle       the music control reports aria-pressed="true" while playing; a click pauses it, another resumes.
 *   quiet        "Buka tanpa musik" opens without sound; the control is offered unpressed.
 *   keyboard     Enter on the focused open link opens with music; Escape on the gate opens without it.
 *   notice       the page after a form post (`?rsvp=saved`) shows no gate.
 * Per --manual page (`autoplay: false`): no gate, the control offered unpressed. Per --plain page: no gate, audio or control.
 * Writes cover-gate.json and a 360 × 800 screenshot of each gate; exit 0 when every check passes, 1 otherwise.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findChrome, launchDevtoolsChrome } from './browser';

export type GateCheck = { name: string; pass: boolean; detail?: string };
export type GateRow = { page: string; kind: 'music' | 'manual' | 'plain'; verdict: 'PASS' | 'FAIL'; checks: GateCheck[] };

export const OPEN_LIMIT_MS = 1500;

export function gateVerdict(checks: GateCheck[]): GateRow['verdict'] {
  return checks.length > 0 && checks.every((check) => check.pass) ? 'PASS' : 'FAIL';
}

/** A soft 440 Hz tone with fades, 16-bit mono PCM: the fixture's own audio, so no third-party recording is involved. */
export function toneWav(seconds = 3, sampleRate = 8000): Buffer {
  const samples = Math.round(seconds * sampleRate);
  const data = Buffer.alloc(samples * 2);
  const fade = Math.round(sampleRate * 0.2);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / fade, (samples - 1 - i) / fade);
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2 * envelope * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

type Cdp = {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  on: (method: string, listener: (params: any) => void) => void;
  close: () => void;
};

async function connect(port: number): Promise<Cdp> {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1000) })).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        let id = 0;
        const pending = new Map<number, (value: any) => void>();
        const listeners = new Map<string, ((params: any) => void)[]>();
        ws.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id && pending.has(message.id)) { pending.get(message.id)!(message); pending.delete(message.id); }
          else if (message.method) for (const listener of listeners.get(message.method) ?? []) listener(message.params);
        };
        return {
          send: (method, params = {}) => new Promise((resolve, reject) => {
            const n = ++id;
            const timer = setTimeout(() => {
              pending.delete(n);
              reject(new Error(`${method}: Chrome did not respond within 8 seconds`));
            }, 8000);
            pending.set(n, (m) => {
              clearTimeout(timer);
              if (m.error) reject(new Error(`${method}: ${m.error.message}`));
              else resolve(m.result);
            });
            ws.send(JSON.stringify({ id: n, method, params }));
          }),
          on: (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener]),
          close: () => ws.close(),
        };
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Chrome did not expose a page target');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate<T>(cdp: Cdp, expression: string): Promise<T> {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(`evaluate failed: ${exceptionDetails.text} ${expression.slice(0, 80)}`);
  return result.value as T;
}

async function waitFor(cdp: Cdp, expression: string, timeoutMs: number): Promise<number | null> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (await evaluate<boolean>(cdp, expression)) return Date.now() - started;
    await sleep(25);
  }
  return null;
}

async function load(cdp: Cdp, url: string) {
  // Repeated tests use the same URL. Use a new document so a completed previous page (or a
  // no-JS fragment navigation) cannot satisfy the readiness check for this one.
  const cleared = await cdp.send('Page.navigate', { url: 'about:blank' });
  if (cleared.errorText) throw new Error(`Could not clear the previous document: ${cleared.errorText}`);
  const navigated = await cdp.send('Page.navigate', { url });
  if (navigated.errorText) throw new Error(`Could not load ${url}: ${navigated.errorText}`);
  const ready = `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && document.fonts.status === 'loaded'`;
  if (await waitFor(cdp, ready, 15_000) === null) throw new Error(`Page did not finish loading: ${url}`);
}

/** React marks the nodes it has hydrated; the island's handlers exist from then on. */
const HYDRATED = `(() => { const gate = document.getElementById('sampul'); const node = gate ?? document.querySelector('audio'); return !!node && Object.keys(node).some((key) => key.startsWith('__reactProps')); })()`;

async function clickSelector(cdp: Cdp, selector: string) {
  const box = await evaluate<{ x: number; y: number } | null>(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error(`no element for ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

async function key(cdp: Cdp, name: 'Tab' | 'Enter' | 'Escape') {
  const codes = { Tab: 9, Enter: 13, Escape: 27 } as const;
  const text = name === 'Enter' ? '\r' : undefined;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: codes[name], ...(text && { text }) });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: codes[name] });
}

const OPEN = '#sampul a[href="#sampul"]:first-of-type';
const QUIET = '#sampul a[href="#sampul"]:nth-of-type(2)';
const OPEN_FOCUSED = `document.activeElement?.matches(${JSON.stringify(OPEN)}) === true`;
/**
 * The music control is the toggle that follows the island's `<audio>`, outside the layout's `<main>`. G-036's reading
 * switch on the design families' covers is a toggle too (`aria-pressed`, inside `<main>`, earlier in the document), so a
 * bare `button[aria-pressed]` reads and clicks the reading switch instead (s52 R-H16).
 */
export const MUSIC_CONTROL = 'audio ~ button[aria-pressed]';
const MUSIC = `document.querySelector(${JSON.stringify(MUSIC_CONTROL)})`;
const STATE = `(() => {
  const gate = document.getElementById('sampul');
  const audio = document.querySelector('audio');
  const toggle = ${MUSIC};
  return {
    gateShown: !!gate && getComputedStyle(gate).display !== 'none' && !gate.hidden,
    playing: !!audio && !audio.paused,
    pressed: toggle ? toggle.getAttribute('aria-pressed') : null,
    inert: !!document.querySelector('main')?.closest('[inert]'),
    locked: getComputedStyle(document.documentElement).overflow === 'hidden',
    focusInPage: !!document.activeElement && document.activeElement !== document.body && document.activeElement.contains(document.querySelector('main')),
    audioCount: document.querySelectorAll('audio').length,
    preload: audio ? audio.getAttribute('preload') : null,
  };
})()`;
type State = { gateShown: boolean; playing: boolean; pressed: string | null; inert: boolean; locked: boolean; focusInPage: boolean; audioCount: number; preload: string | null };

export async function runCoverGate(options: { base: string; pages: string[]; manual: string[]; plain: string[]; guest: string; out: string }): Promise<GateRow[]> {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)');
  const { port, close } = await launchDevtoolsChrome(chrome, ['--hide-scrollbars', '--mute-audio', '--autoplay-policy=user-gesture-required']);
  const rows: GateRow[] = [];
  try {
    const cdp = await connect(port);
    const requested: string[] = [];
    cdp.on('Network.requestWillBeSent', (params) => requested.push(String(params.request?.url ?? '')));
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    const motion = (value: '' | 'reduce') => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
    const state = () => evaluate<State>(cdp, STATE);
    const url = (page: string, query = '') => `${options.base}/i/${page}/${options.guest}${query}`;

    for (const page of options.pages) {
      const checks: GateCheck[] = [];
      const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, ...(detail !== undefined && { detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }) });
      try {
        // first-paint
        await motion('');
        requested.length = 0;
        await load(cdp, url(page));
        const audioSrc = await evaluate<string>(cdp, `document.querySelector('audio')?.src ?? ''`);
        const before = await state();
        check('first-paint: the gate shows and the page has one audio element with preload="none"', before.gateShown && before.audioCount === 1 && before.preload === 'none', before);
        check('first-paint: nothing of the audio is fetched before a tap', audioSrc !== '' && !requested.includes(audioSrc), { audioSrc, fetched: requested.includes(audioSrc) });
        const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
        const { nodes } = await cdp.send('Accessibility.queryAXTree', { nodeId: root.nodeId, accessibleName: 'Buka Undangan' });
        const roles = (nodes as { role?: { value?: string }; ignored?: boolean }[]).filter((node) => !node.ignored).map((node) => node.role?.value);
        check('first-paint: Chrome exposes a link named "Buka Undangan"', roles.includes('link'), roles);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(options.out, `${page}-gate-360.png`), Buffer.from(shot.data, 'base64'));
        const hydratedIn = await waitFor(cdp, `${HYDRATED} && !!document.querySelector('main')?.closest('[inert]')`, 10_000);
        const settled = await state();
        check('hydrated: the page behind the gate is inert and the document does not scroll', hydratedIn !== null && settled.inert && settled.locked && !settled.playing, { hydratedIn, ...settled });

        // tap
        const clickedAt = Date.now();
        await clickSelector(cdp, OPEN);
        const goneIn = await waitFor(cdp, `(() => { const g = document.getElementById('sampul'); return !g || g.hidden || getComputedStyle(g).display === 'none'; })()`, 3000);
        const playingIn = await waitFor(cdp, `(() => { const a = document.querySelector('audio'); return !!a && !a.paused && a.currentTime > 0; })()`, 4000);
        const opened = await state();
        check(`tap: one click starts the music and the gate is gone within ${OPEN_LIMIT_MS} ms (I-15)`, goneIn !== null && goneIn <= OPEN_LIMIT_MS && playingIn !== null, { goneIn, playingIn, sinceClick: Date.now() - clickedAt });
        check('tap: the page is usable again (not inert, scrolls) and focus is in it', !opened.inert && !opened.locked && opened.focusInPage, opened);

        // toggle
        await waitFor(cdp, `!!${MUSIC}`, 2000);
        const pressedWhilePlaying = (await state()).pressed;
        await clickSelector(cdp, MUSIC_CONTROL);
        const pausedIn = await waitFor(cdp, `(() => { const a = document.querySelector('audio'); const b = ${MUSIC}; return a.paused && b.getAttribute('aria-pressed') === 'false'; })()`, 2000);
        await clickSelector(cdp, MUSIC_CONTROL);
        const resumedIn = await waitFor(cdp, `(() => { const a = document.querySelector('audio'); const b = ${MUSIC}; return !a.paused && b.getAttribute('aria-pressed') === 'true'; })()`, 3000);
        check('toggle: aria-pressed follows the music; a click pauses it and another resumes it', pressedWhilePlaying === 'true' && pausedIn !== null && resumedIn !== null, { pressedWhilePlaying, pausedIn, resumedIn });

        // quiet
        await load(cdp, url(page));
        await waitFor(cdp, HYDRATED, 10_000);
        await clickSelector(cdp, QUIET);
        await waitFor(cdp, `!!${MUSIC}`, 3000);
        await sleep(300);
        const quiet = await state();
        check('quiet: "Buka tanpa musik" opens without sound and offers the control unpressed', !quiet.gateShown && !quiet.playing && quiet.pressed === 'false', quiet);

        // React's event handlers can be attached before the effect sets focus. Wait for the
        // guest-visible state the keyboard check needs, without moving focus from the test.
        await load(cdp, url(page));
        const focusedIn = await waitFor(cdp, OPEN_FOCUSED, 10_000);
        await key(cdp, 'Enter');
        const keyGone = await waitFor(cdp, `(() => { const g = document.getElementById('sampul'); return !g || g.hidden; })()`, 3000);
        const keyPlaying = await waitFor(cdp, `(() => { const a = document.querySelector('audio'); return !!a && !a.paused; })()`, 3000);
        check('keyboard: focus starts on "Buka Undangan" and Enter opens with music', focusedIn !== null && keyGone !== null && keyPlaying !== null, { focusedIn, keyGone, keyPlaying });
        await load(cdp, url(page));
        const escapeFocusedIn = await waitFor(cdp, OPEN_FOCUSED, 10_000);
        await key(cdp, 'Escape');
        const escGone = await waitFor(cdp, `(() => { const g = document.getElementById('sampul'); return !g || g.hidden; })()`, 3000);
        await sleep(300);
        const esc = await state();
        check('keyboard: Escape opens without music', escapeFocusedIn !== null && escGone !== null && !esc.playing, { escapeFocusedIn, escGone, ...esc });

        // reduced
        await motion('reduce');
        await load(cdp, url(page));
        await waitFor(cdp, HYDRATED, 10_000);
        // `motion-reduce:transition-none` removes the transitioned properties; the duration utility stays and moves nothing.
        const transition = await evaluate<string>(cdp, `getComputedStyle(document.getElementById('sampul')).transitionProperty`);
        await clickSelector(cdp, OPEN);
        const reducedGone = await waitFor(cdp, `(() => { const g = document.getElementById('sampul'); return !g || g.hidden; })()`, 1000);
        check('reduced: no transition, and the gate is gone at once', transition === 'none' && reducedGone !== null && reducedGone <= 150, { transition, reducedGone });
        await motion('');

        // notice
        await load(cdp, url(page, '?rsvp=saved'));
        const notice = await state();
        check('notice: back from a form post, no gate covers the page', !notice.gateShown && notice.audioCount === 1, notice);

        // no-js
        await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
        await load(cdp, url(page));
        await key(cdp, 'Tab');
        const firstTabOnOpen = await evaluate<boolean>(cdp, OPEN_FOCUSED);
        await clickSelector(cdp, OPEN);
        await sleep(200);
        const noJs = await evaluate<{ shown: boolean; scrolls: boolean }>(cdp, `(() => { const g = document.getElementById('sampul'); return { shown: getComputedStyle(g).display !== 'none', scrolls: getComputedStyle(document.documentElement).overflow !== 'hidden' }; })()`);
        await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
        check('no-js: Tab reaches "Buka Undangan" first and a click opens the invitation', firstTabOnOpen && !noJs.shown && noJs.scrolls, { firstTabOnOpen, ...noJs });
      } catch (error) {
        check('the run completed', false, String(error));
        await cdp.send('Emulation.setScriptExecutionDisabled', { value: false }).catch(() => undefined);
      }
      rows.push({ page, kind: 'music', checks, verdict: gateVerdict(checks) });
    }

    for (const page of options.manual) {
      const checks: GateCheck[] = [];
      await load(cdp, url(page));
      await waitFor(cdp, HYDRATED, 10_000);
      await waitFor(cdp, `!!${MUSIC}`, 3000);
      const s = await state();
      checks.push({ name: 'manual: no gate, one audio element, the control offered unpressed', pass: !s.gateShown && s.audioCount === 1 && s.pressed === 'false' && !s.playing, detail: JSON.stringify(s) });
      rows.push({ page, kind: 'manual', checks, verdict: gateVerdict(checks) });
    }
    for (const page of options.plain) {
      const checks: GateCheck[] = [];
      await load(cdp, url(page));
      await sleep(500);
      const s = await state();
      const gateNode = await evaluate<boolean>(cdp, `!!document.getElementById('sampul')`);
      checks.push({ name: 'plain: no gate, no audio, no control', pass: !gateNode && s.audioCount === 0 && s.pressed === null, detail: JSON.stringify(s) });
      rows.push({ page, kind: 'plain', checks, verdict: gateVerdict(checks) });
    }
    cdp.close();
  } finally {
    await close();
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const tone = arg('write-tone');
  if (tone) {
    mkdirSync(dirname(tone), { recursive: true });
    writeFileSync(tone, toneWav());
    console.log(`tone: ${tone} (${toneWav().length} bytes, generated)`);
    return;
  }
  const out = arg('out');
  const base = arg('base');
  if (!out || !base) throw new Error('usage: cover-gate.ts --out <dir> --base <origin> --pages <a,b> [--manual <a>] [--plain <a>] [--guest <slug>]');
  mkdirSync(out, { recursive: true });
  const list = (name: string) => (arg(name) ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const rows = await runCoverGate({ base, out, pages: list('pages'), manual: list('manual'), plain: list('plain'), guest: arg('guest', 'budi-hartono')! });
  writeFileSync(join(out, 'cover-gate.json'), JSON.stringify({ tool: 'cover-gate', generatedAt: new Date().toISOString(), rows }, null, 2));
  for (const row of rows) {
    console.log(`${row.verdict} ${row.page} (${row.kind})`);
    for (const c of row.checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.pass ? '' : ` ${c.detail ?? ''}`}`);
  }
  const checks = rows.flatMap((row) => row.checks);
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`cover-gate: ${checks.length - failed} / ${checks.length} checks over ${rows.length} pages`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('cover-gate.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
