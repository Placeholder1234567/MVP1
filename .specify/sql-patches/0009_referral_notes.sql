-- Notes at each intake stage (schema.ts table 45, US-29). Like referrals,
-- supervisors and admins of the agency only. A note is written by the person
-- signed in, about a referral in the same agency, and never changed or
-- deleted by app_user (no update or delete policies).

ALTER TABLE public.referral_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_notes_select ON public.referral_notes;
CREATE POLICY referral_notes_select ON public.referral_notes
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  );

DROP POLICY IF EXISTS referral_notes_insert ON public.referral_notes;
CREATE POLICY referral_notes_insert ON public.referral_notes
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
    AND created_by = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.referrals r
      WHERE r.id = referral_notes.referral_id
        AND r.agency_id = referral_notes.agency_id
    )
  );

DROP TRIGGER IF EXISTS referral_notes_audit ON public.referral_notes;
CREATE TRIGGER referral_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.referral_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
