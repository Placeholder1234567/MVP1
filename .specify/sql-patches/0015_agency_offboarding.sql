-- Operator-only access shutdown. Existing claims cannot outlive the hold.
CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.agencies
  WHERE id = (app.claims()->>'agency_id')::uuid
    AND COALESCE(settings #>> '{offboarding,accessBlocked}', 'false') <> 'true';
$$;
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.current_agency_id() IS NOT NULL THEN app.claims()->>'role' END;
$$;
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.current_agency_id() IS NOT NULL THEN (app.claims()->>'profile_id')::uuid END;
$$;

CREATE OR REPLACE FUNCTION public.offboarding_access_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE held boolean;
BEGIN
  IF TG_TABLE_NAME = 'agencies' THEN
    IF current_user <> 'app_service'
       AND (NEW.settings->'offboarding') IS DISTINCT FROM (OLD.settings->'offboarding') THEN
      RAISE EXCEPTION 'Offboarding is operator-only' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  SELECT COALESCE(settings #>> '{offboarding,accessBlocked}', 'false') = 'true'
    INTO held FROM public.agencies WHERE id = NEW.agency_id;
  IF held THEN
    IF (TG_TABLE_NAME = 'profiles' AND (to_jsonb(NEW)->>'active')::boolean)
       OR (TG_TABLE_NAME = 'webhooks' AND (to_jsonb(NEW)->>'active')::boolean)
       OR (TG_TABLE_NAME IN ('api_keys', 'device_keys') AND to_jsonb(NEW)->>'revoked_at' IS NULL)
       OR TG_TABLE_NAME = 'device_tokens' THEN
      RAISE EXCEPTION 'Agency access is blocked' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agencies_offboarding_guard BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.offboarding_access_guard();
CREATE TRIGGER profiles_offboarding_guard BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.offboarding_access_guard();
CREATE TRIGGER api_keys_offboarding_guard BEFORE INSERT OR UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.offboarding_access_guard();
CREATE TRIGGER webhooks_offboarding_guard BEFORE INSERT OR UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.offboarding_access_guard();
CREATE TRIGGER device_keys_offboarding_guard BEFORE INSERT OR UPDATE ON public.device_keys
  FOR EACH ROW EXECUTE FUNCTION public.offboarding_access_guard();
CREATE TRIGGER device_tokens_offboarding_guard BEFORE INSERT OR UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.offboarding_access_guard();
