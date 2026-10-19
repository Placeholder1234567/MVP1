-- Moving a person to another home failed whenever they had MAR records still
-- synced to devices. clients_home_change (SECURITY DEFINER) moves those
-- records' home_id, but SECURITY DEFINER doesn't change the `role` setting, so
-- inside mar_records_immutable is_trusted_server() was still false and the
-- home_id change was refused as an edit. The one change now allowed is
-- home_id alone, to the home the person lives at now: where the record syncs,
-- never what was given.
CREATE OR REPLACE FUNCTION public.mar_records_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MAR records cannot be deleted; record an amendment' USING ERRCODE = '42501';
  END IF;
  IF public.is_trusted_server() THEN
    RETURN NEW;
  END IF;
  IF NEW.home_id IS DISTINCT FROM OLD.home_id
     AND (to_jsonb(NEW) - 'home_id' - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'home_id' - 'updated_at')
     AND NEW.home_id = (SELECT c.home_id FROM public.clients c WHERE c.id = NEW.client_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'acknowledged' - 'effect' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'acknowledged' - 'effect' - 'updated_at') THEN
    RAISE EXCEPTION 'MAR records cannot be changed; record an amendment' USING ERRCODE = '42501';
  END IF;
  IF NEW.effect IS DISTINCT FROM OLD.effect AND (NOT OLD.is_prn OR OLD.effect IS NOT NULL) THEN
    RAISE EXCEPTION 'Effect can be recorded once, on as-needed doses only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
