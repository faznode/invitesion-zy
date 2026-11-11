<!-- SUMMARY (first 7 lines — greppable) -->
# REA playbook — how this research run observes competitors
> WHAT: Pinned REA install, exact commands, mission routing table, measurement protocol, limits and substitutes, verification log.
> STATUS: ACTIVE — v2, re-verified against the REA source and by smoke tests in session 06 (verdict: `00-setup/rea-verification.md`)
> OWNER: Oracle (research)
> DEPS: SKILLS-LOCK.md (reverse-engineer-anything skill), _tools/capture/{capture.mjs,rea-smoke.mjs,rea-har-smoke.mjs,robots.mjs}, _tools/ops/{bootstrap-sandbox.sh,local-stack.sh}, 04-template-benchmarks/protocol.md
> GREP: rea, reverse engineering, cdp, lighthouse, har, apk, capture, scenario, politeness, verification
> UPDATED: 2026-10-29 (session 06)

Doc references (`file:line`) point to the REA git tag `rea-agents-6.8.0`, the release this run executes. `V-REA-NNN` = verification run (§7 and `_evidence-index.md`). v1 (s01) claims that failed verification are corrected below; the comparison is in `00-setup/rea-verification.md` §2.

## 1. Pinned toolchain (re-verified 2026-10-29, session 06)

| Tool | Version / pin | How it is installed | Health check |
|---|---|---|---|
| REA (`rea-agents`) | **6.8.0** = npm `latest` (published 2026-10-25). Docs pinned to tag **`rea-agents-6.8.0` = `160d821`**. `main` moves fast (HEAD `5f9187c` on 2026-10-30): read the tag, not `main` | `bootstrap-sandbox.sh tools`: `npm i rea-agents@6.8.0` in `/vercel/share/work/tools/rea-cli`. Outside the repo is **our** rule (keeps REA's dependency tree out of the product lockfile); the skill only says to prefer an existing CLI and to acquire `rea-agents` when that is in scope (SKILL.md:87) | `rea doctor --format json` → **exit 1 is expected here** (optional engines absent); read `checks`: node ✔, host ✔ (installation.md:356–361) — V-REA-002 |
| Node for REA | **24.22.2** (engines `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1`; the sandbox's 24.16.0 is rejected) | official tarball | `"$REA_NODE" -v` |
| Browser | Chrome for Testing **156.0.8078.4** (Playwright `chromium-1248`) + AL2023 libs via `dnf` | `bootstrap-sandbox.sh tools` | `curl -s http://127.0.0.1:9222/json/version` after `bootstrap-sandbox.sh chrome` |
| Playwright core | **1.58.2**, an REA dependency (REA's scenario capture; our HAR recorder) | comes with `rea-agents` | — |
| Lighthouse | **12.8.2** | `bootstrap-sandbox.sh tools` | `"$LH_BIN" --version` |
| REA skill | `reverse-engineer-anything` (pinned, modified to call `rea-agents@6.8.0`) | `npx skills add morluto/rea --skill reverse-engineer-anything -a claude-code codex -y` | `.agents/skills/reverse-engineer-anything/SKILL.md` |

`npx -y rea-agents setup --yes` registers REA's MCP server and skill in the operator's agents and edits their configuration with backups (installation.md:67–94). It is not run here: this agent cannot load an MCP server mid-session and setup writes global agent config. Every call uses the **CLI**, which "returns the Evidence record directly" (SKILL.md:83–86); that does not establish that MCP is configured, and MCP-only conveniences (guided prompts, `docs/mcp-prompts.md`) stay unused. Owners who want MCP: `npx -y rea-agents@6.8.0 setup` (review the printed plan), then `npx -y rea-agents@6.8.0 doctor`.

Environment: `source /vercel/share/work/tools/env.sh` → `REA_NODE REA_BIN LH_BIN CHROME_PATH INVITESION_PRIVATE_DIR CDP_HTTP GIT_RESEARCH`. Below, `rea` means `"$REA_NODE" "$REA_BIN"`.

## 2. Commands (all exercised in session 06 unless marked)

```bash
# 0. One dedicated, loopback-only browser profile. Passive REA tools attach to it and never launch it.
bash invitation-research/_tools/ops/bootstrap-sandbox.sh chrome     # run as a background task; CDP on 127.0.0.1:9222

# 1. Targets. Valid endpoints: http://127.0.0.1:PORT, http://[::1]:PORT, ws://127.0.0.1:PORT/devtools/browser/ID.
#    localhost, LAN addresses, https/wss, credentials and paths are rejected (browser-observation.md:268-273).
rea list-browser-targets http://127.0.0.1:9222 --json

# 2. Drive ONE visit with REA: navigate, settle, PageDown scroll; records network/console/page-error events, final URL and
#    screenshot (the optional cover click is ours: REA has no conditional step, §6). Launch mode owns a temporary profile; connect mode attaches to our target
#    (browser-scenario-contract.md:3-12, 168-170). Defaults we override: see §4.
rea capture-browser-scenario /abs/scenario.json --json

# 3. Passive page evidence: DOM node types/names, value lengths and attribute NAMES (no text, no attribute values),
#    a11y tree, scripts, resources, attach-window network/console metadata. Storage values are always redacted; key
#    names are opt-in (browser-observation.md:451, 488). URL query values ARE retained (:352).
rea inspect-web-page http://127.0.0.1:9222 <TARGET_ID> --observation-ms 1500 --json     # default window 500 ms

# 4. Static bundle analysis without execution: chunk graph, route/endpoint candidates, vendor fingerprints
#    (frameworks and bundlers only, §6) (browser-observation.md:26).
rea analyze-web-bundle http://127.0.0.1:9222 <TARGET_ID> --json

# 5. Visible-viewport PNG (browser-observation.md:115).
rea capture-web-screenshot http://127.0.0.1:9222 <TARGET_ID> --json

# 6. Offline HAR inspection; recorded URLs are never fetched (web-network-captures.md:3-5). REA keeps HTTP fields and
#    stored body bytes and --record decodes bodies (:130-167), so it only receives sanitized HARs: no bodies
#    (Playwright content:'omit'), no cookie/authorization headers, entries with time < 0 dropped (strict HAR 1.2).
rea inspect-web-network-capture /abs/session.har har --json
rea inspect-web-network-capture /abs/session.har har --record 0 --json

# 7. Human-driven flows (builder screens reachable without signup): arm a window, then a person acts. NOT YET EXERCISED.
rea observe-web-session http://127.0.0.1:9222 <TARGET_ID> --observation-ms 20000 --json

# 8. Public APK (analysis only; never committed or redistributed; hashes + metadata only).
rea inspect-artifact /abs/app.apk --json            # member inventory, digests
rea identify-flutter-build /abs/app.apk --json      # Flutter build facts by pure parsing (flutter-analysis.md:3)
rea inspect-apk-signature /abs/app.apk --json       # schemes + signer certificate fingerprints
rea inspect-android-package /abs/app.apk --json     # manifest/classes: needs a full JDK 17+ AND the jadx-headless-mcp
#   0.7.1 JAR (SHA-256 checked against REA's JadxRelease.ts) in REA_JADX_MCP_JAR; REA never downloads it
#   (android-analysis.md:84-92). Absent in this sandbox → capability_unavailable (V-REA-006).
```

Reproducible checks: `_tools/capture/rea-smoke.mjs --label <name> --url <url> [--own]` runs steps 1–5 on one page; `_tools/capture/rea-har-smoke.mjs --url <own page>` runs step 6 on our own instance.

One evidence capture per URL:

```bash
node invitation-research/_tools/capture/capture.mjs --id C-ENV-117 --competitor enviory \
  --kind demo --url https://… --open-cover --lighthouse [--driver rea|cdp] [--own] [--settle 5000]
# REA scenario drives the visit (default) → REA inspect + bundle → custom structure pass → Lighthouse.
# → raw/<competitor>/<id>.json (summary, no copy/PII; fields driver, rea.scenario, rea.emulation)
# → $INVITESION_PRIVATE_DIR/rea/<id>/ (full Evidence incl. rea-scenario.json), …/thumbs/<id>.webp, …/lh/<id>.json
# → appends raw/_captures.csv (IDs are cited as [OBSERVED C-XXX-NNN])
```

Own pages: `bash invitation-research/_tools/ops/local-stack.sh up`, then `local-stack.sh start` as a background task → `http://127.0.0.1:3100/i/budi-sari/<guest>`.

## 3. Routing table for THIS mission

| Target | Primary instrument | Entry point | Output we keep | Limits / substitutes |
|---|---|---|---|---|
| Competitor marketing site (home, pricing, catalog) | REA scenario + inspect + bundle via `capture.mjs` | `--kind marketing\|pricing\|catalog` | stack fingerprint, asset weight, third parties, Lighthouse | Prices are read like a visitor and tagged [OBSERVED] with the capture/source ID (REA keeps no text) |
| Builder / dashboard flows | REA `observe-web-session` while a person (or agent-browser) moves through screens reachable **without** signup | §2 step 7 | step list, field inventory, navigation timings | No automated signups (R1). A free signup only if the ToS allows it, with a throwaway identity, logged in `_open-questions.md`; otherwise [UNKNOWN] + help docs |
| Guest-facing invitation (public demo) | REA `capture-browser-scenario` drives the visit inside `capture.mjs --kind demo --open-cover --lighthouse` | §2 capture | section sequence, interaction inventory, libraries, fonts, audio behaviour, metrics | One navigation, one cover click, scroll; no RSVP/wish submission. REA navigates, settles and scrolls; the cover click (a trusted CDP mouse click on the settled control) and a scroll through the opened page follow REA's scenario (D-016: no conditional REA step, and a click from our session during REA's scenario never opened a gate, C-ENV-121; first verified opening C-ENV-122). Text features and animation libraries come from the custom structure pass (no REA coverage) |
| Public network / API shape | REA scenario events + inspect attach-window metadata; sanitized HAR via `inspect-web-network-capture` | requests from normal page use only | method, path template, parameter names, JSON shape (paths/types for live body shapes) | No probing, replay or enumeration; HAR rules in §2 step 6 |
| JS bundle + framework fingerprint | `analyze-web-bundle` (+ `export-web-scripts` → `analyze-javascript-application` for deeper module graphs) | target from step 1 | framework/bundler fingerprints, chunk graph, endpoint candidates | No animation-library fingerprints → custom detector. Public source maps only. Nothing enters our repo (R2) |
| Public Android APK | `inspect-artifact`, `identify-flutter-build`, `inspect-apk-signature`; `inspect-android-package` once JDK 17 + the JADX JAR exist | a file obtained lawfully (vendor download, F-Droid-style redistributable); Play-only apps → store-listing metadata | framework, signer fingerprint, sizes, SDK hints; permissions from the store listing | Never commit or redistribute; SHA-256 + metadata only. No third-party APK mirrors |
| Our own running instance | `capture.mjs --own` | `http://127.0.0.1:3100/i/<slug>/<guest>` (`local-stack.sh`) | same metrics; screenshots allowed in `raw/invitesion/` | Measurement build without `middleware.ts` while only placeholder Clerk keys exist (P-INV-010) |

## 4. Measurement protocol (identical for competitors and Invitesion)

- Viewports: **412×915** (primary, DPR 2.625) and **360×800** (layout/overflow check); 390×844 in the harness gates.
- Visit: REA scenario environment `viewport 412×915 @2.625, locale id-ID, timezone Asia/Jakarta, reduced_motion no-preference, service_workers allow` (REA defaults: 1280×720 @1, `en-US`, `UTC`, `reduce`, `block`). Our CDP session adds the Android Chrome UA and `mobile` metrics. REA's viewport override ends when it disconnects, so `capture.mjs` re-asserts the metrics before the structure pass and records `rea.emulation.duringScenario` / `afterScenario`.
- Lab metrics: Lighthouse 12 mobile, simulated Slow 4G (150 ms RTT, 1.6 Mbps down) + 4× CPU slowdown, cold profile per run, Android Chrome UA. Records LCP, CLS, TBT (INP proxy in lab), FCP, SI, bytes by type, request count, third parties, font-display issues, a11y failures.
- Structure pass (CDP, unthrottled, cache disabled): bytes by resource type, protocols, script/font hosts, libraries (globals + DOM markers), section sequence, buttons/labels (≤ 60 chars, digits redacted), audio elements and autoplay attributes, iframes (maps/video hosts), feature heuristics (cover gate, countdown, RSVP, wishes, gift, copy button, maps, calendar, livestream, QR, timezone labels, watermark).
- Stress items: long names, Arabic/RTL block, hostile guest names and WIB/WITA/WIT labels run on **our** templates (harness). On competitor demos only benign long names through the demo's normal name parameter; never hostile payloads on third-party sites.
- In-app browsers (WhatsApp/Instagram): UA emulation only; true WebView autoplay/gesture behaviour needs a physical Android device → [UNKNOWN] unless observed on-device.

## 5. Politeness and ethics (R1, R2, R8)

- `capture.mjs`, `rea-smoke.mjs` and discovery check `robots.txt` through `robots.mjs`: the `User-agent: *` group (longest-match Allow/Disallow) applies to our generic Chrome UA, and a `Disallow: /` for user-initiated AI agents (ChatGPT-User, Claude-User, Perplexity-User, and since D-026 the legacy Anthropic tokens Claude-Web and anthropic-ai) is treated as a block; `_tools/discovery/profile-reads.py` applies the same rule before its first page request. Training-crawler groups (GPTBot, ClaudeBot, CCBot, Google-Extended) do not apply: nothing here trains a model.
- **Fetch outcome first (D-022, s07, RFC 9309 §2.3.1.3–4):** `robotsStatusVerdict()` / `robotsUnreachable()` in `robots.mjs`, used by all three tools: 2xx → parse; 4xx (except 429) → no rules, allowed; 5xx, 429 or a network failure → **assume complete disallow**. Before s07 the tools treated every non-2xx as allowed; C-VID-104…106 were captured that way while `studio.viding.co/robots.txt` answered 500 and are excluded from benchmarks (`04-template-benchmarks/benchmark-exclusions.csv`).
- **After a bot challenge** (Cloudflare or similar) there is no fallback route: no reader tool, no other client; record [UNKNOWN] (S-RSV-002, s07).
- **Rendered read (s23r):** `_tools/discovery/rendered-read.py` renders ONE public page in the capture browser only when its static HTML was served (200, no challenge) but is a client-rendered shell (S-SNT-002 → S-SNT-003). It takes `profile-reads.py`'s robots verdict and stop rules, follows no link and interacts with nothing, and keeps the DOM and text private. It is never a second client for an origin that denied or challenged a read (RSVPify, WedMeGood, Greenvelope, Minted).
- Requests to one origin are spaced ≥ 1.5 s (well under 1 request/second); one page at a time; Lighthouse runs are spaced the same way; never two capture batches at once.
- No logins, purchases, form submissions, RSVP/wish posts, captcha or paywall bypass, anti-bot evasion (a Cloudflare challenge ends the attempt), watermark removal or automated signups.
- Competitor HTML/CSS/JS/images/fonts/audio/copy never enter the repo; only measurements, structure blueprints and our own words. Full REA Evidence, thumbnails and Lighthouse JSON of competitors stay in `$INVITESION_PRIVATE_DIR`.
- Every claim is tagged [OBSERVED capture-id + URL + date] / [CLAIMED] / [ESTIMATE source+date] / [INFERRED confidence] / [UNKNOWN].

## 6. What REA cannot do here, and what is used instead (tested facts)

| Gap | Evidence | Substitute |
|---|---|---|
| Animation-library fingerprints (GSAP, ScrollTrigger, Lottie, AOS, Swiper, three.js, jQuery) | `analyze-web-bundle` vendors = Angular, Next.js, React, Svelte, Vite, Vue (+ Rollup, Rspack); 0 source matches for the others | custom detector in `capture.mjs` (globals + DOM markers) |
| Visible text features (cover wording, RSVP, gift, countdown, timezone labels) | the DOM inventory keeps no text or attribute values by design (browser-observation.md:451) | custom structure pass (labels ≤ 60 chars, digits redacted) |
| Mobile/touch emulation in a connect-mode scenario | scenario environment has viewport/DPR/locale/timezone/motion only; override dropped on disconnect (C-INV-005: 500 px, DPR 1 afterwards) | CDP UA + metrics re-asserted; probes recorded |
| Conditional / optional scenario steps | vocabulary = `click`, `press`, `wait_for_timeout`, request steps; a failed step aborts all later actions (C-IDI-102: REA cover click on a page without a cover → 2/34 steps) | REA keeps navigation, settle and scrolling; the optional cover click (trusted CDP mouse click once the control has settled) and a CDP scroll through the opened page run after REA's scenario (D-016, supersedes the in-window click of D-014) |
| Throttled performance metrics | not an REA feature | Lighthouse 12 mobile simulate |
| Android manifest/class decompilation | needs JDK 17 + jadx-headless-mcp 0.7.1 (android-analysis.md:84–92); absent (V-REA-006) | static triage (`inspect-artifact`, `identify-flutter-build`, `inspect-apk-signature`) + store-listing permissions |
| Lenient HAR admission | Playwright `time: -1` entries rejected (V-REA-005) | drop never-completed entries before inspection and record them |
| iOS apps | no binaries without a device | store listing only |
| True in-app WebView behaviour | no device | UA emulation + [UNKNOWN] |
| MCP prompts / retained evidence views | no MCP server registered here | CLI with full inline Evidence saved privately |
| Complete coverage | attached scenarios always report `status: incomplete` (pre-attach event gap, locale limitation: browser-scenario-contract.md:197–201, 294); bundle analysis `partial` on both test pages | REA absence of evidence is recorded as [UNKNOWN], never as "not present" |

## 7. Verification log (session 06, 2026-10-29 UTC; REA 6.8.0, Node 24.22.2, Chrome 156.0.8078.4)

| ID | When | Command | Output summary | Verdict |
|---|---|---|---|---|
| V-REA-001 | 20:40 | `rea --version`; `npm view rea-agents version dist-tags time.modified`; `git -C rea-src rev-parse rea-agents-6.8.0` | 6.8.0; `latest` = 6.8.0 (2026-10-25); tag = `160d821`; v1 pin `21b1927` = `main`, 666 commits after the tag | PASS (pin current; docs pin moved to the tag) |
| V-REA-002 | 20:46 | `rea doctor --format json` | exit 1, `healthy:false`; node ✔ host ✔; hopper, ghidra, ida-registration, jadx, kuna-installation, skill:identity ✘ | PASS as expected (installation.md:361) |
| V-REA-003 | 21:00 | `rea-smoke.mjs --label own-guest-budi-sari --url http://127.0.0.1:3100/i/budi-sari/budi-hartono --own` | scenario 10/10 steps, 83 events (`ev_b9f99a31…`); inspect 294 nodes / 39 scripts / 17 resources (`ev_3ec34cd1…`); bundle partial, 39 chunks, Next.js + React (`ev_ad05107d…`); screenshot (`ev_d12dbf68…`) → `raw/_setup/rea-smoke-own-guest-budi-sari.json` | PASS |
| V-REA-004 | 20:46 | `rea-smoke.mjs --label viding-home --url https://viding.co/` (robots `Allow: /`) | scenario 10/10, 237 events (`ev_cea64985…`); inspect 2,131 nodes / 45 scripts / 34 resources (`ev_2d2c3b94…`); bundle partial, 45 chunks, Next.js + React, 1 endpoint candidate (`ev_45b92612…`); screenshot (`ev_adabbfef…`) → `raw/_setup/rea-smoke-viding-home.json` | PASS |
| V-REA-005 | 21:26 | `rea-har-smoke.mjs --url http://127.0.0.1:3100/i/budi-sari/budi-hartono` | first run `invalid_request` (HAR schema: entry `time` ≥ 0); after dropping 7 never-completed requests (Clerk SDK, see H-INV-007): 19 records (`ev_a8865f5a…`), `--record 0` (`ev_450d43af…`) → `raw/_setup/rea-smoke-har-own.json` | PASS (after normalisation) |
| V-REA-006 | 21:00 | `inspect-artifact`, `identify-flutter-build`, `inspect-apk-signature`, `inspect-android-package` on the F-Droid client APK (GPL-3.0, 12,569,951 B, SHA-256 `19d51fad…3327b52`, outside the repo) | first three exit 0 (`ev_cc2023ed…`; `ev_0df4e625…` `flutter_detected:false`; `ev_925e1663…` v1 scheme); package view exit 1 `capability_unavailable` (REA_JADX_MCP_JAR not configured) | PARTIAL (static PASS; decompilation UNVERIFIED) |
| V-REA-007 | 21:03 | `capture.mjs --id C-INV-005 --competitor invitesion --kind demo --url http://127.0.0.1:3100/i/budi-sari/budi-hartono --own --lighthouse` | driver `rea`; scenario 32/32 steps, 82 events (`ev_f18a26d8…`); inspect `ev_b030ff16…`; Lighthouse 93/96/96/60, LCP 2.62 s, TBT 209 ms, CLS 0 | PASS |
