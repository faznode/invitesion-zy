-- B-027 slice 2c (D-036): every stored event gets a durable id, so a per-event answer names an event that keeps its
-- identity through edits and reordering. Same rule as `keyStoredEvents` (lib/invitation/event-ids.ts): an event without an
-- id gets `ev-<position>` (1-based, its position now). Only configs that need no tie-break are rewritten: every element is
-- an object, every present id is a valid string held by one event, and no minted id is already taken. The rest are read
-- through the same rule and written with ids on their next save. Saved versions are history and are not rewritten.
WITH "candidates" AS (
  SELECT i."id"
  FROM "invitations" AS i
  WHERE jsonb_typeof(i."config" -> 'events') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(i."config" -> 'events') AS e("item")
      WHERE jsonb_typeof(e."item") = 'object' AND NOT (e."item" ? 'id')
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(i."config" -> 'events') AS e("item")
      WHERE jsonb_typeof(e."item") <> 'object'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(i."config" -> 'events') AS e("item")
      WHERE e."item" ? 'id'
        AND (jsonb_typeof(e."item" -> 'id') <> 'string' OR NOT ((e."item" ->> 'id') ~ '^[a-zA-Z0-9_-]{1,80}$'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(i."config" -> 'events') AS e("item")
      WHERE e."item" ? 'id'
      GROUP BY e."item" ->> 'id'
      HAVING count(*) > 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(i."config" -> 'events') WITH ORDINALITY AS minted("item", "ord")
      JOIN jsonb_array_elements(i."config" -> 'events') AS own("item")
        ON own."item" ? 'id' AND own."item" ->> 'id' = 'ev-' || minted."ord"
      WHERE NOT (minted."item" ? 'id')
    )
),
"keyed" AS (
  SELECT c."id",
         jsonb_agg(
           CASE WHEN e."item" ? 'id' THEN e."item" ELSE e."item" || jsonb_build_object('id', 'ev-' || e."ord") END
           ORDER BY e."ord"
         ) AS "events"
  FROM "candidates" AS c
  JOIN "invitations" AS i ON i."id" = c."id"
  CROSS JOIN LATERAL jsonb_array_elements(i."config" -> 'events') WITH ORDINALITY AS e("item", "ord")
  GROUP BY c."id"
)
UPDATE "invitations" AS i
SET "config" = jsonb_set(i."config", '{events}', k."events") || jsonb_build_object('schemaVersion', 2)
FROM "keyed" AS k
WHERE k."id" = i."id";
