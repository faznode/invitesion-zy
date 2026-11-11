#!/usr/bin/env node
// Throwaway research tool: find PUBLIC demo/sample invitations a normal visitor can reach from a
// competitor's homepage (stage 1) and its theme catalog (stage 2). One navigation per page, scroll
// only, no clicks on forms, robots.txt honoured, >= 1.5 s per origin. Stores link targets and
// short redacted labels only (no page copy).
//   node discover-demos.mjs --code IDI --competitor indoinvite --url https://indoinvite.com/ [--catalog URL]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { robotsStatusVerdict, robotsUnreachable, robotsVerdict } from '../capture/robots.mjs';
import { loadMap, pseudonymizeText, saveMap } from '../safety/pseudonymize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESEARCH = join(HERE, '..', '..');
const PRIVATE = process.env.INVITESION_PRIVATE_DIR ?? join(RESEARCH, '_private');
const CDP = process.env.CDP_HTTP ?? 'http://127.0.0.1:9222';
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const args = Object.fromEntries(process.argv.slice(2).reduce((p, t, i, a) => (t.startsWith('--') && p.push([t.slice(2), a[i + 1]?.startsWith('--') ? true : a[i + 1] ?? true]), p), []));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEMO = /\b(demo|preview|pratinjau|contoh|live ?preview|sample|lihat (tema|undangan|demo|contoh)|coba tema|view (design|sample|site)|see (it|example))\b/i;
const DEMO_HREF = /(demo|preview|pratinjau|sample|contoh|\/u\/|\/inv\/|\/undangan\/|[?&]to=|\/e\/|example|showcase)/i;
const CATALOG = /(tema|template|katalog|catalog|desain|design|themes|koleksi|collection|invitations|cards|wedding-website|청첩장|샘플|mẫu)/i;
const EXCLUDE = /(instagram|facebook|tiktok|youtube|twitter|x\.com|wa\.me|whatsapp|t\.me|linkedin|pinterest|play\.google|apps\.apple|login|masuk|daftar|register|signup|sign-up|blog|artikel|privacy|kebijakan|terms|syarat|faq|karir|career|mailto:|tel:|javascript:)/i;
// Vendor "result"/showcase pages that may be real customers' invitations (e.g. Indoinvite /hasil/<id>?contoh=1).
// Never captured (R1), so not stored either: only a count is kept (R3 minimization, Q-O07 decided in session 04).
const CUSTOMER_SHOWCASE = /(\/hasil\/|[?&]contoh=)/i;

let last = 0;
async function polite() { const w = last + 1500 - Date.now(); if (w > 0) await sleep(w); last = Date.now(); }

async function robotsAllows(url) {
  const { origin, pathname, search } = new URL(url);
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) });
    return (robotsStatusVerdict(res.status) ?? robotsVerdict(await res.text(), pathname + search)).allowed;
  } catch { return robotsUnreachable('network').allowed; }
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = [];
  socket.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } else if (m.method) listeners.forEach((l) => l(m)); });
  const ready = new Promise((res, rej) => { socket.addEventListener('open', res); socket.addEventListener('error', rej); });
  return { ready, on: (l) => listeners.push(l), close: () => socket.close(), send: (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })); }) };
}

const COLLECT = `(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, label: (a.textContent || a.getAttribute('aria-label') || a.title || '').replace(/\\d[\\d .-]{5,}\\d/g, '#').replace(/\\s+/g, ' ').trim().slice(0, 40) })).filter((l) => /^https?:/.test(l.href)))()`;

async function visit(url, scrolls) {
  if (!(await robotsAllows(url))) return { url, skipped: 'robots.txt' };
  await polite();
  const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = connect(target.webSocketDebuggerUrl); await page.ready;
  try {
    await page.send('Network.setUserAgentOverride', { userAgent: UA, acceptLanguage: 'id-ID,id;q=0.9,en;q=0.6', platform: 'Android' });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
    await page.send('Page.enable');
    const loaded = new Promise((r) => page.on((m) => m.method === 'Page.loadEventFired' && r()));
    await page.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(40000)]);
    await sleep(3000);
    const ev = async (expression) => (await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    for (let i = 0; i < scrolls; i++) { await ev('window.scrollBy(0, Math.round(innerHeight * 0.9))'); await sleep(600); }
    const finalUrl = await ev('location.href');
    const links = await ev(COLLECT);
    return { url, finalUrl, links };
  } finally {
    page.close();
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => undefined);
  }
}

const dedupe = (links) => [...new Map(links.map((l) => [l.href.split('#')[0], l])).values()];
const isDemo = (l) => !EXCLUDE.test(l.href) && (DEMO.test(l.label) || DEMO_HREF.test(l.href));
const isCatalog = (l, host) => !EXCLUDE.test(l.href) && new URL(l.href).hostname.endsWith(host) && (CATALOG.test(l.label) || CATALOG.test(new URL(l.href).pathname));

const home = await visit(args.url, 4);
const host = new URL(args.url).hostname.replace(/^www\./, '');
const homeLinks = dedupe(home.links ?? []);
const isShowcase = (l) => CUSTOMER_SHOWCASE.test(l.href);
let demos = homeLinks.filter(isDemo);
const catalogs = homeLinks.filter((l) => isCatalog(l, host) && !isShowcase(l)).map((l) => l.href.split('#')[0]);
const showcaseCatalogLinks = homeLinks.filter((l) => isCatalog(l, host) && isShowcase(l)).length;
let catalog = null;
const catalogUrl = args.catalog && args.catalog !== true ? args.catalog : catalogs.find((h) => h !== home.finalUrl && h !== args.url);
if (catalogUrl) {
  catalog = await visit(catalogUrl, 10);
  demos = dedupe([...demos, ...dedupe(catalog.links ?? []).filter(isDemo)]);
}
const out = {
  code: args.code, competitor: args.competitor, observedAt: new Date(Date.now() + 7 * 3600e3).toISOString().replace('Z', '+07:00'),
  homepage: { url: args.url, finalUrl: home.finalUrl, skipped: home.skipped ?? null, links: homeLinks.length },
  catalogCandidates: [...new Set(catalogs)].slice(0, 15),
  catalog: catalog ? { url: catalogUrl, finalUrl: catalog.finalUrl, skipped: catalog.skipped ?? null, links: (catalog.links ?? []).length } : null,
  demos: demos.filter((l) => !isShowcase(l)).slice(0, 80),
  customerShowcaseDropped: demos.filter(isShowcase).length + showcaseCatalogLinks,
};
const path = join(RESEARCH, 'raw', args.competitor, `discovery-${args.code}.json`);
mkdirSync(dirname(path), { recursive: true });
// Identifying slugs (per-couple subdomains, full-preview couple slugs) are tokenized before anything is written;
// the token map stays private so the queued pages remain capturable (_tools/safety/slug-rules.json).
const redactionMap = loadMap(PRIVATE);
writeFileSync(path, pseudonymizeText(JSON.stringify(out, null, 1), redactionMap));
saveMap(PRIVATE, redactionMap);
console.log(JSON.stringify({ code: args.code, catalog: catalogUrl ?? null, demos: out.demos.length, file: path.replace(RESEARCH + '/', '') }));
