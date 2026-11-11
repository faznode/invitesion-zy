# PALEO (PLO): public API surface observed through normal page use

> Session 08 (2026-11-03). Method: plain visitor fetches of the homepage (S-PLO-001, S-PLO-002) and of the public Google Play listing (S-PLO-003, after checking Play's robots.txt). The app was not installed, no endpoint was called, and no APK was downloaded (D-013).

## Result
**No endpoints observed under this method.**

| Observation | Evidence | Level |
|---|---|---|
| Marketing site is a Next.js page (`__NEXT_DATA__`, `/_next/static/`) whose only outbound links are the Play Store, Instagram and Facebook | S-PLO-002 | [OBSERVED] |
| `/robots.txt` returns the app's HTML instead of a rules file (treated as no rules) | S-PLO-002 | [OBSERVED] |
| The app produces web-hosted invitations ("undangan digital berbasis web"); host and URL shape of guest pages | S-PLO-003 description | existence [CLAIMED] / host [UNKNOWN] |
