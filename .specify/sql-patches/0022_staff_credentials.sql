-- Staff training and certifications (schema.ts staff_credentials,
-- domain/credentials.ts). Supervisors and admins of the agency see them, and
-- each person sees their own. Only admins record, renew or remove them, for
-- a profile in the same agency. Every change is in the audit log.

ALTER TABLE public.staff_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_credentials
  DROP CONSTRAINT IF EXISTS staff_credentials_kind_check;
ALTER TABLE public.staff_credentials
  ADD CONSTRAINT staff_credentials_kind_check
  CHECK (kind IN ('med_admin', 'cpr', 'first_aid', 'abuse_neglect', 'other'));

ALTER TABLE public.staff_credentials
  DROP CONSTRAINT IF EXISTS staff_credentials_dates_check;
ALTER TABLE public.staff_credentials
  ADD CONSTRAINT staff_credentials_dates_check
  CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on);

DROP POLICY IF EXISTS staff_credentials_select ON public.staff_credentials;
CREATE POLICY staff_credentials_select ON public.staff_credentials
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR profile_id = public.current_profile_id()
    )
  );

DROP POLICY IF EXISTS staff_credentials_insert ON public.staff_credentials;
CREATE POLICY staff_credentials_insert ON public.staff_credentials
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
    AND recorded_by = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = staff_credentials.profile_id
        AND p.agency_id = staff_credentials.agency_id
    )
  );

DROP POLICY IF EXISTS staff_credentials_update ON public.staff_credentials;
CREATE POLICY staff_credentials_update ON public.staff_credentials
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  ) WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
    AND recorded_by = public.current_profile_id()
  );

DROP POLICY IF EXISTS staff_credentials_delete ON public.staff_credentials;
CREATE POLICY staff_credentials_delete ON public.staff_credentials
  FOR DELETE USING (
    agency_id = public.current_agency_id()
    AND public.current_user_role() = 'admin'
  );

-- The person a credential belongs to never changes.
CREATE OR REPLACE FUNCTION public.staff_credentials_fixed_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'A credential stays with the person it was recorded for';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staff_credentials_fixed_owner ON public.staff_credentials;
CREATE TRIGGER staff_credentials_fixed_owner
  BEFORE UPDATE ON public.staff_credentials
  FOR EACH ROW EXECUTE FUNCTION public.staff_credentials_fixed_owner();

DROP TRIGGER IF EXISTS staff_credentials_audit ON public.staff_credentials;
CREATE TRIGGER staff_credentials_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
