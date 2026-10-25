-- Scheduled care reports (schema.ts report_schedules). A supervisor or admin
-- sees and manages only their own schedules, for homes they can report on;
-- the daily sweep (app_service) runs them and advances next_run_on.

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_schedules_select ON public.report_schedules;
CREATE POLICY report_schedules_select ON public.report_schedules
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS report_schedules_insert ON public.report_schedules;
CREATE POLICY report_schedules_insert ON public.report_schedules
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
    AND public.is_supervisor_or_above()
    AND EXISTS (
      SELECT 1 FROM public.homes h
      WHERE h.id = report_schedules.home_id
        AND h.agency_id = report_schedules.agency_id
    )
  );

DROP POLICY IF EXISTS report_schedules_delete ON public.report_schedules;
CREATE POLICY report_schedules_delete ON public.report_schedules
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
  );
