-- Consistency snapshot of the spike's fake guests (session 09). Read-only; run after each scenario by run-spike.sh.
-- Keeps the quantities the s08 notes mixed up apart: unique guests, view events (and duplicates the 30-minute dedupe
-- should have prevented), opened counters, RSVP events (one per accepted write, repeats included), confirmed guests,
-- and the allowance column that an RSVP currently overwrites.
WITH inv AS (SELECT id FROM invitations WHERE slug = 'budi-sari'),
g AS (SELECT * FROM guests WHERE invitation_id = (SELECT id FROM inv) AND slug LIKE 'tamu-%'),
v AS (
  SELECT guest_id, count(*) AS n FROM analytics_events
  WHERE invitation_id = (SELECT id FROM inv) AND event_type = 'VIEW' AND guest_id IN (SELECT id FROM g)
  GROUP BY guest_id
),
r AS (
  SELECT guest_id, count(*) AS n FROM analytics_events
  WHERE invitation_id = (SELECT id FROM inv) AND event_type = 'RSVP' AND guest_id IN (SELECT id FROM g)
  GROUP BY guest_id
)
SELECT json_build_object(
  'guests', (SELECT count(*) FROM g),
  'view_events', COALESCE((SELECT sum(n) FROM v), 0),
  'guests_with_view', (SELECT count(*) FROM v),
  'duplicate_view_events', COALESCE((SELECT sum(n - 1) FROM v WHERE n > 1), 0),
  'guests_with_duplicate_views', (SELECT count(*) FROM v WHERE n > 1),
  'opened_count_sum', (SELECT COALESCE(sum(opened_count), 0) FROM g),
  'rsvp_events', COALESCE((SELECT sum(n) FROM r), 0),
  'guests_with_rsvp_event', (SELECT count(*) FROM r),
  'confirmed_guests', (SELECT count(*) FROM g WHERE rsvp_status = 'CONFIRMED'),
  'allowance_2', (SELECT count(*) FROM g WHERE guest_count = 2),
  'allowance_1', (SELECT count(*) FROM g WHERE guest_count = 1),
  'allowance_other', (SELECT count(*) FROM g WHERE guest_count NOT IN (1, 2)),
  'spike_wishes', (SELECT count(*) FROM guest_messages WHERE invitation_id = (SELECT id FROM inv) AND name LIKE 'Tamu Uji %')
);
