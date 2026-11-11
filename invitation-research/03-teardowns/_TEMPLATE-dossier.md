# <Competitor> (<CODE>): Tier A teardown dossier

> Template copied from the original prompt, Phase 3 (saved here in session 04 so future sessions do not need the external prompt).
> Write each dossier IMMEDIATELY after finishing a competitor, then update `_progress.md` and `_evidence-index.md` (R10).
> Tag every claim: [OBSERVED] (capture ID, URL, date), [CLAIMED], [ESTIMATE] (source + date), [INFERRED] (confidence), [UNKNOWN] (R5).
> Blueprints only, never copied assets or copy (R2). No personal data from real customer invitations (R1/R3).
> Status line: version, session, which sections are provisional and why.

## 1. Snapshot
Positioning, segment, languages, company signals, [ESTIMATE] traffic/installs, IDR pricing and plan matrix, free-tier limits/watermark, template catalog stats (count, categories, price per template, release cadence).

## 2. Funnel and flows (mermaid)
landing → template pick → customize → preview → pay → publish → share → guest management → post-event. Steps, friction, estimated time-to-publish, capture IDs.

## 3. Builder / editor
Form-based vs WYSIWYG vs block, fields, validation, live preview, autosave, media constraints, music library, undo, AI helpers.

## 4. Guest-facing invitation deep dive (≥ 6 public demos across niches/tiers)
Section order, interactions, guest personalization, audio behavior, RSVP, wishes wall, digital gift, maps, calendar, share, QR, analytics, asset weight, animation libraries, fonts (+ license status), i18n, a11y, edge cases.
Before using any number: check that the capture is the guest page, not a vendor preview wrapper (top document < 200 DOM nodes + a same-origin iframe ⇒ re-target the iframe's official URL; see `04-template-benchmarks/protocol.md`).

## 5. Tech fingerprint (with confidence)
Front-end framework, build tool, CDN/hosting, backend hints, analytics/ad pixels, payment gateway, WhatsApp integration, storage/image CDN, bot protection.

## 6. Public API surface (normal page use only, no probing) → `api-observed.md`
Method, path, params, response shape.

## 7. Mobile app (if any)
Public APK metadata via REA android-analysis (permissions, SDKs, screens). Never commit or redistribute the APK.

## 8. Growth and SEO
Programmatic pages, keyword targeting, watermark backlinks, reseller/referral, social proof.

## 9. Monetization and pricing psychology

## 10. Strengths, weaknesses, user complaints
Play Store reviews, X, forums: summarize, no personal data.

## 11. Steal-worthy patterns (principle level), avoid, our counter-move

## 12. Mapping to our codebase
F-IDs (`01-codebase-audit/feature-inventory.csv`) and M-IDs (`01-codebase-audit/module-map.md`), with gap type (missing / partial / parity / we lead).
