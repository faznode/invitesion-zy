/**
 * image-bytes.ts — what a guest page's images cost on a phone (B-019, I-28): every image the page requests from first
 * paint through a scroll to its end, at phone viewports and densities, with and without `Save-Data: on`.
 *
 *   npx tsx tools/template-harness/image-bytes.ts --out /tmp/image-bytes --url label=URL [--url …] \
 *     [--save-data both|on|off] [--viewport 360x800@2 --viewport 412x915@2.625]
 *
 * One headless Chrome, cache disabled, no throttling, mobile emulation. Lazy images are reached by scrolling the
 * document in viewport steps, then waiting for 1 s without a request in flight (cap 30 s). For every `<img>` in `<main>`
 * the browser's own choice is read back (`currentSrc`, rendered CSS width, the candidates offered), so "the page
 * requests the variant for its viewport" is checked against what Chrome selected, not against the markup.
 *
 * Verdict per run (`imageVerdict`): INCOMPLETE when the page did not answer 200 or did not load; FAIL when a variant
 * request (`/media/variants/…`) is above the single-image budget (`SINGLE_IMAGE_BUDGET`, 08 §3's strictest tier), when an
 * image offered variants still loaded its original, or when the chosen variant is narrower than 90 % of the rendered
 * width × density while a wider candidate existed (a blurry pick); PASS otherwise. Bytes are recorded for comparison
 * between runs (before / after variants, Save-Data) and never judged against another run. Exit 0 PASS, 1 FAIL,
 * 3 INCOMPLETE. Lab only: emulated phones, not devices; transfer bytes as this local server sends them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome, launchDevtoolsChrome } from './browser';

/** 08 §3: "Any single image", basic tier (the strictest): 200 KiB. */
export const SINGLE_IMAGE_BUDGET = 200 * 1024;
const QUIET_MS = 1000;
const CAP_MS = 30000;

export type Viewport = { width: number; height: number; scale: number };
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 360, height: 800, scale: 2 },
  { width: 412, height: 915, scale: 2.625 },
];

export type ImageRequest = { url: string; status: number; transferBytes: number; decodedBytes: number };
export type RenderedImage = { src: string; currentSrc: string; renderedWidth: number; offered: string | null };
export type ImageRun = {
  label: string;
  url: string;
  viewport: Viewport;
  saveData: boolean;
  status: number;
  loaded: boolean;
  requests: ImageRequest[];
  images: RenderedImage[];
  error?: string;
};
export type ImageVerdict = { verdict: 'PASS' | 'FAIL' | 'INCOMPLETE'; problems: string[] };

export type MediaKind = { kind: 'variant'; tier: string; width: number } | { kind: 'original' } | { kind: 'other' };

/** A host upload's original (`/media/<invitation>/<24 hex>.<ext>`), one of its variants, or anything else. */
export function classifyImageUrl(url: string): MediaKind {
  let path: string;
  try {
    path = new URL(url, 'http://local.invalid').pathname;
  } catch {
    return { kind: 'other' };
  }
  const variant = /^\/media\/variants\/\d+\/[0-9a-f]{24}\/(standard|lite)-(\d+)\.webp$/.exec(path);
  if (variant) return { kind: 'variant', tier: variant[1], width: Number(variant[2]) };
  if (/^\/media\/\d+\/[0-9a-f]{24}\.(png|jpg|webp|gif)$/.test(path)) return { kind: 'original' };
  return { kind: 'other' };
}

/** `url 320w, url 640w` → [320, 640]. */
export function candidateWidths(srcset: string | null): number[] {
  if (!srcset) return [];
  return srcset
    .split(',')
    .map((candidate) => /\s(\d+)w\s*$/.exec(candidate.trim())?.[1])
    .filter((width): width is string => Boolean(width))
    .map(Number)
    .sort((a, b) => a - b);
}

export function imageVerdict(run: ImageRun): ImageVerdict {
  if (run.error || !run.loaded || run.status !== 200) {
    return { verdict: 'INCOMPLETE', problems: [run.error ?? (run.loaded ? `status ${run.status}` : 'no load event')] };
  }
  const problems: string[] = [];
  for (const request of run.requests) {
    if (classifyImageUrl(request.url).kind === 'variant' && request.transferBytes > SINGLE_IMAGE_BUDGET) {
      problems.push(`${request.url}: ${request.transferBytes} bytes above the single-image budget`);
    }
  }
  for (const image of run.images) {
    const widths = candidateWidths(image.offered);
    if (!widths.length) continue;
    const chosen = classifyImageUrl(image.currentSrc);
    if (chosen.kind !== 'variant') {
      problems.push(`${image.src}: offered variants but loaded ${image.currentSrc || 'nothing'}`);
      continue;
    }
    const needed = image.renderedWidth * run.viewport.scale;
    const wider = widths.some((width) => width > chosen.width);
    if (chosen.width < needed * 0.9 && wider) {
      problems.push(`${image.src}: chose ${chosen.width} px for ${Math.round(needed)} device px with a wider variant offered`);
    }
  }
  return { verdict: problems.length ? 'FAIL' : 'PASS', problems };
}

export function summarise(run: ImageRun) {
  const kinds = run.requests.map((request) => ({ ...request, kind: classifyImageUrl(request.url).kind }));
  const sum = (key: 'transferBytes' | 'decodedBytes', filter: (kind: string) => boolean = () => true) =>
    kinds.filter((request) => filter(request.kind)).reduce((total, request) => total + request[key], 0);
  return {
    images: kinds.length,
    originals: kinds.filter((request) => request.kind === 'original').length,
    variants: kinds.filter((request) => request.kind === 'variant').length,
    transferBytes: sum('transferBytes'),
    decodedBytes: sum('decodedBytes'),
    uploadTransferBytes: sum('transferBytes', (kind) => kind !== 'other'),
    largestTransferBytes: Math.max(0, ...kinds.map((request) => request.transferBytes)),
  };
}

type Cdp = {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<any>;
  on: (handler: (method: string, params: any, sessionId?: string) => void) => () => void;
  close: () => void;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(url: string): Promise<Cdp> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const handlers = new Set<(method: string, params: any, sessionId?: string) => void>();
    let nextId = 0;
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const handler = pending.get(message.id)!;
        pending.delete(message.id);
        if (message.error) handler.reject(new Error(message.error.message));
        else handler.resolve(message.result);
        return;
      }
      if (message.method) for (const handler of handlers) handler(message.method, message.params, message.sessionId);
    };
    ws.onerror = () => reject(new Error(`CDP connection to ${url} failed`));
    ws.onopen = () =>
      resolve({
        send: (method, params = {}, sessionId) =>
          new Promise((resolveSend, rejectSend) => {
            const id = ++nextId;
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          }),
        on: (handler) => {
          handlers.add(handler);
          return () => handlers.delete(handler);
        },
        close: () => ws.close(),
      });
  });
}

async function debuggerUrl(port: number): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await delay(200);
    }
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

const READ_IMAGES = `JSON.stringify([...document.querySelectorAll('main img')].map((img) => {
  const source = img.closest('picture')?.querySelector('source');
  return { src: img.getAttribute('src') || '', currentSrc: img.currentSrc || '', renderedWidth: img.getBoundingClientRect().width, offered: source ? source.getAttribute('srcset') : img.getAttribute('srcset') };
}))`;

async function measure(cdp: Cdp, label: string, url: string, viewport: Viewport, saveData: boolean): Promise<ImageRun> {
  const run: ImageRun = { label, url, viewport, saveData, status: 0, loaded: false, requests: [], images: [] };
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
  const requests = new Map<string, ImageRequest & { type: string; done: boolean }>();
  let documentId: string | undefined;
  let lastActivity = Date.now();
  const stop = cdp.on((method, params, from) => {
    if (from !== sessionId) return;
    if (method === 'Page.loadEventFired') run.loaded = true;
    if (!method.startsWith('Network.')) return;
    lastActivity = Date.now();
    const entry = requests.get(params.requestId);
    if (method === 'Network.requestWillBeSent' && !entry) {
      requests.set(params.requestId, { url: params.request.url, type: params.type ?? 'Other', status: 0, transferBytes: 0, decodedBytes: 0, done: false });
      if (params.type === 'Document' && !documentId) documentId = params.requestId;
    } else if (entry && method === 'Network.responseReceived') {
      entry.status = params.response.status;
      entry.type = params.type ?? entry.type;
    } else if (entry && method === 'Network.dataReceived') {
      entry.decodedBytes += params.dataLength;
    } else if (entry && method === 'Network.loadingFinished') {
      entry.transferBytes = params.encodedDataLength;
      entry.done = true;
    } else if (entry && method === 'Network.loadingFailed') {
      entry.done = true;
    }
  });
  const settle = async (since: number) => {
    while (Date.now() - since < CAP_MS) {
      const inFlight = [...requests.values()].some((request) => !request.done);
      if (run.loaded && !inFlight && Date.now() - lastActivity >= QUIET_MS) return true;
      await delay(100);
    }
    return false;
  };
  try {
    await send('Page.enable');
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    if (saveData) await send('Network.setExtraHTTPHeaders', { headers: { 'Save-Data': 'on' } });
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url });
    if (!(await settle(Date.now())) && !run.loaded) {
      run.error = `no load event within ${CAP_MS / 1000} s`;
      return run;
    }
    // Reach every lazy image: scroll in viewport steps to the end of the document, then settle again.
    const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
    for (let y = 0; y <= Number(result.value); y += viewport.height) {
      await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})` });
      await delay(120);
    }
    await settle(Date.now());
    const images = await send('Runtime.evaluate', { expression: READ_IMAGES, returnByValue: true });
    run.images = JSON.parse(images.result.value) as RenderedImage[];
    run.status = documentId ? (requests.get(documentId)?.status ?? 0) : 0;
    run.requests = [...requests.values()]
      .filter((request) => request.done && request.type === 'Image' && !request.url.startsWith('data:'))
      .map(({ url: imageUrl, status, transferBytes, decodedBytes }) => ({ url: imageUrl, status, transferBytes, decodedBytes }));
    return run;
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
    return run;
  } finally {
    stop();
    await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
  }
}

function parseArgs(argv: string[]) {
  const urls: { label: string; url: string }[] = [];
  const viewports: Viewport[] = [];
  let out = '';
  let saveData: 'both' | 'on' | 'off' = 'both';
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--url') {
      const [label, ...rest] = value.split('=');
      urls.push({ label, url: rest.join('=') });
      i++;
    } else if (argv[i] === '--save-data') {
      if (value !== 'both' && value !== 'on' && value !== 'off') throw new Error('--save-data takes both, on or off');
      saveData = value;
      i++;
    } else if (argv[i] === '--viewport') {
      const match = /^(\d+)x(\d+)@([\d.]+)$/.exec(value ?? '');
      if (!match) throw new Error('--viewport takes WIDTHxHEIGHT@SCALE, e.g. 360x800@2');
      viewports.push({ width: Number(match[1]), height: Number(match[2]), scale: Number(match[3]) });
      i++;
    } else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!out || !urls.length) throw new Error('usage: image-bytes.ts --out DIR --url label=URL [--url …]');
  return { out, urls, viewports: viewports.length ? viewports : DEFAULT_VIEWPORTS, saveData };
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

async function main() {
  const { out, urls, viewports, saveData } = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  if (!chrome) {
    console.log('image-bytes: INCOMPLETE (Chrome not found; run bootstrap-sandbox.sh tools)');
    process.exit(3);
  }
  mkdirSync(out, { recursive: true });
  const { port, close } = await launchDevtoolsChrome(chrome);
  const cdp = await connect(await debuggerUrl(port));
  const modes = saveData === 'both' ? [false, true] : [saveData === 'on'];
  const results: (ImageRun & ImageVerdict & { summary: ReturnType<typeof summarise> })[] = [];
  try {
    for (const { label, url } of urls) {
      for (const viewport of viewports) {
        for (const mode of modes) {
          const run = await measure(cdp, label, url, viewport, mode);
          const verdict = imageVerdict(run);
          const summary = summarise(run);
          results.push({ ...run, ...verdict, summary });
          const where = `${viewport.width}x${viewport.height}@${viewport.scale}`;
          console.log(
            `${verdict.verdict.padEnd(10)} ${label} ${where} save-data=${mode ? 'on ' : 'off'}  images ${summary.images} ` +
              `(variants ${summary.variants}, originals ${summary.originals})  transfer ${kib(summary.transferBytes)}  ` +
              `uploads ${kib(summary.uploadTransferBytes)}  largest ${kib(summary.largestTransferBytes)}`,
          );
          for (const problem of verdict.problems) console.log(`           ${problem}`);
        }
      }
    }
  } finally {
    cdp.close();
    await close();
  }
  const fail = results.some((result) => result.verdict === 'FAIL');
  const incomplete = results.some((result) => result.verdict === 'INCOMPLETE');
  const overall = fail ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS';
  writeFileSync(join(out, 'image-bytes.json'), JSON.stringify({ chrome, budget: SINGLE_IMAGE_BUDGET, overall, results }, null, 2));
  console.log(`image-bytes: ${overall} (${results.length} runs; ${join(out, 'image-bytes.json')})`);
  process.exit(fail ? 1 : incomplete ? 3 : 0);
}

if (process.argv[1]?.endsWith('image-bytes.ts')) {
  main().catch((error) => {
    console.error(`image-bytes: INCOMPLETE (${error instanceof Error ? error.message : String(error)})`);
    process.exit(3);
  });
}
