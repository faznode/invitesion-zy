# Satu Momen (SMO): public API surface observed through normal page use

> Session 08 (2026-11-03). Method: plain visitor fetches of public pages (S-SMO-002 robots, S-SMO-003 `/tema`, S-SMO-005 `/harga`, S-SMO-006 reseller page; one request at a time, robots first). S-SMO-004 (three previews with personal data) contributes structure-only facts. No endpoint was called directly, no form or chat was used, and no `cursor=` URL (robots-disallowed) was requested.

## Result
**No endpoints observed under this method.** The pages are server-rendered HTML with Vite bundles; no request URLs or response bodies were recorded.

| Observation | Evidence | Level |
|---|---|---|
| Catalog pagination via `/tema?cursor=<base64 JSON>`; the link on page 1 decodes to `{"id":576,"_pointsToNextItems":true}` (Laravel cursor paginator); robots disallows `/*cursor=` for every agent | S-SMO-003 link, S-SMO-002 | [OBSERVED]; not followed |
| App routes `/app/login`, `/app/register`, `/app/create-card?theme=<id>` | S-SMO-003 links | [OBSERVED links]; behaviour [UNKNOWN] (no signup, R1) |
| Laravel-style CSRF meta tag and Vite `/build/assets/` bundles | S-SMO-005 | [OBSERVED] (with the cursor format above: Laravel, high) |
| Chat entry points with prefilled questions (`/chat?message=…`, `/chat?text=…`) | S-SMO-003 links | [OBSERVED links]; not used |
