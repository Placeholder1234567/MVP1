-- Plan features on each profile, for offline sync gating (entitlements.md §8).
--
-- PowerSync sync streams can only gate rows with subqueries tied to the
-- signed-in user, so the agency's effective features (tier + enabled_features
-- overrides + prerequisites, as resolveFeatures() in
-- src/lib/entitlements/tier-features.ts) are copied onto every profile.
-- A test checks this function against resolveFeatures() for every tier.

CREATE OR REPLACE FUNCTION app.plan_features(tier text, extra text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  WITH starter AS (
    SELECT unnest(ARRAY['scheduling','coverage','timekeeping','reports_basic','messaging','notifications']) AS f
  ), professional AS (
    SELECT f FROM starter
    UNION SELECT unnest(ARRAY['charting','lomi_drafting','lomi_summary','mar','goals','health','incidents','note_review','reports'])
  ), complete AS (
    SELECT f FROM professional
    UNION SELECT unnest(ARRAY['analytics','analytics_advanced','audit_log','intake'])
  ), known AS (
    SELECT unnest(ARRAY[
      'scheduling','coverage','timekeeping','charting','lomi_drafting','mar','goals','health','incidents',
      'note_review','analytics','analytics_advanced','reports','reports_basic','lomi_summary','audit_log',
      'intake','messaging','notifications'
    ]) AS f
  ), chosen AS (
    SELECT f FROM complete WHERE tier = 'complete'
    UNION SELECT f FROM professional WHERE tier = 'professional'
    UNION SELECT f FROM starter WHERE coalesce(tier, 'starter') NOT IN ('professional', 'complete')
    UNION SELECT e FROM unnest(coalesce(extra, '{}'::text[])) AS e WHERE e IN (SELECT f FROM known)
  ), effective AS (
    SELECT f FROM chosen
    UNION SELECT 'charting' WHERE EXISTS (SELECT 1 FROM chosen WHERE f = 'note_review')
    UNION SELECT 'analytics' WHERE EXISTS (SELECT 1 FROM chosen WHERE f = 'analytics_advanced')
  )
  SELECT coalesce(array_agg(f ORDER BY f), '{}') FROM effective;
$$;

-- Every insert or update of a profile recomputes it, so nobody can set it.
CREATE OR REPLACE FUNCTION public.profiles_plan_features()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT app.plan_features(a.subscription_tier, a.enabled_features)
    INTO NEW.plan_features
    FROM public.agencies a WHERE a.id = NEW.agency_id;
  NEW.plan_features := coalesce(NEW.plan_features, '{}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_plan_features ON public.profiles;
CREATE TRIGGER profiles_plan_features
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_plan_features();

-- A plan change reaches every profile of the agency (and so their devices).
CREATE OR REPLACE FUNCTION public.agencies_plan_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET plan_features = app.plan_features(NEW.subscription_tier, NEW.enabled_features)
   WHERE agency_id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agencies_plan_changed ON public.agencies;
CREATE TRIGGER agencies_plan_changed
  AFTER UPDATE OF subscription_tier, enabled_features ON public.agencies
  FOR EACH ROW
  WHEN (NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
        OR NEW.enabled_features IS DISTINCT FROM OLD.enabled_features)
  EXECUTE FUNCTION public.agencies_plan_changed();

-- Backfill existing profiles.
UPDATE public.profiles p
   SET plan_features = app.plan_features(a.subscription_tier, a.enabled_features)
  FROM public.agencies a
 WHERE a.id = p.agency_id;
