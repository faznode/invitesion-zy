<!-- SUMMARY (first 7 lines — greppable) -->
# rea-verification.md — Step 0 re-verification of REA (new instructions §3 Step 0)
> WHAT: Verdict on the REA playbook and capture pipeline: 20 claims checked against the REA source, smoke tests per target type, REA-as-instrument check, fixes made, remaining limits.
> STATUS: DONE 2026-10-29 (session 06). Overall PARTIAL with every gap fixed → **REA VERIFIED** for this mission (Android decompilation UNVERIFIED)
> OWNER: Oracle (research)
> DEPS: _rea-playbook.md v2 (§7 verification log), _tools/capture/{capture.mjs,rea-smoke.mjs,rea-har-smoke.mjs}, _tools/ops/local-stack.sh, raw/_setup/rea-smoke-*.json, _evidence-index.md (V-REA-*)
> GREP: rea, verification, verdict, smoke, playbook, capture-browser-scenario, android, har, jadx
> UPDATED: 2026-10-29

## 0. Verdict

| Scope | Verdict | Basis |
|---|---|---|
| Playbook claims (20 spot-checked) | **PARTIAL → fixed**: 13 PASS, 5 PARTIAL, 2 FAIL | §2; every PARTIAL/FAIL corrected in `_rea-playbook.md` v2 |
| Pinned version | PASS: 6.8.0 is still npm `latest`; the docs pin moved from a `main` commit to the release tag | V-REA-001 |
| Competitor marketing site | PASS | V-REA-004 (viding.co) |
| Guest-facing invitation page | PASS on our own page; competitor demo with the REA driver = first item of the next batch | V-REA-003, V-REA-007 |
| Public network / API capture | PASS (scenario events, inspect attach window, HAR route) | V-REA-003/004/005 |
| JS bundle + framework fingerprint | PASS for frameworks; animation libraries are an REA limit (custom detector kept) | V-REA-003/004, §4 |
| Builder / dashboard flows | Documented, CLI present, **not exercised** (no public builder flow tested yet) | §2 C16 |
| Public Android APK | **PARTIAL**: static triage PASS; manifest/class decompilation **UNVERIFIED** (no JDK 17 + JADX JAR) | V-REA-006 |
| REA as the instrument (Step 0.4) | **FAIL → fixed**: REA now drives the visit in `capture.mjs` | §4, V-REA-007 |

The owner's doubt was justified. The s01 playbook had the right commands, but two claims were false, five were incomplete, its version pin pointed at `main` instead of the release, and one false claim ("`capture_browser_scenario` is MCP-only") meant the pipeline bypassed REA for the visit itself. REA is marked VERIFIED and the run continues with Step 1.

## 1. Sources and method (Steps 0.1, 0.2)

- REA repo `github.com/morluto/rea` cloned to `/vercel/share/work/rea-src` (main HEAD `5f9187c`, 2026-10-30 04:27 +08:00). Claims are judged against the git tag **`rea-agents-6.8.0` (`160d821`)**, the release this run executes; line numbers below refer to that tag.
- The playbook was read in full and compared with the requirement list in `_handoff/briefs/01-new-instructions.md` §3 Step 0.1 (tool per target, exact commands, limits, pinned version, routing table for this mission).

| REA document (tag) | Read | Used for |
|---|---|---|
| README.md (428 lines) | full | install guidance (C01) |
| AGENTS.md | full | contributor rules; nothing operator-facing for this mission |
| .agents/skills/reverse-engineer-anything/SKILL.md (506) | full | CLI fallback (C12), package acquisition scope (C01) |
| docs/installation.md (1622) | setup, doctor, uninstall sections | C02, C03 |
| docs/cli.md (1086) | output formats, exit status | C14 |
| docs/mcp-contracts.md (1426) | tool results, request scope, generated catalog | CLI/MCP parity; `analyze_web_bundle` declares `launchesProcess`/`writesFilesystem` (:911) |
| docs/mcp-prompts.md (140) | full | guided prompts are MCP-only (unused: no MCP server here) |
| docs/reverse-engineering-tools.md (174) | full | objdump/GDB/Rizin/Cutter: native targets only, outside this mission |
| docs/browser-observation.md (671) | full | C04, C05, C06, C08, C16, C18 |
| docs/browser-scenario-contract.md (624) | full | C07, scenario defaults |
| docs/web-network-captures.md (1056) | admission, record selection, body handling | C09 |
| docs/javascript-application-workflows.md (640) | full | `export-web-scripts` → `analyze-javascript-application` (C17) |
| docs/javascript-artifact-reconstruction.md (988) | workflow, safety and verification boundaries | not used on competitors: reconstruction of their code conflicts with clean-room rule R2 |
| docs/android-analysis.md (486) — **the usual gap** | full | C10 |
| docs/native-investigation.md (1221) — **the usual gap** | scope + section map | not applicable: no native binaries in scope (a Flutter `libapp.so` would route here only for deep reversing, which the mission does not need) |
| docs/flutter-analysis.md (213), docs/apk-signature.md (291) | full | C11, C13 |
| adb / apktool / pcap guides | not read | no device, no apktool need (`inspect-artifact` covers metadata), no pcap (HAR route used); read when such a target appears |

## 2. Claim spot-check (Step 0.2)

| ID | Playbook claim (v1 §) | Source at `rea-agents-6.8.0` | Verdict | Fix in playbook v2 |
|---|---|---|---|---|
| C01 | §1 "README: run package acquisition from a trusted directory outside the target project" | Not in README. SKILL.md:87–88: prefer an existing `rea` CLI; use `npx -y rea-agents@latest` only "when REA package acquisition is within the authorized scope" | **FAIL** (misattributed quote) | Outside-repo install restated as our own rule (keeps REA's dependency tree out of the product lockfile); SKILL.md cited for scope; we pin 6.8.0 instead of `@latest` |
| C02 | §1 `setup --yes` registers MCP + skill in operator agents and edits their config with backups | installation.md:67–94, 143 | PASS | — |
| C03 | §1 health check `rea doctor --json`; missing engines not needed | installation.md:356–361 ("its overall `healthy` value can be false while your chosen workflow works"), 380–386 (scoped checks decide the exit status) | PARTIAL: unscoped doctor exits 1 here (V-REA-002) | Expect exit 1; read `checks` node + host; scoped form for a pass/fail gate |
| C04 | §2 CDP endpoint must be `http://127.0.0.1:PORT`; `localhost` rejected | browser-observation.md:268–273 | PASS | Adds `[::1]` and the `ws://127.0.0.1:PORT/devtools/browser/ID` form |
| C05 | §2 "REA attaches; it never launches or owns the browser" | True for passive tools (browser-observation.md:9, 150–151, 189); `capture_browser_scenario` also has a **launch** mode that owns a temporary profile (browser-scenario-contract.md:10–12, 168–170, 316) | PARTIAL | Claim scoped to passive tools |
| C06 | §2 inspect-web-page keeps node names + attribute NAMES, no values; storage key names, values redacted | browser-observation.md:451 (node types/names, value lengths, attribute names; no text or attribute values), :488 (storage values always redacted; key names opt-in), :352 (URL query values retained) | PASS (nuance) | Notes that URL query values are kept → demo `?to=` values must be placeholder names |
| C07 | §6 "`capture_browser_scenario` is MCP-only" → custom CDP drives navigate/click/scroll | browser-scenario-contract.md:3–5: available "through both MCP and the `capture-browser-scenario INPUT_JSON` CLI command"; listed in CLI help; V-REA-003/004/007 exit 0 | **FAIL** | §2, §3, §6 rewritten; `capture.mjs` now drives the visit with REA (§4) |
| C08 | §2 analyze-web-bundle: static, no execution; chunk graph, route/endpoint candidates, vendor fingerprints | browser-observation.md:26 | PASS + limit | Vendor fingerprints = frameworks/bundlers only: `src/domain/webBundleAnalyzerInspection.ts` lists Angular, Next.js, React, Svelte, Vite, Vue (helpers add Rollup, Rspack); 0 source matches for GSAP, Lottie, three.js, Swiper, jQuery |
| C09 | §2 HAR "never fetched by REA; tokens excluded"; §3 "REA keeps paths/types, never values" | web-network-captures.md:3–5 (offline, URLs never fetched: PASS); :130–167 (HTTP fields and stored body bytes retained in sidecars; `--record` decodes retained bodies). "Paths/types, never values" is the live JSON body-shape rule (browser-observation.md:352), not a HAR rule | PARTIAL | HARs are sanitized before REA (no bodies, no cookie/auth headers); `--record` output stays private |
| C10 | §2/§6 inspect-android-package needs headless JADX + JDK 17 | android-analysis.md:84–92: full JDK 17+ **and** the jadx-headless-mcp 0.7.1 JAR (SHA-256 vs REA's `JadxRelease.ts`) in `REA_JADX_MCP_JAR`; REA never downloads it. V-REA-006: `capability_unavailable … jar not_configured` | PARTIAL | Exact prerequisites + env var |
| C11 | identify-flutter-build is static | flutter-analysis.md:3–18 ("pure parsing"); V-REA-006 | PASS | — |
| C12 | §1 skill: the CLI returns the Evidence record directly | SKILL.md:83–86 | PASS | Adds "does not establish that MCP is configured" |
| C13 | inspect-apk-signature reports signer fingerprints | apk-signature.md:14–28; V-REA-006 | PASS | — |
| C14 | `--json` output flag | cli.md:15, 30 (`--format json|jsonl`, 56–77) | PASS | — |
| C15 | Node `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1`; sandbox 24.16.0 rejected | package.json `engines` at the tag; CHANGELOG 6.8.0 BREAKING (Node.js) | PASS | — |
| C16 | `observe-web-session … --observation-ms 20000` for human-driven flows | browser-observation.md:27, 299; CLI help | PASS (documented; not exercised) | — |
| C17 | `export-web-scripts` → `analyze-javascript-application` | CLI help; browser-observation.md:3 | PASS | — |
| C18 | `capture-web-screenshot` = visible-viewport PNG | browser-observation.md:115 | PASS | — |
| C19 | inspect-web-page `--observation-ms 1500` | CLI help (default 500 ms) | PASS | Default noted |
| C20 | Pin "6.8.0 (npm), repo @ `21b1927`" | npm `latest` = 6.8.0 (2026-10-25); tag = `160d821`; `21b1927` is a `main` commit 666 commits after the tag | PARTIAL | Docs pinned to the tag; `main` HEAD recorded as newer, unreleased docs |

Version check: no newer release exists, so nothing we rely on changed. Docs read on `main` can describe unreleased behaviour; v2 cites tag lines only.

## 3. Smoke tests (Step 0.3)

All on 2026-10-29 (UTC), REA 6.8.0, Node 24.22.2, Chrome for Testing 156.0.8078.4. Full Evidence stays in `$INVITESION_PRIVATE_DIR/rea-smoke/` (not committed); compact summaries in `raw/_setup/`.

| ID | Target type | Page / artefact | What ran | Result |
|---|---|---|---|---|
| V-REA-001 | version | — | `rea --version`, `npm view rea-agents version dist-tags time.modified`, tag lookup | 6.8.0 = `latest` |
| V-REA-002 | health | — | `rea doctor --format json` | exit 1, `healthy:false`; node ✔ host ✔; hopper, ghidra, ida-registration, jadx, kuna-installation, skill:identity ✘ (optional engines + skill registration absent) — expected |
| V-REA-003 | own guest page: inspection, network, bundle | `http://127.0.0.1:3100/i/budi-sari/budi-hartono` (local production build) | `rea-smoke.mjs`: targets → scenario (connect) → inspect → bundle → screenshot | PASS: scenario 10/10 steps, 83 events; 294 DOM nodes, 39 scripts, 17 resources; bundle partial, 39 chunks, Next.js + React |
| V-REA-004 | competitor marketing page | `https://viding.co/` (robots `Allow: /`) | same | PASS: scenario 10/10, 237 events; 2,131 nodes, 45 scripts, 34 resources; bundle partial, 45 chunks, Next.js + React, 1 public endpoint candidate |
| V-REA-005 | network capture, HAR route | own guest page | `rea-har-smoke.mjs`: body-less HAR (playwright-core 1.58.2 bundled with REA, cookies/auth stripped) → `inspect-web-network-capture` + `--record 0` | PASS after normalisation: first run `invalid_request` (HAR schema: entry `time` must be ≥ 0; Playwright writes −1 for never-completed requests). 7 such entries dropped and recorded → 19 records inspected |
| V-REA-006 | public Android APK | F-Droid client APK (GPL-3.0, f-droid.org; 12,569,951 B; SHA-256 `19d51fad…3327b52`), kept outside the repo | `inspect-artifact`, `identify-flutter-build`, `inspect-apk-signature`, `inspect-android-package` | PARTIAL: first three exit 0 (not Flutter; v1 signature scheme); package view exit 1 `capability_unavailable` |
| V-REA-007 | pipeline end to end | own guest page | `capture.mjs --own --lighthouse` with the REA driver = **C-INV-005** | PASS: driver `rea`, scenario 32/32 steps; Lighthouse 93/96/96/60, LCP 2.62 s, TBT 209 ms, CLS 0 — consistent with C-INV-001 (94/96/93/60, LCP 2.60 s) |

APK choice: competitor apps (PLO, IDI, WEV) are distributed through Google Play, which offers no direct lawful APK download without a device; third-party mirrors are excluded. The F-Droid client is freely redistributable, so it proves the documented procedure without touching a competitor binary. Competitor apps get store-listing metadata unless a vendor publishes an APK itself.

Side finding (V-REA-005, indexed as H-INV-007): the anonymous guest page requests Clerk's browser SDK (6 attempts of `clerk.browser.js` + 1 of `ui.browser.js` when the Clerk host fails), because `ClerkProvider` wraps the root layout (`app/layout.tsx:40`). Size in production: H-INV-004 (325 KB raw, 70.7 KB brotli). Input for the masterplan's guest-page performance work.

## 4. REA as the instrument (Step 0.4)

Before (s01–s05): `capture.mjs` used REA only for `inspect-web-page` + `analyze-web-bundle` after the visit; navigation, cover click and scrolling were custom CDP because of claim C07.

After (s06): REA `capture-browser-scenario` in connect mode on the capture's own CDP target drives navigation, settle, 14 PageDown presses and Home, and records network/console/page-error events, final URL and screenshot. The optional cover click is not an REA step, because REA's scenario vocabulary (`click`, `press`, `wait_for_timeout`, request steps) has no conditional step and a failed step aborts every later action. Session 06 first took it from our CDP session inside REA's settle window (D-014); that click never opened a gate while REA was attached (C-ENV-121: a settled control, trusted click, still closed), so since 22:20Z UTC it runs after REA's scenario: a trusted CDP mouse click on the settled control, a landing check, then a CDP scroll through the opened page (D-016; first verified opening C-ENV-122, 24 sections). The first version let REA click a Playwright locator for the cover; on C-IDI-102 (no cover gate) that step failed and REA stopped after 2/34 steps, and C-IVT-102 behaved the same; both completed through the CDP fallback. `--driver cdp` restores the old path. If REA fails a step, CDP takes over and the summary records `rea+cdp-fallback` or `cdp-fallback`.

| Concern | REA coverage | Decision |
|---|---|---|
| Visit (navigate, settle, scroll) | yes (scenario) | **REA primary** (new) |
| Optional cover click | **no conditional step** in the scenario vocabulary; a failed click aborts the scenario | CDP click inside REA's settle window (same heuristic as before) |
| Network + console events | yes (scenario events, inspect attach window) | REA primary; the CDP listener stays for byte totals by type, comparable with C-xxx-1xx |
| DOM / a11y / scripts / resources | yes (`inspect-web-page`) | REA primary (unchanged) |
| Framework + bundler fingerprint, chunk graph, endpoint candidates | yes (`analyze-web-bundle`) | REA primary (unchanged) |
| Animation libraries (GSAP, ScrollTrigger, Lottie, AOS, Swiper, three.js, jQuery) | **no** (C08) | custom detector kept |
| Text features (cover gate, countdown, RSVP, wishes, gift, maps, calendar, timezone labels, watermark) | **no**, by design (C06) | custom structure pass kept |
| Mobile emulation during the visit | **partial**: scenario environment = viewport, DPR, locale, timezone, motion; no mobile/touch flag, no UA in connect mode; the override is dropped on disconnect (C-INV-005 after the scenario: width 500, DPR 1) | CDP UA + metrics kept and re-asserted before the structure pass; `rea.emulation.duringScenario` / `afterScenario` recorded from now on |
| Throttled lab metrics | no | Lighthouse 12 kept |

Scenario settings we override, with REA's defaults (browser-scenario schema): viewport 1280×720@1 → 412×915@2.625; locale `en-US` → `id-ID`; timezone `UTC` → `Asia/Jakarta`; `reduced_motion` `reduce` → `no-preference` (guests see the full animation); `service_workers` `block` → `allow` (REA rejects attached captures of service-worker pages under `block`).

Batch A (s06) checks the revised flow on competitor demos: `driver` should read `rea` from C-VID-102 onwards; `structure.coverClicked` shows whether a cover was found.

## 5. Fixes made in session 06

1. `_rea-playbook.md` v2: all FAIL/PARTIAL claims corrected; routing table uses REA scenario capture; §6 limits rebuilt from tested facts; §7 verification log.
2. `_tools/capture/capture.mjs`: REA drives the visit (default `--driver rea`) with CDP fallback; REA version and scenario Evidence hash recorded; emulation probes during and after the scenario.
3. `_tools/capture/rea-smoke.mjs` (new): reproducible web smoke test (steps 1–5 of playbook §2).
4. `_tools/capture/rea-har-smoke.mjs` (new): HAR-route smoke test on our own page, with HAR normalisation.
5. `_tools/ops/local-stack.sh` (new): Postgres 16 + production-build snapshot + seeded fixture for own-page measurement; builds without `middleware.ts` while only placeholder Clerk keys exist (P-INV-010).
6. `_evidence-index.md`: `V-REA-NNN` prefix, V-REA-001…007, C-INV-005, P-INV-010, H-INV-007.

## 6. Remaining limits (carried into the masterplan's research caveats)

- Android manifest/classes: UNVERIFIED until a full JDK 17+ and the jadx-headless-mcp 0.7.1 JAR are supplied (`REA_JADX_MCP_JAR`). Store-listing permissions are used instead.
- No physical device: true in-app WebView (WhatsApp, Instagram) autoplay and gesture behaviour stays [UNKNOWN]; UA emulation only.
- Every attached (connect-mode) scenario reports `status: incomplete` (declared pre-attach event gap and locale limitation, browser-scenario-contract.md:197–201, 294). Bundle analysis reported `partial` on both test pages. REA absence of evidence is recorded as [UNKNOWN], never as "not present".
- MCP-only conveniences (guided prompts, retained evidence views) are unused: CLI only.
- Own-page captures use a build without `middleware.ts` (P-INV-010): no CSP header, `locale` cookie or Clerk headers; the page payload is unchanged.
- TBT noise: the platform's `next dev` competes for CPU during captures (recorded per batch).
