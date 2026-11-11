<!-- SUMMARY (first 7 lines — greppable) -->
# GENERATION-REPORT.md — Melati (`basic-wedding-melati` v1.0.0)
> WHAT: Harness run for this template: static gates, measured bytes vs tier budget, Lighthouse lab run, visual snapshots, deliberate-failure proofs.
> STATUS: PASS: static gates, proofs, Lighthouse and every planned snapshot are valid (generated 2026-11-04T01:35:32Z by `pnpm harness report`)
> OWNER: template author + Guardian review
> DEPS: template.manifest.json, tools/template-harness/, invitation-research/09-masterplan/08-template-system-and-harness.md
> GREP: generation report, harness, budget, lighthouse, snapshot, proof
> UPDATED: 2026-11-04

## Summary
| Tier | Niche | Motion level | Audio | 3D | Locales |
|---|---|---|---|---|---|
| basic | wedding | 1 (reduced: none) | none | none | id, en |

## Static gates (`harness check`)
| Gate | Result | Problems / notes |
|---|---|---|
| schema | pass | — |
| files | pass | 4 assets, sizes and dimensions read from the files |
| budgets | pass | cold load 46 / 320 KiB · JS 0 / 8 · fonts 31.9 / 120 · largest image 9.5 KiB · bytes on disk; transfer size after compression is measured only by `bench` (Lighthouse) |
| contrast | pass | text on background: 12.85:1 (min 4.5) · mutedText on background: 6.73:1 (min 4.5) · text on surface: 13.99:1 (min 4.5) · mutedText on surface: 7.32:1 (min 4.5) · accent on background: 4.97:1 (min 3) · onAccent on accent: 5.5:1 (min 4.5) · computed on tokens, not on rendered pixels over images |
| reduced-motion | pass | fallback declared: none; behaviour confirmed by `snapshot` with emulated reduced motion |
| lazy-3d | pass | no 3D |
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
| Cold-load total (HTML + CSS + JS + fonts + non-deferred images) | 46 KiB | 320 KiB |
| Template JS | 0 KiB | 8 KiB |
| Fonts | 31.9 KiB | 120 KiB |
| Largest image | 9.5 KiB (melati-sprig) | 200 KiB |
| Deferred audio | 0 KiB | 0 KiB |
| Deferred 3D model | 0 KiB | 0 KiB |

## Lighthouse (`harness bench`, lab, mobile, simulated throttling)
| Lighthouse | Performance | Accessibility | LCP | TBT (not INP) | CLS | Transfer weight |
|---|---|---|---|---|---|---|
| 12.8.2 | 100 | 100 | 1351 ms | 0 ms | 0 | 48.6 KiB |

Served by the harness static server on 127.0.0.1 (no CDN, no compression): transfer weight ≈ bytes on disk. One run; not a field measurement.

## Visual snapshots (`harness snapshot`)
Google Chrome for Testing 156.0.8078.4. 8 of 8 planned screenshots. Images are written outside the repository (not committed); hashes identify them.

| Viewport | Fixture | Reduced motion | Bytes | SHA-256 (first 16) |
|---|---|---|---|---|
| 360×800 | default | no | 59716 | `047415130f67b5ae` |
| 390×844 | default | no | 65579 | `e967b3d9934b6abb` |
| 412×915 | default | no | 67372 | `c552d364bbde2d15` |
| 390×844 | long-name | no | 77300 | `9d05a79c5d9aced3` |
| 390×844 | rtl | no | 64574 | `8bf8cbe6e4bf1700` |
| 390×844 | emoji | no | 65751 | `e4b5baf74d6c791e` |
| 390×844 | hostile | no | 71231 | `5927db18d8dc063c` |
| 390×844 | default | yes | 65148 | `c81b6c4e1ad95454` |

## Deliberate-failure proofs (`harness prove`)
Each proof copies the template to a temporary directory, breaks one rule and must make the named gate fail.

| Proof | Expected gate | Caught | First problem reported |
|---|---|---|---|
| oversized-asset | budgets | yes | image melati-sprig 264.1 KiB > 200 KiB (basic) |
| unlicensed-font | licensing | yes | cormorant-garamond: license "LicenseRef-Proprietary" is not on the allowlist (OFL-1.1, Apache-2.0, MIT, CC0-1.0, CC-BY-4.0, own-work) |
| missing-reduced-motion | reduced-motion | yes | motion level 1 but template.css has no @media (prefers-reduced-motion: reduce) |
| unsafe-guest-markup | personalization | yes | raw triple-brace placeholder in template.html |
| guest-name-from-url | personalization | yes | template.js uses insertAdjacentHTML, URLSearchParams, location.search (guest data comes from the guests table only, never from the URL or as markup) |
| unverified-religious-text | religious-text | yes | t.injectedCitation.id looks like religious text: "QS. Ar-Rum: 21" |
| quote-not-in-corpus | religious-text | yes | quote unapproved-entry is not an approved entry of content/verified-religious-texts/corpus.json |
| external-script | external-scripts | yes | template.html: external load "<script src="https://cdn.example.com/tracker.js" |
| declared-bytes-mismatch | files | yes | cormorant-garamond: declared 23313 bytes, file has 23312 |
| og-wrong-size | og-image | yes | og image is 800×400, expected 1200×630 |
| missing-locale-string | localization | yes | t.eyebrow missing en |
| competitor-reference | originality | yes | manifest references "katsudoto" |
| low-contrast | contrast | yes | mutedText on background: 1:1 (min 4.5) |

## Assets and licences
| Asset | Kind | Bytes | Licence | Provenance | Source |
|---|---|---|---|---|---|
| cormorant-garamond | font | 23312 | OFL-1.1 | licensed | Cormorant Garamond 500, latin subset, Google Fonts (fonts.gstatic.com); OFL text from github.com/google/fonts ofl/cormorantgaramond |
| jost | font | 9404 | OFL-1.1 | licensed | Jost 400, latin subset, Google Fonts (fonts.gstatic.com); OFL text from github.com/google/fonts ofl/jost |
| melati-sprig | image | 9750 | own-work | generated | Generated for this repository (v0 image tool, 2026-11-03; watercolour jasmine and eucalyptus sprig; no input image), resized to WebP with sharp |
| og | og | 12633 | own-work | own-work | Headless-Chrome capture of this template's cover with fake sample data (harness preview), JPEG via sharp |

## Originality
Original layout and copy written for this repository: a single-column ivory card with a generated watercolour jasmine sprig, two OFL type families and one fade on first paint. No competitor page, asset, wording or layout was used as a reference.

- Reviewer sign-off: **pending** (the originality gate only proves the absence of competitor references; visual dissimilarity needs a human reviewer).

## Limits
- Lab measurements on one sandbox host; no device, no in-app browser, no field data. TBT is not INP.
- Audio playback and 3D frame rate are not verified without a device (opening ≠ playback).
- Snapshot images and the Lighthouse JSON are written to `$TMPDIR/invitesion-harness/basic-wedding-melati/`, never to the repository.
- Budgets are internal (anchored on our own lab page C-INV-005), not competitor parity; the competitor tier aggregates (`invitation-research/04-template-benchmarks/benchmark-pack.md`) do not support a parity threshold yet.
