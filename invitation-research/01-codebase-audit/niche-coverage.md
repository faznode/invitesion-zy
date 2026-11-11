<!-- SUMMARY (first 7 lines — greppable) -->
# niche-coverage.md — every niche in the repo × templates × features × quality
> WHAT: Catalog categories (27) → core event types (6) → which profile fields exist, what the guest page actually renders, and a quality rating; plus the niche taxonomy gaps vs the Indonesian market.
> STATUS: DONE (Phase 1)
> OWNER: Oracle (research)
> DEPS: template-system.md, data-model.md §3, lib/invitation/template-sync.ts (templateEventTypes)
> GREP: niche, category, event type, wedding, aqiqah, khitanan, tahlilan, corporate, coverage
> UPDATED: 2026-10-29

Rating (1–5) = what a guest receives today: 1 wrong/unfit, 2 generic shell, 3 adequate, 4 good, 5 market-leading. All niches share the same renderer, so no niche exceeds 2 until per-template layouts exist. Screenshot evidence: `raw/invitesion/C-INV-001/viewport-412.webp` (wedding, light) and `C-INV-002/viewport-412.webp` (wedding, dark); other niches render the same layout with different names/palettes.

## 1. Coverage table [OBSERVED registry + mapping, 2026-10-29]
| Catalog category | Templates | Core event type (profile form) | Profile data captured | Guest page renders | Rating | Fit notes |
|---|---|---|---|---|---|---|
| wedding | 15 | wedding (couple) | bride/groom full name, nickname, parents, child order, IG, photo; display order | nicknames on cover only; events, story, gallery, gift, RSVP, wishes | 2 | Parents/full names/photos captured but never shown — core of an Indonesian wedding invite |
| bridal-shower | 2 | wedding | as above | as above | 2 | OK mapping |
| anniversary | 4 | tasyakuran (ceremony) | honouree name… | one name on cover | 1 | A couple's anniversary uses a single-honouree form |
| birthday | 6 | birthday | name, age, birth date, parents, photo, IG, message | name on cover | 2 | Age/photo/message unused |
| aqiqah-khitanan | 3 | aqiqah | gender, birth weight/length, child order, name meaning, prayer, parents | name on cover | 2 | Khitanan event type unreachable from the catalog (maps to aqiqah only) |
| syukuran | 3 | tasyakuran | thanksgiving category/title, achievement | name/title on cover | 2 | — |
| baby-shower | 3 | tasyakuran | — | — | 2 | — |
| graduation | 2 | tasyakuran | (no campus/degree fields) | — | 1 | Wisuda needs graduate, campus, degree |
| holiday-gathering | 4 | tasyakuran | — | — | 2 | Halal bihalal fits here; copy is generic |
| gender-reveal | 1 | tasyakuran | — | — | 2 | — |
| tahlilan | 1 | tasyakuran (thanksgiving!) | thanksgiving fields | — | 1 | Memorial mapped to a celebration form; needs almarhum/ah, date of passing, sober defaults, no gift/music by default |
| community-event | 1 | tasyakuran | — | — | 2 | — |
| reunion | 2 | corporate | organisation, agenda, speakers… | event name on cover | 1 | Reunion with a corporate form |
| corporate, conference, tradeshow, sales-kickoff, workshop, networking, team-building, investor-meeting, gala, client-vip, employee-appreciation, shows, product-launch, retirement | 16 total | corporate | org, event, category, contact, logo, description, dress code, agenda, speakers | event/org name on cover; events | 2 | Agenda, speakers, dress code, logo not rendered; UI labels Indonesian even for `language: en` presets |

Totals: 64 templates; 15 wedding (23 %); 13 single-template business categories (breadth without depth).

## 2. Feature presence by niche preset (what the preset enables)
| Preset family | Sections enabled by default |
|---|---|
| Wedding (15) | greetings, quote (Qur'an translation), story, gallery, gift, RSVP, guestbook, music |
| Anniversary (4) | greetings, story, gallery (masonry), RSVP, guestbook, music |
| Aqiqah-khitanan (3) | greetings + Basmalah, quote (Qur'an translation), gallery, RSVP, guestbook |
| Tahlilan (1) | greetings + Basmalah, quote (Qur'an translation), RSVP, guestbook |
| Business (13) | gallery, RSVP |
`gallery.layout` (grid/masonry/carousel) is ignored by the renderer (always grid); `music` is ignored entirely.

## 3. Taxonomy gaps vs the Indonesian market (seed list in the mission brief)
| Niche | In repo? | Gap |
|---|---|---|
| Islamic wedding (walimatul 'ursy, akad-only, intimate) | Partly (generic wedding + Qur'an quote) | No akad-specific structure (wali, saksi, mahar optional), no hijab-friendly imagery guidance |
| Christian/Catholic wedding (pemberkatan + resepsi) | No | Church blessing structure, Bible verse corpus (verified), "Holy Matrimony" copy |
| Hindu/Bali (pawiwahan, mepandes) | No | Balinese calendar/upacara terms, ornaments |
| Chinese-Indonesian (sangjit, tea pai, double happiness) | No | Red/gold conventions, bilingual names (Hanzi) |
| Regional customs: Javanese (siraman, midodareni, panggih), Sundanese, Batak (adat, marga), Minang (baralek), Bugis (mappacci), Betawi | No | Event sequences + ornament systems + copy conventions per culture |
| Destination wedding | No | Travel/stay info, multiple time zones |
| Lamaran / tunangan | No | Separate small event type |
| Khitanan | Data yes, catalog no | Reachable only by direct type |
| Tingkeban / mitoni (7-month) / 4-month (ngapati) | No | — |
| Wisuda | Category yes, fields no | Graduate profile |
| Pengajian / majelis taklim | No | — |
| Halal bihalal | Indirect (holiday-gathering) | Dedicated copy + date (Syawal) |
| Grand opening / launching usaha | Indirect (product-launch) | — |
| Seminar / webinar | conference | Registration + ticketing UI (config-only today) |
| Charity / fundraising | gala | Donation flow (config-only) |
| Tahlilan / memorial | 1 template, wrong form | Extra-sensitive defaults |

## 4. What this means for the roadmap
1. Fix the form taxonomy before adding templates: memorial, graduation, reunion, anniversary need their own profiles (or a composable profile schema).
2. Render what is already captured (parents, photos, agenda, speakers, dress code) — cheapest parity gain.
3. Depth over breadth: 13 single-template business categories add SEO surface but no real choice; Indonesian wedding sub-niches (religious + regional) are where competitors win (verified in Phase 3).
