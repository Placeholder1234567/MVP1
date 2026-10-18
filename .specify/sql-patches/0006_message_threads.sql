-- Board threads (frontend-audit.md finding 19): a reply points at the first
-- message of a thread on the same board, and a thread may follow up on an
-- incident from the same home. Keeps 0005's person check.

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
    AND (
      reply_to IS NULL
      OR EXISTS (
        SELECT 1 FROM public.messages r
        WHERE r.id = messages.reply_to
          AND r.agency_id = messages.agency_id
          AND r.home_id = messages.home_id
          AND r.reply_to IS NULL
      )
    )
    AND (
      incident_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.incidents i
        WHERE i.id = messages.incident_id
          AND i.agency_id = messages.agency_id
          AND i.home_id = messages.home_id
      )
    )
  );
