-- =============================================================================
-- Guad — Row-Level Security Policies
-- =============================================================================
-- Every table uses agency_id for tenant isolation.
-- JWT app_metadata carries: agency_id, role, profile_id.
-- Caregiver access is further scoped to their assigned home_ids.
-- Supervisors and admins have full access within their agency.
-- audit_log is append-only: INSERT policy only, no UPDATE or DELETE.
-- =============================================================================

-- ─── Helper Functions ───────────────────────────────────────────────────────

-- Extract agency_id from JWT app_metadata
CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt()->'app_metadata'->>'agency_id')::uuid;
$$;

-- Extract role from JWT app_metadata
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.jwt()->'app_metadata'->>'role';
$$;

-- Extract profile_id from JWT app_metadata
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt()->'app_metadata'->>'profile_id')::uuid;
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

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR id = public.current_profile_id()  -- users can update own profile
    )
  );

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

-- Caregivers can only update their own draft notes in assigned homes; supervisors can update any
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

-- note_history rows are primarily written by server-side triggers in the user's
-- auth context. The INSERT policy is intentionally open to all agency users
-- because triggers execute with the authenticated user's session, not service_role.
CREATE POLICY note_history_insert ON public.note_history
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
  );

-- No UPDATE or DELETE — note history is append-only.


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

-- MAR records are irrevocable — only acknowledged field can be updated (amend-only).
-- Supervisors can update for corrections (adds amendment, does not change original status).
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

-- Caregivers can reply to their own candidacy; supervisors can update any
CREATE POLICY coverage_candidates_update ON public.coverage_candidates
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR profile_id = public.current_profile_id()
    )
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

-- Caregivers can update their own records (clock out); supervisors can override
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

-- Events are primarily written by server-side triggers in the user's auth context.
-- The INSERT policy is intentionally open to all agency users because triggers
-- execute with the authenticated user's session, not service_role.
CREATE POLICY events_insert ON public.events
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
  );

-- No UPDATE or DELETE — events are an immutable log.


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

-- INSERT is allowed for the application/triggers to write audit entries
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
  );

-- Explicitly: NO UPDATE policy. NO DELETE policy.
-- Additional tamper protection via trigger:
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

-- Belt-and-suspenders: revoke DELETE and TRUNCATE at the role level
REVOKE DELETE, TRUNCATE ON public.audit_log FROM authenticated;


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

CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
  );

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
-- Service-role bypass (for server-side functions, BullMQ workers, Lomi)
-- =============================================================================
-- Supabase's service_role key bypasses RLS by default. Server-side tRPC
-- procedures and BullMQ workers use service_role for cross-cutting operations
-- (e.g., Lomi coverage engine querying all eligible caregivers). The service
-- role is NEVER exposed to the client bundle.
--
-- PowerSync sync rules execute with service_role and apply their own filtering
-- based on the authenticated user's agency_id and home_ids before sending data
-- to the client.
