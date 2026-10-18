-- Read receipts on the home message board (schema.ts table 41,
-- frontend-audit.md finding 19). Readers see receipts for the boards they can
-- read and add only their own, for a message on that same board. Receipts are
-- permanent: no update or delete policies, so app_user can do neither.

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reads_select ON public.message_reads;
CREATE POLICY message_reads_select ON public.message_reads
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

DROP POLICY IF EXISTS message_reads_insert ON public.message_reads;
CREATE POLICY message_reads_insert ON public.message_reads
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND profile_id = public.current_profile_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.home_id = message_reads.home_id
        AND m.agency_id = message_reads.agency_id
    )
  );
