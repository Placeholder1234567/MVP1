-- Scheduled reports (entitlements.md flag 20, `reports_scheduled`): on the
-- Complete tier, and needs `reports`. Same function as 0001 with the new
-- flag; resolveFeatures() in src/lib/entitlements/tier-features.ts must
-- match (tests/integration/db/plan-features.test.ts checks every tier).

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
    UNION SELECT unnest(ARRAY['analytics','analytics_advanced','audit_log','intake','reports_scheduled'])
  ), known AS (
    SELECT unnest(ARRAY[
      'scheduling','coverage','timekeeping','charting','lomi_drafting','mar','goals','health','incidents',
      'note_review','analytics','analytics_advanced','reports','reports_basic','reports_scheduled',
      'lomi_summary','audit_log','intake','messaging','notifications'
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
    UNION SELECT 'reports' WHERE EXISTS (SELECT 1 FROM chosen WHERE f = 'reports_scheduled')
  )
  SELECT coalesce(array_agg(f ORDER BY f), '{}') FROM effective;
$$;

-- Existing profiles pick up the new flag.
UPDATE public.profiles p
   SET plan_features = app.plan_features(a.subscription_tier, a.enabled_features)
  FROM public.agencies a
 WHERE a.id = p.agency_id;
