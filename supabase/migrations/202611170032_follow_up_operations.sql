-- Office lifecycle is separate from captured findings and immutable report revisions.
alter table public.follow_ups drop constraint follow_ups_state_check;
alter table public.follow_ups add constraint follow_ups_state_check check(state in ('open','completed'));
alter table public.follow_ups add column version integer not null default 1 check(version>0),
 add column managed_at timestamptz,
 add column owner_label text,
 add column completed_at timestamptz,
 add column completed_by uuid references auth.users(id),
 add column completed_by_label text,
 add column completion_note text not null default '',
 add column return_visit_id uuid unique,
 add constraint follow_up_return_visit foreign key(organization_id,return_visit_id) references public.visits(organization_id,id),
 add constraint follow_up_completion check((state='open' and completed_at is null and completed_by is null and completed_by_label is null and completion_note='') or (state='completed' and completed_at is not null and completed_by is not null and completed_by_label is not null and length(trim(completion_note)) between 1 and 2000));
create index follow_ups_state_due_idx on public.follow_ups(organization_id,state,due_date);
create table hvac_private.follow_up_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,action_id uuid not null references public.follow_ups(id),
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),kind text not null,
 before_value jsonb not null,after_value jsonb not null
);
create table hvac_private.follow_up_receipts(
 organization_id uuid not null,actor_id uuid not null references auth.users(id),operation_id uuid not null,payload jsonb not null,result uuid not null,
 primary key(organization_id,actor_id,operation_id)
);
create table hvac_private.follow_up_bookings(
 action_id uuid primary key references public.follow_ups(id),organization_id uuid not null,visit_id uuid not null unique,payload jsonb not null,
 foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
revoke all on hvac_private.follow_up_events,hvac_private.follow_up_receipts,hvac_private.follow_up_bookings from public,anon,authenticated,service_role;
grant select,insert on hvac_private.follow_up_events,hvac_private.follow_up_receipts,hvac_private.follow_up_bookings to hvac_identity_executor;
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;

-- Called only by the existing authenticated field/amendment commands, under their locks.
create function hvac_private.save_captured_follow_up(org uuid,item uuid,data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare f public.follow_ups;captured jsonb;begin
 select * into f from public.follow_ups where organization_id=org and item_id=item for update;
 captured:=case when f.id is null then 'null'::jsonb else jsonb_build_object('kind',f.kind,'ownerId',coalesce(f.owner_id::text,''),'dueDate',coalesce(f.due_date::text,''),'customerAction',f.customer_action) end;
 if captured=coalesce(data,'null'::jsonb) then return;end if;
 if f.managed_at is not null or f.state='completed' or f.return_visit_id is not null then raise exception 'follow_up_managed' using errcode='PT409';end if;
 if data is null or data='null'::jsonb then delete from public.follow_ups where organization_id=org and item_id=item;
 else
  insert into public.follow_ups(organization_id,item_id,kind,owner_id,due_date,customer_action)
   values(org,item,data->>'kind',nullif(data->>'ownerId','')::uuid,nullif(data->>'dueDate','')::date,coalesce(data->>'customerAction',''))
   on conflict(organization_id,item_id) do update set kind=excluded.kind,owner_id=excluded.owner_id,due_date=excluded.due_date,customer_action=excluded.customer_action,version=follow_ups.version+1;
 end if;
end $$;
alter function hvac_private.save_captured_follow_up(uuid,uuid,jsonb) owner to hvac_identity_executor;
revoke all on function hvac_private.save_captured_follow_up(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.follow_up_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'action_denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',f.id,'version',f.version,'kind',f.kind,'state',f.state,'ownerId',f.owner_id,'owner',coalesce(st.email,f.owner_label,''),
  'dueDate',f.due_date,'customerAction',f.customer_action,'completedAt',f.completed_at,'completedBy',f.completed_by_label,'completionNote',f.completion_note,
  'returnVisitId',f.return_visit_id,'returnStart',rv.scheduled_at,'returnEnd',rv.ends_at,
  'visitId',v.id,'itemId',i.id,'systemId',i.system_id,'code',sys.code,'room',sys.room,'site',s.name,'customer',c.name,'timeZone',s.time_zone,
  'finding',i.finding,'work',i.work,'noAccessReason',i.no_access_reason,'outcome',i.outcome,'sourceStart',v.scheduled_at
 ) order by f.state desc,f.due_date,f.id)
 from public.follow_ups f join public.visit_items i on i.organization_id=f.organization_id and i.id=f.item_id
 join public.visits v on v.organization_id=i.organization_id and v.id=i.visit_id
 join public.systems sys on sys.organization_id=i.organization_id and sys.id=i.system_id
 join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 left join lateral hvac_private.visit_staff(p_organization_id,v.id) st on st.id=f.owner_id
 left join public.visits rv on rv.organization_id=f.organization_id and rv.id=f.return_visit_id
 where f.organization_id=p_organization_id and v.status in ('submitted','issued')),'[]'::jsonb);
end $$;

create function public.follow_up_command(p_organization_id uuid,p_action_id uuid,p_operation_id uuid,p_version integer,p_kind text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();f public.follow_ups;v public.visits;i public.visit_items;
 previous hvac_private.follow_up_receipts;booking hvac_private.follow_up_bookings;before_value jsonb;after_value jsonb;
 payload jsonb:=jsonb_build_object('action',p_action_id,'version',p_version,'kind',p_kind,'data',p_data);result uuid;member_label text;owner uuid;booking_data jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'action_denied' using errcode='42501';end if;
 select vi.* into i from public.visit_items vi join public.follow_ups fu on fu.organization_id=vi.organization_id and fu.item_id=vi.id where fu.organization_id=p_organization_id and fu.id=p_action_id;
 if not found then raise exception 'action_denied' using errcode='42501';end if;
 select * into v from public.visits where organization_id=p_organization_id and id=i.visit_id for update;
 select * into f from public.follow_ups where organization_id=p_organization_id and id=p_action_id for update;
 if v.status not in ('submitted','issued') then raise exception 'source_not_submitted' using errcode='22023';end if;
 if p_operation_id is null or p_version is null or p_version<1 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000 then raise exception 'invalid_action' using errcode='22023';end if;
 select * into previous from hvac_private.follow_up_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if previous.payload<>payload then raise exception 'operation_conflict' using errcode='PT409';end if;
  return previous.result;
 end if;
 -- Even different operations converge on the one source-action booking. Reject changed proposals.
 if p_kind='book' then
  if f.kind not in ('repair','revisit') or p_data-array['start','end','members']<>'{}'::jsonb or jsonb_typeof(p_data->'start') is distinct from 'string' or jsonb_typeof(p_data->'end') is distinct from 'string' or jsonb_typeof(p_data->'members') is distinct from 'array' or jsonb_array_length(p_data->'members') not between 1 and 100 then raise exception 'invalid_booking' using errcode='22023';end if;
  booking_data:=jsonb_build_object('siteId',v.site_id,'visitType',case when f.kind='repair' then 'repair' else v.visit_type end,
   'systems',jsonb_build_array(i.system_id),'start',p_data->'start','end',p_data->'end','members',(select jsonb_agg(m order by m) from (select distinct value as m from jsonb_array_elements_text(p_data->'members')) selected));
  select * into booking from hvac_private.follow_up_bookings where organization_id=p_organization_id and action_id=f.id;
  if found then
   if booking.payload<>booking_data then raise exception 'booking_conflict' using errcode='PT409';end if;
   insert into hvac_private.follow_up_receipts values(p_organization_id,actor,p_operation_id,payload,booking.visit_id);
   return booking.visit_id;
  end if;
 end if;
 if f.version<>p_version then raise exception 'stale_action' using errcode='PT409';end if;
 if f.state<>'open' then raise exception 'action_completed' using errcode='PT409';end if;
 before_value:=to_jsonb(f);result:=f.id;
 if p_kind='assign' then
  if p_data-array['ownerId','dueDate']<>'{}'::jsonb or coalesce(p_data->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_action' using errcode='22023';end if;
  owner:=(p_data->>'ownerId')::uuid;
  select email into member_label from hvac_private.visit_staff(p_organization_id,v.id) where id=owner;
  if member_label is null then raise exception 'invalid_owner' using errcode='22023';end if;
  update public.follow_ups set owner_id=owner,owner_label=member_label,due_date=(p_data->>'dueDate')::date,managed_at=coalesce(managed_at,clock_timestamp()),version=version+1 where organization_id=p_organization_id and id=f.id;
 elsif p_kind='complete' then
  if p_data-array['note']<>'{}'::jsonb or jsonb_typeof(p_data->'note') is distinct from 'string' or length(trim(p_data->>'note')) not between 1 and 2000 then raise exception 'completion_note_required' using errcode='22023';end if;
  select email into member_label from hvac_private.visit_staff(p_organization_id,v.id) where id=f.owner_id;
  if member_label is null or f.due_date is null then raise exception 'invalid_owner' using errcode='22023';end if;
  update public.follow_ups set state='completed',owner_label=member_label,completed_at=clock_timestamp(),completed_by=actor,completed_by_label=hvac_private.actor_email(),completion_note=trim(p_data->>'note'),managed_at=coalesce(managed_at,clock_timestamp()),version=version+1 where organization_id=p_organization_id and id=f.id;
 elsif p_kind='book' then
  result:=public.save_operation(p_organization_id,gen_random_uuid(),'visit',booking_data);
  insert into hvac_private.follow_up_bookings values(f.id,p_organization_id,result,booking_data);
  update public.follow_ups set return_visit_id=result,managed_at=coalesce(managed_at,clock_timestamp()),version=version+1 where organization_id=p_organization_id and id=f.id;
 else raise exception 'invalid_command' using errcode='22023';end if;
 update public.visit_items set version=version+1 where organization_id=p_organization_id and id=i.id;
 update public.visits set version=version+1 where organization_id=p_organization_id and id=v.id;
 select to_jsonb(fu) into after_value from public.follow_ups fu where organization_id=p_organization_id and id=f.id;
 insert into hvac_private.follow_up_events(organization_id,action_id,actor_id,kind,before_value,after_value) values(p_organization_id,f.id,actor,p_kind,before_value,after_value);
 insert into hvac_private.follow_up_receipts values(p_organization_id,actor,p_operation_id,payload,result);
 return result;
end $$;

-- A newly assigned return technician receives only this system's source finding, not the entire original visit.
create function public.return_visit_source(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501';end if;
 return (select jsonb_build_object('actionId',f.id,'kind',f.kind,'state',f.state,'visitId',i.visit_id,'itemId',i.id,'code',s.code,'room',s.room,'finding',i.finding,'work',i.work,'noAccessReason',i.no_access_reason,'customerAction',f.customer_action)
 from public.follow_ups f join public.visit_items i on i.organization_id=f.organization_id and i.id=f.item_id join public.systems s on s.organization_id=i.organization_id and s.id=i.system_id where f.organization_id=p_organization_id and f.return_visit_id=p_visit_id);
end $$;
alter function public.follow_up_list(uuid) owner to hvac_identity_executor;
alter function public.follow_up_command(uuid,uuid,uuid,integer,text,jsonb) owner to hvac_identity_executor;
alter function public.return_visit_source(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.follow_up_list(uuid),public.follow_up_command(uuid,uuid,uuid,integer,text,jsonb),public.return_visit_source(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.follow_up_list(uuid),public.follow_up_command(uuid,uuid,uuid,integer,text,jsonb),public.return_visit_source(uuid,uuid) to authenticated;

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
 if v.status not in ('scheduled','in_progress') then raise exception 'visit_locked' using errcode='22023'; end if;
 select * into i from public.visit_items where organization_id=p_organization_id and visit_id=p_visit_id and id=(p_data->>'itemId')::uuid for update;
 if not found then raise exception 'invalid_item' using errcode='22023'; end if;
 if i.version<>p_version then raise exception 'stale_version' using errcode='PT409'; end if;
 if coalesce(p_data->>'outcome','') not in ('pending','serviced','repair_needed','no_access') then raise exception 'invalid_outcome' using errcode='22023'; end if;
 if jsonb_typeof(p_data->'readings') is distinct from 'array' or jsonb_array_length(p_data->'readings')>10 or jsonb_typeof(p_data->'parts') is distinct from 'array' or jsonb_array_length(p_data->'parts')>20 then raise exception 'invalid_details' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(p_data->'readings') loop
 if jsonb_typeof(r->'kind') is distinct from 'string' or jsonb_typeof(r->'mode') is distinct from 'string' or jsonb_typeof(r->'status') is distinct from 'string' or (r->'unit' is not null and r->'unit'<>'null'::jsonb and jsonb_typeof(r->'unit')<>'string') or coalesce(r->>'status','') not in ('measured','not_measured','not_applicable') or length(trim(coalesce(r->>'kind','')))=0 or length(trim(coalesce(r->>'mode','')))=0 then raise exception 'invalid_reading' using errcode='22023'; end if;
 if r->>'status'='measured' then
 if (case when jsonb_typeof(r->'value')='number' then abs((r->>'value')::numeric)>1e308 else true end) or length(trim(coalesce(r->>'unit','')))=0 or p_data->>'outcome'='no_access' then raise exception 'invalid_reading' using errcode='22023'; end if;
 elsif r->'value' is distinct from 'null'::jsonb then raise exception 'invalid_reading' using errcode='22023'; end if;
 end loop;
 for part in select value from jsonb_array_elements(p_data->'parts') loop
 if jsonb_typeof(part->'name') is distinct from 'string' or jsonb_typeof(part->'unit') is distinct from 'string' or length(trim(coalesce(part->>'name','')))=0 or length(trim(coalesce(part->>'unit','')))=0 or (case when jsonb_typeof(part->'quantity')='number' then (part->>'quantity')::numeric<=0 or (part->>'quantity')::numeric>1e308 else true end) then raise exception 'invalid_part' using errcode='22023'; end if;
 end loop;
 if p_data->>'outcome'='no_access' and (length(trim(coalesce(p_data->>'noAccessReason','')))=0 or length(trim(coalesce(p_data->>'work','')))>0 or jsonb_array_length(p_data->'parts')>0) then raise exception 'invalid_no_access' using errcode='22023'; end if;
 f:=p_data->'followUp';
 if f is not null and f<>'null'::jsonb then
 owner_id:=nullif(f->>'ownerId','')::uuid;
 if coalesce(f->>'kind','') not in ('quote','repair','revisit') or (owner_id is not null and not exists(select 1 from public.memberships where organization_id=p_organization_id and id=owner_id and active)) then raise exception 'invalid_follow_up' using errcode='22023'; end if;
 else null;
 end if;
 perform hvac_private.save_captured_follow_up(p_organization_id,i.id,f);
 update public.visit_items set outcome=p_data->>'outcome',work=coalesce(p_data->>'work',''),finding=coalesce(p_data->>'finding',''),no_access_reason=coalesce(p_data->>'noAccessReason',''),internal_note=coalesce(p_data->>'internalNote',''),readings=p_data->'readings',parts=p_data->'parts',entered_by=actor,entered_at=now(),version=version+1 where id=i.id;
 update public.visits set status='in_progress',started_at=coalesce(started_at,now()),version=version+1 where id=v.id;
 else
 if v.version<>p_version then raise exception 'stale_version' using errcode='PT409'; end if;
 if p_kind='add' then
 if v.status not in ('scheduled','in_progress') then raise exception 'visit_locked' using errcode='22023'; end if;
 target:=(p_data->>'systemId')::uuid;
 if not exists(select 1 from public.systems where organization_id=p_organization_id and site_id=v.site_id and id=target) then raise exception 'invalid_system' using errcode='22023'; end if;
 insert into public.visit_items(organization_id,site_id,visit_id,system_id,planned) values(p_organization_id,v.site_id,v.id,target,false) on conflict(organization_id,visit_id,system_id) do nothing;
 update public.visits set version=version+1 where id=v.id;
 elsif p_kind='submit' then
 if v.status<>'in_progress' then raise exception 'invalid_transition' using errcode='22023'; end if;
 if not exists(select 1 from public.visit_items where visit_id=v.id) or exists(select 1 from public.visit_items where visit_id=v.id and outcome='pending') then raise exception 'pending_items' using errcode='22023'; end if;
 if exists(select 1 from public.visit_items vi left join public.follow_ups f on f.item_id=vi.id left join public.memberships m on m.id=f.owner_id and m.organization_id=p_organization_id and m.active where vi.visit_id=v.id and ((vi.outcome in ('repair_needed','no_access') and f.id is null) or (f.id is not null and f.state='open' and (m.id is null or f.due_date is null)) or (vi.outcome='repair_needed' and length(trim(vi.finding))=0))) then raise exception 'missing_follow_up' using errcode='22023'; end if;
 if exists(select 1 from public.attachments where organization_id=p_organization_id and visit_id=v.id and state='reserved') then raise exception 'pending_attachments' using errcode='22023'; end if;
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

create or replace function public.visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); result jsonb;
begin
 if not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501'; end if;
 select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason,
 'technicians',coalesce((select jsonb_agg(st.email order by st.email) from public.visit_assignees a join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=v.id),'[]'),'site',s.name,'address',s.address,'accessNote',s.access_note,'customer',c.name,'contact',c.contact,'timeZone',s.time_zone,'start',v.scheduled_at,'visitType',v.visit_type,
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'label',m.email)) from hvac_private.visit_staff(p_organization_id,p_visit_id) m),'[]'),
 'availableSystems',coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'room',sys.room)) from public.systems sys where sys.organization_id=p_organization_id and sys.site_id=v.site_id and not exists(select 1 from public.visit_items i where i.visit_id=v.id and i.system_id=sys.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'version',i.version,'planned',i.planned,'code',sys.code,'room',sys.room,'model',sys.model,'serial',sys.serial,'outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'internalNote',i.internal_note,'readings',i.readings,'parts',i.parts,'enteredByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.entered_by),'correctedAt',i.corrected_at,'correctedByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.corrected_by),'enteredBy',i.entered_by,'enteredAt',i.entered_at,'followUp',(select jsonb_build_object('id',f.id,'state',f.state,'version',f.version,'ownerLabel',f.owner_label,'completedAt',f.completed_at,'kind',f.kind,'ownerId',f.owner_id,'dueDate',f.due_date,'customerAction',f.customer_action) from public.follow_ups f where f.item_id=i.id)) order by sys.code) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.organization_id=p_organization_id and i.visit_id=v.id),'[]')) into result
 from public.visits v join public.sites s on s.id=v.site_id join public.customers c on c.id=s.customer_id where v.organization_id=p_organization_id and v.id=p_visit_id;
 if result is null then raise exception 'visit_denied' using errcode='42501'; end if;
 return result;
end $$;

create or replace function hvac_private.validate_report_visit(org uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item public.visit_items;reading jsonb;part jsonb;begin
  if not exists(select 1 from public.visit_items where organization_id=org and visit_id=target) then raise exception 'invalid_findings' using errcode='22023'; end if;
  for item in select * from public.visit_items where organization_id=org and visit_id=target for update loop
   if item.outcome not in ('serviced','repair_needed','no_access') or item.entered_by is null or item.entered_at is null or jsonb_typeof(item.readings) is distinct from 'array' or jsonb_typeof(item.parts) is distinct from 'array' or jsonb_array_length(item.readings)>10 or jsonb_array_length(item.parts)>20 then raise exception 'invalid_findings' using errcode='22023'; end if;
   if item.outcome='repair_needed' and length(trim(item.finding))=0 then raise exception 'invalid_findings' using errcode='22023'; end if;
   if item.outcome='no_access' and (length(trim(item.no_access_reason))=0 or length(trim(item.work))>0 or jsonb_array_length(item.parts)>0) then raise exception 'invalid_findings' using errcode='22023'; end if;
   for reading in select value from jsonb_array_elements(item.readings) loop
    if jsonb_typeof(reading->'kind') is distinct from 'string' or jsonb_typeof(reading->'mode') is distinct from 'string' or jsonb_typeof(reading->'status') is distinct from 'string' or (reading->'unit' is not null and reading->'unit'<>'null'::jsonb and jsonb_typeof(reading->'unit')<>'string') or coalesce(reading->>'status','') not in ('measured','not_measured','not_applicable') or length(trim(coalesce(reading->>'kind','')))=0 or length(trim(coalesce(reading->>'mode','')))=0 then raise exception 'invalid_reading' using errcode='22023'; end if;
    if reading->>'status'='measured' then
     if (case when jsonb_typeof(reading->'value')='number' then abs((reading->>'value')::numeric)>1e308 else true end) or length(trim(coalesce(reading->>'unit','')))=0 or item.outcome='no_access' then raise exception 'invalid_reading' using errcode='22023'; end if;
    elsif reading->'value' is distinct from 'null'::jsonb then raise exception 'invalid_reading' using errcode='22023'; end if;
   end loop;
   for part in select value from jsonb_array_elements(item.parts) loop
    if jsonb_typeof(part->'name') is distinct from 'string' or jsonb_typeof(part->'unit') is distinct from 'string' or length(trim(coalesce(part->>'name','')))=0 or (case when jsonb_typeof(part->'quantity')='number' then (part->>'quantity')::numeric<=0 or (part->>'quantity')::numeric>1e308 else true end) or length(trim(coalesce(part->>'unit','')))=0 then raise exception 'invalid_part' using errcode='22023'; end if;
   end loop;
  end loop;
  if exists(select 1 from public.visit_items vi left join public.follow_ups f on f.item_id=vi.id and f.organization_id=org left join public.memberships m on m.id=f.owner_id and m.organization_id=org and m.active where vi.organization_id=org and vi.visit_id=target and ((vi.outcome in ('repair_needed','no_access') and f.id is null) or (f.id is not null and f.state='open' and (m.id is null or f.due_date is null)))) then raise exception 'missing_follow_up' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=org and visit_id=target and state='reserved') then raise exception 'pending_attachments' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=org and visit_id=target and state='verified' and (asset_id is null or length(trim(asset_id))=0 or asset_version is null or asset_version<1 or format is null or format not in ('jpg','png','webp') or verified_bytes is null or width is null or height is null or width<1 or height<1 or width::bigint*height::bigint>40000000)) then raise exception 'invalid_evidence' using errcode='22023'; end if;

end $$;

create or replace function hvac_private.customer_report_data(org uuid,target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb:=public.visit_bundle(org,target); company text; items jsonb;
begin
 select display_name into company from public.organizations where id=org;
 select coalesce(jsonb_agg(jsonb_build_object(
  'code',entry->'code','room',entry->'room','model',entry->'model','serial',entry->'serial',
  'planned',entry->'planned','outcome',entry->'outcome','work',entry->'work','finding',entry->'finding',
  'noAccessReason',entry->'noAccessReason',
  'readings',hvac_private.report_readings(entry->'readings'),'parts',hvac_private.report_parts(entry->'parts'),
  'followUp',case when entry->'followUp'='null'::jsonb then null else jsonb_build_object(
    'kind',entry->'followUp'->'kind','owner',coalesce((select staff->>'label' from jsonb_array_elements(b->'staff') staff where staff->>'id'=entry->'followUp'->>'ownerId'),entry->'followUp'->>'ownerLabel',''),
    'state',entry->'followUp'->'state','completedAt',entry->'followUp'->'completedAt','dueDate',entry->'followUp'->'dueDate','customerAction',entry->'followUp'->'customerAction') end,
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'caption',a.caption,'width',a.width,'height',a.height,
    'provider','cloudinary','deliveryType','authenticated','publicId','hvac/'||a.organization_id||'/'||a.id,
    'assetId',a.asset_id,'assetVersion',a.asset_version,'format',a.format,'bytes',a.verified_bytes) order by a.created_at,a.id)
    from public.attachments a where a.organization_id=org and a.visit_id=target and a.item_id=(entry->>'id')::uuid and a.state='verified' and a.visibility='customer'),'[]')
 ) order by position),'[]') into items from jsonb_array_elements(b->'items') with ordinality e(entry,position);
 return jsonb_build_object('schemaVersion',1,'actionStateVersion',1,'templateVersion','service-report-v1','locale','sr-Latn-RS',
  'branding',jsonb_build_object('displayName',company,'logo',null,'accentColor','#165d4c'),
  'company',company,'visitId',target,'reference',target,'revision',null,'issuedAt',null,'issuer',null,
  'customer',b->'customer','contact',b->'contact','site',b->'site','address',b->'address',
  'start',b->'start','actualStart',b->'startedAt','timeZone',b->'timeZone','visitType',b->'visitType',
  'technicians',b->'technicians','completedAt',b->'submittedAt',
  'totals',jsonb_build_object('planned',(select count(*) from jsonb_array_elements(items) i where (i->>'planned')::boolean),
    'inspected',(select count(*) from jsonb_array_elements(items) i where i->>'outcome' in ('serviced','repair_needed')),
    'actions',(select count(*) from jsonb_array_elements(items) i where i->'followUp'<>'null'::jsonb and coalesce(i->'followUp'->>'state','open')='open')), 'items',items);
end $$;

create or replace function public.amend_report(p_organization_id uuid,p_base_revision_id uuid,p_operation_id uuid,p_version integer,p_reason text,p_items jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();base public.report_revisions;v public.visits;i public.visit_items;
 receipt hvac_private.report_amendment_receipts;payload_hash text;entry jsonb;f jsonb;binding record;old_value jsonb;new_value jsonb;changes jsonb:='[]';
 updated_items jsonb:='[]';snapshot jsonb;live_items jsonb;live_item jsonb;new_id uuid:=gen_random_uuid();issued_time timestamptz;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select * into base from public.report_revisions where organization_id=p_organization_id and id=p_base_revision_id;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 select * into v from public.visits where organization_id=p_organization_id and id=base.visit_id for update;
 if p_operation_id is null or p_version is null or p_version<1 or p_reason is null or length(trim(p_reason)) not between 1 and 2000 or jsonb_typeof(p_items) is distinct from 'array' or octet_length(p_items::text)>524288 then raise exception 'invalid_amendment' using errcode='22023';end if;
 payload_hash:=encode(extensions.digest(jsonb_build_object('base',base.id,'version',p_version,'reason',trim(p_reason),'items',p_items)::text,'sha256'),'hex');
 select * into receipt from hvac_private.report_amendment_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if receipt.payload_hash<>payload_hash then raise exception 'operation_conflict' using errcode='PT409';end if;
  return receipt.revision_id;
 end if;
 if v.status<>'issued' or v.version<>p_version or exists(select 1 from public.report_revisions where organization_id=p_organization_id and visit_id=v.id and revision_no>base.revision_no) then raise exception 'stale_revision' using errcode='PT409';end if;
 if jsonb_array_length(p_items) not between 1 and 500 or jsonb_array_length(p_items)<>(select count(*) from public.visit_items where organization_id=p_organization_id and visit_id=v.id)
 or jsonb_array_length(p_items)<>(select count(*) from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id)
 or (select count(distinct e->>'itemId') from jsonb_array_elements(p_items) e)<>jsonb_array_length(p_items) then raise exception 'incomplete_replacement' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(entry) is distinct from 'object' or entry-array['itemId','version','outcome','work','finding','noAccessReason','readings','parts','followUp']<>'{}'::jsonb
   or jsonb_typeof(entry->'itemId') is distinct from 'string' or coalesce(entry->>'itemId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or jsonb_typeof(entry->'version') is distinct from 'number' then raise exception 'invalid_item' using errcode='22023';end if;
  select vi.* into i from public.visit_items vi join hvac_private.report_item_bindings b on b.organization_id=vi.organization_id and b.item_id=vi.id and b.revision_id=base.id where vi.organization_id=p_organization_id and vi.visit_id=v.id and vi.id=(entry->>'itemId')::uuid for update of vi;
  if not found then raise exception 'invalid_item' using errcode='22023';end if;
  if i.version::numeric<>(entry->>'version')::numeric then raise exception 'stale_item' using errcode='PT409';end if;
  if jsonb_typeof(entry->'outcome') is distinct from 'string' or entry->>'outcome' not in ('serviced','repair_needed','no_access') then raise exception 'invalid_outcome' using errcode='22023';end if;
  if jsonb_typeof(entry->'work') is distinct from 'string' or length(entry->>'work')>2000 or jsonb_typeof(entry->'finding') is distinct from 'string' or length(entry->>'finding')>2000 or jsonb_typeof(entry->'noAccessReason') is distinct from 'string' or length(entry->>'noAccessReason')>2000 then raise exception 'invalid_details' using errcode='22023';end if;
  old_value:=jsonb_build_object('outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'readings',i.readings,'parts',i.parts,'followUp',(select jsonb_build_object('kind',fu.kind,'ownerId',fu.owner_id,'dueDate',fu.due_date,'customerAction',fu.customer_action) from public.follow_ups fu where fu.organization_id=p_organization_id and fu.item_id=i.id));
  new_value:=entry-array['itemId','version'];f:=entry->'followUp';
  -- An edit to a finding must not erase private metadata of unchanged readings/parts.
  if hvac_private.report_readings(i.readings)=entry->'readings' then new_value:=jsonb_set(new_value,'{readings}',i.readings);end if;
  if hvac_private.report_parts(i.parts)=entry->'parts' then new_value:=jsonb_set(new_value,'{parts}',i.parts);end if;
  if f is null then raise exception 'invalid_follow_up' using errcode='22023';end if;
  if f<>'null'::jsonb then
   if jsonb_typeof(f) is distinct from 'object' or f-array['kind','ownerId','dueDate','customerAction']<>'{}'::jsonb or jsonb_typeof(f->'kind') is distinct from 'string' or f->>'kind' not in ('quote','repair','revisit') or jsonb_typeof(f->'ownerId') is distinct from 'string' or coalesce(f->>'ownerId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(f->'dueDate') is distinct from 'string' or coalesce(f->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(f->'customerAction') is distinct from 'string' or length(f->>'customerAction')>2000 then raise exception 'invalid_follow_up' using errcode='22023';end if;
  end if;
  perform hvac_private.save_captured_follow_up(p_organization_id,i.id,f);
  if old_value<>new_value then
   changes:=changes||jsonb_build_array(jsonb_build_object('itemId',i.id,'enteredBy',i.entered_by,'enteredAt',i.entered_at,'before',old_value,'after',new_value));
   update public.visit_items set outcome=entry->>'outcome',work=entry->>'work',finding=entry->>'finding',no_access_reason=entry->>'noAccessReason',readings=new_value->'readings',parts=new_value->'parts',version=version+1,corrected_by=actor,corrected_at=clock_timestamp() where organization_id=p_organization_id and id=i.id;
  end if;
 end loop;
 perform hvac_private.validate_report_visit(p_organization_id,v.id);
 if changes='[]'::jsonb then raise exception 'no_corrections' using errcode='22023';end if;
 -- Reuse the canonical field mapping, but retain frozen identities/evidence from the predecessor.
 live_items:=hvac_private.customer_report_data(p_organization_id,v.id)->'items';
 for binding in select b.position,b.item_id,s.code from hvac_private.report_item_bindings b join public.visit_items vi on vi.organization_id=b.organization_id and vi.id=b.item_id join public.systems s on s.organization_id=vi.organization_id and s.id=vi.system_id where b.organization_id=p_organization_id and b.revision_id=base.id order by b.position loop
  select value into live_item from jsonb_array_elements(live_items) where value->>'code'=binding.code;
  updated_items:=updated_items||jsonb_build_array((base.snapshot->'items'->(binding.position-1))||jsonb_build_object('outcome',live_item->'outcome','work',live_item->'work','finding',live_item->'finding','noAccessReason',live_item->'noAccessReason','readings',live_item->'readings','parts',live_item->'parts','followUp',live_item->'followUp'));
 end loop;
 issued_time:=clock_timestamp();
 snapshot:=base.snapshot||jsonb_build_object('templateVersion','service-report-v2','actionStateVersion',1,'revision',base.revision_no+1,'issuedAt',issued_time,'issuer',hvac_private.actor_email(),
 'amendment',jsonb_build_object('reason',trim(p_reason),'previousRevision',base.revision_no),'items',updated_items,
 'totals',jsonb_build_object('planned',(select count(*) from jsonb_array_elements(updated_items) e where (e->>'planned')::boolean),'inspected',(select count(*) from jsonb_array_elements(updated_items) e where e->>'outcome' in ('serviced','repair_needed')),'actions',(select count(*) from jsonb_array_elements(updated_items) e where e->'followUp'<>'null'::jsonb and coalesce(e->'followUp'->>'state','open')='open')));
 insert into public.report_revisions(id,organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by) values(new_id,p_organization_id,v.id,base.revision_no+1,base.report_number,snapshot,base.locale,'service-report-v2',issued_time,actor);
 insert into hvac_private.report_item_bindings select organization_id,new_id,item_id,position from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id;
 insert into hvac_private.report_amendments(organization_id,revision_id,previous_revision_id,actor_id,reason,changes) values(p_organization_id,new_id,base.id,actor,trim(p_reason),changes);
 insert into hvac_private.render_jobs(organization_id,revision_id,logical_key) values(p_organization_id,new_id,'report-pdf:'||new_id);
 update public.visits set version=version+1 where organization_id=p_organization_id and id=v.id;
 insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_amended',new_id);
 insert into hvac_private.report_amendment_receipts values(p_organization_id,actor,p_operation_id,payload_hash,new_id);
 return new_id;
end $$;

create or replace function public.report_amendment(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base public.report_revisions;b jsonb;items jsonb;begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select * into base from public.report_revisions where organization_id=p_organization_id and id=p_revision_id;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 if exists(select 1 from public.report_revisions where organization_id=p_organization_id and visit_id=base.visit_id and revision_no>base.revision_no) then raise exception 'stale_revision' using errcode='PT409';end if;
 b:=public.visit_bundle(p_organization_id,base.visit_id);
 if (select count(*) from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id)<>jsonb_array_length(b->'items') then raise exception 'legacy_binding_unavailable' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('itemId',e->'id','version',e->'version','outcome',e->'outcome','work',e->'work','finding',e->'finding','noAccessReason',e->'noAccessReason','readings',hvac_private.report_readings(e->'readings'),'parts',hvac_private.report_parts(e->'parts'),'followUp',case when e->'followUp'='null'::jsonb then 'null'::jsonb else jsonb_build_object('kind',e->'followUp'->'kind','ownerId',e->'followUp'->'ownerId','dueDate',e->'followUp'->'dueDate','customerAction',e->'followUp'->'customerAction') end) order by binding.position) into items
 from jsonb_array_elements(b->'items') e join hvac_private.report_item_bindings binding on binding.item_id=(e->>'id')::uuid and binding.revision_id=base.id and binding.organization_id=p_organization_id;
 return jsonb_build_object('visitVersion',b->'version','items',items,'staff',b->'staff');
end $$;

revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
