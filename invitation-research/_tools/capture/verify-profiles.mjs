#!/usr/bin/env node
// verify-profiles.mjs — prove that every capture profile reaches the browser, through both measurement channels.
//
//   source /vercel/share/work/tools/env.sh && node invitation-research/_tools/capture/verify-profiles.mjs [--out raw/_setup/x.json]
//
// A local page (127.0.0.1 only, no competitor contacted) reports screen size, devicePixelRatio, innerWidth and the
// prefers-reduced-motion match back to this script's server. For each profile:
//   CDP channel        the capture session's emulation (emulationCommands) on the CDP Chrome at $CDP_HTTP, read with
//                      EMULATION_PROBE_V2 and checked with emulationMatches();
//   CDP after REA      the capture path: a REA connect-mode scenario drives the same target and disconnects, then the
//                      session re-applies emulationCommands and is probed again (`before` = what REA's disconnect left).
//                      Gating for v2. Informational for v1-412, whose pre-s13 single call is kept for reproducibility;
//                      its result documents the v1.2 post-REA state (protocol.md §2.3);
//   Lighthouse channel a real Lighthouse run with lighthouseArgs(profile): the page's own report from inside
//                      Lighthouse's Chrome is checked against the profile.
// Exit 1 on any gating mismatch. Needs CDP Chrome on 127.0.0.1:9222 (bootstrap-sandbox.sh chrome), REA_NODE / REA_BIN
// and LH_BIN / CHROME_PATH (source /vercel/share/work/tools/env.sh).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PROFILE, EMULATION_PROBE_V2, PROFILES, emulationCommands, emulationMatches, getProfile, lighthouseArgs, reaEnvironment,
} from './capture-profile.mjs';

const CDP = process.env.CDP_HTTP ?? 'http://127.0.0.1:9222';
const LIGHTHOUSE = process.env.LH_BIN;
const CHROME = process.env.CHROME_PATH;
const REA_NODE = process.env.REA_NODE;
const REA_BIN = process.env.REA_BIN;
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const outArg = process.argv.indexOf('--out');
const outPath = outArg > 0 ? process.argv[outArg + 1] : null;

const reports = [];
const PAGE = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>profile probe</title><body><main><h1>Profile probe</h1><p>Local verification page.</p></main><script>
const p = { screenWidth: screen.width, screenHeight: screen.height, dpr: devicePixelRatio, width: innerWidth,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, android: navigator.userAgent.includes('Android') };
navigator.sendBeacon('/report', JSON.stringify(p));
</script></body></html>`;
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { try { reports.push(JSON.parse(body)); } catch { /* ignore malformed beacons */ } res.end(); });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(PAGE);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  });
  const ready = new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  return { ready, close: () => socket.close(),
    send: (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const applyEmulation = async (page, profile) => {
  for (const [method, params] of emulationCommands(profile)) await page.send(method, params);
};
const readProbe = async (page) => (await page.send('Runtime.evaluate', { expression: EMULATION_PROBE_V2, returnByValue: true })).result.value;

async function openTarget(profile) {
  const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = connect(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'Android' });
  await applyEmulation(page, profile);
  await page.send('Page.enable');
  return { target, page, close: async () => { page.close(); await fetch(`${CDP}/json/close/${target.id}`).catch(() => {}); } };
}

async function cdpChannel(profile) {
  const { page, close } = await openTarget(profile);
  await page.send('Page.navigate', { url });
  await sleep(1500);
  const probe = await readProbe(page);
  await close();
  return { probe, ...emulationMatches(profile, probe) };
}

function reaScenario(profile, targetId) {
  const inputPath = join(mkdtempSync(join(tmpdir(), 'rea-verify-')), 'scenario.json');
  writeFileSync(inputPath, JSON.stringify({
    browser: { mode: 'connect', cdp_endpoint: CDP, target_id: targetId }, start_url: { url }, environment: reaEnvironment(profile),
    actions: [{ step_id: 'settle', action: 'wait_for_timeout', duration_ms: 1500 },
      { step_id: 'scroll', action: 'press', locator: { kind: 'css', selector: 'body' }, key: 'PageDown', timeout_ms: 8000 }],
    capture: { at_end: ['url'], events: ['console'] },
  }));
  return new Promise((resolve) => {
    const child = spawn(REA_NODE, [REA_BIN, 'capture-browser-scenario', inputPath, '--json'], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
    child.on('close', (code) => { clearTimeout(timer); resolve(code); });
  });
}

async function cdpAfterReaChannel(profile) {
  const { target, page, close } = await openTarget(profile);
  const reaExit = await reaScenario(profile, target.id);
  const before = await readProbe(page);
  await applyEmulation(page, profile);
  const probe = await readProbe(page);
  await close();
  return { reaExit, before, beforeMismatches: emulationMatches(profile, before).mismatches, probe,
    ...emulationMatches(profile, probe), gating: profile.name !== DEFAULT_PROFILE };
}

// Asynchronous on purpose: the probe server must keep answering while Lighthouse's Chrome loads the page.
function lighthouseChannel(profile) {
  const before = reports.length;
  const dir = mkdtempSync(join(tmpdir(), 'lh-verify-'));
  return new Promise((resolve) => {
    const child = spawn(LIGHTHOUSE, lighthouseArgs(profile, { url, outPath: join(dir, 'lh.json'), userAgent: UA }),
      { env: { ...process.env, CHROME_PATH: CHROME }, stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
    child.on('close', async (code) => {
      clearTimeout(timer);
      await sleep(300);
      const seen = reports.slice(before);
      const probe = seen.at(-1) ?? null;
      resolve({ exit: code, beacons: seen.length, probe, ...emulationMatches(profile, probe) });
    });
  });
}

const results = [];
for (const name of Object.keys(PROFILES)) {
  const profile = getProfile(name);
  const cdp = await cdpChannel(profile);
  const cdpAfterRea = await cdpAfterReaChannel(profile);
  const lhFinal = await lighthouseChannel(profile);
  results.push({ profile: name, cdp, cdpAfterRea, lighthouse: lhFinal });
  const afterLabel = cdpAfterRea.ok ? 'OK ' : cdpAfterRea.gating ? 'FAIL' : 'INFO';
  console.log(`${name.padEnd(10)} CDP ${cdp.ok ? 'OK ' : 'FAIL'} ${JSON.stringify(cdp.probe)}${cdp.ok ? '' : ' ' + cdp.mismatches.join('; ')}`);
  console.log(`${''.padEnd(10)} REA ${afterLabel} rea-exit=${cdpAfterRea.reaExit} ${JSON.stringify(cdpAfterRea.probe)}${cdpAfterRea.ok ? '' : ' ' + cdpAfterRea.mismatches.join('; ')}`
    + ` | before re-apply: ${cdpAfterRea.beforeMismatches.join('; ') || 'matched'}`);
  console.log(`${''.padEnd(10)} LH  ${lhFinal.ok ? 'OK ' : 'FAIL'} exit=${lhFinal.exit} beacons=${lhFinal.beacons} ${JSON.stringify(lhFinal.probe)}${lhFinal.ok ? '' : ' ' + lhFinal.mismatches.join('; ')}`);
}
server.close();
const ok = results.every((r) => r.cdp.ok && r.lighthouse.ok && (r.cdpAfterRea.ok || !r.cdpAfterRea.gating));
if (outPath) writeFileSync(outPath, JSON.stringify({ verifiedAt: new Date().toISOString(), tool: 'verify-profiles.mjs', page: 'local 127.0.0.1 probe page', ok, results }, null, 1) + '\n');
console.log(`verify-profiles: ${ok ? 'all profiles verified on every gating channel' : 'MISMATCH'}`);
process.exit(ok ? 0 : 1);
