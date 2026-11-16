-- Domain conflicts are HTTP 409, not transient database serialization errors.
-- PostgREST retries SQLSTATE 40001; stale user commands must return immediately.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
create or replace function public.visit_command(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); v public.visits; i public.visit_items; previous jsonb;
 payload jsonb:=jsonb_build_object('visit',p_visit_id,'kind',p_kind,'version',p_version,'data',p_data);
 r jsonb; f jsonb; part jsonb; owner_id uuid; target uuid;
begin
 -- Same lock order as membership commands: authorization cannot race revocation.
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found or not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501'; end if;
 if p_kind='return' and not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'visit_denied' using errcode='42501'; end if;
 if p_operation_id is null or p_version is null or p_data is null or octet_length(p_data::text)>30000 then raise exception 'invalid_input' using errcode='22023'; end if;
 select receipt.payload into previous from hvac_private.operation_receipts receipt where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
 if previous<>payload then raise exception 'operation_conflict' using errcode='PT409'; end if;
 return p_visit_id;
 end if;
 if p_kind='save' then
 if v.status='submitted' then raise exception 'visit_locked' using errcode='22023'; end if;
 select * into i from public.visit_items where organization_id=p_organization_id and visit_id=p_visit_id and id=(p_data->>'itemId')::uuid for update;
 if not found then raise exception 'invalid_item' using errcode='22023'; end if;
 if i.version<>p_version then raise exception 'stale_version' using errcode='PT409'; end if;
 if coalesce(p_data->>'outcome','') not in ('pending','serviced','repair_needed','no_access') then raise exception 'invalid_outcome' using errcode='22023'; end if;
 if jsonb_typeof(p_data->'readings') is distinct from 'array' or jsonb_array_length(p_data->'readings')>10 or jsonb_typeof(p_data->'parts') is distinct from 'array' or jsonb_array_length(p_data->'parts')>20 then raise exception 'invalid_details' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(p_data->'readings') loop
 if coalesce(r->>'status','') not in ('measured','not_measured','not_applicable') or length(trim(coalesce(r->>'kind','')))=0 or length(trim(coalesce(r->>'mode','')))=0 then raise exception 'invalid_reading' using errcode='22023'; end if;
 if r->>'status'='measured' then
 if jsonb_typeof(r->'value') is distinct from 'number' or length(trim(coalesce(r->>'unit','')))=0 or p_data->>'outcome'='no_access' then raise exception 'invalid_reading' using errcode='22023'; end if;
 elsif r->'value' is distinct from 'null'::jsonb then raise exception 'invalid_reading' using errcode='22023'; end if;
 end loop;
 for part in select value from jsonb_array_elements(p_data->'parts') loop
 if length(trim(coalesce(part->>'name','')))=0 or length(trim(coalesce(part->>'unit','')))=0 or jsonb_typeof(part->'quantity') is distinct from 'number' or (part->>'quantity')::numeric<=0 then raise exception 'invalid_part' using errcode='22023'; end if;
 end loop;
 if p_data->>'outcome'='no_access' and (length(trim(coalesce(p_data->>'noAccessReason','')))=0 or length(trim(coalesce(p_data->>'work','')))>0 or jsonb_array_length(p_data->'parts')>0) then raise exception 'invalid_no_access' using errcode='22023'; end if;
 f:=p_data->'followUp';
 if f is not null and f<>'null'::jsonb then
 owner_id:=nullif(f->>'ownerId','')::uuid;
 if coalesce(f->>'kind','') not in ('quote','repair','revisit') or (owner_id is not null and not exists(select 1 from public.memberships where organization_id=p_organization_id and id=owner_id and active)) then raise exception 'invalid_follow_up' using errcode='22023'; end if;
 insert into public.follow_ups(organization_id,item_id,kind,owner_id,due_date,customer_action) values(p_organization_id,i.id,f->>'kind',owner_id,nullif(f->>'dueDate','')::date,coalesce(f->>'customerAction',''))
 on conflict(organization_id,item_id) do update set kind=excluded.kind,owner_id=excluded.owner_id,due_date=excluded.due_date,customer_action=excluded.customer_action;
 else delete from public.follow_ups where organization_id=p_organization_id and item_id=i.id;
 end if;
 update public.visit_items set outcome=p_data->>'outcome',work=coalesce(p_data->>'work',''),finding=coalesce(p_data->>'finding',''),no_access_reason=coalesce(p_data->>'noAccessReason',''),internal_note=coalesce(p_data->>'internalNote',''),readings=p_data->'readings',parts=p_data->'parts',entered_by=actor,entered_at=now(),version=version+1 where id=i.id;
 update public.visits set status='in_progress',started_at=coalesce(started_at,now()),version=version+1 where id=v.id;
 else
 if v.version<>p_version then raise exception 'stale_version' using errcode='PT409'; end if;
 if p_kind='add' then
 if v.status='submitted' then raise exception 'visit_locked' using errcode='22023'; end if;
 target:=(p_data->>'systemId')::uuid;
 if not exists(select 1 from public.systems where organization_id=p_organization_id and site_id=v.site_id and id=target) then raise exception 'invalid_system' using errcode='22023'; end if;
 insert into public.visit_items(organization_id,site_id,visit_id,system_id,planned) values(p_organization_id,v.site_id,v.id,target,false) on conflict(organization_id,visit_id,system_id) do nothing;
 update public.visits set version=version+1 where id=v.id;
 elsif p_kind='submit' then
 if v.status<>'in_progress' then raise exception 'invalid_transition' using errcode='22023'; end if;
 if not exists(select 1 from public.visit_items where visit_id=v.id) or exists(select 1 from public.visit_items where visit_id=v.id and outcome='pending') then raise exception 'pending_items' using errcode='22023'; end if;
 if exists(select 1 from public.visit_items vi left join public.follow_ups f on f.item_id=vi.id left join public.memberships m on m.id=f.owner_id and m.organization_id=p_organization_id and m.active where vi.visit_id=v.id and ((vi.outcome in ('repair_needed','no_access') and f.id is null) or (f.id is not null and (m.id is null or f.due_date is null)) or (vi.outcome='repair_needed' and length(trim(vi.finding))=0))) then raise exception 'missing_follow_up' using errcode='22023'; end if;
 update public.visits set status='submitted',submitted_at=now(),submitted_by=actor,correction_reason='',version=version+1 where id=v.id;
 elsif p_kind='return' then
 if v.status<>'submitted' or length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'invalid_transition' using errcode='22023'; end if;
 update public.visits set status='in_progress',correction_reason=trim(p_data->>'reason'),version=version+1 where id=v.id;
 insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'visit_returned',v.id);
 insert into hvac_private.visit_corrections(organization_id,visit_id,actor_id,reason) values(p_organization_id,v.id,actor,trim(p_data->>'reason'));
 else raise exception 'invalid_command' using errcode='22023'; end if;
 end if;
 insert into hvac_private.operation_receipts values(p_organization_id,actor,p_operation_id,payload);
 return p_visit_id;
end $$;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
