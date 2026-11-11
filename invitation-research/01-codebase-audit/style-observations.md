<!-- SUMMARY (first 7 lines — greppable) -->
# style-observations.md — Invitesion's actual visual identity today (seed for style DNA)
> WHAT: Tokens, type, palette logic, motion, Indonesian copy tone — from the styles and code that are actually imported, with file and screenshot evidence. Feeds the planned `invitesion-style-dna` skill.
> STATUS: REVALIDATED s10 (2026-11-04) against `7a00a6d`. Phase-1 version (2026-10-29, base `22ed99e`) described the platform tokens from the archived old-brand file; §1, §2, §5, §7 and §8 are corrected below and the P0 changes (s09) are marked.
> OWNER: Oracle (research)
> DEPS: app/globals.css, app/layout.tsx, app/home.module.css, app/templates/templates.module.css, app/templates/catalog-ui.module.css, components/invitation/public-renderer.tsx, lib/invitation/palettes.ts, templates/_harness-samples/*/template.manifest.json, raw/invitesion/C-INV-001/viewport-412.webp
> GREP: style, identity, tokens, typography, palette, motion, copy tone, dna, brand, rose, magenta
> UPDATED: 2026-11-04

**Correction (s10).** `archive/tokens-old-brand.css` (the old root `tokens.css` of the earlier "Vienne" brand: `--v-paper`, `--v-accent`, `--space-*`, `--ease-*`, an "Iowan Old Style / Palatino" display stack) was never imported by any page. The live design system is `app/globals.css` plus CSS Modules. Every statement below is read from active files at `7a00a6d`.

## 1. Three surfaces, one brand colour
| Surface | Identity | Evidence |
|---|---|---|
| Platform (marketing, pricing, dashboard, auth) | **Rose / magenta editorial on white.** Hex tokens: background `#ffffff`, ink `#18121d` (plum-black), primary `#e80053` (also `viewport.themeColor`), secondary / muted `#f4efff` (lilac tint), accent `#fff0f5` (blush), border `#eadfeb`, radius `0.6rem`. A `brand-50…950` scale (`#fff0f5` → `#4a001b`, `brand-600` = `#e80053`) is the declared single source of truth; a deprecated `orange-*` alias still maps to it. Light-only (`color-scheme: light`, no dark token set) | `app/globals.css` lines 22–109; `app/layout.tsx` (`themeColor '#e80053'`, `colorScheme: 'light'`) |
| Invitations (guest pages, `/i/[slug]`) | **Quiet centred stationery:** one column (`max-w-xl`), Instrument Serif names, Manrope body, palette background, translucent white cards (`bg-white/70`) with soft shadow, uppercase tracked eyebrows. **s09 P0 additions:** countdown island and `.ics` download after the events (B-008), per-invitation link-preview image (B-010), event times in the event's own zone (B-004) | `components/invitation/public-renderer.tsx`; screenshots `raw/invitesion/C-INV-001/viewport-412.webp`, `C-INV-002/viewport-412.webp` show the **pre-P0** page (`22ed99e`) |
| Template marketing preview (`/templates/[slug]`) | **Stationery with ornament:** thin double frame, arch motif, "Buka Undangan" cover button, "Kepada Yth. Bpk/Ibu/Saudara/i — Nama Tamu — di tempat" | `app/templates/[slug]/preview-client.tsx`; `raw/invitesion/C-INV-003/viewport-412.webp` |
| Harness dogfood templates (not wired into the product) | Static HTML/CSS samples with their own OFL font pairs (Cormorant Garamond + Jost; Marcellus + Plus Jakarta Sans; Italiana + Plus Jakarta Sans) and declared motion levels 1 / 2 / 3 | `templates/_harness-samples/*/template.manifest.json`, `GENERATION-REPORT.md` |

The marketing preview still promises a richer invitation than the guest renderer delivers (cover gate, ornament) — the largest brand inconsistency, unchanged by P0.

## 2. Typography
- **Pair:** Instrument Serif 400 (normal + italic) for display, Manrope for body, both SIL OFL 1.1, loaded with `next/font/google` (self-hosted at build) as `--font-serif` / `--font-sans` [OBSERVED `app/layout.tsx`]. The body rule falls back to `"Manrope", Arial, Helvetica, sans-serif` (`app/globals.css`).
- Guest page scale: names `text-4xl → sm:text-5xl` (36→48 px), section headings `text-2xl` serif in the accent colour, eyebrow `text-xs` uppercase `tracking-[0.3em]`, body `text-sm leading-7`.
- Long names wrap cleanly (80-char guest name → 2 balanced lines at 412 px) [OBSERVED C-INV-002, pre-P0].
- Not used: old-style figures, an Arabic script face (an Arabic guest name falls back to system fonts).

## 3. Palette logic
- 18 guest palettes, each exactly four roles: `bg` (paper), `ink` (text), `accent` (eyebrows, headings, icons, outline buttons), `soft` (name chip, countdown boxes). 16 light papers with warm undertones; 2 dark (midnight `#101526`, gold-noir `#171310`) with metallic accents. **s09:** the table moved to `lib/invitation/palettes.ts`, and `paletteHex()` feeds the link-preview image, so page and preview cannot drift.
- Accents are mid-tone (L≈45–55 %): fine for display text, **too light for small text** on light paper (ivory 3.86:1) [OBSERVED C-INV-001 contrast].
- Cards are still hard-coded `bg-white/70` regardless of palette (six occurrences plus one `bg-white/60` in the renderer at `7a00a6d`) → dark palettes break (1.64:1) [OBSERVED C-INV-002].
- Status colours (Tailwind emerald / red / amber) ignore the palette.

## 4. Layout and components
Cover (80 vh, centred) → greeting → quote (only when the host enters one; presets ship without a quotation since B-003) → events (cards with icon rows) → countdown + `.ics` link (s09) → story (cards) → gallery (2-col square grid) → livestream → gift (cards, monospace number) → RSVP (form card) → wishes (form + list) → footer credit. Single column, 24 px gutters, 48–64 px section padding. Icons: lucide. Touch targets ≥ 44 px (`min-h-11`).

## 5. Motion
- **Guest page:** none beyond button hover `transition` classes; the countdown island updates text without animation.
- **Platform:** `app/globals.css` defines **no** motion tokens (no easing, duration, keyframes or transitions). CSS Modules carry all motion: `app/home.module.css` 2 `@keyframes`, 5 `animation`, 19 `transition` declarations, one easing (`cubic-bezier(0.22, 1, 0.36, 1)`), 2 `prefers-reduced-motion` blocks; `app/templates/templates.module.css` 7 `@keyframes`, 16 `animation`, 4 `transition`, 1 reduced-motion block; `catalog-ui.module.css` 1 `transition`. (The Phase-1 figure of ≈ 56 declarations is not reproducible on these files.)
- **Template preview** honours `prefers-reduced-motion` (C-INV-003 `reducedMotionCss=true`).
- **Harness samples** declare motion per manifest: melati level 1 (`cubic-bezier(0.22, 1, 0.36, 1)`, 600 ms), zamrud level 2 (`cubic-bezier(0.2, 0.8, 0.2, 1)`, 520/700 ms, reduced motion = fade only), cincin level 3 (lazy 3D, linear). They are samples, not product pages.

## 6. Indonesian copy tone [OBSERVED presets + renderer]
- Register: polite-formal for family/religious events ("Tanpa mengurangi rasa hormat, kami mengundang Bapak/Ibu/Saudara/i…"), warm-casual for birthdays/reunions ("Yuk, rayakan…"), playful for team building.
- Guest address: "Kepada Yth." + name (renderer); the preview adds "Bpk/Ibu/Saudara/i … di tempat".
- Section names: "Rangkaian Acara", "Cerita Kami", "Galeri", "Hadiah", "Konfirmasi Kehadiran", "Ucapan & Doa", "Siaran Langsung".
- Button voice: first person, gentle ("Ya, saya hadir" / "Maaf, belum bisa", "Kirim ucapan", "Lihat lokasi").
- Religious content: **since B-003 (s09)** presets embed no religious text; any preset quotation must come from `content/verified-religious-texts/corpus.json`, which is empty by owner decision (ADR-O04), so presets ship without one. A host may still type their own quote. No religious text is generated from memory.

## 7. Do / don't (current evidence → keep or fix)
| Keep (works today) | Fix (evidence of failure) |
|---|---|
| Instrument Serif + Manrope pairing; restrained centred composition | Palette-only templates — every theme looks the same to guests |
| Four-role palette model, now shared with the link preview | Accent used for small text on light paper (contrast) |
| Polite, warm Indonesian microcopy in first person | Hard-coded white cards on dark palettes |
| 44 px touch targets, `lang` from locale, pinch-zoom allowed | No cover gate / ornament on the real page while the preview shows one |
| Rose / magenta editorial platform identity (ADR-O05: keep) | No shared motion vocabulary: one easing in one CSS Module, none on invitations |

## 8. Target direction (ADR-O05 keeps the brand; motion system still to be written)
"Modern Indonesian stationery that moves": keep the serif / sans pair and four-role palettes, add per-template layout systems and ornament as code (CSS / SVG authored in-repo), and define a motion vocabulary (it does not exist yet — the harness manifest's levels 0–3, durations, easing and reduced-motion modes are the first concrete form), with optional 3D / cinematic covers as lazy islands with static fallbacks. The `invitesion-style-dna` and `invitesion-motion-system` skills are planned, not written.
