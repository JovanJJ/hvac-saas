-- Explicit assignment is required even for office users downloading to a field device.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public to hvac_identity_executor;
create function public.offline_visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b jsonb;begin
 if not exists(select 1 from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=p_visit_id and m.user_id=actor and m.active)
 then raise exception 'visit_denied' using errcode='42501';end if;
 b:=public.visit_bundle(p_organization_id,p_visit_id);
 return jsonb_build_object('schemaVersion',1,'userId',actor,'organizationId',p_organization_id,'downloadedAt',statement_timestamp(),
  'visit',b-'availableSystems','source',public.return_visit_source(p_organization_id,p_visit_id),
  'photoCount',(select count(*) from public.attachments where organization_id=p_organization_id and visit_id=p_visit_id and state='verified'));
end $$;
alter function public.offline_visit_bundle(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.offline_visit_bundle(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.offline_visit_bundle(uuid,uuid) to authenticated;
revoke create on schema public from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
