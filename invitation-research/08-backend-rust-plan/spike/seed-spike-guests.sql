-- Fake data for the brief 03 §18 spike (local throwaway database only; never run against production).
-- 300 guests tamu-001 ... tamu-300 (allowance 2) and 120 visible wishes on the fixture invitation `budi-sari`,
-- so the guest page reads 50 wishes + a count like a busy real invitation. Idempotent: re-running resets them.
BEGIN;
DELETE FROM analytics_events WHERE invitation_id = (SELECT id FROM invitations WHERE slug = 'budi-sari')
  AND guest_id IN (SELECT id FROM guests WHERE slug LIKE 'tamu-%');
DELETE FROM guest_messages WHERE invitation_id = (SELECT id FROM invitations WHERE slug = 'budi-sari') AND name LIKE 'Tamu Uji %';
DELETE FROM guests WHERE invitation_id = (SELECT id FROM invitations WHERE slug = 'budi-sari') AND slug LIKE 'tamu-%';

INSERT INTO guests (invitation_id, name, slug, guest_count)
SELECT i.id, 'Tamu Uji ' || lpad(n::text, 3, '0'), 'tamu-' || lpad(n::text, 3, '0'), 2
FROM invitations i, generate_series(1, 300) AS n
WHERE i.slug = 'budi-sari';

INSERT INTO guest_messages (invitation_id, guest_id, name, message, is_hidden, created_at)
SELECT g.invitation_id, g.id, g.name, 'Selamat menempuh hidup baru, semoga bahagia selalu. Ucapan uji nomor ' || g.slug, false,
       now() - (n || ' minutes')::interval
FROM guests g JOIN invitations i ON i.id = g.invitation_id, generate_series(1, 120) AS n
WHERE i.slug = 'budi-sari' AND g.slug = 'tamu-' || lpad(n::text, 3, '0');
COMMIT;

SELECT (SELECT count(*) FROM guests WHERE slug LIKE 'tamu-%') AS spike_guests,
       (SELECT count(*) FROM guest_messages WHERE name LIKE 'Tamu Uji %') AS spike_wishes;
