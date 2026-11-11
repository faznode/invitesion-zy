<!-- SUMMARY (first 7 lines — greppable) -->
# GENERATION-REPORT.md — Cincin (`signature-cincin-3d` v1.0.0)
> WHAT: Harness run for this template: static gates, measured bytes vs tier budget, Lighthouse lab run, visual snapshots, deliberate-failure proofs.
> STATUS: PASS: static gates, proofs, Lighthouse and every planned snapshot are valid (generated 2026-11-04T01:36:32Z by `pnpm harness report`)
> OWNER: template author + Guardian review
> DEPS: template.manifest.json, tools/template-harness/, invitation-research/09-masterplan/08-template-system-and-harness.md
> GREP: generation report, harness, budget, lighthouse, snapshot, proof
> UPDATED: 2026-11-04

## Summary
| Tier | Niche | Motion level | Audio | 3D | Locales |
|---|---|---|---|---|---|
| signature | wedding | 3 (reduced: none) | none | lazy (interaction) | id, en |

## Static gates (`harness check`)
| Gate | Result | Problems / notes |
|---|---|---|
| schema | pass | — |
| files | pass | 5 assets, sizes and dimensions read from the files |
| budgets | pass | cold load 37.7 / 420 KiB · JS 5.7 / 40 · fonts 21.4 / 160 · largest image 5.5 KiB · bytes on disk; transfer size after compression is measured only by `bench` (Lighthouse) |
| contrast | pass | text on background: 13.62:1 (min 4.5) · mutedText on background: 6.79:1 (min 4.5) · text on surface: 14.97:1 (min 4.5) · mutedText on surface: 7.46:1 (min 4.5) · accent on background: 5.29:1 (min 3) · onAccent on accent: 5.94:1 (min 4.5) · computed on tokens, not on rendered pixels over images |
| reduced-motion | pass | fallback declared: none; behaviour confirmed by `snapshot` with emulated reduced motion |
| lazy-3d | pass | real-device frame rate is not measured |
| audio | pass | no audio |
| personalization | pass | harness renderer, not the product renderer (product: H-INV-003) |
| render-fixtures | pass | fixtures: long Indonesian name, Arabic name, emoji name, hostile markup; overflow is judged in snapshots |
| localization | pass | — |
| external-scripts | pass | — |
| og-image | pass | assets/og.jpg 1200×630 |
| licensing | pass | declarations are trusted; provenance review stays human |
| originality | pass | cannot prove visual dissimilarity; reviewer sign-off belongs in the generation report |
| religious-text | pass | the corpus is empty until the owner approves entries, so no quote blocks ship (ADR-O04) |

## Bytes on disk vs the tier budget
| Item | Measured | Budget |
|---|---|---|
| Cold-load total (HTML + CSS + JS + fonts + non-deferred images) | 37.7 KiB | 420 KiB |
| Template JS | 5.7 KiB | 40 KiB |
| Fonts | 21.4 KiB | 160 KiB |
| Largest image | 5.5 KiB (rings-fallback) | 250 KiB |
| Deferred audio | 0 KiB | 1536 KiB |
| Deferred 3D model | 126.3 KiB | 900 KiB |

## Lighthouse (`harness bench`, lab, mobile, simulated throttling)
| Lighthouse | Performance | Accessibility | LCP | TBT (not INP) | CLS | Transfer weight |
|---|---|---|---|---|---|---|
| 12.8.2 | 100 | 95 | 1203 ms | 0 ms | 0.013 | 40.7 KiB |

Served by the harness static server on 127.0.0.1 (no CDN, no compression): transfer weight ≈ bytes on disk. One run; not a field measurement.

## Visual snapshots (`harness snapshot`)
Google Chrome for Testing 156.0.8078.4. 8 of 8 planned screenshots. Images are written outside the repository (not committed); hashes identify them.

| Viewport | Fixture | Reduced motion | Bytes | SHA-256 (first 16) |
|---|---|---|---|---|
| 360×800 | default | no | 68034 | `66ea39f328b76522` |
| 390×844 | default | no | 73348 | `b2efa793036f544b` |
| 412×915 | default | no | 78664 | `aaf4d00be603ab54` |
| 390×844 | long-name | no | 73524 | `e85f7abad7b8e422` |
| 390×844 | rtl | no | 71311 | `28a0120aeadbd22f` |
| 390×844 | emoji | no | 72742 | `4b594ae624f47662` |
| 390×844 | hostile | no | 69886 | `1b7da79957380ae2` |
| 390×844 | default | yes | 69830 | `53f46f8682ce49d3` |

## Deliberate-failure proofs (`harness prove`)
Each proof copies the template to a temporary directory, breaks one rule and must make the named gate fail.

| Proof | Expected gate | Caught | First problem reported |
|---|---|---|---|
| oversized-asset | budgets | yes | image rings-fallback 314.1 KiB > 250 KiB (signature) |
| unlicensed-font | licensing | yes | italiana: license "LicenseRef-Proprietary" is not on the allowlist (OFL-1.1, Apache-2.0, MIT, CC0-1.0, CC-BY-4.0, own-work) |
| missing-reduced-motion | reduced-motion | yes | motion level 3 but template.css has no @media (prefers-reduced-motion: reduce) |
| unsafe-guest-markup | personalization | yes | raw triple-brace placeholder in template.html |
| guest-name-from-url | personalization | yes | template.js uses insertAdjacentHTML, URLSearchParams, location.search (guest data comes from the guests table only, never from the URL or as markup) |
| unverified-religious-text | religious-text | yes | t.injectedCitation.id looks like religious text: "QS. Ar-Rum: 21" |
| quote-not-in-corpus | religious-text | yes | quote unapproved-entry is not an approved entry of content/verified-religious-texts/corpus.json |
| external-script | external-scripts | yes | template.html: external load "<script src="https://cdn.example.com/tracker.js" |
| declared-bytes-mismatch | files | yes | italiana: declared 10101 bytes, file has 10100 |
| og-wrong-size | og-image | yes | og image is 800×400, expected 1200×630 |
| missing-locale-string | localization | yes | t.eyebrow missing en |
| competitor-reference | originality | yes | manifest references "katsudoto" |
| low-contrast | contrast | yes | mutedText on background: 1:1 (min 4.5) |
| eager-3d-model | lazy-3d | yes | model path appears in the initial HTML (must load lazily from template.js) |

## Assets and licences
| Asset | Kind | Bytes | Licence | Provenance | Source |
|---|---|---|---|---|---|
| italiana | font | 10100 | OFL-1.1 | licensed | Italiana 400, latin subset, Google Fonts (fonts.gstatic.com); OFL text from github.com/google/fonts ofl/italiana |
| plus-jakarta-sans | font | 11816 | OFL-1.1 | licensed | Plus Jakarta Sans 400, latin subset, Google Fonts (fonts.gstatic.com); OFL text from github.com/google/fonts ofl/plusjakartasans |
| rings-fallback | image | 5658 | own-work | generated | Generated for this repository (v0 image tool, 2026-11-03; two rose-gold rings on an off-white background; no input image), resized to WebP with sharp |
| rings-model | model (deferred) | 129293 | own-work | own-work | Generated by assets/model/make-rings.py in this folder (two interlocking tori, glTF 2.0 with an embedded buffer) |
| og | og | 13809 | own-work | own-work | Headless-Chrome capture of this template's cover with fake sample data (harness preview), JPEG via sharp |

## Originality
Original design for this repository: a round stage that shows a generated photograph of two rings and, only when the guest asks, swaps it for a procedurally generated 3D model drawn by a 6 KB dependency-free WebGL viewer, with scroll-linked reveals. No competitor page, asset, wording or layout was used as a reference.

- Reviewer sign-off: **pending** (the originality gate only proves the absence of competitor references; visual dissimilarity needs a human reviewer).

## Limits
- Lab measurements on one sandbox host; no device, no in-app browser, no field data. TBT is not INP.
- Audio playback and 3D frame rate are not verified without a device (opening ≠ playback).
- Snapshot images and the Lighthouse JSON are written to `$TMPDIR/invitesion-harness/signature-cincin-3d/`, never to the repository.
- Budgets are internal (anchored on our own lab page C-INV-005), not competitor parity; the competitor tier aggregates (`invitation-research/04-template-benchmarks/benchmark-pack.md`) do not support a parity threshold yet.
