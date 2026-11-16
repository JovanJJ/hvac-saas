-- M1a / P01: additive identity foundation. Business data and mutations follow in M1b/M2.
create schema if not exists hvac_private;
revoke all on schema hvac_private from public, anon, authenticated;
grant usage on schema hvac_private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  time_zone text not null default 'Europe/Belgrade',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'coordinator', 'technician')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);
create index memberships_user_active_idx on public.memberships (user_id, organization_id) where active;

-- The policy helper owns only the membership predicate, avoiding recursive membership RLS.
-- An actor cannot use it to inspect another user's memberships.
create function hvac_private.is_active_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid()) and m.active
  );
$$;
revoke all on function hvac_private.is_active_member(uuid) from public, anon, authenticated;
grant execute on function hvac_private.is_active_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
revoke all on public.organizations, public.memberships from public, anon, authenticated;
grant select on public.organizations, public.memberships to authenticated;

create policy organizations_read_active_member on public.organizations
  for select to authenticated
  using ((select hvac_private.is_active_member(id)));
create policy memberships_read_self on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) and active);

comment on table public.organizations is 'M1a foundation: mutations are reserved for reviewed M1b commands.';
comment on table public.memberships is 'M1a exposes only the current user active memberships. No client grants for membership writes.';
