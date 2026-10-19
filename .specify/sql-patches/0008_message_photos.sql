-- Photos on the board (schema.ts table 44, frontend-audit.md finding 19,
-- fix 3). The image itself is in a private bucket; this row says whose it is.
-- Board readers may see the rows of their boards; only the uploader adds one,
-- for a board they can post to. Rows are never changed or deleted by app_user.
-- A message may carry only a photo its author uploaded to the same board.
-- Keeps 0006's thread and 0005's person checks.

ALTER TABLE public.message_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_photos_select ON public.message_photos;
CREATE POLICY message_photos_select ON public.message_photos
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

DROP POLICY IF EXISTS message_photos_insert ON public.message_photos;
CREATE POLICY message_photos_insert ON public.message_photos
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND uploaded_by = public.current_profile_id()
    AND (
      public.is_supervisor_or_above()
      OR home_id = ANY(public.current_user_home_ids())
    )
  );

DROP TRIGGER IF EXISTS message_photos_audit ON public.message_photos;
CREATE TRIGGER message_photos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.message_photos
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

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
    AND (
      photo_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.message_photos p
        WHERE p.id = messages.photo_id
          AND p.agency_id = messages.agency_id
          AND p.home_id = messages.home_id
          AND p.uploaded_by = messages.created_by
      )
    )
  );
