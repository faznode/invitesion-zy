/**
 * Cover-fold gate (s23r, S22-K2): does a guest page's greeting fit the first viewport, with every cover image loaded?
 *
 *   npx tsx tools/template-harness/cover-fold.ts --out <dir> --base http://127.0.0.1:3100 \
 *     --pages review-kartu-corp-wide,review-gapura-corp-wide --guests budi-hartono,nama-panjang,rtl-name \
 *     [--viewports 360x800,412x915,1024x768,1280x800,1366x768,1440x900,1920x1080] [--expect-broken-logo <page>,…]
 *
 * Per page × guest × viewport, in headless Chrome (cache off, reduced motion so entrance animations do not move
 * anything): the bottom of the guest's name (the element whose text is exactly that name), the viewport height, the
 * first header image's rendered box, whether every image above the name loaded (a missing image is INCOMPLETE, never a
 * PASS: a cover that failed to load makes any page fit), and horizontal overflow. PASS = images loaded, name bottom ≤
 * viewport height, no overflow. Writes `cover-fold.json`; exit 0 all PASS, 1 any FAIL, 3 any INCOMPLETE without FAIL.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome, launchDevtoolsChrome } from './browser';

export type FoldRow = {
  page: string; guest: string; viewport: string; verdict: 'PASS' | 'FAIL' | 'INCOMPLETE';
  nameBottom: number | null; height: number; photo: { width: number; height: number } | null; imagesLoaded: boolean;
  brokenImages: string[]; overflow: boolean; note?: string;
};

const GUEST_NAMES: Record<string, string> = {
  'budi-hartono': 'Budi Hartono',
  'nama-panjang': 'Muhammad Fadhlurrahman Al-Ghifari & Putri Anindya Maharani Kusumawardhani',
  'rtl-name': 'عبد الله بن أحمد',
};

export function foldVerdict(row: Omit<FoldRow, 'verdict'>): FoldRow['verdict'] {
  if (row.nameBottom === null || !row.imagesLoaded) return 'INCOMPLETE';
  return row.nameBottom <= row.height && !row.overflow ? 'PASS' : 'FAIL';
}

type Cdp = { send: (method: string, params?: Record<string, unknown>) => Promise<any>; close: () => void };

async function connect(port: number): Promise<Cdp> {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        let id = 0;
        const pending = new Map<number, (value: any) => void>();
        ws.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id && pending.has(message.id)) { pending.get(message.id)!(message); pending.delete(message.id); }
        };
        return {
          send: (method, params = {}) => new Promise((resolve, reject) => {
            const n = ++id;
            pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
            ws.send(JSON.stringify({ id: n, method, params }));
          }),
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

const MEASURE = (name: string) => `(() => {
  const all = [...document.querySelectorAll('main *')];
  const el = all.find((node) => node.children.length === 0 && node.textContent.trim() === ${JSON.stringify(name)})
    ?? all.find((node) => node.textContent.trim() === ${JSON.stringify(name)});
  const nameBottom = el ? Math.round(el.getBoundingClientRect().bottom + window.scrollY) : null;
  const header = document.querySelector('main header') ?? document.querySelector('main');
  const photoEl = header ? [...header.querySelectorAll('img')].find((img) => !img.alt) : null;
  const photo = photoEl ? { width: Math.round(photoEl.getBoundingClientRect().width), height: Math.round(photoEl.getBoundingClientRect().height) } : null;
  const above = [...document.querySelectorAll('main img')].filter((img) => nameBottom === null || img.getBoundingClientRect().top + window.scrollY < nameBottom);
  const broken = above.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.alt ? 'alt:' + img.alt : 'photo');
  return { nameBottom, photo, broken, height: window.innerHeight, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
})()`;

export async function measureFold(options: { base: string; pages: string[]; guests: string[]; viewports: string[]; expectBrokenLogo?: string[] }): Promise<FoldRow[]> {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)');
  const { port, close } = await launchDevtoolsChrome(chrome, ['--hide-scrollbars']);
  const rows: FoldRow[] = [];
  try {
    const cdp = await connect(port);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const viewport of options.viewports) {
      const [width, height] = viewport.split('x').map(Number);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
      for (const page of options.pages) {
        for (const guest of options.guests) {
          await cdp.send('Page.navigate', { url: `${options.base}/i/${page}/${guest}` });
          await waitForLoad(cdp);
          const { result } = await cdp.send('Runtime.evaluate', { expression: MEASURE(GUEST_NAMES[guest] ?? guest), returnByValue: true });
          const m = result.value as { nameBottom: number | null; photo: FoldRow['photo']; broken: string[]; height: number; overflow: boolean };
          const allowed = options.expectBrokenLogo?.includes(page) ? m.broken.filter((b) => !b.startsWith('alt:Logo')) : m.broken;
          const base = { page, guest, viewport, nameBottom: m.nameBottom, height: m.height, photo: m.photo, imagesLoaded: allowed.length === 0, brokenImages: m.broken, overflow: m.overflow };
          rows.push({ ...base, verdict: foldVerdict(base) });
        }
      }
    }
    cdp.close();
  } finally {
    await close();
  }
  return rows;
}

async function waitForLoad(cdp: Cdp) {
  for (let i = 0; i < 100; i++) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && [...document.images].every((img) => img.complete)`,
      returnByValue: true,
    });
    if (result.value === true) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true, returnByValue: true });
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const out = arg('out');
  const base = arg('base');
  const pages = arg('pages')?.split(',').filter(Boolean) ?? [];
  if (!out || !base || pages.length === 0) throw new Error('--out, --base and --pages are required');
  const rows = await measureFold({
    base,
    pages,
    guests: (arg('guests', 'budi-hartono,nama-panjang,rtl-name') ?? '').split(','),
    viewports: (arg('viewports', '360x800,412x915,1024x768,1280x800,1366x768,1440x900,1920x1080') ?? '').split(','),
    expectBrokenLogo: arg('expect-broken-logo')?.split(','),
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'cover-fold.json'), JSON.stringify(rows, null, 2));
  const count = (v: FoldRow['verdict']) => rows.filter((r) => r.verdict === v).length;
  for (const r of rows.filter((row) => row.verdict !== 'PASS')) {
    console.log(`${r.verdict}  ${r.page} ${r.guest} ${r.viewport} name=${r.nameBottom}/${r.height} photo=${r.photo ? `${r.photo.width}x${r.photo.height}` : '-'}${r.overflow ? ' overflow' : ''}${r.brokenImages.length ? ` broken=${r.brokenImages.join('|')}` : ''}`);
  }
  console.log(`cover-fold: ${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('INCOMPLETE')} INCOMPLETE of ${rows.length}`);
  process.exitCode = count('FAIL') ? 1 : count('INCOMPLETE') ? 3 : 0;
}

if (process.argv[1]?.endsWith('cover-fold.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
