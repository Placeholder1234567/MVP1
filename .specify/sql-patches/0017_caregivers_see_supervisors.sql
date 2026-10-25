-- Caregivers see their agency's supervisors and admins (research:
-- .specify/research/decisions-2026-10.md §1). Before this, a caregiver saw
-- only staff who shared a home with them, so a supervisor with no assigned
-- homes was invisible: their name was missing from returned notes and board
-- posts, and the controlled-count witness check (which reads the witness's
-- profile under the caregiver's RLS) refused them although the rule allows any
-- supervisor. Other homes' caregivers stay hidden, and the sync stream for
-- profiles (offline-sync.md §4) sends exactly these rows.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    agency_id = public.current_agency_id()
    AND (
      public.is_supervisor_or_above()
      OR role IN ('supervisor', 'admin')
      OR home_ids && public.current_user_home_ids()  -- array overlap
      OR id = public.current_profile_id()             -- always see own profile
    )
  );
