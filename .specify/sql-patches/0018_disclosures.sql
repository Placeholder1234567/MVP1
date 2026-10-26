-- Accounting of disclosures (schema.ts table 48, HIPAA 45 CFR 164.528).
-- Supervisors and admins of the agency only, like case notes. An entry is
-- recorded by the person signed in, about a person in the same agency, and
-- never changed or deleted by app_user (no update or delete policies): a
-- wrong entry is corrected by recording the right one.

ALTER TABLE public.disclosures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS disclosures_select ON public.disclosures;
CREATE POLICY disclosures_select ON public.disclosures
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

DROP POLICY IF EXISTS disclosures_insert ON public.disclosures;
CREATE POLICY disclosures_insert ON public.disclosures
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
    AND recorded_by = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = disclosures.client_id
        AND c.agency_id = disclosures.agency_id
    )
  );

DROP TRIGGER IF EXISTS disclosures_audit ON public.disclosures;
CREATE TRIGGER disclosures_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.disclosures
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
