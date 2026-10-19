-- Schedule templates (schema.ts table 43, frontend-audit.md finding 17): a
-- home's usual week. Supervisors and admins of the agency read and manage
-- them; caregivers never see them (they hold assignments, not their shifts).

ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_templates_select ON public.schedule_templates;
CREATE POLICY schedule_templates_select ON public.schedule_templates
  FOR SELECT USING (
    agency_id = public.current_agency_id() AND public.is_supervisor_or_above()
  );

DROP POLICY IF EXISTS schedule_templates_insert ON public.schedule_templates;
CREATE POLICY schedule_templates_insert ON public.schedule_templates
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
    AND created_by = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.homes h
      WHERE h.id = home_id AND h.agency_id = schedule_templates.agency_id
    )
  );

DROP POLICY IF EXISTS schedule_templates_update ON public.schedule_templates;
CREATE POLICY schedule_templates_update ON public.schedule_templates
  FOR UPDATE USING (
    agency_id = public.current_agency_id() AND public.is_supervisor_or_above()
  ) WITH CHECK (
    agency_id = public.current_agency_id() AND public.is_supervisor_or_above()
  );

DROP POLICY IF EXISTS schedule_templates_delete ON public.schedule_templates;
CREATE POLICY schedule_templates_delete ON public.schedule_templates
  FOR DELETE USING (
    agency_id = public.current_agency_id() AND public.is_supervisor_or_above()
  );
