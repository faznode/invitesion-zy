<!-- SUMMARY (first 7 lines — greppable) -->
# niche-coverage.md — religious, regional and life-event niches: Invitesion vs Tier A
> WHAT: Brief 03 §15 "Niche coverage": which niches each vendor demonstrably serves, at what depth, with evidence; what that means for our catalog. No cultural or religious requirement is invented here.
> STATUS: DONE s08 (2026-11-03) · evidence cutoff `../_evidence-index.md` s08
> OWNER: Research agent
> DEPS: ../01-codebase-audit/niche-coverage.md (our 27 categories × renderer), ../03-teardowns/*/dossier.md, D-IDI, S-SMO-003, S-INV-002, S-KAT-004, S-WEV-001, S-ENV-001, S-IVT-004/005, S-BRN-001/005
> GREP: niche, islamic, christian, catholic, hindu, bali, chinese, javanese, sundanese, batak, minang, bugis, betawi, khitanan, aqiqah, tahlilan, memorial, corporate
> UPDATED: 2026-11-03

## Depth legend
- **T** dedicated themes or templates for the niche (vendor catalog or registry), **F** niche-specific *fields or sections* rendered to guests, **S** a style/tag filter only, **P** SEO or content page only (themes shared with other niches), **C** claimed in marketing without a catalog seen, **—** looked for on the read surfaces and not present, **?** not established.
- Our depth is capped at **2/5** for every niche today: one renderer for all 64 templates, profile fields captured but not rendered (`../01-codebase-audit/niche-coverage.md` §1, F-036, F-040).

## 1. Religious and cultural wedding traditions
| Niche | Ours | IDI | SMO | WEV | VID | ENV | IVT | INV | KAT | Evidence / note |
|---|---|---|---|---|---|---|---|---|---|---|
| Islamic wedding (akad + resepsi, verse block) | T (15 wedding templates; Qur'an translations of unknown provenance in presets, ADR-O04) | P (Islamic event pages) | F (Qur'an verse blocks on previews) + S "Syari" | ? | ? | F (QS citation marker, family A) | F (QS marker) | F (verse block 6/6) | F (verse 2/6) | S-SMO-003/004, C-ENV-111, C-IVT-101, C-INV-111, C-KAT-101; ours QA-015 |
| Akad-only / intimate | — (no akad-specific structure) | ? | ? | ? | ? (Intimate is a *package* name) | ? | ? | ? | ? | VID "Intimate" = tier, not niche (S-VID-002) |
| Christian / Catholic (pemberkatan, misa) | — | P (baptis, komuni suci, misa syukur, natal, peneguhan sidi, pentahbisan) | ? | ? | ? | — (weddings, no faith variants listed) | ? | ? | ? | D-IDI slugs |
| Hindu / Balinese | — | P (mepandes, melaspas, ngenteg linggih, pitra yadnya, menek kelih) | ? | ? | ? | — | ? | ? | ? | D-IDI slugs |
| Tamil Hindu | — | P (adhi thiruvila) | ? | ? | ? | — | ? | ? | ? | D-IDI |
| Chinese-Indonesian (sangjit, tea pai) | — | ? | ? | ? | ? | — | ? | ? | ? | No vendor evidence in the reads |
| Javanese adat | — | P (tedhak siten, 3 and 7 bulanan) | S "Adat" | T (Wayang, Gethuk Jawa themes) | ? | — | T (Javanese-palace design) | ? | S "Adat" | D-IDI, S-SMO-003, S-WEV-001, S-IVT-004, S-KAT-004 |
| Sundanese, Batak, Minang, Bugis, Betawi | — | ? | ? (an "Adat" filter does not name the culture) | ? | ? | — | ? | ? | ? | No culture-named catalog evidence in any read; brief 03 seeds only |

## 2. Wedding formats
| Niche | Ours | Competitors | Evidence |
|---|---|---|---|
| Destination wedding | — | VID English-first marketing + `/ms` locale [INFERRED]; IVT "10+ negara" claim | S-VID-001, S-IVT-002 |
| Engagement / lamaran | — | KAT "Lamar" tier name [INFERRED, medium] only | S-KAT-004 |
| Multi-event (akad + resepsi + ngunduh mantu) | F partial (F-010, times wrong on UTC servers, QA-002) | PLO, SMO, ENV, IVT, KAT Full (FM-017) | feature matrix FM-017 |

## 3. Life events beyond weddings
| Niche | Ours (categories → form) | IDI | SMO | INV | KAT | WEV | IVT | BRN (KR analogue) | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Khitanan | data yes, not reachable from the catalog (maps to aqiqah) | P | ? | T (11) | ? | ? | ? | — | S-INV-002, D-IDI |
| Aqiqah / tasmiyah | T (3, aqiqah form; only the name renders) | P | S "Syukuran & Islami" (3) | T (11) | ? | ? | ? | — | S-SMO-003 |
| Walimatussafar / umroh | — | P (umroh) | ? | T | ? | ? | ? | — | S-INV-002, D-IDI |
| Tasyakuran / syukuran | T (3) | P | T (Syukuran & Islami) | ? | ? | ? | ? | — | |
| Pregnancy (4 / 7 bulanan, mitoni) | — | P (3 and 7 bulanan) | ? | ? | ? | ? | ? | — | D-IDI |
| Baby shower / first birthday | T (3 baby-shower) | ? | T (Kids & Birthday 9) | ? | ? | ? | ? | F (돌잔치 baby-info areas) | S-BRN-005 |
| Birthday | T (6) | P | T | T (12) | ? | C (FAQ) | C (testimonials) | C | S-WEV-001, S-IVT-002 |
| Anniversary | T (4, wrong single-honouree form) | P | ? | ? | ? | ? | ? | ? | |
| Graduation / wisuda | T (2, no graduate fields) | P (wisuda, farewell, thesis exam) | T (School & Graduation 12) | ? | ? | ? | ? | ? | S-SMO-003 |

## 4. Community, religious gatherings and business
| Niche | Ours | IDI | SMO | Others | Evidence |
|---|---|---|---|---|---|
| Reunion | T (2, corporate form) | P | ? | WEV C (FAQ) | S-WEV-001 |
| Halal bihalal | indirect (holiday-gathering, 4) | P | ? | INV Lebaran video greetings | S-INV-002 |
| Pengajian / majelis taklim | — | P (pengajian, haul, bukber) | ? | — | D-IDI |
| Grand opening | indirect (product-launch) | P (grand / office / house opening) | ? | — | D-IDI |
| Seminar / webinar | T (conference) — registration and ticketing config-only (F-041) | ? | T (Umum & Seminar 37) | RSV Full (forms, ticketing, check-in) | S-SMO-003, S-RSV-001 |
| Company events | T (13 single-template business categories) | P (meetings, fashion show, dinner) | T (company-branded designs) | RSV, KAT `/events` | S-SMO-003, S-KAT-003 |
| Charity / donation | T (gala) — donation flow config-only | P (donation) | ? | RSV donations | S-RSV-001 |

## 5. Memorial and tahlilan (sensitivity)
- **Ours:** one tahlilan template mapped to a **thanksgiving** form (`../01-codebase-audit/niche-coverage.md` §3): wrong tone by construction (gift, music and celebratory defaults are available). Treat as a defect, not a niche win.
- **Competitors:** IDI publishes mourning pages (hari kematian, 40 and 100 hari, tahlilan, haul) as SEO articles over the shared catalog (D-IDI); whether its themes adapt tone is [UNKNOWN] (no guest page measurable, ADR-W1). No other vendor shows memorial themes on the read surfaces.
- **What we may decide without inventing requirements:** sober defaults are a product choice we can make (no music, no gift, no countdown, no RSVP pax by default; neutral palette; host-written text only). Specific religious wording, prayers or verses stay **out** until an owner-approved corpus exists (ADR-O04, brief 03 §21.6).

## 6. Readings for the catalog roadmap (→ `../06-gap-analysis/template-catalog-roadmap.md`)
1. **Breadth is not our gap; depth is.** Our 27 categories already exceed SMO's 5 groups and every measured vendor except IDI's 50 SEO pages, and IDI serves all of them from one shared catalog (P, not T). The gap is that every niche renders the same layout and drops captured fields (F-006, F-036, F-040).
2. **Islamic family events** (khitanan, aqiqah, walimatussafar) are where INVI.ID has real themes (T) and we have forms without a renderer: the cheapest credible niche win after weddings.
3. **Faith and regional weddings** are evidenced only as IDI SEO pages and a few "Adat"/Javanese themes (SMO, WEV, IVT, KAT). Nobody in the reads shows Sundanese, Batak, Minang, Bugis or Betawi themes by name, so their section structures must come from owner or community input, not from this research.
4. **Memorial** needs its own form and sober defaults before any new template (defect, P0 candidate in `../06-gap-analysis/must-have-p0.md`).
