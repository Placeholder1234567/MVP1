GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_service;
REVOKE DELETE, TRUNCATE ON public.audit_log FROM app_user;

-- Agency 1: homes b1, b2. Agency 2: home b3.
INSERT INTO agencies (id, name, slug) VALUES
  ('a1000000-0000-0000-0000-000000000000', 'Agency One', 'one'),
  ('a2000000-0000-0000-0000-000000000000', 'Agency Two', 'two');
INSERT INTO homes (id, agency_id, name, lat, lng, radius) VALUES
  ('b1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'Oak',   40.0, -75.0, 150),
  ('b2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'Maple', 41.0, -75.0, 150),
  ('b3000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'Pine',  42.0, -75.0, 150);

-- c1 caregiver at Oak (med-certified), c2 supervisor, c4 caregiver in agency 2
INSERT INTO profiles (id, agency_id, auth_uid, email, name, role, home_ids, med_certified) VALUES
  ('c1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', gen_random_uuid()::text, 'cg@one.test',  'Cara Giver', 'caregiver',  '{b1000000-0000-0000-0000-000000000000}', true),
  ('c2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', gen_random_uuid()::text, 'sup@one.test', 'Sue Pervisor', 'supervisor', '{b1000000-0000-0000-0000-000000000000,b2000000-0000-0000-0000-000000000000}', false),
  ('c4000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', gen_random_uuid()::text, 'cg@two.test',  'Other Agency', 'caregiver',  '{b3000000-0000-0000-0000-000000000000}', true);

-- d1 at Oak, d2 at Maple (agency 1), d3 at Pine (agency 2)
INSERT INTO clients (id, agency_id, home_id, name) VALUES
  ('d1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'Person Oak'),
  ('d2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000', 'Person Maple'),
  ('d3000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'b3000000-0000-0000-0000-000000000000', 'Person Pine');

INSERT INTO medications (id, agency_id, client_id, name, scheduled_times) VALUES
  ('e1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 'Med A', '{08:00,20:00}');
INSERT INTO medications (id, agency_id, client_id, name, prn_instructions, controlled, controlled_schedule) VALUES
  ('e2000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 'Med C', 'PRN', true, 'II');

INSERT INTO coverage_requests (id, agency_id, home_id, day, shift) VALUES
  ('91000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', '2026-10-13', 'pm');
INSERT INTO coverage_candidates (id, agency_id, coverage_request_id, profile_id, eligible) VALUES
  ('92000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', false);

-- Board messages from the supervisor: f8 at Oak, f9 at Maple.
INSERT INTO messages (id, agency_id, home_id, from_name, body, created_by) VALUES
  ('f8000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'Sue Pervisor', 'Oak note', 'c2000000-0000-0000-0000-000000000000'),
  ('f9000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000', 'Sue Pervisor', 'Maple note', 'c2000000-0000-0000-0000-000000000000');

-- Test helper: runs a statement as the current (non-superuser) role and
-- reports whether it was allowed.
CREATE FUNCTION expect(name text, stmt text, should_fail boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    IF should_fail THEN RAISE NOTICE 'FAIL  % (was allowed)', name;
    ELSE RAISE NOTICE 'PASS  %', name; END IF;
  EXCEPTION WHEN OTHERS THEN
    IF should_fail THEN RAISE NOTICE 'PASS  % (blocked: %)', name, SQLERRM;
    ELSE RAISE NOTICE 'FAIL  % (blocked: %)', name, SQLERRM; END IF;
  END;
END $$;
GRANT EXECUTE ON FUNCTION expect(text, text, boolean) TO app_user;

CREATE FUNCTION check_eq(name text, got bigint, want bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got = want THEN RAISE NOTICE 'PASS  % (=%)', name, got;
  ELSE RAISE NOTICE 'FAIL  % (got %, want %)', name, got, want; END IF;
END $$;
GRANT EXECUTE ON FUNCTION check_eq(text, bigint, bigint) TO app_user;
