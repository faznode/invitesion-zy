# Invitato: public API surface observed from normal page use

Rule: record only calls a normal visitor's page load triggers. No probing, no form submissions (R1). Committed capture summaries keep request hosts and byte totals per resource type, not paths or payloads, because invitation requests carry the guest code.

| Date | Capture | Method | Path | Params | Response shape | Tag |
|---|---|---|---|---|---|---|
| 2026-10-29 – 2026-11-01 | C-IVT-101…104 (load; cover tap on 101/104; scroll) | not retained | `api.invitato.net` (host only) | guest code from the page URL [INFERRED] | not retained; ≈ 2 KB XHR + 16–19 KB fetch per visit | [OBSERVED host and volume] |
| same | C-IVT-101…104 | — | — | — | REA `analyze-web-bundle`: no endpoint observations (16–22 chunks per page) | [OBSERVED] |

Notes
- Result for the dossier: the invitation page fetches guest-specific data from `api.invitato.net` on load; which endpoints, methods and fields are involved is [UNKNOWN] under this method. Recording paths would need a capture variant that stores redacted request lines; not worth it for the masterplan, which only needs "per-guest data is fetched by an opaque code".
- RSVP, wishes, the access-card download and the Imagination Room panel were not used (R1); every write path is [UNKNOWN].
- The demo host `invitato.net` is GitHub Pages behind Cloudflare (S-IVT-001); the marketing site is `invitato.id`.
