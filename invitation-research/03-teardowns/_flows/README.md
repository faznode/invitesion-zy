<!-- SUMMARY (first 7 lines — greppable) -->
# _flows/ — normalized comparative flow library (creator, guest, host day-of, reseller, post-event)
> WHAT: The same five journeys across competitors and Invitesion, with every step marked OBSERVED, CLAIMED or PROPOSED, and the Invitesion target each comparison leads to.
> STATUS: v1, session 10 (2026-11-03). Built from dossier §2 / §4 sections, the Tier-B profiles and our code at `7a00a6d`. No new competitor request was made for this library.
> OWNER: Oracle (research)
> DEPS: ../*/dossier.md, ../tier-b-profiles.md, ../../01-codebase-audit/flows.md, ../../09-masterplan/07-canonical-flows.md, ../../09-masterplan/06-backlog.md
> GREP: flow, journey, creator, guest, host, check-in, reseller, post-event, observed, claimed, proposed
> UPDATED: 2026-11-03

## Files
| Flow | File | Competitor evidence (best level) | Invitesion target lives in |
|---|---|---|---|
| Creator onboarding → publish | `creator.md` | observed up to the catalog / trial entry; everything behind signup claimed | `../../09-masterplan/07-canonical-flows.md` §1 |
| Guest open → RSVP → gift | `guest.md` | observed on measured demos (WEV, ENV, INV, KAT, IVT, VID, BRN); claimed elsewhere | §2 |
| Host day-of check-in | `host-day-of.md` | claimed only (no competitor check-in tool was used) | §4 |
| Reseller operations | `reseller.md` | claimed (partner and pricing pages) | §5 |
| Post-event | `post-event.md` | claimed (FAQ and policy pages) | §6 |

## Legend and rules
- **OBSERVED** = seen on a public page or a capture (ID given). **CLAIMED** = the vendor's own description (pricing cards, FAQ, feature pages). **PROPOSED** = our design target, not a measured baseline. **UNKNOWN** = not visible under the public-only method.
- A step counts as one screen or one deliberate action. Competitor step counts are claims unless an ID with a capture is given.
- No step behind a signup, payment, form or login was performed (`../../_rea-playbook.md` §5); those steps are claims by construction.
- Invitesion "today" means the code at `7a00a6d`: the s09 P0 changes are listed separately from the `22ed99e` audit baseline in each file.
- Sitemu was absent while blocked (D-026, s10–s11). Its v1 dossier (s12, D-030) documents three creator lanes in §2 (free self-serve, paid done-for-you after payment, bespoke via a WhatsApp brief), all from marketing pages [OBSERVED / CLAIMED]; they are **not yet folded into these flow files**. Blocked Tier-B vendors are absent for the reasons in `../tier-b-profiles.md`. Enviory guest-flow rows rest on provisional captures (D-031).

## Cross-flow findings
1. **Every competitor's creator flow is a claim past the catalog**; the only partly observed creator innovation is Enviory's try-with-your-names entry on its demo pages (C-ENV-122/123 button label).
2. **Guest flows are where we have measurements**, and our gap there is richness (cover, music, gallery, gifts), not friction: RSVP is two interactions on our page.
3. **Day-of check-in is a paid or staffed product everywhere it exists** (VID, IVT, KAT, SMO, WEV, INE, SMP); no evidence shows a vendor's scanner working without connectivity.
4. **Resellers buy credits, branding and a landing page** (SMO, INV, WEV, ENV, VID agents); none publishes top-up or wholesale prices completely.
5. **Post-event is the thinnest journey across the market**: deactivation at expiry and occasional exports; nobody shows a keepsake or a thank-you flow on public pages.
