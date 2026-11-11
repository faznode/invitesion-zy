<!-- SUMMARY (first 7 lines — greppable) -->
# 07-canonical-flows.md — proposed creator, guest, host day-of, reseller and post-event journeys
> WHAT: Our target journeys with step counts and targets, derived from current flows (`../01-codebase-audit/flows.md`) and the comparative flow library (`../03-teardowns/_flows/`). Every target here is **PROPOSED**: a design target, not a measured baseline.
> STATUS: **s25 (2026-11-06): "today" brought to current code** in §1–§4 (design families in the creator flow; RSVP depth, couple and parents, and the gift list in the guest flow; host counts, answers and the invite-only panel; manual check-in); every target stays PROPOSED and the competitor columns are unchanged (s10 flow library, OBSERVED / CLAIMED / UNKNOWN). Host day-of, reseller and post-event comparisons rest mostly on CLAIMED evidence. Earlier: verified s10 (v1 s08).
> OWNER: Research agent
> DEPS: ../01-codebase-audit/flows.md, ../03-teardowns/_flows/, ../03-teardowns/*/dossier.md §2, 06-backlog.md, ../07-ideation/top-10.md
> GREP: flow, journey, creator, guest, host, reseller, post-event, steps, observed, claimed, proposed, today s25
> UPDATED: 2026-11-10 (s39: §1 step 7, checkout keys and settlement through one writer, B-039; s36: §6 the wishes book, I-22; §4 gifts by family, I-04; s34: the day-of check-in, B-024; s33: §1 steps 2–3, the creation wizard; s32: §1 steps 4–6)

Step = one screen or one deliberate action. Vocabulary as in `../03-teardowns/_flows/README.md`: OBSERVED (seen on a public page or capture), CLAIMED (vendor's own description), PROPOSED (our target), UNKNOWN. Competitor step counts are CLAIMED unless a capture ID is given (ENV 4 steps to a shareable link, PLO 5 steps "under 5 minutes", IDI "5 menit").

## 1. Creator: from catalog to shared link (comparison: `../03-teardowns/_flows/creator.md`)
| # | Today (s25; `flows.md` + changes since s09) | Target (PROPOSED) | Backlog |
|---|---|---|---|
| 1 | Browse catalog (filters) | same | — |
| 2 | Sign up / log in. **Since s33 (B-037, E-073, D-055), behind `FLAG_CREATION_WIZARD` (off):** "Pakai tema" opens the wizard (`/buat/<tema>`): names, date and theme, rendered by the real guest renderer as the visitor types, with nothing stored (the typed content stays in the visitor's own cookie) | **Type names + date on a template → instant preview** (no account yet) (**done in the sandbox**, s33; the signed-in round trip with real keys is DA-01 item 6) | B-037 |
| 3 | Create from template (preset kept since s09; baseline lost it, QA-001). **Since s33:** the save asks for sign-in or sign-up and comes back to `/buat/simpan` with the typed draft kept; one tap creates the draft (one per wizard, whatever the taps or retries) and opens the editor. Every creation goes through one facade (`BACKEND_CONTENT`, Rust writer built) | Save → account creation (Clerk) with the draft kept | B-001 (done), B-037 |
| 4–6 | Form editor with manual save; preview via the owner route `/preview/[id]` (baseline: 404, QA-011). **Since s14:** an optional design family per invitation (`theme.familyId`; classic layout by default). The host can also edit RSVP questions (E-031), invite-only events (E-038), and person and child photos (E-039, E-047). **Since s32 (B-035, E-071, D-053):** every save carries the version the editor loaded and a stale one is refused with a choice (load the latest, or keep this tab's edits), never overwritten; behind `FLAG_EDITOR_AUTOSAVE` (off) the editor saves by itself shortly after the host stops typing and shows the owner preview beside the fields; content writes through `BACKEND_CONTENT` (`next`, Rust writer built). **Since s32 turn 3 (B-036, E-072, D-054):** the theme tab lists the event type's catalog themes; a switch within the entitled tier stores the catalog id and its palette, keeps the content and never invokes checkout (`invitations.template_id`, the purchased theme, is untouched); Premium themes below the entitlement are shown locked and refused by both writers | Editor with live preview + autosave; theme switch free within tier (**done in the sandbox**, s32; the upgrade to a higher tier is U6) | B-005 (done), B-030 (partial), B-035, B-036, B-041 |
| 7 | Pay (QRIS manual confirmation / Stripe) at the prices in `lib/pricing.ts`. **Since s39 (B-039 provider-neutral, D-064):** a double tap or a resubmitted checkout page reaches one order (a key bound to the server's price and theme; a changed price shows a notice and writes nothing); Stripe customers pay on Stripe's hosted page; every settlement (webhook or the administrator's confirmation) goes through one writer per call (`BACKEND_PAYMENT`) and records the entitlement outbox row with the payment | Pay at publish (published prices); automated confirmation once a PJP exists | B-002 (done), B-039 (provider-neutral part done s39; PJP EXT) |
| 8 | Publish; the link preview shows names and date (s09) | Publish → share screen with per-guest WhatsApp links and an OG preview | B-010 (done), B-018 |
**Target:** ≤ 6 steps to a shareable link for a basic template (ENV claims 4, PLO 5; both CLAIMED).

## 2. Guest: open → respond (comparison: `../03-teardowns/_flows/guest.md`, OBSERVED on measured demos)
1. Tap the WhatsApp link (OG card shows names and date, B-010, shipped s09) → 2. cover with the guest's name and a labelled "Buka Undangan" button (B-009) → 3. music starts on the tap, pause control visible (B-009) → 4. scroll: couple and parents (B-023), events in the correct zone with add-to-calendar and countdown (B-004, B-008, shipped s09), gallery (B-025), gifts with copy buttons (B-026) → 5. RSVP with party size kept (B-007, shipped s09) → 6. wish.
**Targets:** first-load weight within the tier budget (B-012); RSVP in ≤ 2 actions after the cover; works without JavaScript for RSVP and wishes (server actions already do); elder mode and low-data mode as later options (ideas I-05, I-28).

**Today (s25), step by step:**
1. **Shipped:** the OG card (B-010).
2. **Not yet:** the cover gate (B-009, not started). The page opens on the layout's cover, which keeps the guest's name in the first viewport on 360 px phones (E-048, E-051).
3. **Not yet:** music. `config.music` is stored and never rendered (B-009).
4. **Partly shipped:**
   - Couple and parents lines and person photos render (via B-029 and D-038; B-023 partial).
   - Events show the event's zone, add-to-calendar and countdown.
   - Corporate programme, organiser mark, dress code and hashtag render (B-029).
   - The gallery has no lightbox (B-025).
   - The gift account list renders without copy buttons or a QRIS image, and is not limited to personal links (B-026).
5. **Shipped, and deeper than planned (B-027):** RSVP keeps the party size, with "maybe", a deadline, custom questions, an answer per event, and events a guest is not invited to hidden from that guest.
6. **Shipped:** wishes (hidden wishes filtered).

The page's weight is held to the harness budgets by hand, with no CI (B-012, B-020).

## 3. Host before the event
Import guests (B-033) → groups → send personal links (wa.me with an editable message, B-018) → follow up the unopened / unanswered lists (idea I-06, B-034) → watch totals by group and event (B-034).
**Target:** every guest reachable in one tap; no unofficial WhatsApp gateway.
**Today (s25):**
- **Guest import and self-registration (s31, B-033 / D-052, sandbox):** paste or CSV → preview by the live writer → one atomic, undoable batch; a self-registration link fills a queue the host approves (`FLAG_SELF_REGISTRATION` off until B-021's notice). Every roster write goes through `BACKEND_ROSTER` (Next.js or the Rust API). The dashboard steps need a signed-in host (DA-01).
- **Personal links:** wa.me links use `toWhatsAppNumber` normalisation (baseline); the editable message is not available everywhere (B-018).
- **RSVP:** the host sees RSVP counts on the dashboards (E-033) and each guest's answers on the guest page (E-036), and sets invite-only events per guest with an RSVP override (E-038).
- ~~**Not built:** unopened or unanswered follow-up lists (B-034 partial).~~ **Built s31 (E-069, D-051):** `/dashboard/invitations/<id>/insights` lists who has not opened and who opened without answering, each with a one-tap B-018 reminder and a CSV export; totals by group and event, opens over the last 14 days, and a counts-only digest to forward on WhatsApp (I-29). Signed-in acceptance is DA-01 (NOT RUN).
- **Personal links (s29):** one builder with the host's editable message on both guest lists (B-018, E-066).

## 4. Host on the day (comparison: `../03-teardowns/_flows/host-day-of.md`, CLAIMED only)
Ushers open the scanner on a phone (B-024; co-host / usher roles G-044) → scan the guest's QR pass or search the name (manual fallback, already present) → greeting screen shows the name (B-024) → attendance count updates.
**Target:** ≤ 3 s per guest at the desk; works with a weak signal (idea I-27 as a later option).
**Today (s25):** manual arrival tracking only. The manage centre states that "QR scanner flow remains a roadmap item". There is no QR pass, scanner, greeting screen or usher role (B-024, G-044 open).
**s34 (sandbox; `FLAG_GUEST_PASS` off):** B-024 + I-01 / I-27 are implemented (E-074, D-056, ADR-A3). The guest opens their pass from their personal link. The host's scanner reads it by camera or handheld scanner, or finds the name; scans wait on the device without a signal and keep their own time; the greeting shows the name; a guest arrives once whichever desk or path records them. The host scans as the owner until G-044's usher roles. The desk target is not yet measured on a device (EXT).

**s35 (sandbox; `FLAG_TEAM_ACCESS` off):** G-044 is implemented (E-075, D-057). The owner invites a co-host or an usher from the team page with a one-time link (shown once, seven days); the person accepts it signed in, or signs in or up and returns to `/gabung/terima`. Ushers open the desk from their dashboard by a full page load and see names and arrival times only; co-hosts also run the guest list, wishes and insights. Content, theme, the team, checkout and publication stay the owner's. A revoked member is refused from the next request, a stored desk batch included. Real-Clerk acceptance is DA-01 item 8 (NOT RUN).

**s35 (sandbox; `FLAG_HOST_LOGS` off):** G-045 is implemented (E-076, D-058). On the day, the owner opens "Seating, souvenirs & gifts" from the control center: creates tables (or copies the ones planned there), picks each guest's table and seat, marks a souvenir as it is handed over (the first time is kept), and notes envelopes, presents and transfers with an optional amount. Both lists download as CSV without phone numbers. Co-hosts, ushers, guests and the check-in desk never see any of it. Real-Clerk acceptance is DA-01 item 9 (NOT RUN).

## 5. Reseller (later, G-052; comparison: `../03-teardowns/_flows/reseller.md`, CLAIMED)
Buy credits → create invitations for clients or give clients edit access → own branding → resale floor. Depends on the tenant model and automated payments.

## 6. After the event (comparison: `../03-teardowns/_flows/post-event.md`, CLAIMED)
Read-only page stays up for the active period (present) → thank-you message and guest photos (idea I-21) → wishes book export (idea I-22) → deletion on request or at expiry (B-031).

**s36 (sandbox; `FLAG_WISHES_BOOK` off):** I-22 is implemented (E-078, D-060). From the wishes page the owner downloads "Buku ucapan", a PDF of the wishes whose status is VISIBLE, oldest first with the host's replies, also after the guestbook is closed or kept hosts-only; pending and hidden wishes, phones and links never appear. The cover says how many wishes it holds and what the standard fonts could not print. Co-hosts moderate on the same page without the download. On the day (§4), I-04 (E-077, D-059) lets the owner attribute each gift to the bride's or the groom's family on a wedding, with totals per family and a `Pihak` column in the export.
