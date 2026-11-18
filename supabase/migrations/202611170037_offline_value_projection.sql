-- Keep arbitrary operational JSON metadata out of the downloaded field DTO.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
create or replace function public.offline_visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b jsonb;items jsonb;begin
 if not exists(select 1 from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=p_visit_id and m.user_id=actor and m.active)
 then raise exception 'visit_denied' using errcode='42501';end if;
 b:=public.visit_bundle(p_organization_id,p_visit_id);
 select jsonb_agg(item||jsonb_build_object('readings',hvac_private.report_readings(item->'readings'),'parts',hvac_private.report_parts(item->'parts')) order by position) into items from jsonb_array_elements(b->'items') with ordinality entries(item,position);
 b:=jsonb_set(b,'{items}',coalesce(items,'[]'::jsonb));
 return jsonb_build_object('schemaVersion',1,'userId',actor,'organizationId',p_organization_id,'downloadedAt',statement_timestamp(),
  'visit',b-'availableSystems','source',public.return_visit_source(p_organization_id,p_visit_id),
  'photoCount',(select count(*) from public.attachments where organization_id=p_organization_id and visit_id=p_visit_id and state='verified'));
end $$;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public to hvac_identity_executor;
create function public.offline_assignment_ids(p_organization_id uuid) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) then raise exception 'visit_denied' using errcode='42501';end if;
 return coalesce((select array_agg(a.visit_id order by a.visit_id) from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where a.organization_id=p_organization_id and m.user_id=actor and m.active),'{}'::uuid[]);
end $$;
alter function public.offline_assignment_ids(uuid) owner to hvac_identity_executor;
revoke all on function public.offline_assignment_ids(uuid) from public,anon,authenticated,service_role;
grant execute on function public.offline_assignment_ids(uuid) to authenticated;
revoke create on schema public from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
