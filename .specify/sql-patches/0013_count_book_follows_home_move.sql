-- Moving a person left their controlled-medication count book at the old
-- home: clients_home_change re-homed medications and device-synced MAR rows
-- but not controlled_counts. The old home kept syncing the book, and at the
-- new home the expected count missed every earlier receipt, so the first
-- count there was written as a discrepancy. The whole book now moves with the
-- person (it is one running ledger), and controlled_counts_immutable allows
-- that one change: home_id alone, to the home the person lives at now.
CREATE OR REPLACE FUNCTION public.clients_home_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_health_info SET home_id = NEW.home_id WHERE client_id = NEW.id;
  UPDATE public.goals             SET home_id = NEW.home_id WHERE client_id = NEW.id;
  UPDATE public.medications       SET home_id = NEW.home_id WHERE client_id = NEW.id;
  UPDATE public.mar_records       SET home_id = NEW.home_id WHERE client_id = NEW.id AND device_sync;
  UPDATE public.health_entries    SET home_id = NEW.home_id WHERE client_id = NEW.id AND device_sync;
  UPDATE public.attendance        SET home_id = NEW.home_id WHERE client_id = NEW.id AND device_sync;
  UPDATE public.controlled_counts SET home_id = NEW.home_id WHERE client_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.controlled_counts_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Count book entries cannot be deleted; record a new count' USING ERRCODE = '42501';
  END IF;
  IF public.is_trusted_server() THEN
    RETURN NEW;
  END IF;
  IF NEW.home_id IS DISTINCT FROM OLD.home_id
     AND (to_jsonb(NEW) - 'home_id' - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'home_id' - 'updated_at')
     AND NEW.home_id = (SELECT c.home_id FROM public.clients c WHERE c.id = NEW.client_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'witness_status' - 'witnessed_at' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'witness_status' - 'witnessed_at' - 'updated_at') THEN
    RAISE EXCEPTION 'Count book entries cannot be changed; record a new count' USING ERRCODE = '42501';
  END IF;
  IF NOT (OLD.witness_status = 'pending' AND NEW.witness_status = 'verified') THEN
    RAISE EXCEPTION 'Only a pending witness can countersign' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
