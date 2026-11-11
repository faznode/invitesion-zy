# Viding (VID): public API surface observed through normal page use

> Session 08 (2026-11-03). Method: plain visitor fetches of six public marketing pages (S-VID-001…006, robots checked first, one request at a time) and the three permitted guest-page captures (C-VID-101…103). No endpoint was called directly, no form was submitted, and `/api/` (robots-disallowed) was never requested. `studio.viding.co` is off-limits while its robots.txt answers 5xx (D-022, H-VID-001).

## Result
**No endpoints observed under this method.** The captures keep request hosts and resource types, not request URLs or response bodies, so nothing beyond hosts can be claimed.

| Observation | Evidence | Level |
|---|---|---|
| Asset hosts used by guest pages: `cdn.viding.co`, `media.viding.co`, `themes.viding.co` and one further first-party `*.viding.co` host | C-VID-101…103 `network.thirdPartyHosts` | [OBSERVED hosts only] |
| Marketing pages carry an RSC payload (`self.__next_f`) and no inline `/api/…` references in their HTML | S-VID-001…006 | [OBSERVED] |
| A first-party JSON API exists under `/api/` | robots.txt `Disallow: /api/` | [INFERRED, high]; contents [UNKNOWN] |
| Registration entry points `/register?type=trial` and `/register?package=…` | homepage links | [OBSERVED links]; behaviour [UNKNOWN] (no signup, R1) |
