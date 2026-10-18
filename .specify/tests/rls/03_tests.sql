\set QUIET on
\set cg  '{"agency_id":"a1000000-0000-0000-0000-000000000000","role":"caregiver","profile_id":"c1000000-0000-0000-0000-000000000000"}'
\set sup '{"agency_id":"a1000000-0000-0000-0000-000000000000","role":"supervisor","profile_id":"c2000000-0000-0000-0000-000000000000"}'

-- ================= as app_user with no claims =================
SET ROLE app_user;
SELECT check_eq('no claims set: app_user sees no clients', (SELECT count(*) FROM clients), 0);
SELECT check_eq('no claims set: app_user is not trusted', (SELECT count(*) FROM (SELECT 1 WHERE public.is_trusted_server()) x), 0);

-- ================= as caregiver c1 =================
SELECT set_config('app.claims', :'cg', false);

-- 1. Privilege escalation via own profile
SELECT expect('cg cannot add homes to own profile',
  $$UPDATE profiles SET home_ids = '{b1000000-0000-0000-0000-000000000000,b2000000-0000-0000-0000-000000000000}' WHERE id = 'c1000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('cg cannot change own role',
  $$UPDATE profiles SET role = 'admin' WHERE id = 'c1000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('cg can change own name',
  $$UPDATE profiles SET name = 'Cara G.' WHERE id = 'c1000000-0000-0000-0000-000000000000'$$, false);

-- 2. Tenant + home isolation
SELECT check_eq('cg sees only own-home clients', (SELECT count(*) FROM clients), 1);
SELECT check_eq('cg sees no other-agency client', (SELECT count(*) FROM clients WHERE id = 'd3000000-0000-0000-0000-000000000000'), 0);

-- 3. Clock-in verification is server-side
INSERT INTO clock_records (id, agency_id, profile_id, home_id, clock_in_at, clock_in_lat, clock_in_lng, verified, distance_meters)
VALUES ('f1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000',
        'b1000000-0000-0000-0000-000000000000', now(), 40.5, -75.0, true, 0);
SELECT check_eq('far clock-in stored as unverified', (SELECT count(*) FROM clock_records WHERE id = 'f1000000-0000-0000-0000-000000000000' AND NOT verified), 1);
INSERT INTO clock_records (id, agency_id, profile_id, home_id, clock_in_at, clock_in_lat, clock_in_lng)
VALUES ('f2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000',
        'b1000000-0000-0000-0000-000000000000', now(), 40.0005, -75.0);
SELECT check_eq('nearby clock-in verified', (SELECT count(*) FROM clock_records WHERE id = 'f2000000-0000-0000-0000-000000000000' AND verified), 1);
SELECT expect('cg cannot mark own clock-in verified',
  $$UPDATE clock_records SET verified = true, acknowledged = true WHERE id = 'f1000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('cg cannot edit own clock-in time',
  $$UPDATE clock_records SET clock_in_at = now() - interval '3 hours' WHERE id = 'f1000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('cg can clock out',
  $$UPDATE clock_records SET clock_out_at = now() WHERE id = 'f1000000-0000-0000-0000-000000000000'$$, false);
SELECT expect('cg cannot edit closed clock record',
  $$UPDATE clock_records SET clock_out_at = now() + interval '2 hours' WHERE id = 'f1000000-0000-0000-0000-000000000000'$$, true);

-- 4. Forged logs and notifications
SELECT expect('cg cannot write audit_log',
  $$INSERT INTO audit_log (agency_id, table_name, record_id, action) VALUES ('a1000000-0000-0000-0000-000000000000','notes',gen_random_uuid(),'INSERT')$$, true);
SELECT expect('cg cannot write events',
  $$INSERT INTO events (agency_id, event_type) VALUES ('a1000000-0000-0000-0000-000000000000','note.approved')$$, true);
SELECT expect('cg cannot create notifications',
  $$INSERT INTO notifications (agency_id, profile_id, type, title, channel) VALUES ('a1000000-0000-0000-0000-000000000000','c2000000-0000-0000-0000-000000000000','x','x','push')$$, true);

-- 5. Coverage eligibility
UPDATE coverage_candidates SET eligible = true, reply = 'accepted' WHERE id = '92000000-0000-0000-0000-000000000000';
SELECT check_eq('cg cannot make self eligible (0 rows changed)', (SELECT count(*) FROM coverage_candidates WHERE eligible), 0);

-- 6. Note lifecycle (one note per shift)
INSERT INTO notes (id, agency_id, client_id, home_id, author_id, day, shift, type, status, content)
VALUES ('aa000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000',
        'b1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', '2026-10-12', 'am', 'shift', 'draft', '{"activities":"walked"}');
INSERT INTO notes (id, agency_id, client_id, home_id, author_id, day, shift, type, status, content)
VALUES ('ab000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000',
        'b1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', '2026-10-12', 'pm', 'shift', 'draft', '{}');
SELECT expect('cg cannot write note_history',
  $$INSERT INTO note_history (agency_id, note_id, action) VALUES ('a1000000-0000-0000-0000-000000000000','aa000000-0000-0000-0000-000000000000','approved')$$, true);
SELECT check_eq('AM and PM notes both exist for same person/day', (SELECT count(*) FROM notes WHERE client_id = 'd1000000-0000-0000-0000-000000000000'), 2);
SELECT expect('cg cannot self-approve',
  $$UPDATE notes SET status = 'approved' WHERE id = 'aa000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('cg can sign own draft',
  $$UPDATE notes SET status = 'submitted' WHERE id = 'aa000000-0000-0000-0000-000000000000'$$, false);
UPDATE notes SET content = '{"activities":"changed after signing"}' WHERE id = 'aa000000-0000-0000-0000-000000000000';
SELECT check_eq('cg cannot edit after signing (0 rows changed)',
  (SELECT count(*) FROM notes WHERE id = 'aa000000-0000-0000-0000-000000000000' AND content->>'activities' = 'walked'), 1);

-- 7. MAR: twice-daily dose slots, no edits, amendments allowed
INSERT INTO mar_records (id, agency_id, client_id, medication_id, day, scheduled_time, status, recorded_by)
VALUES ('ba000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000',
        'e1000000-0000-0000-0000-000000000000', '2026-10-12', '08:00', 'given', 'c1000000-0000-0000-0000-000000000000');
SELECT expect('cg can record evening dose same day',
  $$INSERT INTO mar_records (agency_id, client_id, medication_id, day, scheduled_time, status, recorded_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000000','2026-10-12','20:00','given','c1000000-0000-0000-0000-000000000000')$$, false);
SELECT expect('duplicate original for same slot rejected',
  $$INSERT INTO mar_records (agency_id, client_id, medication_id, day, scheduled_time, status, recorded_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000000','2026-10-12','08:00','given','c1000000-0000-0000-0000-000000000000')$$, true);
SELECT expect('amendment for same slot allowed',
  $$INSERT INTO mar_records (agency_id, client_id, medication_id, day, scheduled_time, status, recorded_by, amends_id, reason)
    VALUES ('a1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000000','2026-10-12','08:00','refused','c1000000-0000-0000-0000-000000000000','ba000000-0000-0000-0000-000000000000','correction')$$, false);
SELECT check_eq('home_id on MAR derived from client', (SELECT count(*) FROM mar_records WHERE home_id = 'b1000000-0000-0000-0000-000000000000'), 3);

-- 8. Message read receipts: own, on a visible board, permanent
SELECT expect('cg can mark an Oak message read',
  $$INSERT INTO message_reads (id, agency_id, home_id, message_id, profile_id, reader_name)
    VALUES ('f8100000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000000','c1000000-0000-0000-0000-000000000000','Cara Giver')$$, false);
SELECT expect('cg cannot write a receipt for someone else',
  $$INSERT INTO message_reads (agency_id, home_id, message_id, profile_id, reader_name)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000000','c2000000-0000-0000-0000-000000000000','Sue Pervisor')$$, true);
SELECT expect('cg cannot mark another home''s message read',
  $$INSERT INTO message_reads (agency_id, home_id, message_id, profile_id, reader_name)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f9000000-0000-0000-0000-000000000000','c1000000-0000-0000-0000-000000000000','Cara Giver')$$, true);
UPDATE message_reads SET read_at = now() - interval '1 day' WHERE id = 'f8100000-0000-0000-0000-000000000000';
DELETE FROM message_reads WHERE id = 'f8100000-0000-0000-0000-000000000000';
SELECT check_eq('receipts cannot be edited or deleted',
  (SELECT count(*) FROM message_reads WHERE id = 'f8100000-0000-0000-0000-000000000000' AND read_at > now() - interval '1 hour'), 1);

-- 9. Controlled medication count book: own entries, pending witness, permanent
SELECT expect('cg records a count with a pending witness',
  $$INSERT INTO controlled_counts (id, agency_id, home_id, client_id, medication_id, kind, quantity, recorded_by, recorded_by_name, witness_id, witness_name, witness_status)
    VALUES ('fc000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e2000000-0000-0000-0000-000000000000','count',30,'c1000000-0000-0000-0000-000000000000','Cara Giver','c2000000-0000-0000-0000-000000000000','Sue Pervisor','pending')$$, false);
SELECT expect('cg cannot claim the witness already verified',
  $$INSERT INTO controlled_counts (agency_id, home_id, client_id, medication_id, kind, quantity, recorded_by, recorded_by_name, witness_id, witness_name, witness_status)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e2000000-0000-0000-0000-000000000000','count',30,'c1000000-0000-0000-0000-000000000000','Cara Giver','c2000000-0000-0000-0000-000000000000','Sue Pervisor','verified')$$, true);
SELECT expect('cg cannot witness their own entry',
  $$INSERT INTO controlled_counts (agency_id, home_id, client_id, medication_id, kind, quantity, recorded_by, recorded_by_name, witness_id, witness_name, witness_status)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e2000000-0000-0000-0000-000000000000','count',30,'c1000000-0000-0000-0000-000000000000','Cara Giver','c1000000-0000-0000-0000-000000000000','Cara Giver','pending')$$, true);
SELECT expect('count book entries only for controlled medications',
  $$INSERT INTO controlled_counts (agency_id, home_id, client_id, medication_id, kind, quantity, recorded_by, recorded_by_name)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000000','count',30,'c1000000-0000-0000-0000-000000000000','Cara Giver')$$, true);
UPDATE controlled_counts SET witness_status = 'verified' WHERE id = 'fc000000-0000-0000-0000-000000000000';
DELETE FROM controlled_counts WHERE id = 'fc000000-0000-0000-0000-000000000000';
SELECT check_eq('only the named witness countersigns; nobody deletes',
  (SELECT count(*) FROM controlled_counts WHERE id = 'fc000000-0000-0000-0000-000000000000' AND witness_status = 'pending'), 1);

-- 10. A message may name a person from the same home only
SELECT expect('cg posts a message about a person at Oak',
  $$INSERT INTO messages (agency_id, home_id, client_id, from_name, body, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','d1000000-0000-0000-0000-000000000000','Cara Giver','Ate well','c1000000-0000-0000-0000-000000000000')$$, false);
SELECT expect('cg cannot name a person from another home',
  $$INSERT INTO messages (agency_id, home_id, client_id, from_name, body, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','d2000000-0000-0000-0000-000000000000','Cara Giver','Wrong home','c1000000-0000-0000-0000-000000000000')$$, true);

-- 11. Threads: a reply joins a thread on the same board; incidents from the same home
SELECT expect('cg replies to an Oak message',
  $$INSERT INTO messages (id, agency_id, home_id, reply_to, from_name, body, created_by)
    VALUES ('f8200000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000000','Cara Giver','Will do','c1000000-0000-0000-0000-000000000000')$$, false);
SELECT expect('a reply must be on the thread''s own board',
  $$INSERT INTO messages (agency_id, home_id, reply_to, from_name, body, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f9000000-0000-0000-0000-000000000000','Cara Giver','Wrong board','c1000000-0000-0000-0000-000000000000')$$, true);
SELECT expect('a reply points at the first message, not another reply',
  $$INSERT INTO messages (agency_id, home_id, reply_to, from_name, body, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f8200000-0000-0000-0000-000000000000','Cara Giver','Nested','c1000000-0000-0000-0000-000000000000')$$, true);
SELECT expect('a thread cannot name an unknown incident',
  $$INSERT INTO messages (agency_id, home_id, incident_id, from_name, body, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','f8300000-0000-0000-0000-000000000000','Cara Giver','Follow-up','c1000000-0000-0000-0000-000000000000')$$, true);

-- ================= as supervisor c2 =================
SELECT set_config('app.claims', :'sup', false);
SELECT expect('sup cannot rewrite caregiver note content',
  $$UPDATE notes SET content = '{"activities":"rewritten"}' WHERE id = 'aa000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('sup cannot send back without comment',
  $$UPDATE notes SET status = 'returned' WHERE id = 'aa000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('sup can approve',
  $$UPDATE notes SET status = 'approved' WHERE id = 'aa000000-0000-0000-0000-000000000000'$$, false);
SELECT expect('approved note is final',
  $$UPDATE notes SET status = 'returned', supervisor_comment = 'x' WHERE id = 'aa000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('sup cannot change a given dose',
  $$UPDATE mar_records SET status = 'refused' WHERE id = 'ba000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('sup can acknowledge a dose',
  $$UPDATE mar_records SET acknowledged = true WHERE id = 'ba000000-0000-0000-0000-000000000000'$$, false);
SELECT expect('nobody can delete a MAR record',
  $$DELETE FROM mar_records WHERE id = 'ba000000-0000-0000-0000-000000000000'$$, false);
SELECT check_eq('MAR record still there after delete attempt', (SELECT count(*) FROM mar_records WHERE id = 'ba000000-0000-0000-0000-000000000000'), 1);

SELECT expect('a receipt must be on the message''s own board',
  $$INSERT INTO message_reads (agency_id, home_id, message_id, profile_id, reader_name)
    VALUES ('a1000000-0000-0000-0000-000000000000','b2000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000000','c2000000-0000-0000-0000-000000000000','Sue Pervisor')$$, true);
SELECT check_eq('sup sees receipts on boards they supervise', (SELECT count(*) FROM message_reads), 1);

SELECT expect('the witness cannot change the counted amount',
  $$UPDATE controlled_counts SET quantity = 1, witness_status = 'verified' WHERE id = 'fc000000-0000-0000-0000-000000000000'$$, true);
SELECT expect('the named witness countersigns',
  $$UPDATE controlled_counts SET witness_status = 'verified', witnessed_at = now() WHERE id = 'fc000000-0000-0000-0000-000000000000'$$, false);
SELECT expect('a countersigned entry is final',
  $$UPDATE controlled_counts SET witness_status = 'pending' WHERE id = 'fc000000-0000-0000-0000-000000000000'$$, false);
SELECT check_eq('countersigned once and still verified',
  (SELECT count(*) FROM controlled_counts WHERE id = 'fc000000-0000-0000-0000-000000000000' AND witness_status = 'verified'), 1);

RESET ROLE;
SELECT check_eq('note history written by trigger (created x2, signed, approved)', (SELECT count(*) FROM note_history), 4);
SELECT check_eq('audit rows attribute note inserts to the caregiver',
  (SELECT count(*) FROM audit_log WHERE table_name = 'notes' AND action = 'INSERT' AND performed_by = 'c1000000-0000-0000-0000-000000000000'), 2);
SELECT check_eq('audit rows attribute approval to the supervisor',
  (SELECT count(*) FROM audit_log WHERE table_name = 'notes' AND action = 'UPDATE' AND performed_by = 'c2000000-0000-0000-0000-000000000000'), 1);
