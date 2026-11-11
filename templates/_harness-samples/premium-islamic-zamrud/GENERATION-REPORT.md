<!-- SUMMARY (first 7 lines — greppable) -->
# GENERATION-REPORT.md — Zamrud (`premium-islamic-zamrud` v1.0.0)
> WHAT: Harness run for this template: static gates, measured bytes vs tier budget, Lighthouse lab run, visual snapshots, deliberate-failure proofs.
> STATUS: PASS: static gates, proofs, Lighthouse and every planned snapshot are valid (generated 2026-11-04T01:36:03Z by `pnpm harness report`)
> OWNER: template author + Guardian review
> DEPS: template.manifest.json, tools/template-harness/, invitation-research/09-masterplan/08-template-system-and-harness.md
> GREP: generation report, harness, budget, lighthouse, snapshot, proof
> UPDATED: 2026-11-04

## Summary
| Tier | Niche | Motion level | Audio | 3D | Locales |
|---|---|---|---|---|---|
| premium | islamic-wedding | 2 (reduced: fade-only) | after open gesture | none | id, en |

## Static gates (`harness check`)
| Gate | Result | Problems / notes |
|---|---|---|
| schema | pass | — |
| files | pass | 5 assets, sizes and dimensions read from the files |
| budgets | pass | cold load 80.1 / 380 KiB · JS 2.4 / 20 · fonts 25.8 / 160 · largest image 45.3 KiB · bytes on disk; transfer size after compression is measured only by `bench` (Lighthouse) |
| contrast | pass | text on background: 11.01:1 (min 4.5) · mutedText on background: 8.17:1 (min 4.5) · text on surface: 8.85:1 (min 4.5) · mutedText on surface: 6.57:1 (min 4.5) · accent on background: 6.68:1 (min 3) · onAccent on accent: 6.68:1 (min 4.5) · computed on tokens, not on rendered pixels over images |
| reduced-motion | pass | fallback declared: fade-only; behaviour confirmed by `snapshot` with emulated reduced motion |
| lazy-3d | pass | no 3D |
| audio | pass | playback itself is not verified without a device (opening ≠ playback, D-016) |
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
| Cold-load total (HTML + CSS + JS + fonts + non-deferred images) | 80.1 KiB | 380 KiB |
| Template JS | 2.4 KiB | 20 KiB |
| Fonts | 25.8 KiB | 160 KiB |
| Largest image | 45.3 KiB (zamrud-tile) | 250 KiB |
| Deferred audio | 437.5 KiB | 1536 KiB |
| Deferred 3D model | 0 KiB | 0 KiB |

## Lighthouse (`harness bench`, lab, mobile, simulated throttling)
| Lighthouse | Performance | Accessibility | LCP | TBT (not INP) | CLS | Transfer weight |
|---|---|---|---|---|---|---|
| 12.8.2 | 100 | 100 | 1358 ms | 0 ms | 0 | 83 KiB |

Served by the harness static server on 127.0.0.1 (no CDN, no compression): transfer weight ≈ bytes on disk. One run; not a field measurement.

## Visual snapshots (`harness snapshot`)
Google Chrome for Testing 156.0.8078.4. 8 of 8 planned screenshots. Images are written outside the repository (not committed); hashes identify them.

| Viewport | Fixture | Reduced motion | Bytes | SHA-256 (first 16) |
|---|---|---|---|---|
| 360×800 | default | no | 335393 | `c48c822192353e8c` |
| 390×844 | default | no | 387832 | `cff5d15558c68c7d` |
| 412×915 | default | no | 447507 | `485563ab180d6f8f` |
| 390×844 | long-name | no | 352626 | `673eebfeb08c85b1` |
| 390×844 | rtl | no | 385630 | `f8733a137bbebc42` |
| 390×844 | emoji | no | 387439 | `94075d8406d6163d` |
| 390×844 | hostile | no | 355122 | `48d8f35ae715a5a7` |
| 390×844 | default | yes | 387832 | `cff5d15558c68c7d` |

## Deliberate-failure proofs (`harness prove`)
Each proof copies the template to a temporary directory, breaks one rule and must make the named gate fail.

| Proof | Expected gate | Caught | First problem reported |
|---|---|---|---|
| oversized-asset | budgets | yes | image zamrud-tile 314.1 KiB > 250 KiB (premium) |
| unlicensed-font | licensing | yes | marcellus: license "LicenseRef-Proprietary" is not on the allowlist (OFL-1.1, Apache-2.0, MIT, CC0-1.0, CC-BY-4.0, own-work) |
| missing-reduced-motion | reduced-motion | yes | motion level 2 but template.css has no @media (prefers-reduced-motion: reduce) |
| unsafe-guest-markup | personalization | yes | raw triple-brace placeholder in template.html |
| guest-name-from-url | personalization | yes | template.js uses insertAdjacentHTML, URLSearchParams, location.search (guest data comes from the guests table only, never from the URL or as markup) |
| unverified-religious-text | religious-text | yes | t.injectedCitation.id looks like religious text: "QS. Ar-Rum: 21" |
| quote-not-in-corpus | religious-text | yes | quote unapproved-entry is not an approved entry of content/verified-religious-texts/corpus.json |
| external-script | external-scripts | yes | template.html: external load "<script src="https://cdn.example.com/tracker.js" |
| declared-bytes-mismatch | files | yes | marcellus: declared 14553 bytes, file has 14552 |
| og-wrong-size | og-image | yes | og image is 800×400, expected 1200×630 |
| missing-locale-string | localization | yes | t.eyebrow missing en |
| competitor-reference | originality | yes | manifest references "katsudoto" |
| low-contrast | contrast | yes | mutedText on background: 1:1 (min 4.5) |
| autoplay-audio | audio | yes | <audio> must not autoplay |

## Assets and licences
| Asset | Kind | Bytes | Licence | Provenance | Source |
|---|---|---|---|---|---|
| marcellus | font | 14552 | OFL-1.1 | licensed | Marcellus 400, latin subset, Google Fonts (fonts.gstatic.com); OFL text from github.com/google/fonts ofl/marcellus |
| plus-jakarta-sans | font | 11816 | OFL-1.1 | licensed | Plus Jakarta Sans 400, latin subset, Google Fonts (fonts.gstatic.com); OFL text from github.com/google/fonts ofl/plusjakartasans |
| zamrud-tile | image | 46350 | own-work | generated | Generated for this repository (v0 image tool, 2026-11-03; original eight-point geometric tile, no calligraphy or text; no input image), resized to WebP with sharp |
| chime | audio (deferred) | 448044 | own-work | own-work | Synthesised by assets/audio/make-chime.py in this folder (14 s pentatonic chime pad, 16 kHz mono PCM); no samples or recordings used |
| og | og | 104435 | own-work | own-work | Headless-Chrome capture of this template's cover with fake sample data (harness preview), JPEG via sharp |

## Originality
Original design for this repository: a generated eight-point geometric tile in emerald and gold behind a framed cover, an open gesture that starts a synthesised chime, and staggered reveals. No scripture, prayer or calligraphy is included (no owner-approved corpus entry exists, ADR-O04). No competitor page, asset, wording or layout was used as a reference.

- Reviewer sign-off: **pending** (the originality gate only proves the absence of competitor references; visual dissimilarity needs a human reviewer).

## Limits
- Lab measurements on one sandbox host; no device, no in-app browser, no field data. TBT is not INP.
- Audio playback and 3D frame rate are not verified without a device (opening ≠ playback).
- Snapshot images and the Lighthouse JSON are written to `$TMPDIR/invitesion-harness/premium-islamic-zamrud/`, never to the repository.
- Budgets are internal (anchored on our own lab page C-INV-005), not competitor parity; the competitor tier aggregates (`invitation-research/04-template-benchmarks/benchmark-pack.md`) do not support a parity threshold yet.
