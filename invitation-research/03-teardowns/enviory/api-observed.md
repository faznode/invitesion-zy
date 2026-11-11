# Enviory: public API surface observed from normal page use

Rule: record only calls a normal visitor's page load triggers. No probing, no form submissions (R1). Response shapes are recorded as keys and types only; no values that could be personal data.

| Date (WIB) | Capture | Method | Path | Params | Response shape | Tag |
|---|---|---|---|---|---|---|
| 2026-10-29 10:37–10:49 | C-ENV-101…106 | none | none | none | REA `analyze-web-bundle` found no endpoint observations; only low-confidence `endpoint_candidate` values (`u`, `name`) from minified `.get()` calls, which are not real paths | [OBSERVED] |
| 2026-10-29 11:41 – 2026-10-30 05:24 | C-ENV-111…123 (guest pages: load, cover open on 122/123, scroll) | none | none | none | REA `analyze-web-bundle`: **no endpoint observations** on any of the 13 guest-page captures (15–17 first-party chunks each). The page load requested only `enviory.com` assets and Google Fonts | [OBSERVED] |

Notes
- Result for the dossier (session 07): **no endpoints observed under this method.** The guest page performs no API call a normal visitor's load, cover tap or scroll triggers that the bundle analysis could see; RSVP, wishes and the demo's "change data" customizer were not used (R1), so every write path stays [UNKNOWN].
- C-ENV-101…106 hit the preview wrapper (`/tema/<slug>/pratinjau`), see `dossier.md` §4.1.
- Check-in uses `enviory.com/checkin` with a dashboard code [CLAIMED S-ENV-001]. It is not exercised, because it needs a host account.
