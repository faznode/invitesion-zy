# Wevitation: public API surface observed from normal page use

Rule: record only calls a normal visitor's page load triggers. No probing, no form submissions (R1). Committed capture summaries keep request hosts and byte totals per resource type; the request shapes below come from the private REA evidence of C-WEV-105 (paths only, no payloads).

| Date | Capture | Method | Path | Params | Response shape | Tag |
|---|---|---|---|---|---|---|
| 2026-11-01 | C-WEV-105 (load, cover tap, scroll) | not retained | `/livewire/livewire.js` | version query | Livewire runtime script | [OBSERVED URL] |
| same | C-WEV-105 | not retained | `/cdn-cgi/scripts/<id>/cloudflare-static/rocket-loader.min.js` | — | Cloudflare Rocket Loader | [OBSERVED URL] |
| same | C-WEV-105 | not retained | `/cdn-cgi/speculation`, `/cdn-cgi/rum` | query on `rum` | Cloudflare speculation rules and RUM beacon [INFERRED from the paths] | [OBSERVED URL] |
| same | C-WEV-105 | not retained | `analytics.google.com/g/collect` | GA4 measurement params | not retained | [OBSERVED URL] |
| 2026-10-29 – 2026-11-01 | C-WEV-101…106 | — | — | — | No JSON/XHR application endpoint and no Livewire update round-trip during a read-only visit | [OBSERVED] |

Notes
- Result for the dossier: guest pages are server-rendered Livewire views. Content arrives with the HTML, and interactions (RSVP, wishes, gifts, QR pass) presumably go through Livewire update requests [INFERRED, medium]; their paths, payloads and validation are [UNKNOWN] because no form was used (R1).
- Hosts seen across C-WEV-101…106: `cdn.`, `fonts.`, `app.wevitation.com`, an S3 bucket in ap-southeast-1, cdnjs, jsDelivr, unpkg, GTM/GA4/DoubleClick, Cloudflare Insights, YouTube (`../../raw/wevitation/C-WEV-10*.json`, `network.thirdPartyHosts`).
- The sister product `wegiftry.com` shares the Wevitation account (S-WEV-005); its API was not observed.
