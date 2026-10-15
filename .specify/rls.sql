-- =============================================================================
-- Guad — Row-Level Security Policies
-- =============================================================================
-- Every table uses agency_id for tenant isolation.
-- Clients never connect to Postgres. The app server verifies the user's
-- Identity Platform ID token, looks up their profile, and at the start of each
-- transaction runs:
--   SET LOCAL ROLE app_user;
--   SELECT set_config('app.claims',  '{"agency_id":..,"role":..,"profile_id":..}', true);
--   SELECT set_config('app.request', '{"ip":..,"user_agent":..}', true);
-- Every policy below reads those claims through app.claims().
-- Caregiver access is further scoped to their assigned home_ids.
-- Supervisors and admins have full access within their agency.
-- audit_log is append-only: written only by the audit_row_change trigger;
-- no client INSERT, UPDATE or DELETE.
-- =============================================================================

-- ─── Roles and session claims ───────────────────────────────────────────────
-- app_user:    RLS applies. The server switches to it for every request made
--              on behalf of a signed-in user.
-- app_service: bypasses RLS. Used only by job handlers and the specific
--              cross-user writes listed at the end of this file.
-- The server's login role is granted both and owns no PHI privileges itself.
DO $$ BEGIN CREATE ROLE app_user NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE app_service NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app, public TO app_user, app_service;

-- Claims the server set for this transaction (NULL when none were set, in
-- which case every policy below matches no rows).
CREATE OR REPLACE FUNCTION app.claims()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.claims', true), '')::jsonb;
$$;

-- ─── Helper Functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (app.claims()->>'agency_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app.claims()->>'role';
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (app.claims()->>'profile_id')::uuid;
$$;

-- Get the current user's assigned home_ids from their profile
CREATE OR REPLACE FUNCTION public.current_user_home_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(home_ids, '{}')
  FROM public.profiles
  WHERE id = public.current_profile_id()
    AND active = true;
$$;

-- Check if user is at least supervisor (supervisor or admin)
CREATE OR REPLACE FUNCTION public.is_supervisor_or_above()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('supervisor', 'admin');
$$;

-- Prevent UPDATE and DELETE on audit_log (trigger-based tamper protection)
CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable — UPDATE and DELETE are prohibited';
  RETURN NULL;
END;
$$;


-- =============================================================================
-- 1. agencies
-- =============================================================================
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY agencies_select ON public.agencies
  FOR SELECT USING (id = public.current_agency_id());

CREATE POLICY agencies_update ON public.agencies
  FOR UPDATE USING (
    id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- No INSERT or DELETE — agencies are provisioned by the platform, not by users.


-- =============================================================================
-- 2. profiles
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_ids && public.current_user_home_ids()  -- array overlap
      OR id = public.current_profile_id()             -- always see own profile
    )
  );

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- Users can update their own profile, but only name/phone/avatar. RLS cannot
-- restrict columns, so profiles_protect_privileged_columns (see "Integrity
-- triggers" below) rejects any non-admin change to role, home_ids,
-- med_certified, active, mfa_enabled, email, auth_uid or agency_id.
-- Without that trigger a caregiver could add every home to home_ids (and so
-- read every client) or mark themselves med-certified.
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR id = public.current_profile_id()  -- users can update own profile
    )
  )
  WITH CHECK (agency_id = public.current_agency_id());

CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 3. homes
-- =============================================================================
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;

CREATE POLICY homes_select ON public.homes
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY homes_insert ON public.homes
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY homes_update ON public.homes
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY homes_delete ON public.homes
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 4. clients
-- =============================================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY clients_insert ON public.clients
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY clients_update ON public.clients
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY clients_delete ON public.clients
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 5. client_health_info
-- =============================================================================
ALTER TABLE public.client_health_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_health_info_select ON public.client_health_info
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_health_info.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY client_health_info_insert ON public.client_health_info
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY client_health_info_update ON public.client_health_info
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY client_health_info_delete ON public.client_health_info
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 6. goals
-- =============================================================================
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_select ON public.goals
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = goals.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY goals_insert ON public.goals
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY goals_update ON public.goals
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY goals_delete ON public.goals
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 7. goal_templates
-- =============================================================================
ALTER TABLE public.goal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_templates_select ON public.goal_templates
  FOR SELECT USING (agency_id = public.current_agency_id());

CREATE POLICY goal_templates_insert ON public.goal_templates
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY goal_templates_update ON public.goal_templates
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY goal_templates_delete ON public.goal_templates
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 8. medications
-- =============================================================================
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY medications_select ON public.medications
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = medications.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY medications_insert ON public.medications
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY medications_update ON public.medications
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY medications_delete ON public.medications
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 9. medication_history
-- =============================================================================
ALTER TABLE public.medication_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY medication_history_select ON public.medication_history
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.medications m
        JOIN public.clients c ON c.id = m.client_id
        WHERE m.id = medication_history.medication_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY medication_history_insert ON public.medication_history
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY medication_history_update ON public.medication_history
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY medication_history_delete ON public.medication_history
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 10. notes
-- =============================================================================
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- All agency users can read notes scoped to their access level
CREATE POLICY notes_select ON public.notes
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

-- Caregivers create notes for their assigned homes; supervisors/admins for any home
CREATE POLICY notes_insert ON public.notes
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        home_id = ANY(public.current_user_home_ids())
        AND author_id = public.current_profile_id()
      )
    )
  );

-- Caregivers can edit their own draft/returned notes in assigned homes and
-- sign them (new status 'submitted'). Without a separate WITH CHECK, Postgres
-- re-applies USING to the new row, which would block signing. Which status
-- transitions are legal for which role is enforced by notes_enforce_transition.
CREATE POLICY notes_update ON public.notes
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND status IN ('draft', 'returned')
        AND home_id = ANY(public.current_user_home_ids())
      )
    )
  )
  WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND status IN ('draft', 'returned', 'submitted')
        AND home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY notes_delete ON public.notes
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 11. note_goals
-- =============================================================================
ALTER TABLE public.note_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY note_goals_select ON public.note_goals
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_goals.note_id
          AND n.author_id = public.current_profile_id()
          AND n.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY note_goals_insert ON public.note_goals
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_goals.note_id
          AND n.author_id = public.current_profile_id()
      )
    )
  );

CREATE POLICY note_goals_update ON public.note_goals
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_goals.note_id
          AND n.author_id = public.current_profile_id()
          AND n.status IN ('draft', 'returned')
      )
    )
  );

CREATE POLICY note_goals_delete ON public.note_goals
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 12. note_history
-- =============================================================================
ALTER TABLE public.note_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY note_history_select ON public.note_history
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_history.note_id
          AND n.author_id = public.current_profile_id()
          AND n.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

-- No INSERT, UPDATE or DELETE policy: clients cannot write note_history at all.
-- Rows are written only by the notes_write_history trigger (SECURITY DEFINER,
-- see "Integrity triggers"), so a caregiver cannot forge "Approved by ..." rows.


-- =============================================================================
-- 13. incidents
-- =============================================================================
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY incidents_select ON public.incidents
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = incidents.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY incidents_insert ON public.incidents
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = incidents.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY incidents_update ON public.incidents
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND status = 'open'
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = incidents.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY incidents_delete ON public.incidents
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 14. mar_records
-- =============================================================================
ALTER TABLE public.mar_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY mar_records_select ON public.mar_records
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = mar_records.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

-- Caregivers must be med_certified to record MAR entries
CREATE POLICY mar_records_insert ON public.mar_records
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        recorded_by = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = public.current_profile_id()
            AND p.med_certified = true
        )
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = mar_records.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

-- MAR records are irrevocable. Supervisors may set `acknowledged` (and caregivers
-- `effect` on their own PRN doses, via the server); mar_records_immutable rejects
-- every other column change. Corrections are new rows with amends_id set.
CREATE POLICY mar_records_update ON public.mar_records
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

-- No DELETE policy — MAR records are never deleted.


-- =============================================================================
-- 15. health_entries
-- =============================================================================
ALTER TABLE public.health_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_entries_select ON public.health_entries
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = health_entries.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY health_entries_insert ON public.health_entries
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        recorded_by = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = health_entries.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY health_entries_update ON public.health_entries
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY health_entries_delete ON public.health_entries
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 16. attendance
-- =============================================================================
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_select ON public.attendance
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = attendance.client_id
          AND c.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY attendance_insert ON public.attendance
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        recorded_by = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = attendance.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY attendance_update ON public.attendance
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY attendance_delete ON public.attendance
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 17. messages
-- =============================================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON public.messages
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
    AND created_by = public.current_profile_id()
  );

CREATE POLICY messages_update ON public.messages
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY messages_delete ON public.messages
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 18. coverage_requests
-- =============================================================================
ALTER TABLE public.coverage_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY coverage_requests_select ON public.coverage_requests
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY coverage_requests_insert ON public.coverage_requests
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        called_out_by = public.current_profile_id()
        AND home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY coverage_requests_update ON public.coverage_requests
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY coverage_requests_delete ON public.coverage_requests
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 19. coverage_candidates
-- =============================================================================
ALTER TABLE public.coverage_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY coverage_candidates_select ON public.coverage_candidates
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY coverage_candidates_insert ON public.coverage_candidates
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

-- Supervisors only. Caregivers reply through coverage.accept / coverage.decline
-- (or an SMS reply), which run on the server and also fill the schedule
-- slot. A direct caregiver UPDATE would let someone mark themselves eligible.
CREATE POLICY coverage_candidates_update ON public.coverage_candidates
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY coverage_candidates_delete ON public.coverage_candidates
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 20. coverage_steps
-- =============================================================================
ALTER TABLE public.coverage_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY coverage_steps_select ON public.coverage_steps
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR EXISTS (
        SELECT 1 FROM public.coverage_requests cr
        WHERE cr.id = coverage_steps.coverage_request_id
          AND cr.home_id = ANY(public.current_user_home_ids())
      )
    )
  );

CREATE POLICY coverage_steps_insert ON public.coverage_steps
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

-- No UPDATE or DELETE — coverage steps are an audit trail of the coverage process.


-- =============================================================================
-- 21. clock_records
-- =============================================================================
ALTER TABLE public.clock_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY clock_records_select ON public.clock_records
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY clock_records_insert ON public.clock_records
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        profile_id = public.current_profile_id()
        AND home_id = ANY(public.current_user_home_ids())
      )
    )
  );

-- Caregivers can update their own records only to clock out; supervisors can
-- override. clock_records_verify recomputes distance_meters and verified on the
-- server from the home's coordinates (client values are ignored), and
-- clock_records_caregiver_columns stops caregivers changing anything except
-- clock_out_at/lat/lng on an open record. Otherwise a caregiver could mark an
-- out-of-area clock-in as verified, or edit their hours.
CREATE POLICY clock_records_update ON public.clock_records
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY clock_records_delete ON public.clock_records
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 22. schedule_slots
-- =============================================================================
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_slots_select ON public.schedule_slots
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY schedule_slots_insert ON public.schedule_slots
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY schedule_slots_update ON public.schedule_slots
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY schedule_slots_delete ON public.schedule_slots
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 23. events
-- =============================================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select ON public.events
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

-- No INSERT, UPDATE or DELETE policy: events are written only by the server
-- (Audit Service emitEvent() as app_service) and are an immutable log.


-- =============================================================================
-- 24. audit_log (APPEND-ONLY — no UPDATE or DELETE policies)
-- =============================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only supervisors and admins can read audit logs
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

-- Explicitly: NO INSERT, UPDATE or DELETE policy. Audit rows are written only by
-- the audit_row_change trigger (SECURITY DEFINER) attached to every audited
-- table, so performed_by always comes from the real session and cannot be forged.
-- Additional tamper protection via trigger:
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

-- Belt-and-suspenders: revoke DELETE and TRUNCATE at the role level
REVOKE DELETE, TRUNCATE ON public.audit_log FROM app_user;


-- =============================================================================
-- 25. notifications
-- =============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR profile_id = public.current_profile_id()
    )
  );

-- No INSERT policy: notifications are created only by the Notification Service
-- (app_service). Otherwise any user could send alerts to anyone in the agency.

-- Users can mark their own notifications as read; admins restricted to own as well
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 26. notification_preferences
-- =============================================================================
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_select ON public.notification_preferences
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY notification_preferences_insert ON public.notification_preferences
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY notification_preferences_update ON public.notification_preferences
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY notification_preferences_delete ON public.notification_preferences
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 27. sync_checkpoints
-- =============================================================================
ALTER TABLE public.sync_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_checkpoints_select ON public.sync_checkpoints
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR profile_id = public.current_profile_id()
    )
  );

CREATE POLICY sync_checkpoints_insert ON public.sync_checkpoints
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      profile_id = public.current_profile_id()
      OR public.current_user_role() = 'admin'
    )
  );

-- Users can only update their own checkpoints; admins can update any within agency
CREATE POLICY sync_checkpoints_update ON public.sync_checkpoints
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      profile_id = public.current_profile_id()
      OR public.current_user_role() = 'admin'
    )
  );

CREATE POLICY sync_checkpoints_delete ON public.sync_checkpoints
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND (
      profile_id = public.current_profile_id()
      OR public.current_user_role() = 'admin'
    )
  );


-- =============================================================================
-- 28. case_notes
-- =============================================================================
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_notes_select ON public.case_notes
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = case_notes.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY case_notes_insert ON public.case_notes
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = case_notes.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY case_notes_update ON public.case_notes
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR (
        author_id = public.current_profile_id()
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = case_notes.client_id
            AND c.home_id = ANY(public.current_user_home_ids())
        )
      )
    )
  );

CREATE POLICY case_notes_delete ON public.case_notes
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 29. referrals
-- =============================================================================
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Referrals contain prospective client PHI — restricted to supervisors and admins
CREATE POLICY referrals_select ON public.referrals
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY referrals_insert ON public.referrals
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY referrals_update ON public.referrals
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY referrals_delete ON public.referrals
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );


-- =============================================================================
-- 30. rooms
-- =============================================================================
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_select ON public.rooms
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

CREATE POLICY rooms_insert ON public.rooms
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY rooms_update ON public.rooms
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

CREATE POLICY rooms_delete ON public.rooms
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );



-- =============================================================================
-- 31-37. Supporting tables
-- =============================================================================

-- device_tokens: own rows only. Written by the app (register/refresh token).
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_tokens_select ON public.device_tokens
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

CREATE POLICY device_tokens_insert ON public.device_tokens
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

CREATE POLICY device_tokens_update ON public.device_tokens
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

CREATE POLICY device_tokens_delete ON public.device_tokens
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

-- email_suppressions: admins can read and remove; rows are added by the
-- Notification Service (app_service) from SES bounce notifications.
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_suppressions_select ON public.email_suppressions
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY email_suppressions_delete ON public.email_suppressions
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- user_settings: own row only.
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON public.user_settings
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

CREATE POLICY user_settings_insert ON public.user_settings
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

CREATE POLICY user_settings_update ON public.user_settings
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

-- api_keys, webhooks, webhook_deliveries: admin only. key_hash and
-- secret_hash are never returned by tRPC; the plaintext is shown once.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_select ON public.api_keys
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY api_keys_insert ON public.api_keys
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- Keys are revoked (revoked_at set), never deleted, so access history stays auditable.
CREATE POLICY api_keys_update ON public.api_keys
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhooks_select ON public.webhooks
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY webhooks_insert ON public.webhooks
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY webhooks_update ON public.webhooks
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY webhooks_delete ON public.webhooks
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- Deliveries are written by the webhook job handler (app_service).
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_select ON public.webhook_deliveries
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- report_jobs: supervisors see their agency's jobs. Created and updated by
-- the Report Service (app_service) so status can't be faked.
ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_jobs_select ON public.report_jobs
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

-- device_keys: no policies at all. Only the Device Service (app_service)
-- reads or writes them; no user, not even an admin, can read a key through
-- their own session.
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- Integrity triggers
-- =============================================================================
-- RLS decides which rows a user can touch; it cannot decide which columns or
-- which state transitions. These triggers close that gap. They skip checks for
-- trusted server work (any role other than app_user, e.g. app_service job
-- handlers or migrations), which runs business logic already validated in the
-- services. The check reads the SET ROLE setting rather than current_user,
-- because current_user changes inside SECURITY DEFINER functions.
-- Writes from devices reach Postgres only through tRPC (see offline-sync.md §3),
-- so these triggers are a backstop, not the primary validation.

CREATE OR REPLACE FUNCTION public.is_trusted_server()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT current_setting('role') IS DISTINCT FROM 'app_user';
$$;

-- ─── profiles: privileged columns are admin-only ────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trusted_server() OR public.current_user_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.home_ids IS DISTINCT FROM OLD.home_ids
     OR NEW.med_certified IS DISTINCT FROM OLD.med_certified
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.auth_uid IS DISTINCT FROM OLD.auth_uid
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'Only an admin can change role, homes, certification or account status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_privileged_columns();

-- ─── notes: legal status transitions, no supervisor edits to content ────────
--   caregiver (author): draft -> draft | submitted, returned -> returned | submitted
--   supervisor:         submitted -> approved | returned (comment required)
--   approved is final for everyone except trusted server code.
CREATE OR REPLACE FUNCTION public.notes_enforce_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trusted_server() THEN
    RETURN NEW;
  END IF;
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.home_id IS DISTINCT FROM OLD.home_id
     OR NEW.day IS DISTINCT FROM OLD.day
     OR NEW.shift IS DISTINCT FROM OLD.shift
     OR NEW.type IS DISTINCT FROM OLD.type
     OR (OLD.lomi_drafted AND NOT NEW.lomi_drafted) THEN
    RAISE EXCEPTION 'Note identity fields cannot change' USING ERRCODE = '42501';
  END IF;

  IF public.is_supervisor_or_above() AND OLD.author_id IS DISTINCT FROM public.current_profile_id() THEN
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION 'Supervisors cannot edit a note they did not write; send it back instead'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (OLD.status = 'submitted' AND NEW.status IN ('approved', 'returned'))
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Invalid note status change' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'returned' AND coalesce(trim(NEW.supervisor_comment), '') = '' THEN
      RAISE EXCEPTION 'A comment is required to send a note back' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Author path
  IF NOT (
       (OLD.status = 'draft' AND NEW.status IN ('draft', 'submitted'))
    OR (OLD.status = 'returned' AND NEW.status IN ('returned', 'submitted'))
  ) THEN
    RAISE EXCEPTION 'Invalid note status change' USING ERRCODE = '42501';
  END IF;
  IF NEW.supervisor_comment IS DISTINCT FROM OLD.supervisor_comment THEN
    RAISE EXCEPTION 'Only a supervisor can set the review comment' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notes_enforce_transition
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_enforce_transition();

-- ─── notes: history is written by the database, never by clients ────────────
CREATE OR REPLACE FUNCTION public.notes_write_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who text;
  what text;
BEGIN
  SELECT name INTO who FROM public.profiles WHERE id = public.current_profile_id();
  IF TG_OP = 'INSERT' THEN
    what := CASE WHEN NEW.lomi_drafted THEN 'created (drafted with Lomi)' ELSE 'created' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    what := CASE NEW.status
      WHEN 'submitted' THEN CASE WHEN OLD.status = 'returned' THEN 'amended and resubmitted' ELSE 'signed' END
      WHEN 'approved'  THEN 'approved'
      WHEN 'returned'  THEN 'returned'
      ELSE NEW.status::text END;
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    what := 'edited';
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.note_history (agency_id, note_id, action, by_name)
  VALUES (NEW.agency_id, NEW.id, what, coalesce(who, 'system'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER notes_write_history
  AFTER INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_write_history();

-- ─── mar_records: irrevocable ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mar_records_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MAR records cannot be deleted; record an amendment' USING ERRCODE = '42501';
  END IF;
  IF public.is_trusted_server() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'acknowledged' - 'effect' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'acknowledged' - 'effect' - 'updated_at') THEN
    RAISE EXCEPTION 'MAR records cannot be changed; record an amendment' USING ERRCODE = '42501';
  END IF;
  IF NEW.effect IS DISTINCT FROM OLD.effect AND (NOT OLD.is_prn OR OLD.effect IS NOT NULL) THEN
    RAISE EXCEPTION 'Effect can be recorded once, on as-needed doses only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mar_records_immutable
  BEFORE UPDATE OR DELETE ON public.mar_records
  FOR EACH ROW EXECUTE FUNCTION public.mar_records_immutable();

-- ─── clock_records: the server decides whether a clock-in is verified ───────
CREATE OR REPLACE FUNCTION public.clock_records_verify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h record;
  d double precision;
BEGIN
  SELECT lat, lng, radius INTO h FROM public.homes WHERE id = NEW.home_id;
  IF NEW.clock_in_lat IS NULL OR NEW.clock_in_lng IS NULL OR h.lat IS NULL OR h.lng IS NULL THEN
    NEW.distance_meters := NULL;
    NEW.verified := false;
  ELSE
    -- Haversine distance in meters (same formula as the MVP's src/geo.js)
    d := 2 * 6371000 * asin(sqrt(
           power(sin(radians(h.lat - NEW.clock_in_lat) / 2), 2) +
           cos(radians(NEW.clock_in_lat)) * cos(radians(h.lat)) *
           power(sin(radians(h.lng - NEW.clock_in_lng) / 2), 2)));
    NEW.distance_meters := round(d);
    NEW.verified := d <= coalesce(h.radius, 150);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clock_records_verify
  BEFORE INSERT OR UPDATE OF clock_in_lat, clock_in_lng, home_id, verified, distance_meters
  ON public.clock_records
  FOR EACH ROW EXECUTE FUNCTION public.clock_records_verify();

CREATE OR REPLACE FUNCTION public.clock_records_caregiver_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trusted_server() OR public.is_supervisor_or_above() THEN
    RETURN NEW;
  END IF;
  IF OLD.clock_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'This clock record is closed; ask a supervisor to correct it' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - 'clock_out_at' - 'clock_out_lat' - 'clock_out_lng' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'clock_out_at' - 'clock_out_lat' - 'clock_out_lng' - 'updated_at') THEN
    RAISE EXCEPTION 'Only clock-out can be recorded on your own clock record' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clock_records_caregiver_columns
  BEFORE UPDATE ON public.clock_records
  FOR EACH ROW EXECUTE FUNCTION public.clock_records_caregiver_columns();

-- ─── Denormalized home_id: always derived, never trusted from the client ─────
CREATE OR REPLACE FUNCTION public.set_home_id_from_client()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT home_id INTO NEW.home_id FROM public.clients WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_health_info', 'goals', 'medications', 'mar_records',
                           'health_entries', 'attendance', 'incidents', 'notes'] LOOP
    EXECUTE format('CREATE TRIGGER %I_set_home_id BEFORE INSERT ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.set_home_id_from_client()', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.note_goals_set_home_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT home_id INTO NEW.home_id FROM public.notes WHERE id = NEW.note_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER note_goals_set_home_id
  BEFORE INSERT ON public.note_goals
  FOR EACH ROW EXECUTE FUNCTION public.note_goals_set_home_id();

CREATE OR REPLACE FUNCTION public.coverage_steps_set_home_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT home_id INTO NEW.home_id FROM public.coverage_requests WHERE id = NEW.coverage_request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coverage_steps_set_home_id
  BEFORE INSERT ON public.coverage_steps
  FOR EACH ROW EXECUTE FUNCTION public.coverage_steps_set_home_id();

-- When a person moves homes, their reference data and recent records follow
-- them so the new home's caregivers can see them offline. Notes and incidents
-- keep the home they were written at.
CREATE OR REPLACE FUNCTION public.clients_home_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_health_info SET home_id = NEW.home_id WHERE client_id = NEW.id;
  UPDATE public.goals             SET home_id = NEW.home_id WHERE client_id = NEW.id;
  UPDATE public.medications       SET home_id = NEW.home_id WHERE client_id = NEW.id;
  UPDATE public.mar_records       SET home_id = NEW.home_id WHERE client_id = NEW.id AND device_sync;
  UPDATE public.health_entries    SET home_id = NEW.home_id WHERE client_id = NEW.id AND device_sync;
  UPDATE public.attendance        SET home_id = NEW.home_id WHERE client_id = NEW.id AND device_sync;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_home_change
  AFTER UPDATE OF home_id ON public.clients
  FOR EACH ROW WHEN (NEW.home_id IS DISTINCT FROM OLD.home_id)
  EXECUTE FUNCTION public.clients_home_change();

-- ─── Audit log: written by the database for every audited table ─────────────
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req  jsonb := nullif(current_setting('app.request', true), '')::jsonb;
  rec  jsonb := to_jsonb(coalesce(NEW, OLD));
BEGIN
  INSERT INTO public.audit_log
    (agency_id, table_name, record_id, action, old_values, new_values,
     performed_by, ip_address, user_agent)
  VALUES
    ((rec->>'agency_id')::uuid, TG_TABLE_NAME, (rec->>'id')::uuid, TG_OP::audit_action,
     CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
     CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
     public.current_profile_id(),
     req->>'ip',
     req->>'user_agent');
  RETURN coalesce(NEW, OLD);
END;
$$;

-- PHI tables plus operational tables audited for accountability (security.md).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'client_health_info', 'goals', 'medications',
                           'medication_history', 'notes', 'note_goals', 'incidents',
                           'mar_records', 'health_entries', 'attendance', 'case_notes',
                           'referrals', 'messages', 'schedule_slots', 'clock_records',
                           'coverage_requests', 'profiles', 'api_keys', 'webhooks'] LOOP
    EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;

-- =============================================================================
-- RLS bypass (app_service: job handlers, cross-user writes, Lomi)
-- =============================================================================
-- app_service bypasses RLS. Job handlers (Cloud Tasks / Cloud Scheduler
-- endpoints) and a few tRPC procedures switch to it for cross-cutting work
-- (e.g., the Lomi coverage engine querying all eligible caregivers, writing
-- notifications, events and coverage replies). Clients never hold database
-- credentials. Procedures that act on behalf of a user run as app_user with
-- that user's claims so RLS still applies, and switch to app_service only for
-- the specific cross-user writes listed above.
--
-- PowerSync replicates through its own read-only replication role (BYPASSRLS,
-- see offline-sync.md) and applies its sync rules, filtered by the signed-in
-- user's agency_id and home_ids, before sending data to the device.
