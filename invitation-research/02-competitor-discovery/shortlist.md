<!-- SUMMARY (first 7 lines — greppable) -->
# shortlist.md — discovery method, weighted rubric, scores, tiers
> WHAT: How the 52-candidate longlist was found, the scoring rubric, every score with its basis, and the Tier A (deep teardown) / Tier B (profile) split.
> STATUS: DONE (Phase 2) — 2026-10-29 06:20 WIB
> OWNER: Oracle (research)
> DEPS: competitor-longlist.csv, ../raw/_discovery/probe-2026-10-29.jsonl, ../_tools/discovery/probe-homepages.py
> GREP: discovery, longlist, rubric, score, shortlist, tier a, tier b
> UPDATED: 2026-10-29

## 1. Method (dated 2026-10-29 WIB)
1. **Keyword sweep (Indonesian):** "website undangan digital pernikahan terbaik 2026", "aplikasi undangan digital … RSVP QR check-in", "undangan digital premium animasi tema eksklusif harga paket", "undangan khitanan aqiqah ulang tahun digital online murah template" → 30+ brand names (WebSearch summaries; brand names verified below).
2. **Google Play:** four searches ("undangan digital", "undangan pernikahan digital", "undangan online rsvp", "buku tamu digital qr"), 29 unique packages, each listing read once for its public install bracket, rating and update date (≥ 1.1 s spacing).
3. **Homepage probe** (`../_tools/discovery/probe-homepages.py`): one GET per candidate with a browser UA, robots.txt honoured (fetched with the same UA, RFC 9309 semantics), ≥ 1.5 s per host; records title, stack hints, and on-page claims (customer counts, prices, template counts) — claims are [CLAIMED]. Raw output: `probe-2026-10-29.jsonl`.
4. **Neutral traffic signal:** Tranco top-1M research list (file dated 2026-10-27, downloaded 2026-10-29) [ESTIMATE; global rank; subdomains aggregate to the registrable domain].
5. **International + Asian archetypes:** WebSearch comparison queries + brief seeds; Korean, Chinese, Vietnamese, Malaysian, Indian, Japanese players verified by probe.
6. **Reseller ecosystem:** observed through reseller/partner pages (sangmempelai.id "Partner Undangan", Harikita business tiers up to Rp9.999M, INVI.ID packs). Instagram/WhatsApp reseller accounts were **not** scraped (no automated social access, R1/R8) → [UNKNOWN] beyond what partner pages state.
Skill used: `research` (source discipline, claim tagging).

## 2. Rubric (weights sum to 100 %)
| Criterion | Weight | 5 = | 1 = | Signals used |
|---|---|---|---|---|
| Audience size | 30 % | ≥ 500K installs or Tranco < 250K | no public signal | Play installs, Tranco rank, [CLAIMED] counts (claims alone cap at 3) |
| Catalog depth | 20 % | ≥ 300 themes, many niches | < 20 themes | homepage counts, catalog pages |
| Product depth | 20 % | full guest + host ops (RSVP, gift, QR check-in, guest mgmt, blast) | static page | homepage feature lists, seeds, store listings |
| Innovation | 15 % | category-defining motion/3D/flows | template clone | stack hints (GSAP/Lottie), positioning |
| Relevance to us | 15 % | same market, same buyer, same price band | different market | country, segment, price |
Score = Σ weight × criterion score (1–5). Ties broken by audience size.

## 3. Scores
| Code | Size | Catalog | Product | Innov. | Relev. | **Score** | Basis |
|---|---|---|---|---|---|---|---|
| IDI Indoinvite | 5 | 5 | 4 | 3 | 5 | **4.50** | 500K+ installs, Tranco 195K, 300–400 themes, all life events |
| PLO PALEO | 5 | 4 | 3 | 3 | 5 | **4.10** | 500K+ installs, 100 themes |
| SMO Satu Momen | 4 | 4 | 4 | 3 | 5 | **4.00** | Tranco 476K, DIY→custom ladder |
| WEV Wevitation | 4 | 4 | 4 | 3 | 5 | **4.00** | 50K+ installs, Tranco 845K, app + web |
| VID Viding | 4 | 3 | 4 | 3 | 5 | **3.80** | Tranco 306K, guest management |
| ENV Enviory | 3 | 3 | 4 | 5 | 5 | **3.80** | claims 8.8M users, motion-led premium, Midtrans |
| IVT Invitato | 3 | 3 | 4 | 4 | 5 | **3.65** | QR check-in pioneer positioning |
| INV INVI.ID | 3 | 3 | 4 | 3 | 4 | **3.35** | website-as-a-service + reseller packs |
| KAT Katsudoto | 3 | 3 | 3 | 4 | 4 | **3.30** | Tranco 798K, GSAP/AOS motion |
| BRS Bridestory | 5 | 2 | 3 | 2 | 3 | 3.25 | marketplace; invitations secondary → profile |
| STM Sitemu | 2 | 4 | 3 | 3 | 4 | **3.05** | 120 themes, "jadi 5 menit" onboarding claim |
| HRK Harikita | 2 | 3 | 4 | 3 | 4 | 3.05 | business tiers (tie → Sitemu wins on catalog) |
| UVR Undangan Virtual | 2 | 3 | 3 | 3 | 4 | 2.85 | syar'i positioning |
| JNV Janiva | 2 | 2 | 3 | 4 | 4 | 2.80 | cinematic openers |
| MMO MEMO Wedding | 4 | 2 | 2 | 2 | 3 | 2.75 | 100K+ installs, site not live |
| SAN Sannubari | 2 | 2 | 3 | 4 | 3 | 2.65 | done-for-you premium |
| SMP sangmempelai.id | 2 | 2 | 3 | 3 | 4 | 2.65 | reseller partner model |
| WNK WebNikah | 2 | 4 | 2 | 2 | 3 | 2.55 | free builder |
| PAC / JOU / WDW | 2 | 2 | 3 | 2–3 | 3–4 | 2.50 | niche/planner/QR |
| others (GOI, ULK, LVG, KPI, SBU, SPL, MNY, EVA, BKT, TMK, WKU) | 1–3 | 1–2 | 2–3 | 2–3 | 2–4 | 1.5–2.45 | thin public signals |
| **International** | | | | | | | |
| RSV RSVPify | 4 | 3 | 5 | 4 | 3 | **3.85** | event ops depth (brief benchmark; our marketing IA mirrors it) |
| PPO Paperless Post | 5 | 5 | 3 | 5 | 2 | **4.10** | design + motion craft benchmark, Tranco 24K |
| JOY Joy | 5 | 3 | 4 | 4 | 2 | **3.80** | free all-in-one guest experience, Tranco 29K |
| PTF Partiful | 5 | 2 | 3 | 5 | 2 | **3.50** | viral mobile-first sharing, Tranco 28K |
| BRN Barunson Mcard | 3 | 3 | 4 | 3 | 5 | **3.50** | Korean mobile scroll invitation ≈ Indonesian format (gift accounts, map, gallery) |
| ZOL Zola / TKN The Knot | 5 | 3 | 4 | 3 | 2 | 3.55 | registry suites (profile) |
| EVT Evite / PBW Punchbowl / GRV Greenvelope / MTD Minted | 4–5 | 3–5 | 3 | 3 | 2 | 3.2–3.6 | profile |
| INE Invitee (MY) | 2 | 5 | 4 | 3 | 5 | 3.55 | DuitNow-QR gifts, Akad Nikah — closest cultural twin (profile, flagged for depth) |
| SNT, EQX, MAK, BHP, WMG, PRY, ITD, CNV | — | — | — | — | — | 2.5–3.5 | Asian/global archetypes (profile) |

## 4. Tiers
**Tier A — Indonesia (10 deep teardowns):** Indoinvite, PALEO, Satu Momen, Wevitation, Viding, Enviory, Invitato, INVI.ID, Katsudoto, Sitemu.
**Tier A — International (5 deep teardowns):** Paperless Post, RSVPify, Joy, Partiful, Barunson Mcard (KR).
**Tier B — profiles (1 page each):** Harikita, Undangan Virtual, Janiva, Sannubari, sangmempelai.id, Bridestory, MEMO Wedding, WebNikah, PunyaAcara, Wedew (Indonesia); Zola, The Knot, Evite, Greenvelope, Minted, Canva, Invitee (MY), Sonett (KR), Eqxiu (CN), Biihappy (VN), WedMeGood (IN) (international/Asian).

## 5. Rationale for the cut
- Tier A covers every archetype we compete with: mass-market DIY + app (Indoinvite, PALEO, Wevitation), DIY→custom ladder (Satu Momen, Sitemu), platform + guest ops (Viding, Invitato), premium motion (Enviory, Katsudoto), website-as-a-service + resellers (INVI.ID).
- Bridestory scores high on audience but invitations are a side product of a vendor marketplace → profile, not teardown.
- International Tier A is chosen for **what we can learn**, not market overlap: craft (Paperless Post), operations (RSVPify), free all-in-one guest UX (Joy), viral growth loops (Partiful), and the closest foreign format to ours (Korean mobile invitations).
- Seeds not reachable or not verifiable today (Menica: DNS fails; Zehan: blank site; Minyma: blank title; VIP Invitation: blank page; BikinUndangan: TLS error; Uleman: origin error) are logged in the longlist with their failure and not ranked.
