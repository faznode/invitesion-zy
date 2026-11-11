/**
 * product-bytes.ts — byte census of the product's rendered guest pages, one per design family, split into the shared
 * shell and family-attributable bytes and checked against `PRODUCT_PAGE_BUDGETS` (B-012 × B-030, s21).
 *
 *   npx tsx tools/template-harness/product-bytes.ts --out /tmp/product-bytes \
 *     --url legacy=http://127.0.0.1:3102/i/review-legacy-full/budi-hartono --url gapura=… [--url label=URL …]
 *
 * Every URL should render the same invitation content through a different layout (the review fixture's
 * `review-<layout>-full` pages, one guest), so that what differs between the pages is the families'. One headless
 * Chrome, cache disabled, 360 × 800 at device scale 1, no throttling. A page counts what it requests until its load
 * event plus 1 s without a request in flight (cap 20 s): documents, scripts, stylesheets, fonts and images. Fetches
 * (RSC prefetches, server actions), media and the rest are listed but not counted: the first render does not need them.
 *
 * Attribution (`attributeBytes`):
 * - **shell**: every counted resource other than the document that every page requested under the same URL (framework
 *   and app chunks, the global stylesheet, shared fonts). Chunk and stylesheet URLs are content-hashed, so within one
 *   build the same URL means the same bytes. The shell is counted once.
 * - **family**: the page's document (markup and inline RSC payload, which the family's layout renders for the shared
 *   content, the shared blocks inside it included) plus every counted resource that not every page requested.
 * - **host uploads** (s24): the part of a family's own resources that is the host's upload (`/media/<id>/…`, protected
 *   and avatar paths included; each invitation's upload has its own URL, so it always lands in family bytes), with
 *   `design` = family − host uploads. Since s43 the image job's WebP variants of an upload
 *   (`/media/variants/<id>/<24 hex>/<tier>-<width>.webp`) count as uploads too.
 * Verdict basis (Q-O11, s25; `FAMILY_BUDGET_BASIS` in `policy.ts`): the family budget judges `design`; the host uploads
 * stay inside both page totals and are reported separately per family. Nothing is dropped from the record: the JSON
 * keeps every resource, the family figure with the uploads, and the verdict under the other basis (`otherBasis`).
 * `--family-basis family` reproduces the s21–s24 verdict for one run.
 * Budgets use decoded bytes (what the phone parses; independent of the host's compression). Transfer bytes as served
 * are recorded beside them. Exit 0 PASS, 1 FAIL (a budget exceeded), 3 INCOMPLETE (fewer than two pages, a page that
 * did not answer 200 or did not load). Lab only: it measures bytes, not speed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome, launchDevtoolsChrome } from './browser';
import { FAMILY_BUDGET_BASIS, PRODUCT_PAGE_BUDGETS, type FamilyBudgetBasis } from './policy';

export type Resource = { url: string; type: string; status: number; transferBytes: number; decodedBytes: number };
export type PageCensus = {
  label: string;
  url: string;
  status: number;
  /** Bytes of the inline RSC payload (`self.__next_f.push(…)` scripts) inside the document. */
  payloadBytes: number;
  counted: Resource[];
  excluded: Resource[];
  error?: string;
};
export type FamilyBytes = {
  label: string;
  documentBytes: number;
  payloadBytes: number;
  markupBytes: number;
  own: Resource[];
  familyBytes: number;
  familyTransferBytes: number;
  /** Own resources that are the host's uploads (Q-O11); already inside `familyBytes`. */
  hostMedia: Resource[];
  hostMediaBytes: number;
  hostMediaTransferBytes: number;
  /** `familyBytes` − `hostMediaBytes`: what the layout itself costs on this content. */
  designBytes: number;
  totalBytes: number;
  totalTransferBytes: number;
};
export type Attribution = {
  shell: { resources: Resource[]; bytes: number; transferBytes: number; bytesByType: Record<string, number> };
  families: FamilyBytes[];
};
export type ProductBudgets = { shellKiB: number; familyKiB: number; totalKiB: number; totalTransferKiB: number };
export type Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE';

export const COUNTED_TYPES = ['Document', 'Script', 'Stylesheet', 'Font', 'Image'];

const sum = (resources: Resource[], key: 'decodedBytes' | 'transferBytes') => resources.reduce((total, resource) => total + resource[key], 0);
const kib = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

/** The upload paths `lib/invitation/image-url.ts` accepts (public, protected, avatar), matched on the URL's path. */
const HOST_UPLOAD_PATH = /^\/media\/(?:protected\/|avatars\/)?[1-9]\d*\/[0-9a-f]{24}\.[a-z0-9]+$/i;
/**
 * s43: the WebP variants the image job derives from a public upload (`VARIANT_KEY` in `lib/media/variants.ts`, served
 * under `/media/`). Their bytes are the host's photo resized, so they are uploads too; which width a layout's `sizes`
 * picks stays limited by the page totals, as any other upload is.
 */
const HOST_UPLOAD_VARIANT_PATH = /^\/media\/variants\/(?:0|[1-9]\d{0,9})\/[0-9a-f]{24}\/(?:standard|lite)-[1-9]\d{0,4}\.webp$/;

export function isHostUpload(url: string): boolean {
  try {
    const { pathname } = new URL(url, 'http://localhost');
    return HOST_UPLOAD_PATH.test(pathname) || HOST_UPLOAD_VARIANT_PATH.test(pathname);
  } catch {
    return false;
  }
}

export function attributeBytes(pages: PageCensus[]): Attribution {
  const nonDocument = (page: PageCensus) => page.counted.filter((resource) => resource.type !== 'Document');
  const urlSets = pages.map((page) => new Set(nonDocument(page).map((resource) => resource.url)));
  const shared = new Set([...(urlSets[0] ?? [])].filter((url) => urlSets.every((set) => set.has(url))));
  const shellResources = pages.length ? nonDocument(pages[0]).filter((resource) => shared.has(resource.url)) : [];
  const bytesByType: Record<string, number> = {};
  for (const resource of shellResources) bytesByType[resource.type] = (bytesByType[resource.type] ?? 0) + resource.decodedBytes;
  const shell = { resources: shellResources, bytes: sum(shellResources, 'decodedBytes'), transferBytes: sum(shellResources, 'transferBytes'), bytesByType };
  const families = pages.map((page): FamilyBytes => {
    const documents = page.counted.filter((resource) => resource.type === 'Document');
    const own = nonDocument(page).filter((resource) => !shared.has(resource.url));
    const documentBytes = sum(documents, 'decodedBytes');
    const familyBytes = documentBytes + sum(own, 'decodedBytes');
    const familyTransferBytes = sum(documents, 'transferBytes') + sum(own, 'transferBytes');
    const hostMedia = own.filter((resource) => isHostUpload(resource.url));
    const hostMediaBytes = sum(hostMedia, 'decodedBytes');
    return {
      label: page.label,
      documentBytes,
      payloadBytes: page.payloadBytes,
      markupBytes: documentBytes - page.payloadBytes,
      own,
      familyBytes,
      familyTransferBytes,
      hostMedia,
      hostMediaBytes,
      hostMediaTransferBytes: sum(hostMedia, 'transferBytes'),
      designBytes: familyBytes - hostMediaBytes,
      totalBytes: shell.bytes + familyBytes,
      totalTransferBytes: shell.transferBytes + familyTransferBytes,
    };
  });
  return { shell, families };
}

/**
 * The family budget judges `design` or `family` bytes (`basis`, Q-O11); the shell and both page totals are the same
 * on either basis, and the totals always contain the host's uploads.
 */
export function checkProductBudgets(attribution: Attribution, budgets: ProductBudgets = PRODUCT_PAGE_BUDGETS, basis: FamilyBudgetBasis = FAMILY_BUDGET_BASIS): string[] {
  const problems: string[] = [];
  const over = (what: string, bytes: number, limitKiB: number) => {
    if (bytes > limitKiB * 1024) problems.push(`${what} ${kib(bytes)} KiB > ${limitKiB} KiB`);
  };
  over('shell', attribution.shell.bytes, budgets.shellKiB);
  for (const family of attribution.families) {
    if (basis === 'design') over(`${family.label}: design bytes`, family.designBytes, budgets.familyKiB);
    else over(`${family.label}: family bytes`, family.familyBytes, budgets.familyKiB);
    over(`${family.label}: page total`, family.totalBytes, budgets.totalKiB);
    over(`${family.label}: page total as served`, family.totalTransferBytes, budgets.totalTransferKiB);
  }
  return problems;
}

export const otherBasis = (basis: FamilyBudgetBasis): FamilyBudgetBasis => (basis === 'design' ? 'family' : 'design');

export function parseFamilyBasis(value: string | undefined): FamilyBudgetBasis {
  if (value === undefined) return FAMILY_BUDGET_BASIS;
  if (value === 'design' || value === 'family') return value;
  throw new Error(`--family-basis must be design or family, not ${value}`);
}

export function productVerdict(pages: PageCensus[], problems: string[]): { verdict: Verdict; reasons: string[] } {
  const reasons: string[] = [];
  if (pages.length < 2) reasons.push('fewer than two pages: the shell cannot be told apart from a family');
  for (const page of pages) {
    if (page.error) reasons.push(`${page.label}: ${page.error}`);
    else if (page.status !== 200) reasons.push(`${page.label}: document answered ${page.status}`);
    else if (!page.counted.some((resource) => resource.type === 'Document')) reasons.push(`${page.label}: no document recorded`);
  }
  if (reasons.length) return { verdict: 'INCOMPLETE', reasons };
  return problems.length ? { verdict: 'FAIL', reasons: problems } : { verdict: 'PASS', reasons: [] };
}

export type RelativeRow = { label: string; familyBytes: number; aboveLeanestBytes: number; aboveLeanestPercent: number };

/**
 * s23r: each family's bytes above the leanest layout of the same run on the same content. A comparison between layouts,
 * kept apart from the budgets on purpose: it never changes the verdict, and it is not competitor-parity evidence.
 */
export function relativeToLeanest(attribution: Attribution): { leanest?: string; rows: RelativeRow[] } {
  if (!attribution.families.length) return { rows: [] };
  const leanest = attribution.families.reduce((min, family) => (family.familyBytes < min.familyBytes ? family : min));
  return {
    leanest: leanest.label,
    rows: attribution.families.map((family) => {
      const above = family.familyBytes - leanest.familyBytes;
      return { label: family.label, familyBytes: family.familyBytes, aboveLeanestBytes: above, aboveLeanestPercent: leanest.familyBytes ? Math.round((above / leanest.familyBytes) * 1000) / 10 : 0 };
    }),
  };
}

export function formatRelative(relative: ReturnType<typeof relativeToLeanest>): string {
  if (!relative.leanest) return 'relative: no pages';
  const others = relative.rows.filter((row) => row.label !== relative.leanest).map((row) => `${row.label} +${kib(row.aboveLeanestBytes)} KiB (+${row.aboveLeanestPercent} %)`);
  return `relative (a comparison between layouts, not a budget): leanest ${relative.leanest}; ${others.join(', ')}`;
}

/** UTF-8 bytes of the inline RSC payload scripts in a Next.js document. */
export function inlinePayloadBytes(html: string): number {
  let bytes = 0;
  for (const match of html.matchAll(/<script>(self\.__next_f\.push\([\s\S]*?)<\/script>/g)) bytes += Buffer.byteLength(match[1]);
  return bytes;
}

type Cdp = {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<any>;
  on: (handler: (method: string, params: any, sessionId?: string) => void) => () => void;
  close: () => void;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const QUIET_MS = 1000;
const CAP_MS = 20000;

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
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch {
      await delay(200);
    }
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

async function census(cdp: Cdp, label: string, url: string): Promise<PageCensus> {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
  const requests = new Map<string, { url: string; type: string; status: number; transferBytes: number; decodedBytes: number; done: boolean }>();
  let loaded = false;
  let lastActivity = Date.now();
  let documentId: string | undefined;
  const stop = cdp.on((method, params, from) => {
    if (from !== sessionId) return;
    if (method === 'Page.loadEventFired') loaded = true;
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
  try {
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    const started = Date.now();
    await send('Page.navigate', { url });
    while (Date.now() - started < CAP_MS) {
      const inFlight = [...requests.values()].some((request) => !request.done);
      if (loaded && !inFlight && Date.now() - lastActivity >= QUIET_MS) break;
      await delay(100);
    }
    if (!loaded) return { label, url, status: 0, payloadBytes: 0, counted: [], excluded: [], error: `no load event within ${CAP_MS / 1000} s` };
    let payloadBytes = 0;
    if (documentId) {
      const { body, base64Encoded } = await send('Network.getResponseBody', { requestId: documentId });
      payloadBytes = inlinePayloadBytes(base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body);
    }
    const all: Resource[] = [...requests.values()]
      .filter((request) => request.done && !request.url.startsWith('data:'))
      .map(({ url: resourceUrl, type, status, transferBytes, decodedBytes }) => ({ url: resourceUrl, type, status, transferBytes, decodedBytes }));
    const status = documentId ? (requests.get(documentId)?.status ?? 0) : 0;
    return {
      label,
      url,
      status,
      payloadBytes,
      counted: all.filter((resource) => COUNTED_TYPES.includes(resource.type)),
      excluded: all.filter((resource) => !COUNTED_TYPES.includes(resource.type)),
    };
  } finally {
    stop();
    await cdp.send('Target.closeTarget', { targetId });
  }
}

export function formatAttribution(attribution: Attribution): string[] {
  const lines = [`shell  ${kib(attribution.shell.bytes)} KiB decoded (${kib(attribution.shell.transferBytes)} KiB transfer), ${attribution.shell.resources.length} resources: ${Object.entries(attribution.shell.bytesByType).map(([type, bytes]) => `${type} ${kib(bytes)}`).join(', ')}`];
  for (const family of attribution.families) {
    lines.push(
      `${family.label.padEnd(8)} family ${kib(family.familyBytes)} KiB (document ${kib(family.documentBytes)}: markup ${kib(family.markupBytes)} + RSC payload ${kib(family.payloadBytes)}; own resources ${family.own.length}, ${kib(family.familyBytes - family.documentBytes)}${family.hostMedia.length ? `, of which host uploads ${family.hostMedia.length}, ${kib(family.hostMediaBytes)}; design ${kib(family.designBytes)}` : ''}) · page total ${kib(family.totalBytes)} KiB decoded, ${kib(family.totalTransferBytes)} KiB transfer`,
    );
  }
  return lines;
}

export type HostUploadRow = { label: string; count: number; decodedBytes: number; transferBytes: number };

export function hostUploadRows(attribution: Attribution): HostUploadRow[] {
  return attribution.families.map((family) => ({ label: family.label, count: family.hostMedia.length, decodedBytes: family.hostMediaBytes, transferBytes: family.hostMediaTransferBytes }));
}

/**
 * Host uploads per layout, reported apart from the family budget (Q-O11). Every page renders the same content, so the
 * layouts should fetch the same uploads; when they do not, the difference is the layout's choice (an eager gallery, a
 * hidden logo), which only the page totals limit. Undefined when no page fetched an upload.
 */
export function formatHostUploads(attribution: Attribution): string | undefined {
  const rows = hostUploadRows(attribution);
  if (!rows.some((row) => row.count)) return undefined;
  const differ = new Set(rows.map((row) => `${row.count}:${row.decodedBytes}`)).size > 1;
  const list = rows.map((row) => `${row.label} ${row.count} (${kib(row.decodedBytes)} KiB decoded, ${kib(row.transferBytes)} served)`).join(', ');
  return `host uploads, in the page totals and not in the family budget: ${list}${differ ? '; the layouts fetch different uploads for the same content (a layout choice: check the first render)' : ''}`;
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const out = valueAfter('--out') ?? join(process.env.TMPDIR ?? '/tmp', 'invitesion-product-bytes');
  const basis = parseFamilyBasis(valueAfter('--family-basis'));
  const targets = args
    .flatMap((arg, index) => (arg === '--url' ? [args[index + 1] ?? ''] : []))
    .map((pair) => ({ label: pair.slice(0, pair.indexOf('=')), url: pair.slice(pair.indexOf('=') + 1) }))
    .filter((target) => target.label && /^https?:\/\//.test(target.url));
  if (!targets.length) throw new Error('Pass at least two --url label=http://…');
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found (set CHROME_PATH or run bootstrap-sandbox.sh tools)');
  mkdirSync(out, { recursive: true });
  const { port, close } = await launchDevtoolsChrome(chrome);
  try {
    const cdp = await connect(await debuggerUrl(port));
    const pages: PageCensus[] = [];
    for (const target of targets) pages.push(await census(cdp, target.label, target.url));
    cdp.close();
    const attribution = attributeBytes(pages);
    const { verdict, reasons } = productVerdict(pages, checkProductBudgets(attribution, PRODUCT_PAGE_BUDGETS, basis));
    const other = { basis: otherBasis(basis), ...productVerdict(pages, checkProductBudgets(attribution, PRODUCT_PAGE_BUDGETS, otherBasis(basis))) };
    const relative = relativeToLeanest(attribution);
    const hostUploads = hostUploadRows(attribution);
    writeFileSync(
      join(out, 'product-bytes.json'),
      `${JSON.stringify({ tool: 'product-bytes', generatedAt: new Date().toISOString(), budgets: PRODUCT_PAGE_BUDGETS, familyBudgetBasis: basis, verdict, reasons, otherBasis: other, hostUploads, attribution, relative, pages }, null, 2)}\n`,
    );
    for (const line of formatAttribution(attribution)) console.log(line);
    const uploads = formatHostUploads(attribution);
    if (uploads) console.log(uploads);
    console.log(formatRelative(relative));
    for (const page of pages) if (page.excluded.length) console.log(`${page.label.padEnd(8)} not counted: ${page.excluded.map((resource) => `${resource.type} ${kib(resource.decodedBytes)} KiB`).join(', ')}`);
    console.log(`budgets: shell ≤ ${PRODUCT_PAGE_BUDGETS.shellKiB} KiB, family ≤ ${PRODUCT_PAGE_BUDGETS.familyKiB} KiB on ${basis} bytes, page total ≤ ${PRODUCT_PAGE_BUDGETS.totalKiB} KiB decoded and ≤ ${PRODUCT_PAGE_BUDGETS.totalTransferKiB} KiB as served`);
    if (uploads) console.log(`on the ${other.basis} basis (stored, not the verdict): ${other.verdict}${other.reasons.length ? ` (${other.reasons.join('; ')})` : ''}`);
    console.log(`overall: ${verdict}${reasons.length ? ` (${reasons.join('; ')})` : ''}`);
    process.exitCode = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3;
  } finally {
    await close();
  }
}

if (process.argv[1] && /product-bytes\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
