# Indoinvite (IDI): public API surface observed through normal page use

> Session 08 (2026-11-03). Method: plain visitor fetches of public pages (S-IDI-001 robots, S-IDI-002 wedding catalog, S-IDI-004 video samples, S-IDI-005 design service, S-IDI-006 pricing; one request at a time, robots first) and the catalog-page captures C-IDI-101…107. S-IDI-003 (one catalog preview that rendered a real event) contributes only non-identifying facts. No endpoint was called directly, no form was submitted, and the robots-disallowed folders were never requested.

## Result
**No endpoints observed under this method.** The catalog captures keep request hosts and resource types, not request URLs or response bodies; the plain fetches read HTML only.

| Observation | Evidence | Level |
|---|---|---|
| robots.txt disallows `/cgi-bin/`, `/pernikahan-qr/`, `/admin/` for every agent (named AI agents included) | S-IDI-001 | [OBSERVED] |
| `/pernikahan-qr/` hosts the QR check-in flow sold from the Super tier | robots path + "QRCode Check-in Tamu" (S-IDI-006) | [INFERRED, medium]; contents [UNKNOWN] |
| Catalog "Preview" links follow `/s/<account>/undangan/<themeId>?kpd=<guest>&contoh=1`; account ids are never recorded (D-020) | S-IDI-002 | [OBSERVED URL shape] |
| Laravel session and CSRF cookies (`laravel_session`, `XSRF-TOKEN`) on a guest page | S-IDI-003 | [OBSERVED] |
| Theme thumbnails served from Contabo object storage | S-IDI-002 | [OBSERVED host] |
| Payment flow via Xendit (markers + QRIS on a guest page; aggregator-style method logos on the pricing page) | S-IDI-003, S-IDI-006 | presence [OBSERVED] / checkout gateway [INFERRED, medium] |
