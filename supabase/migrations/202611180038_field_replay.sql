-- Keep the original acknowledgement with the actor-scoped receipt, including after a lost response.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table hvac_private.field_replay_receipts (
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references auth.users(id),
 operation_id uuid not null, payload jsonb not null, result jsonb not null,
 primary key(organization_id,actor_id,operation_id)
);
revoke all on hvac_private.field_replay_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on hvac_private.field_replay_receipts to hvac_identity_executor;
create function public.replay_field_command(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); previous hvac_private.field_replay_receipts;
 payload jsonb:=jsonb_build_object('visit',p_visit_id,'kind',p_kind,'version',p_version,'data',p_data);
 b jsonb; result jsonb; saved_item jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 perform 1 from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found or not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) or not exists(
  select 1 from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id
  where a.organization_id=p_organization_id and a.visit_id=p_visit_id and m.user_id=actor and m.active)
 then raise exception 'visit_denied' using errcode='42501';end if;
 if p_operation_id is null or p_kind not in ('save','submit') or p_kind is null or p_version is null or p_version<1 or p_data is null or octet_length(p_data::text)>30000 or (p_kind='submit' and p_data<>'{}'::jsonb)
 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into previous from hvac_private.field_replay_receipts r where r.organization_id=p_organization_id and r.actor_id=actor and r.operation_id=p_operation_id;
 if found then
  if previous.payload<>payload then raise exception 'operation_conflict' using errcode='PT409';end if;
  return previous.result;
 end if;
 -- Reuse all authoritative M2b validation, attribution, version checks and actor-scoped receipts.
 perform public.visit_command(p_organization_id,p_visit_id,p_operation_id,p_kind,p_version,p_data);
 b:=public.offline_visit_bundle(p_organization_id,p_visit_id)->'visit';
 if p_kind='save' then select item into saved_item from jsonb_array_elements(b->'items') item where item->>'id'=p_data->>'itemId';end if;
 result:=jsonb_build_object('operationId',p_operation_id,'visitId',p_visit_id,'type',p_kind,'baseVersion',p_version,
  'confirmedAt',clock_timestamp(),'item',saved_item,'visit',jsonb_build_object('version',b->'version','status',b->'status',
  'startedAt',b->'startedAt','submittedAt',b->'submittedAt','submittedBy',b->'submittedBy','correctionReason',b->'correctionReason'));
 insert into hvac_private.field_replay_receipts values(p_organization_id,actor,p_operation_id,payload,result);
 return result;
end $$;
alter function public.replay_field_command(uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
revoke all on function public.replay_field_command(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.replay_field_command(uuid,uuid,uuid,text,integer,jsonb) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
