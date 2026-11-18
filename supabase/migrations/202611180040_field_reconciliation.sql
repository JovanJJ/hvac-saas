-- Explicit reviewed replacements retain provenance and use fresh operation IDs/versions.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table hvac_private.field_reconciliations (
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references auth.users(id),
 operation_id uuid not null, previous_operation_id uuid not null, payload jsonb not null,
 server_before jsonb not null, created_at timestamptz not null default now(),
 primary key(organization_id,actor_id,operation_id)
);
revoke all on hvac_private.field_reconciliations from public,anon,authenticated,service_role;
grant select,insert,delete on hvac_private.field_reconciliations to hvac_identity_executor;
create function hvac_private.require_field_assignment(org uuid,target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();begin
 perform 1 from public.organizations where id=org for update;
 perform 1 from public.visits where organization_id=org and id=target for update;
 if not found or not hvac_private.has_workspace_role(org,array['owner','coordinator','technician']) or not exists(
 select 1 from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id
 where a.organization_id=org and a.visit_id=target and m.active and m.user_id=actor)
 then raise exception 'visit_denied' using errcode='42501';end if;
 return actor;
end $$;
alter function hvac_private.require_field_assignment(uuid,uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.require_field_assignment(uuid,uuid) from public,anon,authenticated,service_role;
create function public.field_recovery_context(p_organization_id uuid,p_visit_id uuid,p_operation jsonb,p_photo_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_field_assignment(p_organization_id,p_visit_id);r hvac_private.field_replay_receipts;expected jsonb;op jsonb;begin
 if coalesce(array_length(p_photo_ids,1),0)>100 or octet_length(coalesce(p_operation,'null'::jsonb)::text)>30000 then raise exception 'invalid_input' using errcode='22023';end if;
 if p_operation is not null and p_operation<>'null'::jsonb then
  if p_operation->>'entityId'<>p_visit_id::text or coalesce(p_operation->>'type','') not in ('save','submit') then raise exception 'invalid_input' using errcode='22023';end if;
  expected:=jsonb_build_object('visit',p_visit_id,'kind',p_operation->>'type','version',p_operation->'baseVersion','data',p_operation->'payload');
  select * into r from hvac_private.field_replay_receipts f where f.organization_id=p_organization_id and f.actor_id=actor and f.operation_id=(p_operation->>'operationId')::uuid;
  if found then op:=case when r.payload=expected then jsonb_build_object('status','committed','acknowledgement',r.result) else jsonb_build_object('status','mismatch') end;
  elsif exists(select 1 from hvac_private.operation_receipts f where f.organization_id=p_organization_id and f.actor_id=actor and f.operation_id=(p_operation->>'operationId')::uuid) then op:=jsonb_build_object('status','mismatch');
  else op:=jsonb_build_object('status','absent');end if;
 end if;
 return jsonb_build_object('bundle',public.offline_visit_bundle(p_organization_id,p_visit_id),'operation',op,
 'photos',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'itemId',a.item_id,'caption',a.caption,'visibility',a.visibility,'state',a.state) order by a.created_at) from public.attachments a where a.organization_id=p_organization_id and a.visit_id=p_visit_id and a.state<>'removed'),'[]'::jsonb),
 'photoReceipts',coalesce((select jsonb_agg(f.result order by (f.result->'visit'->>'version')::int) from hvac_private.photo_replay_receipts f where f.organization_id=p_organization_id and f.actor_id=actor and f.attachment_id=any(p_photo_ids) and f.payload->>'visit'=p_visit_id::text),'[]'::jsonb));
end $$;
create function public.reconcile_field_command(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_previous_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_field_assignment(p_organization_id,p_visit_id);event hvac_private.field_reconciliations;
 expected jsonb:=jsonb_build_object('visit',p_visit_id,'previous',p_previous_operation_id,'kind',p_kind,'version',p_version,'data',p_data);before_data jsonb;result jsonb;
begin
 if p_previous_operation_id is null or p_operation_id is null or p_previous_operation_id=p_operation_id then raise exception 'invalid_input' using errcode='22023';end if;
 select * into event from hvac_private.field_reconciliations e where e.organization_id=p_organization_id and e.actor_id=actor and e.operation_id=p_operation_id;
 if found then
  if event.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;
  return public.replay_field_command(p_organization_id,p_visit_id,p_operation_id,p_kind,p_version,p_data);
 end if;
 if exists(select 1 from hvac_private.operation_receipts f where f.organization_id=p_organization_id and f.actor_id=actor and f.operation_id=p_previous_operation_id) then raise exception 'replay_required' using errcode='PT409';end if;
 if exists(select 1 from hvac_private.operation_receipts f where f.organization_id=p_organization_id and f.actor_id=actor and f.operation_id=p_operation_id) then raise exception 'operation_conflict' using errcode='PT409';end if;
 before_data:=public.offline_visit_bundle(p_organization_id,p_visit_id);
 result:=public.replay_field_command(p_organization_id,p_visit_id,p_operation_id,p_kind,p_version,p_data);
 insert into hvac_private.field_reconciliations(organization_id,actor_id,operation_id,previous_operation_id,payload,server_before) values(p_organization_id,actor,p_operation_id,p_previous_operation_id,expected,before_data);
 return result;
end $$;
alter function public.field_recovery_context(uuid,uuid,jsonb,uuid[]) owner to hvac_identity_executor;
alter function public.reconcile_field_command(uuid,uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
revoke all on function public.field_recovery_context(uuid,uuid,jsonb,uuid[]),public.reconcile_field_command(uuid,uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.field_recovery_context(uuid,uuid,jsonb,uuid[]),public.reconcile_field_command(uuid,uuid,uuid,uuid,text,integer,jsonb) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
