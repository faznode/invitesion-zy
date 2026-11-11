<!-- SUMMARY (first 7 lines — greppable) -->
# top-10.md — specifications of the ten highest-ranked ideas (brief 03 §16)
> WHAT: For each: user problem, segment, experience, differentiation, evidence, dependencies, acceptance criteria, success metric, effort/risk, smallest useful experiment. Ranking from `score-ideas.py` (`ranking.md`).
> STATUS: DONE s08 (2026-11-03). "Observed" = demand evidenced at competitors or in our audit; "proposed" = our hypothesis without observed demand.
> OWNER: Research agent
> DEPS: ideas.csv, ranking.md, ../06-gap-analysis/upgrade-map.csv, ../05-feature-matrix/feature-matrix.csv
> GREP: idea, top 10, experiment, acceptance, metric, I-0
> UPDATED: 2026-11-03

Success metrics name what to measure; **no baseline or target number is invented** (no analytics access, ADR-O06). Each experiment records its own baseline first.

### 1. I-06 WhatsApp follow-up without an API (observed · score 27)
- **Problem:** hosts chase non-responders one by one; competitors sell staged follow-ups as a paid service (IVT RSVP Assistance from Rp 1M, S-IVT-003) or meter messages (KAT Rp 1,000 each, S-KAT-004).
- **Segment:** self-serve hosts with 100–500 guests.
- **Experience:** "Belum dibuka" and "Belum menjawab" lists in the guest dashboard; each row has a one-tap WhatsApp button with a host-editable, personalized reminder and the guest's own link; a "sent" mark with date.
- **Differentiation:** the same outcome as a paid assistance service, inside the product, with no unofficial gateway (no ban risk).
- **Evidence:** S-IVT-003, S-KAT-004, S-PPO-002; our open tracking exists (F-059) but is visible only in the CSV.
- **Dependencies:** G-015 (08 → 62 normalisation), G-039 (dashboard), B-011 (links); privacy notice G-022.
- **Acceptance:** filters are correct against fixture data; each button opens `wa.me/62…?text=` with the guest's link; reminder template validated for length; nothing is sent automatically.
- **Metric:** share of guests with an answer by D-3; reminders sent per invitation.
- **Effort / risk:** M / L.
- **Smallest experiment:** ship the two filtered lists with buttons behind a flag for new invitations; compare answer rates with and without the flag.

### 2. I-05 Elder-friendly reading mode (proposed · 26)
- **Problem:** invitations go to parents and grandparents; script fonts, low contrast and motion are hard to read (contrast failures QA-008; competitors 77–86 accessibility).
- **Segment:** older guests of every niche.
- **Experience:** a "Teks besar" control on the cover and in the header: larger base size, high-contrast palette, motion off, decorative fonts replaced by the body font; the choice persists per device.
- **Differentiation:** no Tier-A vendor offers it (FM-049 Unknown or None everywhere).
- **Evidence:** proposed; our a11y lead (FM-163) makes it credible.
- **Dependencies:** template tokens (harness), G-010.
- **Acceptance:** toggling keeps every section usable at 200 % text; contrast ≥ 4.5:1 in the mode; reduced motion implied; harness snapshot at 360×800 passes.
- **Metric:** share of guest sessions that turn it on; scroll depth for those sessions.
- **Effort / risk:** S / L.
- **Smallest experiment:** the toggle on the basic template only; count activations.

### 3. I-02 "Ringan" promise: published speed and weight budget (proposed · 25)
- **Problem:** competitor guest pages weigh 2.4–7.2 MB at cold load with LCP medians above 12.5 s (FM-157, FM-160); guests on WhatsApp in-app browsers and prepaid data feel it.
- **Segment:** every guest; hosts choosing a vendor.
- **Experience:** each template page states its budget (e.g. weight at first load) and the harness enforces it; marketing explains why it matters with our own measured numbers and their limits.
- **Differentiation:** nobody publishes a budget; we already measure 311 KiB (C-INV-005).
- **Evidence:** dossier digests; FM-156…160.
- **Dependencies:** B-012 harness budgets; G-009 (clerk-js off guest pages) so production matches the lab.
- **Acceptance:** `bench` fails a template over its tier budget; the public number equals the latest `bench` report.
- **Metric:** median guest-page weight in production (needs field data once analytics exist).
- **Effort / risk:** S / L (claims must stay true; numbers come from the harness only).
- **Smallest experiment:** publish budgets for the three dogfood templates on their preview pages.

### 4. I-18 Visible privacy controls (observed problem · 24)
- **Problem:** vendors expose real customers' events as public samples (S-IDI-003, S-SMO-004); hosts cannot limit who sees wishes (S-WEV-004); our gift accounts show without a guest link (QA-022).
- **Segment:** privacy-conscious hosts and families.
- **Experience:** a "Privasi" panel: show gift accounts and address only on personal links (default on), wishes visible to all / hosts only, search indexing off (already), delete everything after the event in one action.
- **Differentiation:** privacy as a visible product feature, matching our fictional previews and noindex (FM-172, FM-173).
- **Evidence:** S-IDI-003, S-SMO-004, S-WEV-004; QA-022, QA-023.
- **Dependencies:** G-021, G-032, G-059 (deletion + policy, professional review).
- **Acceptance:** with the default, `/i/:slug` without a guest renders no account numbers and the RSC payload carries none; hosts-only wishes are hidden from guests; deletion removes invitation, guests, wishes and media.
- **Metric:** share of invitations with non-default privacy settings; privacy-related support requests.
- **Effort / risk:** M / M (deletion is irreversible: confirmation + delay).
- **Smallest experiment:** the account-visibility default alone.

### 5. I-03 Host QRIS gift block, no custody (observed · 24)
- **Problem:** guests want to send gifts by QRIS; we show plain account text without copy buttons (FM-033, FM-034).
- **Segment:** every wedding host.
- **Experience:** hosts upload their own static QRIS image and accounts per side; guests see tabs (Transfer / QRIS / Kado) with copy buttons; Invitesion never touches the money.
- **Differentiation:** parity with ENV's QRIS tab (C-ENV-111) without the custody questions of platform-processed gifts (ADR-O03).
- **Evidence:** C-ENV-111, C-INV-111.
- **Dependencies:** media upload (M-027), G-021 visibility default.
- **Acceptance:** QRIS image validated as an image under the upload limit; copy buttons announce success to screen readers; accounts hidden on non-personal links by default.
- **Metric:** share of wedding invitations with a QRIS block.
- **Effort / risk:** S / L.
- **Smallest experiment:** copy buttons first (one component), then the QRIS image.

### 6. I-11 Verified religious-text blocks with provenance (proposed · 24)
- **Problem:** five vendors show verse blocks (S-SMO-004, C-ENV-111, C-IVT-101, C-INV-111, C-KAT-101) with no visible source; our presets carry three translations of unknown provenance (QA-015).
- **Segment:** Muslim families first; later other faiths, only with approved corpora.
- **Experience:** hosts pick from an approved list; each block shows its source and translation edition; nothing else can be inserted as scripture.
- **Differentiation:** trust; no competitor shows provenance.
- **Evidence:** above; ADR-O04.
- **Dependencies:** an owner-approved corpus (`content/verified-religious-texts/`); B-003.
- **Acceptance:** the harness rejects religious text not in the corpus; the picker lists only verified entries; with an empty corpus the block is hidden.
- **Metric:** share of eligible invitations using a verified block.
- **Effort / risk:** S engineering / M dependency (owner corpus).
- **Smallest experiment:** ship the empty corpus, the README and the harness gate (done with B-003); add entries when the owner supplies them.

### 7. I-28 Low-data mode (proposed · 24)
- **Problem:** heavy media on prepaid mobile data and slow venues; no vendor adapts (no Save-Data handling in any capture).
- **Segment:** guests on slow or metered connections.
- **Experience:** with `Save-Data` or a slow effective connection, the page skips music preload, video and decorative art, and offers "Muat foto" buttons.
- **Differentiation:** unique; reinforces I-02.
- **Evidence:** FM-160 medians; proposed.
- **Dependencies:** harness asset manifest (media classes).
- **Acceptance:** with `Save-Data: on` the first-load weight stays under the basic-tier budget for every tier; content stays complete.
- **Metric:** share of sessions served in low-data mode.
- **Effort / risk:** S / L.
- **Smallest experiment:** honour `Save-Data` for gallery images only.

### 8. I-13 Sober memorial mode (proposed · 24)
- **Problem:** our tahlilan template uses a celebration form (G-060); celebratory defaults are inappropriate for mourning.
- **Segment:** families inviting to tahlilan, 40 / 100 days, haul.
- **Experience:** a memorial preset: no music, no countdown, no gift block, neutral palette, host-written text only, RSVP optional.
- **Differentiation:** dignity by default; IDI publishes mourning pages but their tone is unknown (D-IDI).
- **Evidence:** D-IDI; our niche audit.
- **Dependencies:** B-001 (presets survive creation), ADR-O04 (no generated prayers).
- **Acceptance:** creating from the memorial template yields no music / gift / countdown sections; harness niche check passes.
- **Metric:** memorial invitations published; support complaints about tone.
- **Effort / risk:** S / L.
- **Smallest experiment:** fix the preset of the one existing tahlilan template.

### 9. I-15 Cinematic but accessible motion (observed problem · 23)
- **Problem:** premium vendors use long intros (ENV 10+ s) and text-less cover controls that need a settled tap (B-ENV-001); motion libraries add weight (FM-179).
- **Segment:** premium and signature tiers.
- **Experience:** opening sequence ≤ 1.5 s, cover button tappable and labelled from first paint, motion via CSS and small islands, `prefers-reduced-motion` skips the sequence.
- **Differentiation:** "rich but light": premium feel inside our budgets.
- **Evidence:** C-ENV-122, B-ENV-001; motion libs on 5 vendors.
- **Dependencies:** harness motion gate; B-009 cover.
- **Acceptance:** cover control has an accessible name and works on first paint; reduced-motion run shows no animation; TBT within the tier budget.
- **Metric:** share of guests who open the cover; bounce before opening.
- **Effort / risk:** M / M.
- **Smallest experiment:** the signature dogfood template.

### 10. I-16 Generated share card and Status / Story image (observed · 23)
- **Problem:** WhatsApp previews of our links show the platform card, not the couple (QA-009); six vendors set `og:image` (FM-047).
- **Segment:** every host.
- **Experience:** an OG image per invitation (names, date, palette) and a downloadable 9:16 image for WhatsApp Status / IG Story.
- **Differentiation:** parity on OG; the Story image matches WEV's template (C-WEV-104) with our own art.
- **Evidence:** C-WEV-104, C-VID-101, QA-009.
- **Dependencies:** B-010.
- **Acceptance:** `og:image` resolves with the right size and names; hostile names render as text; Story download works on mobile.
- **Metric:** link-preview presence (manual check), Story downloads.
- **Effort / risk:** M / L.
- **Smallest experiment:** OG image only (B-010).
