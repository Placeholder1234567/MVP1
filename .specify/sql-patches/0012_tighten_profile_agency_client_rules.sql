-- Backstops that were looser than the services (security review, 2026-10-19).

-- profiles: created_at starts the supervisor's 30-day MFA grace period
-- (domain/mfa.ts), so a supervisor editing their own row must not move it.
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trusted_server() OR public.current_user_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.home_ids IS DISTINCT FROM OLD.home_ids
     OR NEW.med_certified IS DISTINCT FROM OLD.med_certified
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.auth_uid IS DISTINCT FROM OLD.auth_uid
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only an admin can change role, homes, certification or account status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- agencies: the plan (tier and extra features) and the slug are the
-- operator's (scripts/set-plan.ts, provision-agency.ts), never an agency
-- admin's, even though admins may update the agency's other settings.
CREATE OR REPLACE FUNCTION public.agencies_protect_plan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_trusted_server() THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.enabled_features IS DISTINCT FROM OLD.enabled_features
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'The plan and agency ID are changed by Guad, not in the app'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_protect_plan ON public.agencies;
CREATE TRIGGER agencies_protect_plan
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_protect_plan();

-- clients: adding people and changing them (name, home, active) is a
-- supervisor's job (client.create / client.update); caregivers only read.
-- The home must be one of the agency's.
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
    AND (
      clients.home_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.homes h
        WHERE h.id = clients.home_id AND h.agency_id = clients.agency_id
      )
    )
  );

DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients
  FOR UPDATE
  USING (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
  )
  WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
    AND (
      clients.home_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.homes h
        WHERE h.id = clients.home_id AND h.agency_id = clients.agency_id
      )
    )
  );

DROP POLICY IF EXISTS rooms_insert ON public.rooms;
CREATE POLICY rooms_insert ON public.rooms
  FOR INSERT WITH CHECK (
    agency_id = public.current_agency_id()
    AND public.is_supervisor_or_above()
    AND EXISTS (
      SELECT 1 FROM public.homes h
      WHERE h.id = rooms.home_id AND h.agency_id = rooms.agency_id
    )
  );
