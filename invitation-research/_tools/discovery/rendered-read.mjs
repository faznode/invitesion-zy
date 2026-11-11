#!/usr/bin/env node
// rendered-read.mjs — the browser half of rendered-read.py (analysis script, not product code). Never run it alone:
// the Python wrapper decides robots.txt (profile-reads.py's Reader.verdict, D-022 / D-030) and pacing first.
//
//   node rendered-read.mjs --url https://example.com/ --html /private/dir/page.html [--settle-ms 4000] > result.json
//
// One navigation in headless Chrome (CHROME_PATH) with the capture identity: the Android Chrome user agent of
// profile-reads.py / capture.mjs and 412 x 915 mobile emulation. No clicks, no scrolling, no forms, no retries.
// The main document's redirect chain is watched: a hop to another origin, or to a demo / customer / auth / commerce
// path (profile-reads.py NEVER_REACH, D-008), stops loading and nothing of the page is kept. The rendered DOM goes to
// --html (the private directory); stdout gets status, final URL, redirects, sizes and request counts only.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const NEVER_REACH = /preview|contoh|demo|sample|\/i\/|\/u\/|\/s\/|\/invitation\/|\/undangan\/[^/]+\/|login|masuk|daftar|register|signup|sign-up|checkout|cart|account|akun/i;

function args(argv) {
  const out = { settleMs: 4000 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--html') out.html = argv[++i];
    else if (argv[i] === '--settle-ms') out.settleMs = Number(argv[++i]);
  }
  if (!out.url || !out.html) throw new Error('usage: --url URL --html PATH [--settle-ms N]');
  return out;
}

async function connect(port) {
  for (let i = 0; i < 75; i += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        let id = 0;
        const pending = new Map();
        const listeners = [];
        ws.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
          else if (message.method) for (const fn of listeners) fn(message);
        };
        return {
          send: (method, params = {}) => new Promise((resolve, reject) => {
            const n = ++id;
            pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
            ws.send(JSON.stringify({ id: n, method, params }));
          }),
          on: (fn) => listeners.push(fn),
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

async function main() {
  const opts = args(process.argv.slice(2));
  const chrome = process.env.CHROME_PATH;
  if (!chrome) throw new Error('CHROME_PATH is not set (source env.sh)');
  const target = new URL(opts.url);
  const port = 9800 + Math.floor(Math.random() * 150);
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID',
    `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  const result = { url: opts.url, startedAt: new Date().toISOString(), status: null, finalUrl: null, contentType: null,
    redirects: [], aborted: null, requests: { firstParty: 0, thirdParty: 0, failed: 0 }, thirdPartyHosts: [] };
  try {
    const cdp = await connect(port);
    let mainRequestId = null;
    let lastNetwork = Date.now();
    let loaded = false;
    const hosts = new Set();
    cdp.on((m) => {
      if (m.method === 'Network.requestWillBeSent') {
        lastNetwork = Date.now();
        const url = new URL(m.params.request.url);
        if (m.params.type === 'Document' && (mainRequestId === null || m.params.requestId === mainRequestId)) {
          mainRequestId = m.params.requestId;
          if (m.params.redirectResponse) {
            result.redirects.push({ from: m.params.redirectResponse.url, status: m.params.redirectResponse.status, to: url.href });
            if (url.origin !== target.origin || NEVER_REACH.test(url.pathname + url.search)) {
              result.aborted = `redirect to ${url.origin}${url.pathname}: another origin or a never-reach page`;
              cdp.send('Page.stopLoading').catch(() => {});
            }
          }
        }
        if (url.protocol.startsWith('http')) {
          if (url.origin === target.origin) result.requests.firstParty += 1;
          else { result.requests.thirdParty += 1; hosts.add(url.host); }
        }
      } else if (m.method === 'Network.responseReceived' && m.params.requestId === mainRequestId) {
        result.status = m.params.response.status;
        result.finalUrl = m.params.response.url;
        result.contentType = m.params.response.headers['content-type'] ?? m.params.response.headers['Content-Type'] ?? null;
      } else if (m.method === 'Network.loadingFinished') lastNetwork = Date.now();
      else if (m.method === 'Network.loadingFailed') { lastNetwork = Date.now(); result.requests.failed += 1; }
      else if (m.method === 'Page.loadEventFired') loaded = true;
    });
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: UA, acceptLanguage: 'id-ID,id;q=0.9', platform: 'Android' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url: opts.url });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !result.aborted) {
      if (loaded && Date.now() - lastNetwork > opts.settleMs) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    result.timedOut = !loaded;
    result.thirdPartyHosts = [...hosts].sort();
    if (!result.aborted) {
      const { result: dom } = await cdp.send('Runtime.evaluate', {
        expression: '({ html: document.documentElement.outerHTML, text: (document.body ? document.body.innerText : "").length, '
          + 'lang: document.documentElement.lang || null })',
        returnByValue: true,
      });
      writeFileSync(opts.html, dom.value.html);
      result.renderedBytes = Buffer.byteLength(dom.value.html);
      result.innerTextChars = dom.value.text;
      result.lang = dom.value.lang;
    }
    cdp.close();
  } finally {
    child.kill('SIGKILL');
  }
  result.finishedAt = new Date().toISOString();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => { process.stdout.write(`${JSON.stringify({ error: error.message })}\n`); process.exit(1); });
