import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { sha256 } from './files';
import { SNAPSHOT_VIEWPORTS } from './policy';

/**
 * Browser-backed gates: visual snapshots (headless Chrome) and a Lighthouse cold-load run. Both report "not run" with
 * the reason when Chrome or Lighthouse is missing; they never invent a number. Lab only: TBT is not INP.
 */
const TOOLS = '/vercel/share/work/tools';

export function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const root = join(TOOLS, 'ms-playwright');
  if (existsSync(root)) {
    for (const dir of readdirSync(root).filter((name) => name.startsWith('chromium-')).sort().reverse()) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) if (existsSync(join(root, dir, sub))) return join(root, dir, sub);
    }
  }
  return null;
}

/**
 * Start a disposable browser for the CDP gates. Recent Chrome releases may not expose
 * debugging for the default profile; a fresh profile also prevents reuse of another
 * gate's browser. Let Chrome choose the port so concurrent runs cannot collide.
 */
export async function launchDevtoolsChrome(chrome: string, extraArgs: string[] = []) {
  const profile = mkdtempSync(join(tmpdir(), 'invitesion-chrome-'));
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`,
    '--remote-debugging-port=0', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });
  let launchError: Error | undefined;
  child.once('error', (error) => { launchError = error; });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const close = async () => {
    child.kill('SIGKILL');
    await closed;
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };
  const activePort = join(profile, 'DevToolsActivePort');
  try {
    for (let i = 0; i < 75; i++) {
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Chrome exited before DevTools started (${child.exitCode ?? child.signalCode})`);
      }
      const port = existsSync(activePort) ? Number(readFileSync(activePort, 'utf8').split('\n', 1)[0]) : 0;
      if (port > 0 && port <= 65535 && Number.isInteger(port)) return { port, close };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Chrome did not write its DevTools port within 15 seconds');
  } catch (error) {
    await close();
    throw error;
  }
}

export function findLighthouse(): string | null {
  for (const candidate of [process.env.LH_BIN, join(TOOLS, 'lh/node_modules/.bin/lighthouse')]) if (candidate && existsSync(candidate)) return candidate;
  return null;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/** Static server for the preview directory on 127.0.0.1 (random port); serves files only from inside `root`. */
export function serve(root: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path === '/' ? 'preview.html' : path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({ server, origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` });
  }));
}

export type Snapshot = { viewport: string; fixture: string; reducedMotion: boolean; file: string; bytes: number; sha256: string };
/** `expected` is the planned shot count: a run is complete only when every planned shot exists. */
export type SnapshotRun = { ran: boolean; reason?: string; chrome?: string; expected: number; shots: Snapshot[] };

export async function takeSnapshots(outDir: string): Promise<SnapshotRun> {
  const plan: Array<{ width: number; height: number; fixture: string; reducedMotion: boolean }> = [
    ...SNAPSHOT_VIEWPORTS.map((viewport) => ({ ...viewport, fixture: 'default', reducedMotion: false })),
    ...['long-name', 'rtl', 'emoji', 'hostile'].map((fixture) => ({ width: 390, height: 844, fixture, reducedMotion: false })),
    { width: 390, height: 844, fixture: 'default', reducedMotion: true },
  ];
  const chrome = findChrome();
  if (!chrome) return { ran: false, reason: 'Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)', expected: plan.length, shots: [] };
  const version = spawnSync(chrome, ['--version'], { encoding: 'utf8' }).stdout.trim();
  const { server, origin } = await serve(outDir);
  const shots: Snapshot[] = [];
  try {
    for (const item of plan) {
      const page = item.fixture === 'default' ? 'preview.html' : `preview-${item.fixture}.html`;
      const file = join(outDir, `snapshot-${item.width}x${item.height}-${item.fixture}${item.reducedMotion ? '-reduced' : ''}.png`);
      const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${item.width},${item.height}`,
        '--virtual-time-budget=4000',
        `--screenshot=${file}`,
        ...(item.reducedMotion ? ['--force-prefers-reduced-motion'] : []),
        `${origin}/${page}`,
      ];
      await new Promise<void>((resolve) => {
        const child = spawn(chrome, args, { stdio: 'ignore' });
        const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (existsSync(file)) {
        const buf = readFileSync(file);
        shots.push({ viewport: `${item.width}×${item.height}`, fixture: item.fixture, reducedMotion: item.reducedMotion, file, bytes: buf.length, sha256: sha256(buf) });
      }
    }
  } finally {
    server.close();
  }
  const reason = shots.length === plan.length ? undefined : `Chrome produced ${shots.length} of ${plan.length} planned screenshots`;
  return { ran: shots.length > 0, reason, chrome: version, expected: plan.length, shots };
}

/** `ran` is true only for a valid measurement; otherwise `reason` says why no number is reported. */
export type LighthouseRun = {
  ran: boolean;
  reason?: string;
  version?: string;
  performance?: number;
  accessibility?: number;
  lcpMs?: number;
  tbtMs?: number;
  cls?: number;
  totalByteWeight?: number;
};

export type LighthouseReport = {
  runtimeError?: { code?: string; message?: string };
  categories?: Record<string, { score?: number | null } | undefined>;
  audits?: Record<string, { numericValue?: number } | undefined>;
};

/**
 * A report with a runtime error, a null performance score or no LCP is not a measurement: Lighthouse still writes the
 * JSON, and reading `score ?? 0` turned such a run into "performance 0, LCP 0 ms" beside a PASS (melati, 2026-11-03).
 */
export function lighthouseFromReport(report: LighthouseReport, version: string): LighthouseRun {
  const runtimeError = report.runtimeError;
  if (runtimeError?.code) {
    return { ran: false, version, reason: `invalid Lighthouse result: runtime error ${runtimeError.code}${runtimeError.message ? ` (${runtimeError.message})` : ''}` };
  }
  const performance = report.categories?.performance?.score;
  if (typeof performance !== 'number') return { ran: false, version, reason: 'invalid Lighthouse result: no performance score' };
  const lcp = report.audits?.['largest-contentful-paint']?.numericValue;
  if (typeof lcp !== 'number' || lcp <= 0) return { ran: false, version, reason: 'invalid Lighthouse result: no LCP recorded' };
  const numeric = (id: string) => {
    const value = report.audits?.[id]?.numericValue;
    return typeof value === 'number' ? value : undefined;
  };
  const accessibility = report.categories?.accessibility?.score;
  const tbt = numeric('total-blocking-time');
  const cls = numeric('cumulative-layout-shift');
  return {
    ran: true,
    version,
    performance: Math.round(performance * 100),
    accessibility: typeof accessibility === 'number' ? Math.round(accessibility * 100) : undefined,
    lcpMs: Math.round(lcp),
    tbtMs: tbt === undefined ? undefined : Math.round(tbt),
    cls: cls === undefined ? undefined : Math.round(cls * 1000) / 1000,
    totalByteWeight: numeric('total-byte-weight'),
  };
}

export async function runLighthouse(outDir: string): Promise<LighthouseRun> {
  const chrome = findChrome();
  const lighthouse = findLighthouse();
  if (!chrome || !lighthouse) return { ran: false, reason: `${chrome ? '' : 'Chrome '}${lighthouse ? '' : 'Lighthouse '}not installed`.trim() };
  const version = spawnSync(lighthouse, ['--version'], { encoding: 'utf8' }).stdout.trim();
  const { server, origin } = await serve(outDir);
  const output = join(outDir, 'lighthouse.json');
  try {
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        lighthouse,
        [`${origin}/preview.html`, '--quiet', '--output=json', `--output-path=${output}`, '--only-categories=performance,accessibility', '--form-factor=mobile', '--chrome-flags=--headless=new --no-sandbox --disable-gpu'],
        { env: { ...process.env, CHROME_PATH: chrome }, stdio: 'ignore' },
      );
      const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
      child.on('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    if (code !== 0 || !existsSync(output)) return { ran: false, reason: `Lighthouse exited ${code}`, version };
    return lighthouseFromReport(JSON.parse(readFileSync(output, 'utf8')) as LighthouseReport, version);
  } finally {
    server.close();
  }
}
