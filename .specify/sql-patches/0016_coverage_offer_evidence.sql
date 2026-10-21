-- Prospective offer evidence is written only by app_service. It deliberately
-- has no historical backfill: missing rows before this migration are unknown.
ALTER TABLE public.coverage_offer_evidence ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coverage_offer_evidence TO app_user, app_service;

DROP POLICY IF EXISTS coverage_offer_evidence_select ON public.coverage_offer_evidence;
CREATE POLICY coverage_offer_evidence_select ON public.coverage_offer_evidence
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.current_user_role() = 'admin'
      OR (
        public.current_user_role() = 'supervisor'
        AND home_id = ANY(public.current_user_home_ids())
      )
    )
  );

DROP TRIGGER IF EXISTS coverage_offer_evidence_audit ON public.coverage_offer_evidence;
CREATE TRIGGER coverage_offer_evidence_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.coverage_offer_evidence
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
