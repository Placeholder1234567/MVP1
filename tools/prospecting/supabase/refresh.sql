-- Daily refresh inside Supabase: public.refresh_homes() asks the California
-- open-data portal (data.chhs.ca.gov, CKAN datastore SQL API) for Bay Area
-- rows of three state lists, upserts them into public.homes and records the
-- run in public.refresh_log. pg_cron runs it every morning; no GitHub secret
-- or service key is involved. Run by hand with: select public.refresh_homes();
--
-- Mirrors bay_area_homes.py: same keys (source:facility_number), groups,
-- whole-word licence-status rule, and "only mark homes gone after a complete
-- run" rule.

create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

-- Licence status is open unless it has a closing word; blank counts as open.
create or replace function public.status_is_open(p text) returns boolean
language sql immutable as $$
  select case
    when coalesce(trim(p), '') = '' then true
    when upper(p) ~ '\m(INACTIVE|UNLICENSED|CLOSED|REVOKED|SUSPENDED|EXPIRED|DENIED|WITHDRAWN|TERMINATED|CANCELLED|CANCELED|SURRENDERED)\M' then false
    else upper(p) ~ '\m(LICENSED|OPEN|ACTIVE|PENDING|PROBATION|CERTIFIED)\M'
  end;
$$;

create or replace function public.cdph_group(t text) returns text
language sql immutable as $$
  select case
    when upper(t) like '%INTERMEDIATE CARE%' or upper(t) like 'ICF%' then
      case when upper(t) ~ '(DEVELOPMENTAL|\mDD)' then 'idd' else 'nursing' end
    when upper(t) like '%SKILLED NURSING%' or upper(t) like '%CONGREGATE LIVING%' then 'nursing'
    else null
  end;
$$;

create or replace function public.ccl_group(t text, dflt text) returns text
language sql immutable as $$
  select case
    when upper(t) like '%ADULT DAY%' then 'day'
    when upper(t) like '%SOCIAL REHAB%' or upper(t) like '%CHRONICALLY ILL%' then 'other'
    when upper(t) like '%ELDERLY%' or upper(t) like '%RCFE%' then 'elderly'
    else dflt
  end;
$$;

create or replace function public.fmt_phone(p text) returns text
language sql immutable as $$
  select case
    when length(d) = 10 then '(' || substr(d, 1, 3) || ') ' || substr(d, 4, 3) || '-' || substr(d, 7)
    when length(d) = 11 and left(d, 1) = '1' then '(' || substr(d, 2, 3) || ') ' || substr(d, 5, 3) || '-' || substr(d, 8)
    else coalesce(trim(p), '')
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- One CKAN datastore SQL query; returns its records, or raises with the reason.
create or replace function public.ckan_sql(p_sql text) returns jsonb
language plpgsql as $$
declare r extensions.http_response; j jsonb;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');
  r := extensions.http_get('https://data.chhs.ca.gov/api/3/action/datastore_search_sql?sql='
       || extensions.urlencode(p_sql));
  if r.status <> 200 then
    raise exception 'HTTP %', r.status;
  end if;
  j := r.content::jsonb;
  if not coalesce((j->>'success')::boolean, false) then
    raise exception '%', left(coalesce(j->>'error', 'no success flag'), 200);
  end if;
  return j->'result'->'records';
end;
$$;

create or replace function public.refresh_homes(
  p_groups text[] default array['idd', 'nursing', 'elderly', 'day']
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  run_at timestamptz := now();
  counties text := '''ALAMEDA'',''CONTRA COSTA'',''MARIN'',''NAPA'',''SAN FRANCISCO'',''SAN MATEO'',''SANTA CLARA'',''SOLANO'',''SONOMA''';
  problems text[] := '{}';
  recs jsonb;
  n int := 0;
  got int;
  src record;
begin
  -- The two CDSS Community Care Licensing lists (same columns).
  for src in select * from (values
      ('ccl_arf', 'idd', '9f5d1d00-6b24-4f44-a158-9cbe4b43f117'),
      ('ccl_rcfe', 'elderly', '744d1583-f9eb-45b6-b0f8-b9a9dab936a6')) v(key, dflt, rid)
  loop
    if src.key = 'ccl_rcfe' and not ('elderly' = any (p_groups)) then continue; end if;
    begin
      recs := public.ckan_sql(format(
        'SELECT * FROM %I WHERE upper("county_name") IN (%s)', src.rid, counties));
      insert into public.homes as h (home_key, facility_number, facility_name, facility_type, grp, licensee_owner,
        administrator, address, city, zip, county, phone, capacity, license_status, source, still_listed, seen_at)
      select distinct on (r->>'facility_number')
        src.key || ':' || (r->>'facility_number'), r->>'facility_number', initcap(r->>'facility_name'),
        initcap(coalesce(r->>'facility_type', '')), g, coalesce(r->>'licensee', ''),
        coalesce(r->>'facility_administrator', ''), initcap(coalesce(r->>'facility_address', '')),
        initcap(coalesce(r->>'facility_city', '')), left(coalesce(r->>'facility_zip', ''), 5),
        initcap(r->>'county_name'), public.fmt_phone(r->>'facility_telephone_number'),
        coalesce(r->>'facility_capacity', ''), initcap(coalesce(r->>'facility_status', '')), src.key, true, run_at
      from jsonb_array_elements(recs) r,
        lateral (select public.ccl_group(r->>'facility_type', src.dflt) as g) gg
      where coalesce(r->>'facility_number', '') <> '' and coalesce(r->>'facility_name', '') <> ''
        and public.status_is_open(r->>'facility_status') and g = any (p_groups)
      on conflict (home_key) do update set
        facility_name = excluded.facility_name, facility_type = excluded.facility_type, grp = excluded.grp,
        licensee_owner = excluded.licensee_owner, administrator = excluded.administrator,
        address = excluded.address, city = excluded.city, zip = excluded.zip, county = excluded.county,
        phone = excluded.phone, capacity = excluded.capacity, license_status = excluded.license_status,
        still_listed = true, seen_at = excluded.seen_at;
      get diagnostics got = row_count;
      n := n + got;
    exception when others then
      problems := problems || (src.key || ': ' || left(sqlerrm, 200));
    end;
  end loop;

  -- CDPH licensed and certified healthcare facilities (nursing homes, ICF/DD).
  if p_groups && array['idd', 'nursing'] then
    begin
      recs := public.ckan_sql(format(
        'SELECT * FROM %I WHERE upper("COUNTY_NAME") IN (%s)', 'f0ae5731-fef8-417f-839d-54a0ed3a126e', counties));
      insert into public.homes as h (home_key, facility_number, facility_name, facility_type, grp, licensee_owner,
        administrator, address, city, zip, county, phone, email, capacity, license_status, source, still_listed, seen_at)
      select distinct on (r->>'FACID')
        'cdph:' || (r->>'FACID'), r->>'FACID', initcap(r->>'FACNAME'), initcap(coalesce(r->>'FAC_FDR', '')), g,
        coalesce(r->>'BUSINESS_NAME', ''), coalesce(r->>'FACADMIN', ''), initcap(coalesce(r->>'ADDRESS', '')),
        initcap(coalesce(r->>'CITY', '')), left(coalesce(r->>'ZIP', ''), 5), initcap(r->>'COUNTY_NAME'),
        public.fmt_phone(r->>'CONTACT_PHONE_NUMBER'), lower(coalesce(r->>'CONTACT_EMAIL', '')),
        coalesce(r->>'CAPACITY', ''), initcap(coalesce(r->>'LICENSE_STATUS_DESCRIPTION', r->>'FAC_STATUS_TYPE_CODE', '')),
        'cdph', true, run_at
      from jsonb_array_elements(recs) r,
        lateral (select public.cdph_group(r->>'FAC_FDR') as g) gg
      where coalesce(r->>'FACID', '') <> '' and coalesce(r->>'FACNAME', '') <> '' and g = any (p_groups)
        and public.status_is_open(coalesce(r->>'LICENSE_STATUS_DESCRIPTION', r->>'FAC_STATUS_TYPE_CODE'))
      on conflict (home_key) do update set
        facility_name = excluded.facility_name, facility_type = excluded.facility_type, grp = excluded.grp,
        licensee_owner = excluded.licensee_owner, administrator = excluded.administrator,
        address = excluded.address, city = excluded.city, zip = excluded.zip, county = excluded.county,
        phone = excluded.phone, email = excluded.email, capacity = excluded.capacity,
        license_status = excluded.license_status, still_listed = true, seen_at = excluded.seen_at;
      get diagnostics got = row_count;
      n := n + got;
    exception when others then
      problems := problems || ('cdph: ' || left(sqlerrm, 200));
    end;
  end if;

  if n = 0 and cardinality(problems) = 0 then
    problems := array['no homes came back'];
  end if;
  -- Only a complete run says which homes left the state lists.
  if cardinality(problems) = 0 then
    update public.homes set still_listed = false
    where grp = any (p_groups) and seen_at < run_at and still_listed;
  end if;
  insert into public.refresh_log (ran_at, complete, homes, problems)
  values (run_at, cardinality(problems) = 0, n, array_to_string(problems, '; '));
  return case when cardinality(problems) = 0 then 'complete: ' || n || ' homes'
    else 'incomplete: ' || n || ' homes; ' || array_to_string(problems, '; ') end;
end;
$$;

revoke execute on function public.refresh_homes(text[]) from public, anon, authenticated;
revoke execute on function public.ckan_sql(text) from public, anon, authenticated;

-- Every morning at 14:17 UTC (7:17 Pacific in summer, 6:17 in winter).
select cron.schedule('care-homes-refresh', '17 14 * * *', $$select public.refresh_homes()$$);
