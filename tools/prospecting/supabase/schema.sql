-- Bay Area care-home tracker: run once in Supabase (SQL Editor > New query).
-- The daily GitHub Action writes `homes` and `refresh_log` with the
-- service-role key (which skips these rules). The website signs you in by
-- email link and can only read homes and read/write your outreach notes if
-- your email is in `allowed_users`.

create table if not exists public.homes (
  home_key text primary key,
  facility_number text default '',
  facility_name text not null,
  facility_type text default '',
  grp text default '',
  licensee_owner text default '',
  cms_legal_business_name text default '',
  cms_owners text default '',
  administrator text default '',
  address text default '',
  city text default '',
  zip text default '',
  county text default '',
  phone text default '',
  email text default '',
  capacity text default '',
  license_status text default '',
  source text default '',
  still_listed boolean not null default true,
  seen_at timestamptz not null default now()
);

create table if not exists public.outreach (
  home_key text primary key,          -- no foreign key: notes outlive a home leaving the list
  status text not null default 'New',
  priority text default '',
  contact_name text default '',
  contact_email text default '',
  first_contact date,
  last_contact date,
  visit_date date,
  next_step text default '',
  notes text default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.refresh_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  complete boolean not null,
  homes int not null,
  problems text default ''
);

create table if not exists public.allowed_users (
  email text primary key
);

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
-- Only the policies (run as signed-in users) need it; nobody signed out does.
revoke execute on function public.is_allowed() from public, anon;

alter table public.homes enable row level security;
alter table public.outreach enable row level security;
alter table public.refresh_log enable row level security;
alter table public.allowed_users enable row level security;  -- no policies: only the SQL editor and service role

drop policy if exists homes_read on public.homes;
create policy homes_read on public.homes for select to authenticated using (public.is_allowed());

drop policy if exists outreach_read on public.outreach;
create policy outreach_read on public.outreach for select to authenticated using (public.is_allowed());
drop policy if exists outreach_insert on public.outreach;
create policy outreach_insert on public.outreach for insert to authenticated with check (public.is_allowed());
drop policy if exists outreach_update on public.outreach;
create policy outreach_update on public.outreach for update to authenticated
  using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists refresh_log_read on public.refresh_log;
create policy refresh_log_read on public.refresh_log for select to authenticated using (public.is_allowed());

-- Then add yourself (and anyone you work with):
--   insert into public.allowed_users (email) values ('you@example.com');
