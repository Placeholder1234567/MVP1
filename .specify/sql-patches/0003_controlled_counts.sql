-- Count book for controlled medications (schema.ts table 42,
-- domain/controlled.ts). Staff who may record MAR entries for a home may add
-- receipts, counts, waste and disposal for its controlled medications. Rows
-- are permanent: the only change allowed is the named witness countersigning a
-- pending entry. The server (app_service) may also set device_sync.

ALTER TABLE public.controlled_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS controlled_counts_select ON public.controlled_counts;
CREATE POLICY controlled_counts_select ON public.controlled_counts
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

DROP POLICY IF EXISTS controlled_counts_insert ON public.controlled_counts;
CREATE POLICY controlled_counts_insert ON public.controlled_counts
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND recorded_by = public.current_profile_id()
    AND witness_status IN ('none', 'pending')
    AND witness_id IS DISTINCT FROM recorded_by
    AND (
      public.is_supervisor_or_above()
      OR (
        home_id = ANY(public.current_user_home_ids())
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = public.current_profile_id() AND p.med_certified = true
        )
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_id
        AND m.agency_id = controlled_counts.agency_id
        AND m.client_id = controlled_counts.client_id
        AND m.home_id = controlled_counts.home_id
        AND m.controlled = true
    )
  );

-- Only the named witness, only to countersign a pending entry.
DROP POLICY IF EXISTS controlled_counts_countersign ON public.controlled_counts;
CREATE POLICY controlled_counts_countersign ON public.controlled_counts
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND witness_id = public.current_profile_id()
    AND witness_status = 'pending'
  ) WITH CHECK (witness_status = 'verified');

-- No DELETE policy: count book entries are never deleted.

CREATE OR REPLACE FUNCTION public.controlled_counts_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Count book entries cannot be deleted; record a new count' USING ERRCODE = '42501';
  END IF;
  IF public.is_trusted_server() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'witness_status' - 'witnessed_at' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'witness_status' - 'witnessed_at' - 'updated_at') THEN
    RAISE EXCEPTION 'Count book entries cannot be changed; record a new count' USING ERRCODE = '42501';
  END IF;
  IF NOT (OLD.witness_status = 'pending' AND NEW.witness_status = 'verified') THEN
    RAISE EXCEPTION 'Only a pending witness can countersign' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS controlled_counts_immutable ON public.controlled_counts;
CREATE TRIGGER controlled_counts_immutable
  BEFORE UPDATE OR DELETE ON public.controlled_counts
  FOR EACH ROW EXECUTE FUNCTION public.controlled_counts_immutable();

DROP TRIGGER IF EXISTS controlled_counts_audit ON public.controlled_counts;
CREATE TRIGGER controlled_counts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.controlled_counts
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
