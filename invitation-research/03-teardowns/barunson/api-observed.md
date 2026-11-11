# Barunson Mcard (BRN): public API surface observed through normal page use

> Session 08 (2026-11-03). Method: plain visitor fetches (S-BRN-001…005, one request at a time; robots has no rules because `/robots.txt` redirects to a soft-404 HTML page) and the three sample captures C-BRN-101…103. No endpoint was called directly; no form, guestbook or payment was used.

## Result
**No endpoints observed under this method.** The preview renders from JSON embedded in the HTML.

| Observation | Evidence | Level |
|---|---|---|
| Preview data embedded as JSON with an area model (`Template_ID`, `Area_ID`, `Area_Name`, `Edit_YN`) and fictional sample fields | S-BRN-003 | [OBSERVED] |
| Rendering script `preview.js` (cache-busting hash), plus `sns.js` and the Kakao JavaScript SDK for sharing | S-BRN-005 | [OBSERVED] |
| Asset and font hosts: `pstatic.net` (Naver), Google Fonts, jsDelivr, jQuery CDN, `kakaocdn.net` | C-BRN-101…103 Lighthouse third parties | [OBSERVED hosts only] |
| Server stack IIS 10 / ASP.NET; unknown paths redirect to `/CustomErrors/404` with HTTP 200 | S-BRN-001, S-BRN-005 | [OBSERVED] |
