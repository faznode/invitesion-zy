<!-- SUMMARY (7 baris; greppable) -->
# Knowledge Taxonomy & Classifier — Personal/Family Events
> WHAT: Taxonomy dan aturan klasifikasi bahasa bebas untuk seluruh destination PERSONAL/FAMILY Vienne.
> STATUS: RESEARCH COMPLETE — classifier policy, intake contract, redirect policy.
> OWNER: Architect / Design Research
> SOURCE OF TRUTH: app/marketing-header.tsx + app/marketing-registry.ts + docs/design-research/*.md
> COVERAGE: expected 14 destination; researched 14; gap 0.
> GUARDRAIL: agent tidak boleh memindahkan kategori diam-diam; wrong_category wajib menjelaskan alasan dan menawarkan redirect hidup.
> UPDATED: 2026-07-18

## 1. Scope, counts, dan source audit

Menu kanonik `Personal Events` pada `marketing-header.tsx` memiliki 14 item, dan `eventTypesTitles` pada `marketing-registry.ts` menghasilkan slug berikut. Parameter `_legacyHref` tidak mengubah destination; `marketingHref()` tetap menghasilkan `/event-types/{slug}`.

| Group | Expected | Researched | Gap |
|---|---:|---:|---:|
| Weddings | 3 | 3 | 0 |
| Milestones | 4 | 4 | 0 |
| Faith & Cultural | 4 | 4 | 0 |
| Celebrations | 3 | 3 | 0 |
| **Total** | **14** | **14** | **0** |

**Canonical destinations:**
1. `weddings` — `/event-types/weddings`
2. `wedding-anniversaries` — `/event-types/wedding-anniversaries`
3. `bridal-showers` — `/event-types/bridal-showers`
4. `birthdays` — `/event-types/birthdays`
5. `anniversary-parties` — `/event-types/anniversary-parties`
6. `reunions` — `/event-types/reunions`
7. `graduations` — `/event-types/graduations`
8. `aqiqah-and-khitanan` — `/event-types/aqiqah-and-khitanan`
9. `syukuran` — `/event-types/syukuran`
10. `baby-showers` — `/event-types/baby-showers`
11. `gender-reveals` — `/event-types/gender-reveals`
12. `holiday-gatherings` — `/event-types/holiday-gatherings`
13. `retirement-parties` — `/event-types/retirement-parties`
14. `celebrations-of-life` — `/event-types/celebrations-of-life`

Existing research audited: `all-event-menu-page-formats.md`, `invitation-directions-wedding-birthday.md`, `invitation-directions-islamic-family-events.md`, `invitation-directions-corporate-and-template-taxonomy.md`, and `marketing-menu-ip-and-competitor-similarity-audit.md`. Existing research validates all 14 menu items and provides event-specific section orders, modules, child-safety, cultural, accessibility, and privacy constraints. This document turns those findings into classifier knowledge; it does not copy competitor design or copy.

## 2. Ontology: event utama, cultural context, modules

### 2.1 Event utama
An **event utama** is the social purpose that determines the invitation journey and primary CTA. Exactly one primary event destination must be selected for a single-intent wizard. Dates, venue, hosts, and RSVP are attributes/modules, not event categories.

### 2.2 Cultural context
Cultural context may qualify an event but must not silently replace it:
- `faith_islamic`: aqiqah, khitanan, syukuran; requires family-approved wording and optional verified prayer/Arabic.
- `family_milestone`: wedding anniversary, birthday milestone, graduation, retirement.
- `seasonal_or_tradition`: holiday gathering; exact tradition/holiday is an intake field.
- `memorial_context`: celebration of life; tone, privacy, and consent are safety-critical.
- `life_stage_context`: baby shower/gender reveal; pregnancy/child data must remain private and optional.

`aqiqah`, `khitanan`, and `syukuran` are distinct cultural contexts. Because the canonical menu combines aqiqah and khitanan, their sub-intent must be captured internally and must drive copy/module restrictions; do not claim they are the same rite.

### 2.3 Canonical modules (not event categories)
`identity_profile`, `host_note`, `story_timeline`, `event_facts`, `schedule_multi_event`, `venue_map`, `travel_access`, `rsvp`, `household_plus_one`, `dietary_menu`, `gallery`, `music`, `streaming`, `guestbook_wishes`, `gift_registry`, `activity_poll`, `prediction_poll`, `tribute_memory`, `reminders_whatsapp`, `privacy_consent`, `moderation`, `faq`, `calendar_link`.

Module policy: `required` means needed to produce a valid invitation; `allowed` means may be enabled; `forbidden` means the classifier/design agent must not propose it by default for that destination. Missing optional data is not a reason to reclassify.

## 3. Global classifier contract

### 3.1 Output states
- `valid`: one destination has clear dominant intent and no contradiction.
- `ambiguous`: two or more neighboring destinations remain plausible; ask only the minimal boundary question.
- `wrong_category`: user selected/was routed to a destination contradicted by explicit intent. Explain the mismatch; show live redirect link; carry transferable fields.
- `unsupported`: intent is not in the 14 destinations or requires unsupported product capability. Do not force-fit; offer nearest live destination only if useful.
- `mixed_intent`: multiple primary events are requested. Ask which event should be primary, or create separate invitations; never silently merge.

### 3.2 Scoring and precedence (language independent)
1. Extract explicit event nouns and purpose (`married`, `turning`, `graduating`, `remembering`, etc.). Explicit purpose beats theme, color, venue, date, and module words.
2. Extract participants/relationship, life stage, ritual context, and whether the event is for one honouree, couple, household, cohort, or community.
3. Positive signal must be supported by at least one purpose signal plus one context/participant signal, unless the canonical noun is unambiguous.
4. Contradiction signals subtract confidence; explicit contradiction wins over weak positive keywords.
5. If top two scores are within the configured confidence margin, return `ambiguous`; do not guess.
6. If two explicit event purposes occur, return `mixed_intent`, except when one is clearly a sub-event (e.g. “graduation ceremony and dinner” remains `graduations`).
7. A module word alone never classifies: “butuh RSVP”, “pakai foto”, “ada map”, or “kirim WhatsApp” is insufficient.
8. Do not infer religion, gender, pregnancy, age, marital status, or bereavement from names, colors, photos, pronouns, or venue.
9. “Syukuran” is a valid umbrella only when no more specific event purpose is explicit. If the user says “syukuran ulang tahun”, classify `birthdays` and retain `syukuran` as context.
10. Canonical URL in redirects must be one of the live paths listed in section 2; no fabricated route.

### 3.3 Minimal universal clarifiers
Ask at most one question per turn, in Indonesian by default, with English labels available:
- “Acara utamanya untuk apa: pernikahan, ulang tahun, kelulusan, atau perayaan lain?”
- “Siapa yang menjadi pusat acara: pasangan, satu orang, bayi, anak, lulusan, kelompok, atau orang yang dikenang?”
- “Apakah ini acara inti atau acara pendamping, misalnya shower sebelum pernikahan atau pesta setelah wisuda?”
- “Apakah konteksnya aqiqah, khitanan, atau syukuran umum?”

## 4. Destination rules

The following compact records are normative. `ID` and `EN` signals are intentionally short, literal, and machine-translatable.

### P01 — `weddings`
- **Definition/purpose:** perayaan dan undangan resmi pernikahan pasangan; primary CTA RSVP/lihat rangkaian acara.
- **Audience:** pasangan, keluarga, tamu undangan, household/plus-one.
- **Positive ID:** “menikah”, “akad”, “resepsi”, “ijab kabul”, “undangan pernikahan”, “calon pengantin”, “dua keluarga”. **Positive EN:** “getting married”, “wedding”, “ceremony and reception”, “bride and groom”, “wedding invitation”.
- **Contradiction:** “sudah menikah bertahun-tahun/ulang tahun pernikahan” → anniversary; “sebelum menikah, acara untuk calon pengantin” → bridal shower; “wisuda/ulang tahun/aqiqah” → respective destination.
- **Neighbors/boundary:** `wedding-anniversaries` requires existing marriage milestone; `bridal-showers` is pre-wedding honouree gathering; `anniversary-parties` is non-specific relationship/organization milestone.
- **Minimum questions:** “Apakah ini acara pernikahan sekarang, bukan perayaan ulang tahun pernikahan?”
- **Intake required:** couple names, wedding date/event date, at least one event fact, venue/location, host/contact, RSVP mode. **Optional:** parents, story, quote/prayer, gallery, gift, music, streaming, guestbook, dress code copy.
- **Modules:** required `identity_profile,event_facts,venue_map,rsvp`; allowed `schedule_multi_event,household_plus_one,dietary_menu,story_timeline,gallery,gift_registry,music,streaming,guestbook_wishes,reminders_whatsapp,calendar_link,privacy_consent`; forbidden: child/baby modules, prediction poll, medical details.
- **Section order:** cover/hero → couple/family → quote or welcome → ceremony/event cards → venue/map/travel → story (optional) → gallery (optional) → RSVP → gift/stream (optional) → wishes → closing.
- **Design directions:** `ceremonial`, `intimate`, `editorial`, `spiritual`; NF/PF/CI allowed; never make photo mandatory.
- **Examples:** valid ID “Kami mau undangan akad dan resepsi Rani–Dimas.” EN “We are inviting guests to our wedding ceremony and reception.” Ambiguous ID “mau acara setelah menikah” / EN “a marriage celebration.” Wrong-category “Saya pilih birthday, padahal ini akad.” Unsupported “buat legal marriage certificate.” Mixed “wedding dan ulang tahun anak dalam satu link” — ask primary.
- **Redirect:** `/event-types/weddings`. **Transfer:** names, date, events, venue/map, hosts, RSVP, guest list, gallery, quote.
- **Next:** confirm couple names → event sequence → guest/RSVP rules.

### P02 — `wedding-anniversaries`
- **Definition/purpose:** merayakan lamanya pernikahan pasangan yang sudah menikah.
- **Audience:** pasangan, keluarga lintas generasi, teman dekat.
- **Positive ID:** “ulang tahun pernikahan”, “anniversary pernikahan ke-25”, “silver/golden anniversary”. **EN:** “wedding anniversary”, “25th anniversary”, “years married”.
- **Contradiction:** “akan menikah/akad” → weddings; “shower untuk bride” → bridal showers; “anniversary kantor/brand” → anniversary-parties.
- **Neighbors:** `anniversary-parties` when relationship/type is unspecified; boundary is explicit marriage history.
- **Minimum question:** “Apakah pasangan sudah menikah dan ini merayakan tahun pernikahan tertentu?”
- **Required:** couple/honouree names, anniversary milestone/date, event facts, venue/host. **Optional:** then-now story, archival gallery, tributes, RSVP, map, stream, music, gift.
- **Modules:** required `identity_profile,event_facts`; allowed `story_timeline,gallery,tribute_memory,rsvp,household_plus_one,venue_map,travel_access,guestbook_wishes,streaming,music,reminders_whatsapp,privacy_consent,moderation`; forbidden wedding-planning-only fields (vendor selection, bridal party), baby/pregnancy modules.
- **Order:** milestone hero → then/now story → photo timeline → celebration details → RSVP → tribute/messages → access/map → closing.
- **Directions:** `commemorative`, `editorial`, `intimate`, `documentary`; photo optional.
- **Examples:** valid “Perayaan 25 tahun pernikahan orang tua.” / “A party for our 50th wedding anniversary.” Ambiguous “anniversary keluarga.” Wrong “anniversary kantor, bukan pernikahan.” Unsupported “renewal legal registration.” Mixed “anniversary dan wedding baru.”
- **Redirect:** `/event-types/wedding-anniversaries`. **Transfer:** couple, milestone, dates, venue, story/photos, RSVP, messages.
- **Next:** milestone + preferred memory/story collection.

### P03 — `bridal-showers`
- **Definition/purpose:** acara sebelum pernikahan untuk merayakan/mendukung calon pengantin, biasanya hosted gathering.
- **Audience:** bride/groom honouree, friends, family, hosts.
- **Positive ID:** “bridal shower”, “siraman calon pengantin” only if purpose is pre-wedding shower, “acara sebelum wedding untuk calon pengantin”, “host shower”. **EN:** “bridal shower”, “pre-wedding shower”, “shower for the bride”.
- **Contradiction:** actual akad/reception → weddings; baby honouree → baby-showers; generic birthday → birthdays.
- **Neighbors:** `weddings` boundary is ceremony of marriage vs pre-wedding party; `baby-showers` boundary is baby/pregnancy.
- **Minimum question:** “Apakah tamu berkumpul sebelum pernikahan untuk merayakan calon pengantin?”
- **Required:** honouree, host, date, venue, RSVP/contact. **Optional:** activities, dietary, registry, gallery, map, reminders.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `host_note,activity_poll,dietary_menu,venue_map,gallery,gift_registry,guestbook_wishes,reminders_whatsapp,privacy_consent`; forbidden ceremony schedule/akad, baby prediction, medical/pregnancy details.
- **Order:** honouree hero → host note → activities/theme → details → RSVP → menu/diet → optional registry → map/FAQ → closing.
- **Directions:** `joyful`, `playful`, `intimate`, `editorial`; no gender stereotype required.
- **Examples:** valid “Bridal shower untuk Nisa sebelum akad.” / “A shower celebrating the bride-to-be.” Ambiguous “shower keluarga.” Wrong “baby shower, bukan bridal.” Unsupported “jual paket bridal shower.” Mixed “bridal shower sekaligus resepsi.”
- **Redirect:** `/event-types/bridal-showers`. **Transfer:** honouree, host, date, venue, activities, RSVP, dietary, registry.
- **Next:** honouree/host → activity → guest response.

### P04 — `birthdays`
- **Definition/purpose:** perayaan ulang tahun satu orang, anak atau dewasa.
- **Audience:** celebrant, parents/guardian if minor, friends/family.
- **Positive ID:** “ulang tahun”, “ultah”, “anniversary usia”, “turning 7/30”. **EN:** “birthday”, “turning 7”, “40th birthday”.
- **Contradiction:** “baby shower sebelum lahir” → baby-showers; “aqiqah” → aqiqah-and-khitanan; “wedding anniversary” → wedding-anniversaries.
- **Neighbors:** `baby-showers` is pre-birth parent event; `holiday-gatherings` centers tradition/season; `anniversary-parties` centers relationship milestone.
- **Minimum question:** “Apakah acara utamanya ulang tahun seseorang, bukan baby shower atau anniversary?”
- **Required:** celebrant name, date, event facts/venue, host, RSVP choice. **Optional:** age, parents/guardian, theme, photo/gallery, music, stream, guestbook, map, plus-one.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `venue_map,household_plus_one,gallery,music,streaming,guestbook_wishes,reminders_whatsapp,calendar_link,privacy_consent,activity_poll`; forbidden wedding story/gift assumption, public minor location/age, pregnancy data.
- **Order:** celebrant/age hero → message → when/where → activities/theme → RSVP → map/access → gallery/music/stream → wishes → closing.
- **Directions:** `joyful`, `playful`, `editorial`, `photo-forward`; age/photo optional.
- **Examples:** valid “Ulang tahun ke-10 Dafa.” / “An invitation for Maya’s 30th birthday.” Ambiguous “perayaan anak.” Wrong “ini aqiqah, bukan ultah.” Unsupported “buatkan animasi game berlisensi.” Mixed “ulang tahun dan graduation party.”
- **Redirect:** `/event-types/birthdays`. **Transfer:** celebrant, age/birth date if chosen, parents, date, venue, activity, RSVP, gallery.
- **Next:** age/privacy → date/location → RSVP.

### P05 — `anniversary-parties`
- **Definition/purpose:** perayaan milestone hubungan, organisasi, usaha, atau pencapaian yang disebut anniversary tetapi bukan khusus pernikahan.
- **Audience:** honouree/organization, members, family/friends, customers.
- **Positive ID:** “anniversary perusahaan”, “ulang tahun komunitas/usaha”, “anniversary hubungan” tanpa wedding. **EN:** “company anniversary”, “brand anniversary”, “relationship anniversary” (non-wedding).
- **Contradiction:** explicit wedding anniversary → wedding-anniversaries; birthday of person → birthdays; retirement → retirement-parties.
- **Neighbors:** boundary is what is being commemorated; ask whether marriage, person’s birth, or organization/relationship.
- **Minimum question:** “Yang dirayakan ulang tahun pernikahan, ulang tahun seseorang, atau anniversary organisasi/hubungan lain?”
- **Required:** honouree/organization, milestone label, date, host, venue/event facts. **Optional:** story, gallery, program, RSVP, tributes, map, food.
- **Modules:** required `identity_profile,event_facts`; allowed `story_timeline,gallery,tribute_memory,rsvp,household_plus_one,venue_map,dietary_menu,guestbook_wishes,reminders_whatsapp,privacy_consent`; forbidden automatic wedding/baby ritual modules.
- **Order:** milestone hero → story → program/details → RSVP → tribute/gallery → food/access → FAQ.
- **Directions:** `editorial`, `celebratory`, `commemorative`, `professional` where organization-led.
- **Examples:** valid “Anniversary komunitas lari ke-5.” / “Our studio’s tenth anniversary party.” Ambiguous “anniversary party.” Wrong “ulang tahun anak.” Unsupported “annual subscription renewal.” Mixed “company anniversary + wedding reception.”
- **Redirect:** `/event-types/anniversary-parties`. **Transfer:** honouree/org, milestone, story, date, venue, program, RSVP.
- **Next:** identify commemorated entity and milestone.

### P06 — `reunions`
- **Definition/purpose:** mempertemukan kembali cohort/keluarga/teman yang pernah memiliki hubungan atau periode bersama.
- **Audience:** alumni, extended family, former classmates/coworkers, friends.
- **Positive ID:** “reuni sekolah”, “reuni keluarga”, “angkatan”, “ketemu lagi teman lama”. **EN:** “class reunion”, “family reunion”, “reconnect with our cohort”.
- **Contradiction:** graduation ceremony now → graduations; generic community festival → holiday-gatherings/community unsupported; memorial → celebrations-of-life.
- **Neighbors:** `graduations` is achievement ceremony; reunion is return gathering after separation/time.
- **Minimum question:** “Apakah fokusnya berkumpul kembali dengan kelompok lama, bukan upacara kelulusan?”
- **Required:** group/cohort identity, host, date, venue/itinerary, RSVP. **Optional:** household/travel, attendee opt-in, archive gallery, updates, map, dietary.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `household_plus_one,schedule_multi_event,travel_access,venue_map,gallery,guestbook_wishes,reminders_whatsapp,dietary_menu,privacy_consent,moderation`; forbidden public attendee directory/facial tagging without consent.
- **Order:** group/year hero → reason to gather → itinerary → attendance opt-in → RSVP → travel/stay → memory archive → updates/contact.
- **Directions:** `community`, `nostalgic`, `documentary`, `warm editorial`.
- **Examples:** valid “Reuni alumni SMA 2006.” / “A family reunion after ten years apart.” Ambiguous “gathering teman.” Wrong “acara wisuda angkatan.” Unsupported “find every classmate’s phone number.” Mixed “reuni sekaligus wedding.”
- **Redirect:** `/event-types/reunions`. **Transfer:** cohort, date, itinerary, venue, travel, RSVP, photos, privacy choices.
- **Next:** define group/cohort → itinerary → attendance visibility.

### P07 — `graduations`
- **Definition/purpose:** merayakan kelulusan atau pencapaian pendidikan, dengan ceremony, party, atau keduanya.
- **Audience:** graduate, family, school/community, invited guests.
- **Positive ID:** “wisuda”, “kelulusan”, “lulus sekolah/kuliah”, “graduation ceremony”. **EN:** “graduation”, “commencement”, “graduation party”, “graduate”.
- **Contradiction:** “reuni alumni setelah lulus” → reunions; promotion/new business thanksgiving → syukuran; retirement → retirement.
- **Neighbors:** `reunions` boundary is time-of-achievement ceremony vs later reconnection; `syukuran` if event is explicitly thanksgiving and education is context.
- **Minimum question:** “Apakah undangan untuk acara kelulusan/wisuda atau pesta syukuran setelahnya?” If latter, keep `graduations` when graduate remains center; use `syukuran` only when thanksgiving is dominant.
- **Required:** graduate, achievement, date, event facts, venue/access, RSVP or ticket allocation. **Optional:** separate ceremony/party events, gallery, messages, gift, map, parking.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `schedule_multi_event,venue_map,travel_access,gallery,guestbook_wishes,gift_registry,reminders_whatsapp,calendar_link,privacy_consent`; forbidden school claims/trademarks without approval, public student data.
- **Order:** graduate hero → achievement story → ceremony vs party → schedule/access/tickets → RSVP → venue/parking → gallery/messages → optional gift → FAQ.
- **Directions:** `ceremonial`, `editorial`, `joyful`, `family milestone`.
- **Examples:** valid “Undangan wisuda S1 dan makan bersama.” / “Invitation to our daughter’s graduation ceremony.” Ambiguous “syukuran lulus.” Wrong “reuni alumni, bukan wisuda.” Unsupported “issue accredited diploma.” Mixed “graduation and birthday” — ask primary.
- **Redirect:** `/event-types/graduations`. **Transfer:** graduate, degree/achievement, ceremony/party dates, venue, ticket/RSVP, gallery.
- **Next:** distinguish ceremony vs post-graduation gathering, then configure attendance.

### P08 — `aqiqah-and-khitanan`
- **Definition/purpose:** canonical destination for family Islamic celebration whose specific subcontext is aqiqah or khitanan; internal subtype is mandatory.
- **Audience:** baby/child and parents/family, invited household.
- **Positive ID aqiqah:** “aqiqah”, “syukuran kelahiran”, “potong kambing untuk bayi”, “arti nama bayi”. **EN:** “aqiqah”, “Islamic birth celebration”, “celebration for our newborn”. Positive ID khitanan: “khitan”, “sunatan”, “tasyakuran khitan”, “anak selesai disunat”. **EN:** “khitanan”, “circumcision celebration”, “sunat celebration”.
- **Contradiction:** generic birthday/baby shower without aqiqah/khitan → respective destination; syukuran rumah/usaha → syukuran; medical appointment → unsupported.
- **Neighbors/boundary:** aqiqah = birth/child naming context; khitanan = circumcision celebration; `baby-showers` occurs before birth; `birthdays` centers birth date/age. Do not classify by “anak” alone.
- **Minimum questions:** “Apakah ini aqiqah atau khitanan?” and “Apakah acara syukuran keluarga, bukan layanan medis?”
- **Required:** subtype, child name/call name, parent/host, event date, venue/location, RSVP. **Optional:** birth details/name meaning/prayer for aqiqah; age/school/date of procedure/doa for khitanan; photo, gallery, map, guestbook, music, gift, streaming.
- **Modules:** required `identity_profile,event_facts,venue_map,rsvp`; allowed `host_note,privacy_consent,gallery,guestbook_wishes,music,streaming,reminders_whatsapp,calendar_link`; `gift_registry` optional only if family requests; forbidden medical/anatomy/procedure imagery, story/Instagram Story default, public child data without consent.
- **Order:** salam/opening → child/profile → meaning/birth or supportive recovery note → parent prayer → event/date → map → RSVP/ucapan → gallery optional → closing.
- **Directions:** `spiritual`, `gentle`, `family`, `editorial`, `illustrated`; verified Arabic only, no generic mosque/green-gold assumption.
- **Examples:** valid “Aqiqah putra kami, Faris.” / “A khitanan thanksgiving for our son.” Ambiguous “syukuran anak.” Wrong “baby shower, belum lahir.” Unsupported “book a circumcision procedure.” Mixed “aqiqah dan ulang tahun pertama” — ask primary; if aqiqah primary retain birthday context.
- **Redirect:** same live canonical `/event-types/aqiqah-and-khitanan`; explain subtype choice, not a silent move. **Transfer:** subtype, child, parents, date, venue, prayer, gallery, RSVP, privacy.
- **Next:** choose aqiqah/khitanan → confirm wording/privacy → schedule RSVP.

### P09 — `syukuran`
- **Definition/purpose:** flexible gathering to express gratitude for a stated achievement, transition, or blessing when no more specific destination dominates.
- **Audience:** host/family/community and invited guests.
- **Positive ID:** “syukuran rumah baru”, “syukuran naik jabatan”, “syukuran usaha baru”, “syukuran haji/umrah”, “tasyakuran”. **EN:** “thanksgiving gathering”, “housewarming thanksgiving”, “celebration of a new business/promotion/return from pilgrimage”.
- **Contradiction:** explicit birthday/wedding/baby shower/aqiqah/khitanan/graduation primary → those destinations; generic religious service may be unsupported/religious organization.
- **Neighbors/boundary:** use the most specific event when explicit; use `syukuran` for reason-of-gratitude as dominant umbrella. Subcontexts: `new_home`, `promotion_or_graduation`, `new_business`, `hajj_umrah_return`, `general_other`.
- **Minimum question:** “Syukuran untuk apa?”
- **Required:** thanksgiving reason/category, host, title, date, event facts, venue, RSVP. **Optional:** achievement, photo, gallery, prayer, map, wishes, music, streaming.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `host_note,venue_map,gallery,guestbook_wishes,music,streaming,reminders_whatsapp,privacy_consent,calendar_link`; forbidden automatic baby profile, gift promotion, medical content, assumptions about ritual/faith.
- **Order:** opening → reason/context → host/achievement → message/prayer → schedule → venue/map → RSVP/ucapan → gallery optional → closing.
- **Directions:** `spiritual`, `intimate`, `minimal`, `cultural`, `editorial`; context-specific motifs only.
- **Examples:** valid “Syukuran rumah baru keluarga kami.” / “A thanksgiving gathering for returning from Umrah.” Ambiguous “acara syukuran.” Wrong “syukuran ulang tahun” if user clearly wants birthday → birthdays. Unsupported “legal proof of achievement.” Mixed “syukuran kelulusan” ask whether graduation remains primary.
- **Redirect:** `/event-types/syukuran`. **Transfer:** reason/category, host, achievement, date, venue, message, RSVP, modules.
- **Next:** select reason → validate wording/cultural context → details.

### P10 — `baby-showers`
- **Definition/purpose:** pre-birth gathering celebrating expecting parent(s) and welcoming a baby; not a birth rite.
- **Audience:** expecting parent(s), host, family/friends.
- **Positive ID:** “baby shower”, “acara sebelum bayi lahir”, “merayakan calon ibu/orang tua”, “hadiah untuk bayi”. **EN:** “baby shower”, “celebrating the parents-to-be”, “before the baby arrives”.
- **Contradiction:** baby already born + aqiqah → aqiqah; birthday → birthdays; reveal-only event → gender-reveals.
- **Neighbors/boundary:** `gender-reveals` primary purpose is reveal/prediction; baby shower is support/celebration for parents before birth.
- **Minimum question:** “Fokusnya baby shower untuk orang tua atau reveal jenis kelamin?”
- **Required:** parent(s)/honouree or host, date, venue, RSVP. **Optional:** activities, dietary, registry, map, privacy/photo rules, reminders.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `host_note,activity_poll,dietary_menu,gift_registry,venue_map,gallery,guestbook_wishes,reminders_whatsapp,privacy_consent`; forbidden medical/pregnancy details, gender assumptions, child public identity.
- **Order:** parent(s) hero → host note → theme/activities → details → RSVP → dietary/access → optional registry → privacy/map → closing.
- **Directions:** `intimate`, `joyful`, `gentle`, `gender-neutral`; no pink/blue requirement.
- **Examples:** valid “Baby shower untuk calon bayi dan orang tuanya.” / “A gathering for the parents-to-be.” Ambiguous “acara calon bayi.” Wrong “gender reveal, bukan shower.” Unsupported “predict medical sex.” Mixed “baby shower dan gender reveal” ask primary; one may be activity.
- **Redirect:** `/event-types/baby-showers`. **Transfer:** parent/host, date, venue, activities, RSVP, dietary, registry, privacy.
- **Next:** choose shower vs reveal → host/guest rules.

### P11 — `gender-reveals`
- **Definition/purpose:** gathering whose central activity is revealing or predicting a pregnancy-related sex/gender label chosen by family.
- **Audience:** expecting parent(s), invited family/friends.
- **Positive ID:** “gender reveal”, “tebak warna”, “reveal bayi”, “pengumuman jenis kelamin bayi”. **EN:** “gender reveal”, “sex reveal”, “prediction reveal”.
- **Contradiction:** no reveal, only parent support/registry → baby-showers; after birth naming/aqiqah → aqiqah; medical diagnosis → unsupported.
- **Neighbors/boundary:** reveal activity is primary; baby shower support is primary. Use family’s preferred terminology; do not correct or infer identity.
- **Minimum question:** “Apakah reveal/prediksi adalah tujuan utama acara?”
- **Required:** host/parent(s), reveal format or safe activity, date, venue, RSVP, privacy/safety note. **Optional:** prediction poll, countdown, dietary, map, gallery, reminders.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `prediction_poll,activity_poll,venue_map,dietary_menu,gallery,guestbook_wishes,reminders_whatsapp,privacy_consent,moderation`; forbidden pyrotechnic/unsafe activity encouragement, medical data, forced binary wording.
- **Order:** teaser hero → host note → safe activity plan → schedule → RSVP → location → food/access → privacy/photo rules → closing.
- **Directions:** `playful`, `suspenseful`, `gentle`, `minimal`; motion must be optional/reduced.
- **Examples:** valid “Acara reveal bayi dengan voting warna.” / “A safe gender reveal with a prediction poll.” Ambiguous “baby celebration before birth.” Wrong “baby shower only.” Unsupported “determine sex medically.” Mixed “reveal dan baby shower” ask dominant or treat shower as secondary activity.
- **Redirect:** `/event-types/gender-reveals`. **Transfer:** parent/host, date, venue, reveal format, prediction choices, RSVP, safety/privacy.
- **Next:** confirm safe reveal plan and family-approved terms.

### P12 — `holiday-gatherings`
- **Definition/purpose:** seasonal or traditional gathering centered on a holiday/custom, not a single honouree milestone.
- **Audience:** family, friends, community, households.
- **Positive ID:** “kumpul Lebaran/Natal/Tahun Baru/Imlek”, “holiday gathering”, “open house hari raya”, “potluck liburan”. **EN:** “holiday gathering”, “Christmas/New Year/Lunar New Year gathering”, “holiday potluck”.
- **Contradiction:** birthday/wedding/retirement/memorial is central → specific destination; religious worship/service may be unsupported or organization event.
- **Neighbors/boundary:** seasonal tradition is the anchor; ask exact holiday and whether it is private family gathering vs public community event.
- **Minimum question:** “Tradisi/liburan apa yang menjadi pusat acara, dan ini gathering privat atau acara komunitas terbuka?”
- **Required:** holiday/tradition, host, date, venue, RSVP/household rules. **Optional:** potluck, travel/stay, dietary, accessibility, activities, map, gallery.
- **Modules:** required `event_facts,rsvp`; allowed `identity_profile,household_plus_one,dietary_menu,activity_poll,venue_map,travel_access,gallery,guestbook_wishes,reminders_whatsapp,privacy_consent`; forbidden default religious symbolism, public access assumptions.
- **Order:** holiday-neutral hero → host note → details → activities/traditions → household RSVP → potluck/menu → travel/access → FAQ.
- **Directions:** `warm`, `seasonal`, `inclusive`, `minimal`; use host-selected cultural context only.
- **Examples:** valid “Kumpul keluarga Idul Fitri di rumah nenek.” / “A private New Year family gathering.” Ambiguous “acara akhir tahun.” Wrong “holiday party kantor” (corporate; out of personal destination). Unsupported public city festival → community event.
- **Redirect:** `/event-types/holiday-gatherings`. **Transfer:** holiday, tradition, host, date, venue, household, menu, access.
- **Next:** exact tradition → private/public boundary → RSVP.

### P13 — `retirement-parties`
- **Definition/purpose:** tribute and farewell gathering honoring someone leaving work after retirement.
- **Audience:** honouree, colleagues, family, friends, host/organization.
- **Positive ID:** “pensiun”, “purnabakti”, “farewell retirement”, “melepas rekan yang pensiun”. **EN:** “retirement party”, “retirement farewell”, “honoring a retiree”.
- **Contradiction:** resignation/job farewell without retirement → unsupported or community/private celebration; work anniversary → anniversary-parties; memorial → celebrations-of-life.
- **Neighbors/boundary:** retirement transition is explicit; ask if person is retiring, not merely changing jobs.
- **Minimum question:** “Apakah orang yang dirayakan resmi memasuki masa pensiun?”
- **Required:** honouree, host, date, venue, program, RSVP. **Optional:** career timeline, tribute submissions, gallery/video, food, map, gift guidance, moderation.
- **Modules:** required `identity_profile,event_facts,rsvp`; allowed `story_timeline,tribute_memory,gallery,dietary_menu,venue_map,guestbook_wishes,reminders_whatsapp,privacy_consent,moderation`; forbidden age jokes, confidential work history, public uploads without moderation.
- **Order:** honouree hero → career story → host/program → details → RSVP → tribute submissions → venue/access → optional gift guidance.
- **Directions:** `warm`, `commemorative`, `editorial`, `professional`.
- **Examples:** valid “Pesta purnabakti Bu Sari.” / “A retirement farewell for our colleague.” Ambiguous “farewell party.” Wrong “perpisahan pindah kerja, bukan pensiun.” Unsupported “HR termination notice.” Mixed “retirement and birthday” ask primary.
- **Redirect:** `/event-types/retirement-parties`. **Transfer:** honouree, career facts, host, program, date, venue, RSVP, tributes.
- **Next:** verify retirement context → collect honouree consent and tribute rules.

### P14 — `celebrations-of-life`
- **Definition/purpose:** memorial/celebration of life honoring a deceased person, communicating service logistics and collecting memories sensitively.
- **Audience:** bereaved family, invited mourners, friends/community.
- **Positive ID:** “mengenang almarhum/almarhumah”, “memorial”, “celebration of life”, “acara mengenang”, “takziah” when invitation logistics are central. **EN:** “celebration of life”, “memorial service”, “remembering [name]”.
- **Contradiction:** retirement/farewell for living honouree → retirement; wedding/birthday → respective; religious organization service without deceased honouree → unsupported/organization.
- **Neighbors/boundary:** deceased person and remembrance purpose are required. If explicit funeral service rather than celebration/invitation capability, explain supported memorial scope and ask if this destination fits.
- **Minimum question:** “Apakah acara ini mengenang orang yang telah wafat, dan apakah keluarga menyetujui pengumpulan RSVP/kenangan?”
- **Required:** family-approved honouree name, service/event facts, date/location or stream, family contact, privacy setting. **Optional:** portrait, obituary/legacy, RSVP, memory submission, flower/donation guidance, accessibility.
- **Modules:** required `identity_profile,event_facts,privacy_consent`; allowed `venue_map,streaming,rsvp,tribute_memory,guestbook_wishes,gallery,moderation,reminders_whatsapp,travel_access`; forbidden celebratory confetti/gamification, urgency/scarcity, auto-public memories, aggressive gift/monetization, unapproved obituary.
- **Order:** quiet hero → family note → service/program → location/stream → RSVP optional → legacy → memory submission → flowers/donation guidance → access/support → closing.
- **Directions:** `restrained`, `quiet editorial`, `spiritual` only if family chooses; no forced photo.
- **Examples:** valid “Halaman mengenang almarhum ayah dan info doa bersama.” / “A private memorial invitation and memory wall.” Ambiguous “acara mengenang” (ask whether deceased and event logistics). Wrong “retirement party, orangnya masih hidup.” Unsupported “publish obituary to everyone.” Mixed “memorial dan birthday” ask primary and privacy.
- **Redirect:** `/event-types/celebrations-of-life`. **Transfer:** approved name, family note, service details, stream/map, privacy, RSVP, memories, moderation.
- **Next:** confirm family consent/privacy before collecting any guest data.

## 5. Confusion matrices and decision boundaries

Legend: `P` = primary destination; `C` = cultural context/secondary; `Q` = clarifying question; `R` = redirect.

### 5.1 Wedding vs anniversary
| Signal | Weddings | Wedding anniversaries | Anniversary parties | Bridal showers |
|---|---|---|---|---|
| “akad/resepsi/akan menikah” | P | R | R | R |
| “25 tahun menikah” | R | P | R | R |
| “anniversary perusahaan/komunitas” | R | R | P | R |
| “sebelum wedding untuk calon pengantin” | R | R | R | P |
| “anniversary” only | Q entity + married? | Q | Q | Q |

### 5.2 Birthday vs baby shower
| Signal | Birthdays | Baby showers | Gender reveals |
|---|---|---|---|
| celebrant already born, age/ultah | P | R | R |
| expecting parents, support/registry | R | P | Q/R |
| reveal/prediction is central | R | R or C | P |
| “bayi” only | Q born or expected? | Q | Q |

### 5.3 Aqiqah vs khitanan vs syukuran
| Signal | Aqiqah | Khitanan | Syukuran |
|---|---|---|---|
| birth/name/newborn/aqiqah | P subtype | R | C only if generic wording |
| circumcision/sunat/khitan | R | P subtype | C only |
| new home/promotion/business/hajj return | R | R | P |
| “syukuran anak” | Q birth or circumcision? | Q | Q |
| “syukuran ulang tahun” | R | R | R → birthdays |

### 5.4 Reunion vs graduation
| Signal | Reunions | Graduations | Syukuran |
|---|---|---|---|
| cohort/alumni meet again | P | R | R |
| ceremony/diploma/graduate | R | P | C if thanksgiving secondary |
| “syukuran lulus” | Q graduate remains center? | P if yes | P if gratitude gathering dominates |
| group/year only | Q ceremony or reconnect? | Q | R |

### 5.5 Private celebration vs community
There is no `private-celebration` canonical destination. Map private occasions to the specific event above. `community-events` is not in PERSONAL/FAMILY and is not a silent redirect target unless a live product route exists and the user confirms public/community intent.

| Signal | Personal destination | Community/public interpretation |
|---|---|---|
| named honouree/family, invite-only | specific P01–P14 | R from generic community |
| open public event, residents/members, volunteer/public program | Q; likely unsupported in this taxonomy | do not force-fit; offer only a verified live route |
| “holiday gathering keluarga” | P12 | community only if public stated |
| “reuni alumni” | P06 | community context may be secondary |
| “community anniversary” | P05 or unsupported community | Q audience/access |

## 6. Redirect and mixed-intent policy

### 6.1 Wrong category response
Template, machine-translatable:
> `Kategori saat ini tidak cocok karena tujuan utama yang Anda sebut adalah [reason]. Pilih [label destination] untuk alur yang sesuai: [live URL]. Kami akan membawa data yang sudah Anda isi: [fields].`

Never say “we changed your category” without confirmation. Show two actions: `Pilih [destination]` and `Tetap di kategori ini`. If the destination is not live/verified, use `unsupported` and do not fabricate a link.

### 6.2 Transferable fields
Always carry only fields already supplied and permitted: `language, host_name, honouree_or_couple_names, date/time, timezone if supplied, event title, venue/address/map URL, event list, RSVP deadline/mode, guest count, plus_one/household rule, dietary/access notes, gallery references, message/quote, privacy choice`. Do not transfer inferred religion, gender, pregnancy status, medical information, child age/location, or public visibility defaults.

### 6.3 Mixed intent
Examples:
- “wedding dan ulang tahun anak” → ask which is primary; recommend two invitations if both require separate guest journeys.
- “baby shower dan gender reveal” → one may be primary and the other an activity/module; ask.
- “graduation ceremony dan dinner” → one `graduations` event with `schedule_multi_event`, no ambiguity if dinner is clearly secondary.
- “aqiqah dan ulang tahun pertama” → ask primary; subtype/secondary context may be retained.

## 7. Intake field contract by family

| Family | Required fields | Optional fields | Forbidden/default hidden |
|---|---|---|---|
| Wedding | couple, date, events, venue, host, RSVP | parents, story, quote, gallery, gift, stream, dietary | baby/medical/prediction |
| Wedding anniversary | couple, milestone, date, venue/host | then-now story, archive, tribute, RSVP | bridal planning |
| Bridal shower | honouree, host, date, venue, RSVP | activities, menu, registry, gallery | ceremony/medical |
| Birthday | celebrant, date, venue, host, RSVP | age, guardian, theme, gallery, music | wedding/baby assumptions |
| Anniversary party | entity/honouree, milestone, date, venue, host | story, program, tribute, gallery | automatic wedding |
| Reunion | cohort/group, date, venue/itinerary, RSVP | travel, attendee opt-in, archive | public directory by default |
| Graduation | graduate, achievement, date/events, venue/access, RSVP | ceremony/party split, tickets, gallery, messages | unapproved school/legal claims |
| Aqiqah/khitanan | subtype, child, parents, date, venue, RSVP | birth/meaning or recovery context, prayer, gallery | anatomy, medical claims, child exposure |
| Syukuran | reason/category, host, title, date, venue, RSVP | achievement, prayer, gallery, stream | baby/gift assumptions |
| Baby shower | parent(s), host, date, venue, RSVP | activities, dietary, registry, privacy | pregnancy/medical details |
| Gender reveal | parent/host, safe format, date, venue, RSVP, safety/privacy | prediction poll, countdown, dietary, gallery | unsafe pyrotechnics, forced binary |
| Holiday gathering | holiday/tradition, host, date, venue, household RSVP | potluck, travel, activities, access | default religion/symbol |
| Retirement | honouree, retirement context, host, date, venue/program, RSVP | career story, tribute, gallery, food | age jokes/confidential HR |
| Celebration of life | approved honouree, family consent, service facts, date/location/stream, privacy | legacy, RSVP, memories, donation/flowers | auto-public memorial, upbeat gamification |

## 8. Unsupported and safety rules

- Unsupported examples include a medical appointment/procedure, legal certificate issuance, event ticket/payment implementation not verified, mass public festival when no live route is confirmed, or requests to expose private guest/child/deceased data.
- For unsupported intent: state exactly what is unsupported, preserve general fields locally only if policy allows, and offer `/sign-up` or a verified destination—not an invented event URL.
- Child data: guardian consent, optional photo, no public age/location by default.
- Pregnancy/gender: use family-approved terminology; do not infer identity or publish health details.
- Islamic/cultural text: family-approved; Arabic quote must be verified and labeled; do not invent scripture or ritual claims.
- Memorial: family approval, privacy-first, moderation before publishing memories.
- All designs: mobile-first, readable without photo/audio/motion, reduced-motion support, no critical information in imagery, and no module is enabled merely because a keyword appeared.

## 9. Classifier test set summary

Minimum acceptance set: each of 14 destinations has at least one valid Indonesian utterance, one valid English utterance, one ambiguous example, one wrong-category example, one unsupported example, and one mixed-intent example in section 4. Boundary tests must include all five matrices in section 5 and explicit negative tests for keyword-only classification (“RSVP”, “foto”, “WhatsApp”, “tema hijau”).

## 10. Research status and gaps

- **Expected:** 14 canonical PERSONAL/FAMILY destinations from source menu.
- **Researched:** 14/14.
- **Gap:** **0 destination gaps**.
- **Explicit product/schema gaps:** canonical menu combines aqiqah and khitanan, so subtype intake is required; `private celebration/community` has no canonical personal destination; some requested modules (dietary, activity poll, tribute moderation, calendar, safety fields) may be operational/schema capabilities rather than current editor fields; event address/end time/timezone and custom RSVP questions are documented as gaps in existing research. Classifier must label these as optional/backlog or unsupported rather than promise them.
- **Domain validation:** relies on existing research’s limited domain validation and product/source audit; no competitor copy or design has been reproduced. Further cultural review should be done with local family/domain reviewers before production.

## 11. Implementation-neutral next-step protocol

1. Normalize utterance and detect language; retain original text.
2. Extract explicit purpose, honouree/entity, relationship, life-stage, cultural context, date/venue, and module mentions.
3. Score only canonical destinations; apply contradiction and safety rules.
4. Return `valid`, `ambiguous`, `wrong_category`, `unsupported`, or `mixed_intent` with reason and confidence explanation suitable for customer.
5. Ask one minimal clarifying question when needed.
6. On confirmed redirect, show the live URL and transfer only explicit transferable fields.
7. Generate intake one question at a time; stop asking fields forbidden or irrelevant to the selected destination.
8. Validate module compatibility before design direction selection; event identity is decided before visual style.

This is a knowledge and policy artifact, not implementation code.
