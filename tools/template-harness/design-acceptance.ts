/**
 * design-acceptance.ts (s23r, Task 4): the phone design checks a guest page must keep, measured in headless Chrome.
 *
 *   npx tsx tools/template-harness/design-acceptance.ts --out <dir> \
 *     --url gapura-full=http://127.0.0.1:3104/i/review-gapura-full/budi-hartono [--url label=URL …] [--skip-media]
 *
 * Per URL at 360 × 800, device scale 1, cache off (the guest is the URL's last segment):
 * - overflow: no horizontal scroll in the final layout (reduced motion).
 * - name: the guest's stress name is one element and is not clipped; a hostile name stays text (no injected element,
 *   no dialog). Skipped for a guest the tool does not know.
 * - t3-rhythm (taste candidate T3, "no screen-high gaps on phones"): vertical bands holding no content (text, media,
 *   icons, or a box with its own background or border) between the first and the last content. FAIL when a band is at
 *   least half the viewport high. Block gaps (≥ 24 px) are summarised (median, p90, max); outliers (> 2.5 × the median
 *   and ≥ 96 px) are listed for inspection, not failed.
 * - reduced-motion: with prefers-reduced-motion: reduce, no animation longer than 10 ms runs from 1 s after load while
 *   the page is scrolled through a viewport at a time. The same count without the preference is reported beside it, so
 *   a page that animates nothing either way is visible as such.
 * - forced-colors: in emulated forced-colours mode every visible `.inv-icon` (first eight) keeps ink: at least 4 % of
 *   its box differs from the box's dominant colour. An icon without ink in normal mode makes the check INCOMPLETE (the
 *   measurement did not see it), never PASS.
 * - print: printed without background graphics, the page draws more clip / rect / fill operations with the shipped icon
 *   CSS than with `print-color-adjust: economy` forced on the icons. A PDF operator differential, not a raster: the lab
 *   has no PDF rasteriser.
 * `--skip-media` drops forced-colors and print (guest-independent) for stress-name runs. Writes design-acceptance.json;
 * exit 0 all PASS (or N/A), 1 any FAIL, 3 any INCOMPLETE without FAIL. Lab only: layout and rendering, not speed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { findChrome, launchDevtoolsChrome } from './browser';

export type Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'N/A';
export type Gap = { top: number; height: number };
export type Png = { width: number; height: number; channels: number; data: Uint8Array };

export const STRESS_NAMES: Record<string, string> = {
  'budi-hartono': 'Budi Hartono',
  'nama-panjang': 'Muhammad Fadhlurrahman Al-Ghifari & Putri Anindya Maharani Kusumawardhani',
  'hostile-name': '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>',
  'rtl-name': 'عبد الله بن أحمد',
  'emoji-name': 'Sari 💐 & Keluarga 👨‍👩‍👧',
};

const INK_MIN = 0.04;
const MAX_ICONS = 8;

/** Bands between content: intervals are merged, and each space between two merged runs is a gap. */
export function verticalGaps(intervals: [number, number][]): { gaps: Gap[]; contentTop: number; contentBottom: number } {
  const merged: [number, number][] = [];
  for (const [top, bottom] of intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && top <= last[1]) last[1] = Math.max(last[1], bottom);
    else merged.push([top, bottom]);
  }
  const gaps = merged.slice(1).map(([top], index) => ({ top: merged[index][1], height: top - merged[index][1] }));
  return { gaps, contentTop: merged[0]?.[0] ?? 0, contentBottom: merged[merged.length - 1]?.[1] ?? 0 };
}

/** T3: block gaps (≥ `minBlockGap`) by nearest rank; a gap of half the viewport or more fails. */
export function rhythmSummary(gaps: Gap[], viewportHeight: number, minBlockGap = 24) {
  const block = gaps.filter((gap) => gap.height >= minBlockGap).map((gap) => ({ top: Math.round(gap.top), height: Math.round(gap.height) }));
  const heights = block.map((gap) => gap.height).sort((a, b) => a - b);
  const rank = (q: number) => (heights.length ? heights[Math.min(heights.length - 1, Math.max(0, Math.ceil(q * heights.length) - 1))] : 0);
  const median = rank(0.5);
  const screenHigh = block.filter((gap) => gap.height >= viewportHeight / 2);
  const outliers = block.filter((gap) => median > 0 && gap.height > 2.5 * median && gap.height >= 96);
  const verdict: Verdict = screenHigh.length ? 'FAIL' : 'PASS';
  return { blockGaps: block.length, median, p90: rank(0.9), max: heights[heights.length - 1] ?? 0, screenHigh, outliers, verdict };
}

/** 8-bit, non-interlaced RGB / RGBA PNG (what Chrome's screenshots are); CRCs are not checked. */
export function decodePng(buffer: Buffer): Png {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colourType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || (colourType !== 2 && colourType !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colourType}, interlace ${interlace})`);
  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[y * stride + x - channels] : 0;
      const b = y > 0 ? data[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? data[(y - 1) * stride + x - channels] : 0;
      let value = raw[line + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, channels, data };
}

/** Share of pixels that differ (any channel by more than 40) from the image's dominant colour. */
export function inkRatio(png: Png): number {
  const pixels = png.width * png.height;
  if (!pixels) return 0;
  const counts = new Map<number, number>();
  for (let p = 0; p < pixels; p++) {
    const i = p * png.channels;
    const key = ((png.data[i] >> 4) << 8) | ((png.data[i + 1] >> 4) << 4) | (png.data[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const mode = [...counts].sort((x, y) => y[1] - x[1])[0][0];
  const centre = [((mode >> 8) & 15) * 16 + 8, ((mode >> 4) & 15) * 16 + 8, (mode & 15) * 16 + 8];
  let ink = 0;
  for (let p = 0; p < pixels; p++) {
    const i = p * png.channels;
    if (Math.max(Math.abs(png.data[i] - centre[0]), Math.abs(png.data[i + 1] - centre[1]), Math.abs(png.data[i + 2] - centre[2])) > 40) ink++;
  }
  return ink / pixels;
}

/** Clip (`W n`), rect (`re`) and fill (`f`) operators across a PDF's Flate content streams. */
export function pdfDrawOps(pdf: Buffer): { clips: number; rects: number; fills: number } {
  const text = pdf.toString('latin1');
  const marker = /stream\r?\n/g;
  const ops = { clips: 0, rects: 0, fills: 0 };
  for (let match = marker.exec(text); match; match = marker.exec(text)) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    marker.lastIndex = end + 'endstream'.length;
    let body: string;
    try {
      body = inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch {
      continue;
    }
    ops.clips += (body.match(/(?:^|\s)W\*?\s+n(?=\s)/g) ?? []).length;
    ops.rects += (body.match(/\sre(?=\s)/g) ?? []).length;
    ops.fills += (body.match(/(?:^|\s)f\*?(?=\s)/g) ?? []).length;
  }
  return ops;
}

type Cdp = { send: (method: string, params?: Record<string, unknown>) => Promise<any>; on: (method: string, handler: (params: any) => void) => void; close: () => void };

async function connect(port: number): Promise<Cdp> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const target = targets.find((t) => t.type === 'page');
      if (target) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
        });
        let id = 0;
        const pending = new Map<number, (message: any) => void>();
        const listeners = new Map<string, ((params: any) => void)[]>();
        ws.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id && pending.has(message.id)) {
            pending.get(message.id)!(message);
            pending.delete(message.id);
          } else if (message.method) for (const handler of listeners.get(message.method) ?? []) handler(message.params);
        };
        return {
          send: (method, params = {}) =>
            new Promise((resolve, reject) => {
              const n = ++id;
              pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
              ws.send(JSON.stringify({ id: n, method, params }));
            }),
          on: (method, handler) => listeners.set(method, [...(listeners.get(method) ?? []), handler]),
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate<T>(cdp: Cdp, expression: string): Promise<T> {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value as T;
}

async function load(cdp: Cdp, url: string, settleMs: number) {
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    if (await evaluate<boolean>(cdp, `document.readyState === 'complete' && [...document.images].every((img) => img.complete)`)) break;
    await delay(100);
  }
  await evaluate(cdp, 'document.fonts.ready.then(() => true)');
  await delay(settleMs);
}

const RUNNING = `document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getTiming?.().duration ?? 0) > 10).length`;

/** The most animations running at once while the page is scrolled to the end a viewport at a time (scroll-triggered entrances included), then back to the top. */
async function maxRunningWhileScrolling(cdp: Cdp): Promise<number> {
  let most = await evaluate<number>(cdp, RUNNING);
  const steps = await evaluate<number>(cdp, `Math.ceil(document.documentElement.scrollHeight / innerHeight)`);
  for (let step = 1; step <= Math.min(steps, 12); step++) {
    await evaluate(cdp, `window.scrollTo(0, ${step} * innerHeight)`);
    await delay(120);
    most = Math.max(most, await evaluate<number>(cdp, RUNNING));
  }
  await evaluate(cdp, 'window.scrollTo(0, 0)');
  await delay(120);
  return most;
}

const MEASURE = (name: string | undefined) => `(() => {
  const main = document.querySelector('main') ?? document.body;
  let pageBg = 'rgba(0, 0, 0, 0)';
  for (let node = main; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg !== 'transparent' && !/rgba\\(.*,\\s*0\\)$/.test(bg)) { pageBg = bg; break; }
  }
  const docHeight = document.documentElement.scrollHeight;
  const intervals = [];
  const push = (r) => { if (r.width > 0.5 && r.height > 0.5) intervals.push([r.top + scrollY, r.bottom + scrollY]); };
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement) continue;
    const cs = getComputedStyle(node.parentElement);
    if (cs.visibility === 'hidden') continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) push(r);
  }
  const visible = (c) => c && c !== 'transparent' && !/rgba\\(.*,\\s*0\\)$/.test(c);
  for (const el of main.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    const media = /^(IMG|SVG|VIDEO|CANVAS|IFRAME|INPUT|SELECT|TEXTAREA|BUTTON|PICTURE)$/i.test(el.tagName) || el.classList.contains('inv-icon');
    const box = r.height < 0.8 * docHeight && ((visible(cs.backgroundColor) && cs.backgroundColor !== pageBg) || cs.backgroundImage !== 'none'
      || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && visible(cs['border' + s + 'Color'])));
    if (media || box) push(r);
  }
  const name = ${JSON.stringify(name ?? null)};
  let nameCheck = null;
  if (name !== null) {
    const all = [...main.querySelectorAll('*')];
    const el = all.find((n) => n.children.length === 0 && n.textContent.trim() === name) ?? all.find((n) => n.textContent.trim() === name);
    nameCheck = el
      ? { found: true, clipped: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible', right: Math.round(el.getBoundingClientRect().right), injected: main.querySelectorAll('img[src="x"], script:not([src])').length }
      : { found: false, clipped: false, right: 0, injected: main.querySelectorAll('img[src="x"]').length };
  }
  return { intervals, overflow: document.documentElement.scrollWidth - innerWidth, viewportHeight: innerHeight, docHeight, nameCheck, running: ${RUNNING}, icons: main.querySelectorAll('.inv-icon').length };
})()`;

async function iconInk(cdp: Cdp, limit: number): Promise<number[]> {
  const count = await evaluate<number>(cdp, `document.querySelectorAll('main .inv-icon').length`);
  const inks: number[] = [];
  for (let index = 0; index < count && inks.length < limit; index++) {
    const box = await evaluate<{ x: number; y: number; width: number; height: number } | null>(
      cdp,
      `(() => { const el = document.querySelectorAll('main .inv-icon')[${index}]; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
        return r.width >= 8 && r.height >= 8 && getComputedStyle(el).visibility !== 'hidden' ? { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } : null; })()`,
    );
    if (!box) continue;
    await delay(60);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    inks.push(Math.round(inkRatio(decodePng(Buffer.from(shot.data, 'base64'))) * 1000) / 1000);
  }
  return inks;
}

export type Check = { check: string; verdict: Verdict; detail: string };
export type PageResult = { label: string; url: string; checks: Check[]; rhythm: ReturnType<typeof rhythmSummary> & { docHeight: number } };

async function acceptPage(cdp: Cdp, label: string, url: string, skipMedia: boolean, dialogs: string[]): Promise<PageResult> {
  const guest = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
  const name = STRESS_NAMES[guest];
  const checks: Check[] = [];
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await load(cdp, url, 0);
  const runningWithMotion = await maxRunningWhileScrolling(cdp);
  const before = dialogs.length;
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await load(cdp, url, 1000);
  const runningReduced = await maxRunningWhileScrolling(cdp);
  const m = await evaluate<{
    intervals: [number, number][]; overflow: number; viewportHeight: number; docHeight: number; running: number; icons: number;
    nameCheck: { found: boolean; clipped: boolean; right: number; injected: number } | null;
  }>(cdp, MEASURE(name));
  checks.push({ check: 'overflow', verdict: m.overflow > 1 ? 'FAIL' : 'PASS', detail: `${m.overflow} px` });
  if (m.nameCheck) {
    const n = m.nameCheck;
    const bad = !n.found || n.clipped || n.right > 361 || n.injected > 0 || dialogs.length > before;
    checks.push({ check: 'name', verdict: bad ? 'FAIL' : 'PASS', detail: `${guest}: found ${n.found}, clipped ${n.clipped}, right ${n.right}, injected ${n.injected}, dialogs ${dialogs.length - before}` });
  } else checks.push({ check: 'name', verdict: 'N/A', detail: `unknown guest ${guest}` });
  const { gaps } = verticalGaps(m.intervals);
  const rhythm = { ...rhythmSummary(gaps, m.viewportHeight), docHeight: m.docHeight };
  checks.push({
    check: 't3-rhythm',
    verdict: rhythm.verdict,
    detail: `block gaps ${rhythm.blockGaps}, median ${rhythm.median}, p90 ${rhythm.p90}, max ${rhythm.max} px; screen-high ${rhythm.screenHigh.length}; outliers ${rhythm.outliers.map((g) => `${g.height}@${g.top}`).join(' ') || 'none'}`,
  });
  const reduced = Math.max(m.running, runningReduced);
  checks.push({
    check: 'reduced-motion',
    verdict: reduced > 0 ? 'FAIL' : 'PASS',
    detail: `most running with reduce ${reduced}; without it ${runningWithMotion}${runningWithMotion ? '' : ' (this page animates nothing either way)'}`,
  });
  if (skipMedia) return { label, url, checks, rhythm };
  if (!m.icons) {
    checks.push({ check: 'forced-colors', verdict: 'N/A', detail: 'no icons' }, { check: 'print', verdict: 'N/A', detail: 'no icons' });
    return { label, url, checks, rhythm };
  }
  const normal = await iconInk(cdp, MAX_ICONS);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'forced-colors', value: 'active' }] });
  await delay(200);
  const forced = await iconInk(cdp, MAX_ICONS);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // An icon without ink in normal mode means the measurement could not see it, never a pass.
  const unseen = normal.filter((ink) => ink < INK_MIN).length;
  const lost = forced.filter((ink) => ink < INK_MIN).length;
  checks.push({
    check: 'forced-colors',
    verdict: !forced.length || unseen || forced.length !== normal.length ? 'INCOMPLETE' : lost ? 'FAIL' : 'PASS',
    detail: `${m.icons} icons; ink normal ${normal.join('/')} · forced ${forced.join('/')}`,
  });
  const shipped = pdfDrawOps(Buffer.from((await cdp.send('Page.printToPDF', { printBackground: false })).data, 'base64'));
  await evaluate(cdp, `(() => { const s = document.createElement('style'); s.textContent = '.inv-icon{print-color-adjust:economy!important;-webkit-print-color-adjust:economy!important}'; document.head.append(s); return true; })()`);
  const economy = pdfDrawOps(Buffer.from((await cdp.send('Page.printToPDF', { printBackground: false })).data, 'base64'));
  const more = shipped.clips + shipped.rects + shipped.fills - (economy.clips + economy.rects + economy.fills);
  checks.push({
    check: 'print',
    verdict: more > 0 ? 'PASS' : 'INCOMPLETE',
    detail: `shipped clips/rects/fills ${shipped.clips}/${shipped.rects}/${shipped.fills} vs economy ${economy.clips}/${economy.rects}/${economy.fills}`,
  });
  return { label, url, checks, rhythm };
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(process.env.TMPDIR ?? '/tmp', 'invitesion-design-acceptance');
  const targets = args
    .flatMap((arg, index) => (arg === '--url' ? [args[index + 1] ?? ''] : []))
    .map((pair) => ({ label: pair.slice(0, pair.indexOf('=')), url: pair.slice(pair.indexOf('=') + 1) }))
    .filter((target) => target.label && /^https?:\/\//.test(target.url));
  if (!targets.length) throw new Error('Pass at least one --url label=http://…');
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)');
  mkdirSync(out, { recursive: true });
  const { port, close } = await launchDevtoolsChrome(chrome, ['--hide-scrollbars']);
  const results: PageResult[] = [];
  try {
    const cdp = await connect(port);
    const dialogs: string[] = [];
    cdp.on('Page.javascriptDialogOpening', (params) => {
      dialogs.push(String(params.message));
      void cdp.send('Page.handleJavaScriptDialog', { accept: false });
    });
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    for (const target of targets) results.push(await acceptPage(cdp, target.label, target.url, args.includes('--skip-media'), dialogs));
    cdp.close();
  } finally {
    await close();
  }
  writeFileSync(join(out, 'design-acceptance.json'), `${JSON.stringify({ tool: 'design-acceptance', generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  const all = results.flatMap((result) => result.checks.map((check) => ({ ...check, label: result.label })));
  for (const row of all) if (row.verdict !== 'PASS' && row.verdict !== 'N/A') console.log(`${row.verdict.padEnd(10)} ${row.label} ${row.check}: ${row.detail}`);
  for (const result of results) console.log(`${result.label.padEnd(28)} ${result.checks.map((c) => `${c.check}=${c.verdict}`).join(' ')} | T3 median ${result.rhythm.median} p90 ${result.rhythm.p90} max ${result.rhythm.max}`);
  const count = (verdict: Verdict) => all.filter((row) => row.verdict === verdict).length;
  console.log(`design-acceptance: ${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('INCOMPLETE')} INCOMPLETE, ${count('N/A')} N/A over ${results.length} pages`);
  process.exitCode = count('FAIL') ? 1 : count('INCOMPLETE') ? 3 : 0;
}

if (process.argv[1]?.endsWith('design-acceptance.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
