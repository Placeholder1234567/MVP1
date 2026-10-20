-- Only app_service (verified inbound SMS and dispatch) can read/write carrier
-- suppression. No app_user policies: channel preference edits cannot clear STOP.
ALTER TABLE public.sms_carrier_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_carrier_consents ADD CONSTRAINT sms_carrier_consent_state
  CHECK (state IN ('unknown', 'stopped', 'started', 'legacy_suppressed'));
CREATE TRIGGER sms_carrier_consents_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.sms_carrier_consents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Historical SMS-off preferences cannot distinguish STOP from an ordinary
-- opt-out. Preserve suppression conservatively; only verified START clears it.
INSERT INTO public.sms_carrier_consents (agency_id, phone_hash, state)
SELECT DISTINCT p.agency_id, encode(sha256(convert_to(p.phone, 'UTF8')), 'hex'), 'legacy_suppressed'
FROM public.profiles p JOIN public.notification_preferences n
  ON n.profile_id = p.id AND n.agency_id = p.agency_id
WHERE p.phone IS NOT NULL AND n.sms_enabled = false
ON CONFLICT (agency_id, phone_hash) DO NOTHING;
