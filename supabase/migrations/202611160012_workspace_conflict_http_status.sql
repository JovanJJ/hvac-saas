-- Apply the same terminal conflict status to existing workspace commands.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
create or replace function public.update_workspace(p_organization_id uuid,p_name text,p_time_zone text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); current_version integer;
begin
  select version into current_version from public.organizations where id=p_organization_id for update;
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if p_version is null or current_version<>p_version then raise exception 'stale_workspace' using errcode='PT409'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_time_zone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'invalid_workspace' using errcode='22023'; end if;
  update public.organizations set display_name=btrim(p_name),time_zone=p_time_zone,version=version+1 where id=p_organization_id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'workspace_updated',p_organization_id);
end $$;
create or replace function public.update_workspace_member(p_organization_id uuid,p_membership_id uuid,p_role text,p_active boolean,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); member public.memberships;
begin
  -- Serialize all authority changes within an organization before checking the actor again.
  perform 1 from public.organizations where id=p_organization_id for update;
  if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  select * into member from public.memberships where id=p_membership_id and organization_id=p_organization_id for update;
  if not found then raise exception 'membership_unavailable' using errcode='22023'; end if;
  if p_version is null or member.version<>p_version then raise exception 'stale_membership' using errcode='PT409'; end if;
  if p_role is null or p_role not in ('owner','coordinator','technician') or p_active is null then raise exception 'invalid_member' using errcode='22023'; end if;
  if member.active and member.role='owner' and (not p_active or p_role<>'owner')
    and not exists(select 1 from public.memberships where organization_id=p_organization_id and id<>member.id and active and role='owner') then
    raise exception 'last_active_owner' using errcode='22023';
  end if;
  update public.memberships set role=p_role,active=p_active,version=version+1 where id=member.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'membership_updated',member.id);
end $$;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
