# RSVPify (RSV): public API surface observed through normal page use

> Session 08 write-up of s07 evidence (S-RSV-001). Only `robots.txt` (a vendor fact sheet) was read as evidence; the pricing page returned a Cloudflare challenge that was not passed, and the reader-tool copy of it (S-RSV-002) is excluded from evidence. No endpoint, form or account was used.

## Result
**No endpoints observed under this method.**

| Observation | Evidence | Level |
|---|---|---|
| `robots.txt` serves a 13.7 KB LLM-oriented product fact sheet and no robots directives | S-RSV-001 | [OBSERVED] |
| MCP server for AI assistants; Stripe payments; SAML SSO | S-RSV-001 | [CLAIMED]; not observed |
| Pricing page behind a Cloudflare challenge | S-RSV-002 (status only) | [OBSERVED]; content excluded |
