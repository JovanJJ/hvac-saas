-- Supabase's postgres role cannot delegate grants on the Auth-owned schema.
-- Keep the command executor isolated from Auth and expose only actor-scoped identity lookups.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
create function hvac_private.request_actor_id() returns uuid
language sql stable security definer set search_path='' as $$ select auth.uid(); $$;
alter function hvac_private.require_verified_actor() owner to postgres;
create function hvac_private.actor_email() returns text
language sql stable security definer set search_path='' as $$
  select lower(u.email) from auth.users u where u.id=hvac_private.require_verified_actor();
$$;
create function hvac_private.workspace_emails(target uuid)
returns table(user_id uuid,email text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); actor_role text;
begin
  select m.role into actor_role from public.memberships m where m.organization_id=target and m.user_id=actor and m.active;
  if actor_role is null or actor_role not in ('owner','coordinator') then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  return query select u.id,u.email::text from public.memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=target and (m.active or actor_role='owner');
end $$;
revoke all on function hvac_private.request_actor_id(),hvac_private.require_verified_actor(),hvac_private.actor_email(),hvac_private.workspace_emails(uuid) from public,anon,authenticated;
grant execute on function hvac_private.request_actor_id(),hvac_private.require_verified_actor(),hvac_private.actor_email(),hvac_private.workspace_emails(uuid) to hvac_identity_executor;

create or replace function hvac_private.has_workspace_role(target uuid,allowed_roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.organization_id=target and m.user_id=hvac_private.request_actor_id()
    and m.active and m.role=any(allowed_roles));
$$;
create or replace function public.lookup_workspace_invitation(p_token_hash text)
returns table(workspace_name text,role text,expires_at timestamptz,accepted boolean)
language sql stable security definer set search_path='' as $$
  select o.display_name,i.role,i.expires_at,i.accepted_at is not null from hvac_private.invitations i
    join public.organizations o on o.id=i.organization_id
  where i.token_hash=p_token_hash and i.revoked_at is null and i.expires_at>now()
    and (i.accepted_at is null or i.accepted_by=hvac_private.request_actor_id());
$$;
create or replace function public.accept_workspace_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); invitation hvac_private.invitations; target uuid; actor_email text;
begin
  select organization_id into target from hvac_private.invitations where token_hash=p_token_hash;
  if target is null then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  perform 1 from public.organizations where id=target for update;
  select * into invitation from hvac_private.invitations where token_hash=p_token_hash for update;
  if invitation.revoked_at is not null or invitation.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  actor_email:=hvac_private.actor_email();
  if actor_email<>invitation.email then raise exception 'invitation_email_mismatch' using errcode='22023'; end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by<>actor or not hvac_private.has_workspace_role(target,array['owner','coordinator','technician']) then raise exception 'invitation_unavailable' using errcode='42501'; end if;
    return target;
  end if;
  insert into public.memberships(organization_id,user_id,role) values(target,actor,invitation.role)
    on conflict(organization_id,user_id) do update set
      role=case when public.memberships.active then public.memberships.role else excluded.role end,
      active=true,version=public.memberships.version+case when public.memberships.active then 0 else 1 end;
  update hvac_private.invitations set accepted_at=now(),accepted_by=actor where id=invitation.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(target,actor,'invitation_accepted',invitation.id);
  return target;
end $$;
create or replace function public.workspace_roster(p_organization_id uuid)
returns table(membership_id uuid,user_id uuid,email text,role text,active boolean,version integer)
language plpgsql stable security definer set search_path='' as $$
begin
  perform hvac_private.require_verified_actor();
  if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  return query select m.id,m.user_id,u.email,m.role,m.active,m.version from public.memberships m join hvac_private.workspace_emails(p_organization_id) u on u.user_id=m.user_id
    where m.organization_id=p_organization_id and (m.active or hvac_private.has_workspace_role(p_organization_id,array['owner'])) order by m.created_at,m.id;
end $$;
-- CREATE OR REPLACE preserves the ownership and RPC execution grants established in M1b.
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
