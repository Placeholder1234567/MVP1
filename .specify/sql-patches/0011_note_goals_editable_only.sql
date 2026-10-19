-- Goal trials could be written onto a signed note: note_goals_insert never
-- looked at the note's status, and supervisors could insert or update any
-- note's trials. Trials are part of what the author signs, so only the
-- author may write them, and only while the note is a draft or sent back
-- (the same rule notes_update applies to the note itself). Service code
-- (app_service) is unaffected.
DROP POLICY IF EXISTS note_goals_insert ON public.note_goals;
CREATE POLICY note_goals_insert ON public.note_goals
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_goals.note_id
        AND n.agency_id = note_goals.agency_id
        AND n.author_id = public.current_profile_id()
        AND n.status IN ('draft', 'returned')
    )
  );

DROP POLICY IF EXISTS note_goals_update ON public.note_goals;
CREATE POLICY note_goals_update ON public.note_goals
  FOR UPDATE USING (
    agency_id = public.current_agency_id()
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_goals.note_id
        AND n.agency_id = note_goals.agency_id
        AND n.author_id = public.current_profile_id()
        AND n.status IN ('draft', 'returned')
    )
  );
