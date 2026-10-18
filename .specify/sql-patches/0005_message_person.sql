-- A board message may name the person it is about (messages.client_id). The
-- person must belong to the agency and live in the message's home.

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
    AND created_by = public.current_profile_id()
    AND (
      client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_id
          AND c.agency_id = messages.agency_id
          AND c.home_id = messages.home_id
      )
    )
  );
