-- M1b / P01. Narrow commands own lifecycle writes; raw API writes stay denied.
alter table public.organizations add column version integer not null default 1 check (version > 0);
alter table public.memberships add column version integer not null default 1 check (version > 0);

create table hvac_private.workspace_creations (
  actor_id uuid not null references auth.users(id), operation_id uuid not null,
  payload jsonb not null, organization_id uuid not null references public.organizations(id),
  primary key(actor_id, operation_id)
);
create table hvac_private.invitations (
  id uuid primary key, organization_id uuid not null references public.organizations(id),
  email text not null, role text not null check(role in ('owner','coordinator','technician')),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz, accepted_by uuid references auth.users(id), revoked_at timestamptz,
  check((accepted_at is null) = (accepted_by is null))
);
create index invitations_organization_idx on hvac_private.invitations(organization_id,created_at);
create unique index invitations_pending_email_idx on hvac_private.invitations(organization_id,email)
  where accepted_at is null and revoked_at is null;
create table hvac_private.identity_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id), event_type text not null,
  subject_id uuid not null, created_at timestamptz not null default now()
);
revoke all on hvac_private.workspace_creations,hvac_private.invitations,hvac_private.identity_events from public,anon,authenticated;

-- No login, no BYPASSRLS, no membership granted to browser roles.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='hvac_identity_executor') then
    create role hvac_identity_executor nologin noinherit;
  end if;
end $$;
-- Temporary migration authority for transferring function ownership.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit false, set true', current_user); end $$;
grant usage on schema public,hvac_private,auth to hvac_identity_executor;
grant create on schema public,hvac_private to hvac_identity_executor;
grant select,insert,update on public.organizations,public.memberships to hvac_identity_executor;
grant select,insert,update on hvac_private.workspace_creations,hvac_private.invitations,hvac_private.identity_events to hvac_identity_executor;
grant select(id,email,email_confirmed_at,deleted_at,banned_until) on auth.users to hvac_identity_executor;
create policy organizations_identity_commands on public.organizations to hvac_identity_executor using(true) with check(true);
create policy memberships_identity_commands on public.memberships to hvac_identity_executor using(true) with check(true);

create function hvac_private.require_verified_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())) then
    raise exception 'verified_identity_required' using errcode='42501';
  end if;
  return actor;
end $$;

create function hvac_private.has_workspace_role(target uuid, allowed_roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.organization_id=target and m.user_id=auth.uid()
    and m.active and m.role=any(allowed_roles));
$$;

create function public.create_workspace(p_operation_id uuid,p_name text,p_time_zone text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); existing hvac_private.workspace_creations;
  target uuid; payload jsonb:=jsonb_build_object('name',btrim(p_name),'time_zone',p_time_zone);
begin
  if p_operation_id is null or p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then
    raise exception 'invalid_workspace' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select * into existing from hvac_private.workspace_creations where actor_id=actor and operation_id=p_operation_id;
  if found then
    if existing.payload<>payload then raise exception 'operation_payload_conflict' using errcode='22023'; end if;
    if not hvac_private.has_workspace_role(existing.organization_id,array['owner']) then
      raise exception 'workspace_access_denied' using errcode='42501';
    end if;
    return existing.organization_id;
  end if;
  insert into public.organizations(display_name,time_zone) values(btrim(p_name),p_time_zone) returning id into target;
  insert into public.memberships(organization_id,user_id,role) values(target,actor,'owner');
  insert into hvac_private.workspace_creations values(actor,p_operation_id,payload,target);
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(target,actor,'workspace_created',target);
  return target;
end $$;

create function public.update_workspace(p_organization_id uuid,p_name text,p_time_zone text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); current_version integer;
begin
  select version into current_version from public.organizations where id=p_organization_id for update;
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if p_version is null or current_version<>p_version then raise exception 'stale_workspace' using errcode='40001'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_time_zone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'invalid_workspace' using errcode='22023'; end if;
  update public.organizations set display_name=btrim(p_name),time_zone=p_time_zone,version=version+1 where id=p_organization_id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'workspace_updated',p_organization_id);
end $$;

create function public.create_workspace_invitation(p_organization_id uuid,p_operation_id uuid,p_email text,p_role text,p_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); existing hvac_private.invitations; normalized_email text:=lower(btrim(p_email));
begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if p_operation_id is null or p_email is null or length(normalized_email)>254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_role is null or p_role not in ('owner','coordinator','technician') or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_invitation' using errcode='22023';
  end if;
  select * into existing from hvac_private.invitations where id=p_operation_id;
  if found then
    if existing.organization_id<>p_organization_id or existing.created_by<>actor or existing.email<>normalized_email
      or existing.role<>p_role or existing.token_hash<>p_token_hash then raise exception 'operation_payload_conflict' using errcode='22023'; end if;
    if existing.revoked_at is not null or existing.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='22023'; end if;
    return existing.id;
  end if;
  update hvac_private.invitations set revoked_at=now() where organization_id=p_organization_id and email=normalized_email and accepted_at is null and revoked_at is null;
  insert into hvac_private.invitations(id,organization_id,email,role,token_hash,created_by)
    values(p_operation_id,p_organization_id,normalized_email,p_role,p_token_hash,actor);
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'invitation_created',p_operation_id);
  return p_operation_id;
end $$;

create function public.lookup_workspace_invitation(p_token_hash text)
returns table(workspace_name text,role text,expires_at timestamptz,accepted boolean)
language sql stable security definer set search_path='' as $$
  select o.display_name,i.role,i.expires_at,i.accepted_at is not null from hvac_private.invitations i
    join public.organizations o on o.id=i.organization_id
  where i.token_hash=p_token_hash and i.revoked_at is null and i.expires_at>now()
    and (i.accepted_at is null or i.accepted_by=auth.uid());
$$;

create function public.accept_workspace_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); invitation hvac_private.invitations; target uuid; actor_email text;
begin
  select organization_id into target from hvac_private.invitations where token_hash=p_token_hash;
  if target is null then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  perform 1 from public.organizations where id=target for update;
  select * into invitation from hvac_private.invitations where token_hash=p_token_hash for update;
  if invitation.revoked_at is not null or invitation.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  select lower(email) into actor_email from auth.users where id=actor;
  if actor_email<>invitation.email then raise exception 'invitation_email_mismatch' using errcode='22023'; end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by<>actor or not hvac_private.has_workspace_role(target,array['owner','coordinator','technician']) then
      raise exception 'invitation_unavailable' using errcode='42501';
    end if;
    return target;
  end if;
  -- Existing active staff keep their current role. A fresh owner-issued invitation may reactivate revoked staff.
  insert into public.memberships(organization_id,user_id,role) values(target,actor,invitation.role)
    on conflict(organization_id,user_id) do update set
      role=case when public.memberships.active then public.memberships.role else excluded.role end,
      active=true,version=public.memberships.version+case when public.memberships.active then 0 else 1 end;
  update hvac_private.invitations set accepted_at=now(),accepted_by=actor where id=invitation.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(target,actor,'invitation_accepted',invitation.id);
  return target;
end $$;

create function public.revoke_workspace_invitation(p_organization_id uuid,p_invitation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();
begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if not exists(select 1 from hvac_private.invitations where id=p_invitation_id and organization_id=p_organization_id) then
    raise exception 'invitation_unavailable' using errcode='22023';
  end if;
  update hvac_private.invitations set revoked_at=now() where id=p_invitation_id and revoked_at is null;
  if found then insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'invitation_revoked',p_invitation_id); end if;
end $$;

create function public.update_workspace_member(p_organization_id uuid,p_membership_id uuid,p_role text,p_active boolean,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); member public.memberships;
begin
  -- Serialize all authority changes within an organization before checking the actor again.
  perform 1 from public.organizations where id=p_organization_id for update;
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  select * into member from public.memberships where id=p_membership_id and organization_id=p_organization_id for update;
  if not found then raise exception 'membership_unavailable' using errcode='22023'; end if;
  if p_version is null or member.version<>p_version then raise exception 'stale_membership' using errcode='40001'; end if;
  if p_role is null or p_role not in ('owner','coordinator','technician') or p_active is null then raise exception 'invalid_member' using errcode='22023'; end if;
  if member.active and member.role='owner' and (not p_active or p_role<>'owner')
    and not exists(select 1 from public.memberships where organization_id=p_organization_id and id<>member.id and active and role='owner') then
    raise exception 'last_active_owner' using errcode='22023';
  end if;
  update public.memberships set role=p_role,active=p_active,version=version+1 where id=member.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'membership_updated',member.id);
end $$;

create function public.workspace_roster(p_organization_id uuid)
returns table(membership_id uuid,user_id uuid,email text,role text,active boolean,version integer)
language plpgsql stable security definer set search_path='' as $$
begin
  perform hvac_private.require_verified_actor();
  if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  return query select m.id,m.user_id,u.email::text,m.role,m.active,m.version from public.memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=p_organization_id and (m.active or hvac_private.has_workspace_role(p_organization_id,array['owner'])) order by m.created_at,m.id;
end $$;

create function public.workspace_invitations(p_organization_id uuid)
returns table(id uuid,email text,role text,expires_at timestamptz,accepted_at timestamptz,revoked_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  perform hvac_private.require_verified_actor();
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  return query select i.id,i.email,i.role,i.expires_at,i.accepted_at,i.revoked_at from hvac_private.invitations i where i.organization_id=p_organization_id order by i.created_at desc,i.id;
end $$;

-- Own-row policy stays simple; office roster reads use an explicitly authorized RPC.
-- Each elevated function is owned by the narrow executor role and has no PUBLIC execution.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('create_workspace','update_workspace','create_workspace_invitation','lookup_workspace_invitation','accept_workspace_invitation','revoke_workspace_invitation','update_workspace_member','workspace_roster','workspace_invitations'))
      or (n.nspname='hvac_private' and p.proname in ('require_verified_actor','has_workspace_role'))
  loop
    execute format('alter function %s owner to hvac_identity_executor',fn.signature);
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  end loop;
end $$;
grant execute on function public.create_workspace(uuid,text,text),public.update_workspace(uuid,text,text,integer),
  public.create_workspace_invitation(uuid,uuid,text,text,text),public.accept_workspace_invitation(text),
  public.revoke_workspace_invitation(uuid,uuid),public.update_workspace_member(uuid,uuid,text,boolean,integer),
  public.workspace_roster(uuid),public.workspace_invitations(uuid) to authenticated;
grant execute on function public.lookup_workspace_invitation(text) to anon,authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I', current_user); end $$;
