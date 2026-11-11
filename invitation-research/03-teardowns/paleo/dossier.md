# PALEO (PLO): Tier A teardown dossier

> **Status: v1, session 08 (2026-11-03). No guest-page measurement.** Evidence level **C** (homepage and store-listing metadata; `../../_handoff/review-20261101.md` §2). PALEO is **app-first**: the homepage only links to the Play Store and social accounts, and no web catalog, sample invitation or demo exists on any surface read (s02 discovery, s03 read, s08 bounded search). The APK is not analysed (D-013: competitor APKs only if the vendor publishes a redistributable build). This dossier exists under **ADR-W1** (`../../09-masterplan/12-decision-log.md`); it is the thinnest of the set and says so section by section.
>
> Evidence used (times UTC): **D-PLO** discovery (2026-10-29: app landing, 4 anchors, 0 demos); longlist row (Play listing + probe 2026-10-29); **S-PLO-001** homepage (2026-10-29 03:29Z, plain fetch); **S-PLO-002** `robots.txt` (served as the app's HTML, so no rules) + homepage (2026-11-03 16:34–16:35Z); **S-PLO-003** Google Play `robots.txt` (16:47:59Z) + the store listing `id.paleo.undangandigital` (16:48:02Z, `hl=id&gl=ID`, HTTP 200, 1,175,002 bytes, allowed by Play's robots). Private copies: `$INVITESION_PRIVATE_DIR/pages/{demo-search,paleo}/` (not committed).
>
> **Privacy:** the Play developer account is registered to an individual; the name is not recorded. Testimonial names on the homepage and listing are not recorded. The app was not installed, no account was created, nothing was purchased.

## 1. Snapshot
| Item | Finding | Evidence |
|---|---|---|
| Positioning | "Undangan Web Digital Nomor 1 Di Indonesia": an Android app that builds **web** invitations ("undangan digital berbasis web") | [CLAIMED S-PLO-001/002] / [OBSERVED S-PLO-003] |
| Segment | Weddings first: the builder asks for bride and groom data with both sets of parents; other event types not described | [OBSERVED S-PLO-003 description] / others [UNKNOWN] |
| Size signals | **500K+ installs**, rating **4.5** (1.66K reviews), content rating 3+, category Events; Tranco: not in the top 1M | [OBSERVED S-PLO-003] / [ESTIMATE 2026-10-29] |
| Release cadence | Version 1.7.1, **last updated 29 Oct 2025**: about a year without an update on 2026-11-03 | [OBSERVED S-PLO-003] / stagnation [INFERRED, medium] |
| Company | Homepage footer "© 2022 PALEO, Inc."; the Play developer account is an individual's | [OBSERVED S-PLO-002, S-PLO-003] |
| Pricing | **[UNKNOWN]**: no price on the homepage or the listing, and the listing shows neither "Berisi iklan" (contains ads) nor "Pembelian dalam aplikasi" (in-app purchases) | [OBSERVED absence S-PLO-003] |
| Catalog | "100+ tema premium", responsive; Single Page and Multi Page types; categories Floral, Fotografi, Shape | [CLAIMED S-PLO-001/002, S-PLO-003] |
| Free tier, watermark, active period | [UNKNOWN] | — |

## 2. Funnel and flows
```mermaid
flowchart LR
  I[Play Store install] --> S[Mulai buat undangan]
  S --> Q[Pick a quote]
  Q --> B[Bride: name, father, mother]
  B --> G[Groom: name, father, mother]
  G --> E[Events: add or remove, date, location]
  E --> T[Pick a theme: single or multi page]
  T --> L[Web invitation live and shareable]
  L --> W[WhatsApp share per guest name and address]
  W --> V[Guest page: cover, autoplay music, story, gallery, guest book]
```
- The five-step builder and "under 5 minutes until the web invitation can be viewed and shared" are [CLAIMED S-PLO-003]; nothing was installed or used (R1, no automated signups).
- Guest management beyond WhatsApp sharing, RSVP handling, host day-of and post-event: [UNKNOWN].
- Reseller or partner programme: none mentioned. [OBSERVED absence]

## 3. Builder / editor
- **Wizard first, editor second:** a guided builder collects quote, couple, parents, events and theme; the quote and content can be edited later in the Editor. [CLAIMED S-PLO-003]
- Image crop and rotate in-app; add or remove features per invitation; ready-made backsound songs; real-time editing from any device. [CLAIMED S-PLO-001/002, S-PLO-003]
- 1.7.1 "What's new": swap the couple's order, hide the guest book, edit the sharing message, add a prewedding video. [OBSERVED S-PLO-003]
- Autosave, undo, media limits, music upload, AI helpers: [UNKNOWN].

## 4. Guest invitation: no guest-page measurement
### 4.1 Why nothing is measured (ADR-W1)
- No public sample, demo or catalog URL exists on the homepage or the listing; guest pages exist only for real customers. Store screenshots were not analysed. Evidence level C; conclusions about PLO guest pages are **low confidence**.

### 4.2 Guest features (claimed)
Cover, autoplay backsound, couple story ("cerita/kisah"), prewedding gallery and video, guest book (can be hidden), event list with date and location, WhatsApp sharing by guest name. [CLAIMED S-PLO-001/002, S-PLO-003] Performance, accessibility, motion, audio behaviour, localization: [UNKNOWN].

### 4.3 Against our own guest page
Not comparable (PLO unmeasured). Feature comparison in §12.

## 5. Tech fingerprint
| Layer | Finding | Confidence |
|---|---|---|
| Marketing site | Next.js (`__NEXT_DATA__`, `/_next/static/`); the `robots.txt` path returns the app's HTML (no rules file) | high [OBSERVED S-PLO-002] |
| Android app | Framework and SDKs not analysed (D-013) | [UNKNOWN] |
| Data handling (developer-declared) | May **share** location, personal info and 5 other data types with third parties; collects the same; encrypted in transit; deletion on request; committed to the Play Families Policy | developer declaration [OBSERVED S-PLO-003] |
| Guest-page hosting | [UNKNOWN] (no public guest page) | — |

## 6. Public API surface
No endpoints observed. See `api-observed.md`.

## 7. Mobile app
`id.paleo.undangandigital`: 500K+ installs, 4.5★ from 1.66K reviews, v1.7.1 (29 Oct 2025), Events category, content rating 3+, support e-mail and privacy policy listed (not recorded). No ads or in-app-purchase labels. Permissions, SDKs and screens [UNKNOWN] without a redistributable APK (D-013). [OBSERVED S-PLO-003]

## 8. Growth and SEO
- **Store-led acquisition:** install CTA is the only homepage action; Instagram (`@paleoinvitations` tips), Facebook; a help centre. [OBSERVED S-PLO-002, S-PLO-003]
- Minimal web footprint (no catalog, no programmatic pages, Tranco unranked). [OBSERVED / ESTIMATE]
- Homepage copy is corrupted in several sentences (the word "outfit" replaces other words, e.g. guest names in the WhatsApp feature). [OBSERVED S-PLO-002]

## 9. Monetization and pricing psychology
[UNKNOWN]. No public price, no ads label and no in-app-purchase label on the listing; how PALEO earns (web checkout, manual payment or free) cannot be established without installing the app, which this research does not do.

## 10. Strengths, weaknesses, public complaints
- **Strengths:** large install base with a 4.5 rating; the shortest guided creation flow described in the set (five steps, "under 5 minutes"); mobile-native editing; data deletion offered. [OBSERVED/CLAIMED as tagged]
- **Weaknesses:** no web catalog or sample, so web discovery depends on the store; about a year without an app update; opaque pricing; developer-declared sharing of location and personal data with third parties; corrupted homepage copy. [OBSERVED]
- **Public complaints (s14, S-PLO-005, paraphrased, no names):** Google Play listing 4.5★ from 1.66K reviews (500K+ installs); the listing was last updated 2025-10-29. The three reviews shown first (Apr–Jun 2024, positive) value the low price compared with social-media and marketplace sellers, a quick builder that suits beginners, and the number of themes. No complaint is visible in that sample, so complaint themes stay [UNKNOWN]; the visible reviews are more than two years old and not a representative sample. [OBSERVED listing, CLAIMED by reviewers]

## 11. Patterns to learn, to avoid, and our counter-move
| Learn (principle) | Avoid | Our counter-move |
|---|---|---|
| A guided wizard that reaches a shareable invitation in minutes | Wizard-only flows that lock content into one shape | Wizard into our module editor (M-018) with live preview (F-069) |
| Mobile-first editing | App-only distribution without web previews | Mobile-first web editor + public placeholder template previews (M-005) |
| Feature toggles per invitation (hide guest book) | Hidden pricing | Published prices (F-085) and per-module toggles |

## 12. Mapping to our modules and features
| PALEO capability | Ours | Modules | Verdict |
|---|---|---|---|
| Guided creation wizard | form-based editor; F-069 live preview missing | M-018 | partial |
| Couple and parents data | F-006 partial (captured in the editor, only nicknames rendered) | M-013, M-018 | partial |
| Event list with date and location | F-010 partial (UTC times, QA-002), F-011 partial | M-013 | partial |
| Cover + autoplay music | F-003 missing, F-004 config-only | M-013 | gap |
| Story, gallery, prewedding video | F-007 full, F-008 partial, F-009 missing | M-013, M-027 | partial |
| Guest book (wishes), hideable | F-019 full, F-020 config-only | M-013, M-014 | parity on wishes |
| WhatsApp share per guest | F-050 partial | M-019 | partial |
| Image crop/rotate | F-071 upload only | M-027, M-028 | gap |
| Android app | none | — | gap (no app) |
| Programmatic SEO + public catalog | F-092, F-093 full | M-002, M-004 | **we lead** on web discoverability |
| Guest-page weight and accessibility | C-INV-005 (local production build, no middleware) | M-012, M-013 | **not comparable** (PLO unmeasured) |
