-- Staff can't set controlled_counts.witness_sign_in themselves: only the
-- server, after verifying the witness's sign-in, records its hash
-- (sql-patches/0003 policy, plus this column).

DROP POLICY IF EXISTS controlled_counts_insert ON public.controlled_counts;
CREATE POLICY controlled_counts_insert ON public.controlled_counts
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND recorded_by = public.current_profile_id()
    AND witness_status IN ('none', 'pending')
    AND witness_sign_in IS NULL
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
