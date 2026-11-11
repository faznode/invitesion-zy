# Partiful (PTF): public API surface observed through normal page use

> Session 08 write-up of s07 evidence (S-PTF-001): robots on both hosts first, then one browser-UA fetch each of the homepage and the help centre. No event page, account, RSVP or text blast was used.

## Result
**No endpoints observed under this method.**

| Observation | Evidence | Level |
|---|---|---|
| `partiful.com` robots: allow groups for search and link-preview bots, a training-crawler disallow group, no `*` group | S-PTF-001 | [OBSERVED] |
| `help.partiful.com` robots: `*` with `Crawl-delay: 1` | S-PTF-001 | [OBSERVED] |
| Marketing site on Framer with the Transcend consent manager | S-PTF-001 | [OBSERVED] |
