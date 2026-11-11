/**
 * Gallery acceptance (B-025, G-028): the design families' gallery layouts, the lightbox island and the video facades, in
 * headless Chrome against the real routes.
 *
 *   npx tsx tools/template-harness/gallery-gate.ts --out <dir> --base http://127.0.0.1:3100 \
 *     --pages review-gapura-gallery-grid,review-gapura-gallery-masonry,… --legacy review-legacy-gallery-carousel \
 *     [--guest budi-hartono] [--axe <axe.min.js>]
 *   npx tsx tools/template-harness/gallery-gate.ts --write-photos <dir>   # the fixture's photos: generated here, no licence
 *
 * Per family page (360 × 800, mobile emulation; the expected layout is the slug's last segment):
 *   layout     the photo boxes stand as the layout says (`arrangement`: grid rows, masonry columns, one carousel row wider
 *              than its scroller); no layout shift inside the gallery while its images load; the document never scrolls
 *              sideways (0 px overflow); the page's whole layout shift stays within CLS_LIMIT.
 *   keyboard   Enter on a focused photo link opens the lightbox on that photo with focus on its close button; the counter
 *              and the image name follow ArrowRight / ArrowLeft (wrapping); Tab never reaches the page behind; Escape
 *              closes it, focus returns to that photo link and the page scrolls again.
 *   pointer    a click on a photo opens it, "Foto berikutnya" steps, "Tutup galeri" closes and returns focus.
 *   requests   the closed lightbox holds no image; the open one shows the photo it names (loaded).
 *   reduced    under prefers-reduced-motion nothing animates while the lightbox is open (I-15).
 *   video      no provider request and no player before a tap; a tap on the YouTube poster makes exactly one player
 *              request, to www.youtube-nocookie.com, and focus moves into the player; another page opens in a new tab.
 *   axe        no axe violation (WCAG 2.x A / AA) in the gallery, and none in the open lightbox.
 * Per --legacy page (D-041): no lightbox, no video, the photos as plain images.
 * The players are answered by this tool (`Fetch` interception, site isolation off so the frame is in process), so nothing
 * reaches YouTube or Vimeo. Writes gallery-gate.json and a 360 × 800 screenshot of each open lightbox; exit 0 when every
 * check passes, 1 otherwise. Lab only: emulated phone, one Chrome build.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { findChrome, launchDevtoolsChrome } from './browser';

export type GalleryCheck = { name: string; pass: boolean; detail?: string };
export type GalleryLayoutName = 'grid' | 'masonry' | 'carousel';
export type GalleryRow = { page: string; kind: 'family' | 'legacy'; layout: GalleryLayoutName | 'legacy'; verdict: 'PASS' | 'FAIL'; checks: GalleryCheck[] };
export type Box = { x: number; y: number; width: number; height: number };

/** Web Vitals' "good" bound for the whole page; the gallery's own share must be exactly 0. */
export const CLS_LIMIT = 0.1;
export const PLAYER_HOSTS = ['www.youtube-nocookie.com', 'player.vimeo.com'] as const;
const PROVIDER_PATTERNS = ['*youtube-nocookie.com*', '*youtube.com*', '*youtu.be*', '*ytimg.com*', '*vimeo.com*', '*vimeocdn.com*'];

export function galleryVerdict(checks: GalleryCheck[]): GalleryRow['verdict'] {
  return checks.length > 0 && checks.every((check) => check.pass) ? 'PASS' : 'FAIL';
}

/** The layout a slug asks for: its last segment (`review-gapura-gallery-masonry` → masonry). */
export function expectedLayout(page: string): GalleryLayoutName | null {
  const last = page.split('-').pop();
  return last === 'grid' || last === 'masonry' || last === 'carousel' ? last : null;
}

/**
 * How photo boxes stand, from their document rectangles in DOM order:
 * - carousel: one row (shared top) inside a scroller wider than its box;
 * - grid: rows that never overlap, each of one height, at least one with boxes side by side (a first photo spanning the
 *   row, as Kartu's, is a row of its own);
 * - masonry: otherwise, when the second photo sits under the first (column order), with two or more columns and differing
 *   heights.
 * Anything else is `unknown`, which fails the layout check.
 */
export function arrangement(boxes: Box[], scroller?: { clientWidth: number; scrollWidth: number }): GalleryLayoutName | 'unknown' {
  if (boxes.length < 3) return 'unknown';
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  if (boxes.every((box) => near(box.y, boxes[0].y))) return scroller && scroller.scrollWidth > scroller.clientWidth + 1 ? 'carousel' : 'unknown';
  const rows: Box[][] = [];
  for (const box of [...boxes].sort((a, b) => a.y - b.y)) {
    const row = rows.find((candidate) => near(candidate[0].y, box.y));
    if (row) row.push(box);
    else rows.push([box]);
  }
  const evenRows = rows.every((row) => row.every((box) => near(box.height, row[0].height)));
  const stacked = rows.every((row, i) => i === 0 || row[0].y >= Math.max(...rows[i - 1].map((box) => box.y + box.height)) - 1);
  if (evenRows && stacked && rows.some((row) => row.length >= 2)) return 'grid';
  const columns = new Set(boxes.map((box) => Math.round(box.x))).size;
  const heights = new Set(boxes.map((box) => Math.round(box.height))).size;
  if (near(boxes[1].x, boxes[0].x) && boxes[1].y > boxes[0].y && columns >= 2 && heights >= 2) return 'masonry';
  return 'unknown';
}

// ── Generated fixture photos (no photograph, no licence) ──────────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
/** A soft two-axis gradient as an 8-bit RGB PNG: a stand-in photo with real decoding cost and no content. */
export function gradientPng(width: number, height: number, hue: number): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = hslToRgb((hue + (x / width) * 40) % 360, 0.45, 0.3 + 0.45 * (y / height));
      raw.set([r, g, b], y * stride + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
/** Five photos, portrait and landscape: `gallery-1.png` … `gallery-5.png`. */
export const FIXTURE_PHOTOS = [
  { name: 'gallery-1.png', width: 600, height: 800, hue: 20 },
  { name: 'gallery-2.png', width: 800, height: 600, hue: 160 },
  { name: 'gallery-3.png', width: 600, height: 800, hue: 280 },
  { name: 'gallery-4.png', width: 800, height: 600, hue: 60 },
  { name: 'gallery-5.png', width: 600, height: 800, hue: 330 },
] as const;

// ── Chrome ────────────────────────────────────────────────────────────────────────────────────────────────────────
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
            const timer = setTimeout(() => { pending.delete(n); reject(new Error(`${method}: Chrome did not respond within 8 seconds`)); }, 8000);
            pending.set(n, (m) => { clearTimeout(timer); if (m.error) reject(new Error(`${method}: ${m.error.message}`)); else resolve(m.result); });
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
  if (exceptionDetails) throw new Error(`evaluate failed: ${exceptionDetails.exception?.description ?? exceptionDetails.text} ${expression.slice(0, 80)}`);
  return result.value as T;
}

/** Milliseconds until `expression` held, or null when it did not within `timeoutMs`. */
async function waitFor(cdp: Cdp, expression: string, timeoutMs: number): Promise<number | null> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (await evaluate<boolean>(cdp, expression)) return Date.now() - started;
    await sleep(25);
  }
  return null;
}

async function load(cdp: Cdp, url: string) {
  const cleared = await cdp.send('Page.navigate', { url: 'about:blank' });
  if (cleared.errorText) throw new Error(`Could not clear the previous document: ${cleared.errorText}`);
  const navigated = await cdp.send('Page.navigate', { url });
  if (navigated.errorText) throw new Error(`Could not load ${url}: ${navigated.errorText}`);
  const ready = `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && document.fonts.status === 'loaded'`;
  if ((await waitFor(cdp, ready, 15_000)) === null) throw new Error(`Page did not finish loading: ${url}`);
}

const KEYS = { Tab: 9, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowRight: 39 } as const;
async function key(cdp: Cdp, name: keyof typeof KEYS) {
  const text = name === 'Enter' ? '\r' : undefined;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: KEYS[name], ...(text && { text }) });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: KEYS[name] });
}

async function click(cdp: Cdp, selector: string) {
  const box = await evaluate<{ x: number; y: number } | null>(
    cdp,
    // `instant`: the carousel scrolls smoothly (motion-safe), and a press and release on a moving target is no click.
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  if (!box) throw new Error(`no element for ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

/** The island's dialog is rendered by React; once React marks it, its handlers exist. */
const HYDRATED = `(() => { const d = document.querySelector('dialog'); return !!d && Object.keys(d).some((key) => key.startsWith('__reactProps')); })()`;
const SECTION = `(document.querySelector('a[data-lightbox-index]')?.closest('section') ?? document.querySelector('a[data-lightbox-index]')?.parentElement?.parentElement)`;
const STATE = `(() => {
  const dialog = document.querySelector('dialog');
  const img = dialog?.querySelector('img');
  const active = document.activeElement;
  return {
    open: !!dialog?.open,
    counter: dialog?.querySelector('[aria-live]')?.textContent ?? null,
    label: dialog?.getAttribute('aria-label') ?? null,
    alt: img?.getAttribute('alt') ?? null,
    loaded: !!img && img.complete && img.naturalWidth > 0,
    imgCount: dialog ? dialog.querySelectorAll('img').length : -1,
    activeLabel: active?.getAttribute('aria-label') ?? active?.tagName ?? null,
    activeInPage: !!active && active !== document.body && active !== document.documentElement && !(dialog && dialog.contains(active)),
    activeTrigger: active?.matches('a[data-lightbox-index]') ? Number(active.getAttribute('data-lightbox-index')) : null,
    locked: document.documentElement.style.overflow === 'hidden',
  };
})()`;
type State = { open: boolean; counter: string | null; label: string | null; alt: string | null; loaded: boolean; imgCount: number; activeLabel: string | null; activeInPage: boolean; activeTrigger: number | null; locked: boolean };
/** Shut and cleaned up: the dialog's `close` event is a queued task, so its handler runs after `open` turns false. */
const SETTLED_CLOSED = `(() => { const d = document.querySelector('dialog'); return !!d && !d.open && !d.querySelector('img') && document.documentElement.style.overflow !== 'hidden'; })()`;
const OPEN_AT = (shown: number, total: number) => `(() => { const d = document.querySelector('dialog'); return !!d && d.open && d.querySelector('[aria-live]')?.textContent === ${JSON.stringify(`${shown} / ${total}`)}; })()`;
const LIGHTBOX_IMAGE_LOADED = `(() => { const img = document.querySelector('dialog img'); return !!img && img.complete && img.naturalWidth > 0; })()`;

/** Layout shifts from the start of the document, kept with their source nodes (registered before any page script). */
const SHIFT_RECORDER = `window.__shifts = []; new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__shifts.push(entry); }).observe({ type: 'layout-shift', buffered: true });`;
const SHIFTS = `(() => {
  const section = ${SECTION};
  const counted = (window.__shifts || []).filter((entry) => !entry.hadRecentInput);
  const total = counted.reduce((sum, entry) => sum + entry.value, 0);
  const gallery = counted.filter((entry) => (entry.sources || []).some((source) => source.node && section && section.contains(source.node))).reduce((sum, entry) => sum + entry.value, 0);
  return { total, gallery };
})()`;

function axePath(explicit: string | undefined): string | null {
  const candidates = [explicit, process.env.LH_BIN && join(dirname(process.env.LH_BIN), '..', 'axe-core', 'axe.min.js'), join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')];
  return candidates.find((path): path is string => !!path && existsSync(path)) ?? null;
}

const AXE_OPTIONS = JSON.stringify({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
async function axeViolations(cdp: Cdp, axeSource: string, contextExpression: string): Promise<string[]> {
  if (!(await evaluate<boolean>(cdp, 'typeof window.axe === "object"'))) await evaluate(cdp, `${axeSource};true`);
  return evaluate<string[]>(
    cdp,
    `(async () => { const context = ${contextExpression}; if (!context) return ['no context to check']; const result = await axe.run(context, ${AXE_OPTIONS}); return result.violations.map((v) => v.id + ' (' + v.nodes.length + '): ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')); })()`,
  );
}

export async function runGalleryGate(options: { base: string; pages: string[]; legacy: string[]; guest: string; out: string; axe?: string }): Promise<GalleryRow[]> {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)');
  const axeFile = axePath(options.axe);
  const axeSource = axeFile ? readFileSync(axeFile, 'utf8') : null;
  const { port, close } = await launchDevtoolsChrome(chrome, ['--hide-scrollbars', '--mute-audio', '--disable-features=IsolateOrigins,site-per-process']);
  const rows: GalleryRow[] = [];
  try {
    const cdp = await connect(port);
    const providerRequests: string[] = [];
    cdp.on('Fetch.requestPaused', (params) => {
      providerRequests.push(String(params.request?.url ?? ''));
      void cdp
        .send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<!doctype html><title>pemutar uji</title>').toString('base64') })
        .catch(() => undefined);
    });
    await cdp.send('Fetch.enable', { patterns: PROVIDER_PATTERNS.map((urlPattern) => ({ urlPattern })) });
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SHIFT_RECORDER });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
    const motion = (value: '' | 'reduce') => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
    const state = () => evaluate<State>(cdp, STATE);
    const url = (page: string) => `${options.base}/i/${page}/${options.guest}`;

    for (const page of options.pages) {
      const layout = expectedLayout(page);
      const checks: GalleryCheck[] = [];
      const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, ...(detail !== undefined && { detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }) });
      try {
        if (!layout) throw new Error(`${page}: the slug names no layout (grid, masonry or carousel)`);
        await motion('');
        providerRequests.length = 0;
        await load(cdp, url(page));
        check('page: hydrated', (await waitFor(cdp, HYDRATED, 10_000)) !== null);
        const total = await evaluate<number>(cdp, `document.querySelectorAll('a[data-lightbox-index]').length`);
        check('page: at least three photo links', total >= 3, total);

        // layout: bring the gallery in; in a carousel show each photo once (they load lazily as they come into view).
        await evaluate(cdp, `${SECTION}?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
        if (await evaluate<boolean>(cdp, `!!document.querySelector('[role="region"]')`)) {
          for (let i = 0; i < total; i++) {
            await evaluate(cdp, `document.querySelector('a[data-lightbox-index="${i}"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })`);
            await sleep(150);
          }
        }
        const imagesLoaded = await waitFor(cdp, `[...(${SECTION}?.querySelectorAll('a[data-lightbox-index] img') ?? [])].every((img) => img.complete && img.naturalWidth > 0)`, 15_000);
        await evaluate(cdp, `(() => { const region = document.querySelector('[role="region"]'); if (region) region.scrollTo({ left: 0, behavior: 'instant' }); })()`);
        check('layout: every gallery photo loaded', imagesLoaded !== null);
        const geometry = await evaluate<{ boxes: Box[]; scroller: { clientWidth: number; scrollWidth: number } | null; overflow: number }>(
          cdp,
          `(() => {
            const links = [...document.querySelectorAll('a[data-lightbox-index]')];
            const boxes = links.map((link) => { const r = link.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; });
            const region = document.querySelector('[role="region"]');
            return { boxes, scroller: region ? { clientWidth: region.clientWidth, scrollWidth: region.scrollWidth } : null, overflow: document.documentElement.scrollWidth - innerWidth };
          })()`,
        );
        const seen = arrangement(geometry.boxes, geometry.scroller ?? undefined);
        check(`layout: the photos stand as ${layout}`, seen === layout, { seen, boxes: geometry.boxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]) });
        check('layout: 0 px horizontal overflow', geometry.overflow <= 0, geometry.overflow);
        await sleep(300);
        const shifts = await evaluate<{ total: number; gallery: number }>(cdp, SHIFTS);
        check('layout: no layout shift inside the gallery', shifts.gallery === 0, shifts);
        check(`layout: page CLS ≤ ${CLS_LIMIT}`, shifts.total <= CLS_LIMIT, shifts);

        // requests (closed)
        const closed = await state();
        check('requests: the closed lightbox holds no image', !closed.open && closed.imgCount === 0, closed);

        // axe (closed)
        if (axeSource) {
          const violations = await axeViolations(cdp, axeSource, SECTION);
          check('axe: no violation in the gallery', violations.length === 0, violations);
        } else check('axe: axe-core found (LH_BIN or --axe)', false);

        // keyboard
        await evaluate(cdp, `document.querySelector('a[data-lightbox-index="0"]').focus()`);
        await key(cdp, 'Enter');
        await waitFor(cdp, OPEN_AT(1, total), 3000);
        await waitFor(cdp, LIGHTBOX_IMAGE_LOADED, 10_000);
        const opened = await state();
        check('keyboard: Enter opens the first photo with focus on "Tutup galeri"', opened.open && opened.counter === `1 / ${total}` && opened.activeLabel === 'Tutup galeri' && opened.locked, opened);
        check('requests: the open lightbox shows the photo it names', opened.loaded && opened.imgCount === 1 && opened.alt === `Foto 1 dari ${total}` && opened.label === `Foto 1 dari ${total}`, opened);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(options.out, `${page}-lightbox.png`), Buffer.from(shot.data, 'base64'));
        if (axeSource) {
          const violations = await axeViolations(cdp, axeSource, `document.querySelector('dialog')`);
          check('axe: no violation in the open lightbox', violations.length === 0, violations);
        }
        await key(cdp, 'ArrowRight');
        const next = await state();
        check('keyboard: ArrowRight shows the next photo', next.counter === `2 / ${total}` && next.alt === `Foto 2 dari ${total}`, next);
        await key(cdp, 'ArrowLeft');
        await key(cdp, 'ArrowLeft');
        const wrapped = await state();
        check('keyboard: ArrowLeft wraps to the last photo', wrapped.counter === `${total} / ${total}` && wrapped.alt === `Foto ${total} dari ${total}`, wrapped);
        const tabbed: (string | null)[] = [];
        let escaped = false;
        for (let i = 0; i < 6; i++) {
          await key(cdp, 'Tab');
          const now = await state();
          tabbed.push(now.activeLabel);
          if (now.activeInPage) escaped = true;
        }
        check('keyboard: Tab never reaches the page behind', !escaped, tabbed);
        await key(cdp, 'Escape');
        const escapeSettledMs = await waitFor(cdp, SETTLED_CLOSED, 3000);
        const escapedState = await state();
        check(
          'keyboard: Escape closes it, focus returns to the photo link, the page scrolls again',
          escapeSettledMs !== null && !escapedState.open && escapedState.activeTrigger === 0 && !escapedState.locked && escapedState.imgCount === 0,
          { ...escapedState, settledMs: escapeSettledMs },
        );

        // pointer
        await click(cdp, 'a[data-lightbox-index="2"]');
        await waitFor(cdp, OPEN_AT(3, total), 3000);
        const clicked = await state();
        await click(cdp, 'dialog button[aria-label="Foto berikutnya"]');
        await waitFor(cdp, OPEN_AT(4, total), 3000);
        const stepped = await state();
        await click(cdp, 'dialog button[aria-label="Tutup galeri"]');
        const shutSettledMs = await waitFor(cdp, SETTLED_CLOSED, 3000);
        const shut = await state();
        check(
          'pointer: a click opens the photo, "Foto berikutnya" steps, "Tutup galeri" closes and returns focus',
          clicked.open && clicked.counter === `3 / ${total}` && stepped.counter === `4 / ${total}` && shutSettledMs !== null && !shut.open && shut.activeTrigger === 2,
          { clicked: clicked.counter, stepped: stepped.counter, shut, settledMs: shutSettledMs },
        );

        // reduced motion
        await motion('reduce');
        await evaluate(cdp, `document.querySelector('a[data-lightbox-index="1"]').focus()`);
        await key(cdp, 'Enter');
        await waitFor(cdp, OPEN_AT(2, total), 3000);
        const animating = await evaluate<{ running: number; transition: string }>(
          cdp,
          `({ running: document.getAnimations().filter((a) => a.playState === 'running').length, transition: getComputedStyle(document.querySelector('dialog')).transitionDuration })`,
        );
        check('reduced: nothing animates while the lightbox is open', animating.running === 0 && /^0s(, 0s)*$/.test(animating.transition), animating);
        await key(cdp, 'Escape');
        await waitFor(cdp, SETTLED_CLOSED, 3000);
        await motion('');

        // video
        const facade = 'a[href^="https://www.youtube.com/watch?v="]';
        const before = { requests: providerRequests.length, frames: await evaluate<number>(cdp, `document.querySelectorAll('iframe').length`) };
        check('video: nothing from a provider and no player before a tap', before.requests === 0 && before.frames === 0, { ...before, requested: providerRequests.slice(0, 3) });
        const facadeReady = (await waitFor(cdp, `(() => { const a = document.querySelector(${JSON.stringify(facade)}); return !!a && Object.keys(a).some((key) => key.startsWith('__reactProps')); })()`, 5000)) !== null;
        if (facadeReady) await click(cdp, facade);
        await waitFor(cdp, `!!document.querySelector('iframe')`, 3000);
        await sleep(500);
        const player = await evaluate<{ src: string | null; title: string | null; focused: boolean }>(
          cdp,
          `(() => { const frame = document.querySelector('iframe'); return { src: frame?.getAttribute('src') ?? null, title: frame?.getAttribute('title') ?? null, focused: !!frame && document.activeElement === frame }; })()`,
        );
        const playerRequests = providerRequests.filter((request) => new URL(request).hostname === 'www.youtube-nocookie.com');
        check(
          'video: a tap starts exactly one player request, to www.youtube-nocookie.com, and focus moves into the player',
          facadeReady && !!player.src?.startsWith('https://www.youtube-nocookie.com/embed/') && playerRequests.length === 1 && providerRequests.length === 1 && player.focused,
          { player, requested: providerRequests },
        );
        const plain = await evaluate<{ target: string | null; rel: string | null } | null>(
          cdp,
          `(() => { const a = [...document.querySelectorAll('a[target="_blank"]')].find((link) => link.textContent.startsWith('Tonton video')); return a ? { target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null; })()`,
        );
        check('video: another page opens in a new tab without the opener', plain?.target === '_blank' && /\bnoopener\b/.test(plain.rel ?? '') && /\bnoreferrer\b/.test(plain.rel ?? ''), plain);
      } catch (error) {
        check('run: completed', false, error instanceof Error ? error.message : String(error));
      }
      rows.push({ page, kind: 'family', layout: layout ?? 'grid', verdict: galleryVerdict(checks), checks });
    }

    for (const page of options.legacy) {
      const checks: GalleryCheck[] = [];
      const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, ...(detail !== undefined && { detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }) });
      try {
        await load(cdp, url(page));
        const legacy = await evaluate<{ dialogs: number; links: number; frames: number; facades: number; images: number }>(
          cdp,
          `({ dialogs: document.querySelectorAll('dialog').length, links: document.querySelectorAll('a[data-lightbox-index]').length, frames: document.querySelectorAll('iframe').length, facades: [...document.querySelectorAll('a')].filter((a) => /^(Putar|Tonton) video/.test(a.textContent.trim())).length, images: document.querySelectorAll('main img').length })`,
        );
        check('legacy (D-041): no lightbox, no video, the photos as plain images', legacy.dialogs === 0 && legacy.links === 0 && legacy.frames === 0 && legacy.facades === 0 && legacy.images >= 3, legacy);
      } catch (error) {
        check('run: completed', false, error instanceof Error ? error.message : String(error));
      }
      rows.push({ page, kind: 'legacy', layout: 'legacy', verdict: galleryVerdict(checks), checks });
    }
    cdp.close();
  } finally {
    await close();
  }
  return rows;
}

async function main() {
  const argValue = (flag: string) => (process.argv.indexOf(flag) > 0 ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
  const photosDir = argValue('--write-photos');
  if (photosDir) {
    mkdirSync(photosDir, { recursive: true });
    for (const photo of FIXTURE_PHOTOS) writeFileSync(join(photosDir, photo.name), gradientPng(photo.width, photo.height, photo.hue));
    console.log(`${FIXTURE_PHOTOS.length} generated photos in ${photosDir}: ${FIXTURE_PHOTOS.map((photo) => photo.name).join(', ')}`);
    return;
  }
  const out = argValue('--out');
  const base = argValue('--base');
  if (!out || !base) throw new Error('usage: gallery-gate.ts --out <dir> --base <origin> --pages <slug,…> [--legacy <slug,…>] [--guest <slug>] [--axe <axe.min.js>]');
  mkdirSync(out, { recursive: true });
  const list = (flag: string) => (argValue(flag) ?? '').split(',').filter(Boolean);
  const rows = await runGalleryGate({ base, out, pages: list('--pages'), legacy: list('--legacy'), guest: argValue('--guest') ?? 'budi-hartono', axe: argValue('--axe') });
  writeFileSync(join(out, 'gallery-gate.json'), JSON.stringify(rows, null, 2));
  for (const row of rows) {
    console.log(`${row.verdict.padEnd(5)} ${row.page} (${row.layout})`);
    for (const check of row.checks.filter((c) => !c.pass)) console.log(`      FAIL ${check.name}${check.detail ? `: ${check.detail.slice(0, 400)}` : ''}`);
  }
  const checks = rows.flatMap((row) => row.checks);
  const passed = checks.filter((check) => check.pass).length;
  const verdict = rows.length > 0 && rows.every((row) => row.verdict === 'PASS') ? 'PASS' : 'FAIL';
  console.log(`gallery-gate: ${verdict} (${passed} / ${checks.length} checks over ${rows.length} pages; ${join(out, 'gallery-gate.json')})`);
  process.exit(verdict === 'PASS' ? 0 : 1);
}

if (process.argv[1]?.endsWith('gallery-gate.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
