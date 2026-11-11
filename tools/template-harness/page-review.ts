/**
 * page-review.ts — full-page screenshots and horizontal-overflow measurements of rendered guest pages, for the
 * recorded visual review of design families (B-030) and palette changes (B-016).
 *
 *   npx tsx tools/template-harness/page-review.ts --out /tmp/review \
 *     --url gapura-default=http://127.0.0.1:3102/i/budi-sari/budi-hartono [--url label=URL ...] [--mobile-only]
 *
 * Every URL is shot at 360×800, 390×844, 412×915 and 1280×800, plus 390×844 with prefers-reduced-motion (the
 * `--mobile-only` flag keeps 360×800 only, for stress fixtures). Writes PNGs and review.json (overflow in CSS px, page
 * height, sha256) to --out, which should be outside the repository. Exit 1 when any shot overflows horizontally.
 * Lab only: one headless Chrome, device scale 1, no network throttling; it judges layout, not speed.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome } from './browser';

type Viewport = { width: number; height: number; reducedMotion: boolean };
type Shot = { label: string; url: string; viewport: string; reducedMotion: boolean; overflowPx: number; pageHeight: number; file: string; sha256: string };
type Cdp = {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<any>;
  once: (method: string, sessionId?: string) => Promise<any>;
  close: () => void;
};

const FULL: Viewport[] = [
  { width: 360, height: 800, reducedMotion: false },
  { width: 390, height: 844, reducedMotion: false },
  { width: 412, height: 915, reducedMotion: false },
  { width: 1280, height: 800, reducedMotion: false },
  { width: 390, height: 844, reducedMotion: true },
];
const SETTLE_MS = 1500;
const MAX_HEIGHT = 16000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(url: string): Promise<Cdp> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const waiters: { method: string; sessionId?: string; resolve: (value: any) => void }[] = [];
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
      const waiter = waiters.find((candidate) => candidate.method === message.method && (!candidate.sessionId || candidate.sessionId === message.sessionId));
      if (waiter) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message.params);
      }
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
        once: (method, sessionId) => new Promise((resolveOnce) => waiters.push({ method, sessionId, resolve: resolveOnce })),
        close: () => ws.close(),
      });
  });
}

async function debuggerUrl(port: number): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch {
      await delay(200);
    }
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

async function shoot(cdp: Cdp, label: string, url: string, viewport: Viewport, out: string): Promise<Shot> {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
  try {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 768 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: viewport.reducedMotion ? 'reduce' : 'no-preference' }] });
    const loaded = cdp.once('Page.loadEventFired', sessionId);
    await send('Page.navigate', { url });
    await loaded;
    await delay(SETTLE_MS);
    const { result } = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ overflow: document.documentElement.scrollWidth - window.innerWidth, height: document.documentElement.scrollHeight })',
      returnByValue: true,
    });
    const metrics = JSON.parse(result.value) as { overflow: number; height: number };
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: viewport.width, height: Math.min(metrics.height, MAX_HEIGHT), scale: 1 },
    });
    const image = Buffer.from(data, 'base64');
    const file = join(out, `${label}-${viewport.width}x${viewport.height}${viewport.reducedMotion ? '-reduced' : ''}.png`);
    writeFileSync(file, image);
    return {
      label,
      url,
      viewport: `${viewport.width}×${viewport.height}`,
      reducedMotion: viewport.reducedMotion,
      overflowPx: metrics.overflow,
      pageHeight: metrics.height,
      file,
      sha256: createHash('sha256').update(image).digest('hex'),
    };
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const out = valueAfter('--out') ?? join(process.env.TMPDIR ?? '/tmp', 'invitesion-page-review');
  const viewports = args.includes('--mobile-only') ? FULL.slice(0, 1) : FULL;
  const targets = args
    .flatMap((arg, index) => (arg === '--url' ? [args[index + 1] ?? ''] : []))
    .map((pair) => ({ label: pair.slice(0, pair.indexOf('=')), url: pair.slice(pair.indexOf('=') + 1) }))
    .filter((target) => target.label && /^https?:\/\//.test(target.url));
  if (!targets.length) throw new Error('Pass at least one --url label=http://…');
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)');
  mkdirSync(out, { recursive: true });

  const port = 9333;
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const cdp = await connect(await debuggerUrl(port));
    const shots: Shot[] = [];
    for (const target of targets) for (const viewport of viewports) shots.push(await shoot(cdp, target.label, target.url, viewport, out));
    cdp.close();
    writeFileSync(join(out, 'review.json'), `${JSON.stringify(shots, null, 2)}\n`);
    for (const shot of shots) {
      console.log(`${shot.overflowPx > 0 ? 'OVERFLOW' : 'ok      '} ${shot.label} ${shot.viewport}${shot.reducedMotion ? ' reduced-motion' : ''} overflow=${shot.overflowPx}px height=${shot.pageHeight}px`);
    }
    process.exitCode = shots.some((shot) => shot.overflowPx > 0) ? 1 : 0;
  } finally {
    child.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
