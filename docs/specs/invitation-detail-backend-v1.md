# Spec: Invitation Detail Backend v1

## Objective
Provide a customer-owned backend for the invitation-editor modules observed in the reference flow: couple, theme, event schedule, music, guestbook, cashless gift, RSVP, gallery, planner, streaming, story, Instagram Story, quote, settings, cover/WhatsApp copy, and guest sending. The invitation `config` remains the renderer source of truth.

## Commands
- Build: `pnpm build`
- Generate migration: `pnpm db:generate`
- Apply migration: `pnpm db:migrate`

## Contract
- `GET /api/invitations/:id/detail` returns the typed normalized detail config.
- `PATCH /api/invitations/:id/detail` accepts a partial valid config and returns the saved config.
- `GET /api/invitations/:id/media` returns media ordered by `sortOrder ASC, id ASC`.
- `POST /api/invitations/:id/media` accepts an explicit `uploadSequence`; the server assigns it as `sortOrder`. Filename and URL are never used for ordering.
- `PATCH /api/invitations/:id/media/:assetId` supports an explicit `sortOrder` (reorder) and safe metadata updates.
- `DELETE /api/invitations/:id/media/:assetId` removes only an owned asset.

## Ownership / safety
- All endpoints require a CUSTOMER session.
- An invitation must be owned by the session user; non-owned IDs respond with `404`.
- URL, MIME/type, sequence and configuration are validated at the boundary with Zod.
- Version snapshots are added only after a detail change succeeds.

## Database change
`media_assets` gains additive `sort_order`, `upload_sequence`, and `source` columns. `(invitation_id, upload_sequence)` is unique when a sequence exists.

## Success criteria
- Two assets with random filenames list in explicit upload sequence.
- Duplicate upload sequence for one invitation is rejected.
- A different customer cannot read or mutate an invitation or asset.
- Invalid detail payload returns structured `422`.
- Build and migration succeed.

## Boundaries
- Always: preserve existing config keys through deep merge; retain config as canonical renderer input.
- Ask first: changing public renderer semantics or existing configs.
- Never: infer media order from filename, Discord attachment ID, path, or URL.

## Open follow-up
Actual binary storage / Discord ingestion transport is deliberately outside this backend contract; the uploader supplies an ordered, validated URL after storage succeeds.
