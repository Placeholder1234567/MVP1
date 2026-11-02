-- Lets the daily GitHub Action save homes without the service-role key.
-- The Action calls these two functions with the public anon key plus a
-- refresh token (GitHub secret REFRESH_TOKEN). Only the token's SHA-256 is
-- stored, in a table no one can read through the API. A leaked token can
-- only add or update homes and log entries, never read notes or users.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ingest_token (
  id int primary key default 1 check (id = 1),
  token_sha256 text not null
);
alter table public.ingest_token enable row level security;  -- no policies

create or replace function public.check_ingest_token(p_token text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_token is null or not exists (
    select 1 from public.ingest_token
    where token_sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'invalid refresh token' using errcode = '28000';
  end if;
end;
$$;

-- Upsert a batch of homes (JSON array of objects with the homes columns).
create or replace function public.ingest_homes(p_token text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform public.check_ingest_token(p_token);
  insert into public.homes (home_key, facility_number, facility_name, facility_type, grp, licensee_owner,
    cms_legal_business_name, cms_owners, administrator, address, city, zip, county, phone, email, capacity,
    license_status, source, still_listed, seen_at)
  select r.home_key, coalesce(r.facility_number, ''), r.facility_name, coalesce(r.facility_type, ''),
    coalesce(r.grp, ''), coalesce(r.licensee_owner, ''), coalesce(r.cms_legal_business_name, ''),
    coalesce(r.cms_owners, ''), coalesce(r.administrator, ''), coalesce(r.address, ''), coalesce(r.city, ''),
    coalesce(r.zip, ''), coalesce(r.county, ''), coalesce(r.phone, ''), coalesce(r.email, ''),
    coalesce(r.capacity, ''), coalesce(r.license_status, ''), coalesce(r.source, ''), true, r.seen_at
  from jsonb_to_recordset(p_rows) as r(home_key text, facility_number text, facility_name text,
    facility_type text, grp text, licensee_owner text, cms_legal_business_name text, cms_owners text,
    administrator text, address text, city text, zip text, county text, phone text, email text,
    capacity text, license_status text, source text, seen_at timestamptz)
  where r.home_key is not null and r.facility_name is not null
  on conflict (home_key) do update set
    facility_number = excluded.facility_number, facility_name = excluded.facility_name,
    facility_type = excluded.facility_type, grp = excluded.grp, licensee_owner = excluded.licensee_owner,
    cms_legal_business_name = excluded.cms_legal_business_name, cms_owners = excluded.cms_owners,
    administrator = excluded.administrator, address = excluded.address, city = excluded.city,
    zip = excluded.zip, county = excluded.county, phone = excluded.phone, email = excluded.email,
    capacity = excluded.capacity, license_status = excluded.license_status, source = excluded.source,
    still_listed = true, seen_at = excluded.seen_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Finish a run: record it, and only after a complete download mark homes of
-- these groups not seen since p_run_at as no longer listed (never deleted).
create or replace function public.finish_refresh(p_token text, p_groups text[], p_run_at timestamptz,
  p_complete boolean, p_homes int, p_problems text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.check_ingest_token(p_token);
  if p_complete then
    update public.homes set still_listed = false
    where grp = any (p_groups) and seen_at < p_run_at and still_listed;
  end if;
  insert into public.refresh_log (complete, homes, problems)
  values (p_complete, p_homes, left(coalesce(p_problems, ''), 2000));
end;
$$;

revoke execute on function public.check_ingest_token(text) from public, anon, authenticated;
revoke execute on function public.ingest_homes(text, jsonb) from public, authenticated;
revoke execute on function public.finish_refresh(text, text[], timestamptz, boolean, int, text) from public, authenticated;
grant execute on function public.ingest_homes(text, jsonb) to anon;
grant execute on function public.finish_refresh(text, text[], timestamptz, boolean, int, text) to anon;

-- Set or rotate the token (run with your own value's SHA-256):
--   insert into public.ingest_token (id, token_sha256) values (1, '<sha256 hex>')
--   on conflict (id) do update set token_sha256 = excluded.token_sha256;
