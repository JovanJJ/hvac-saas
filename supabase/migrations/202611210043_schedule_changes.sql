-- Versioned schedule changes share the field-command lock order.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
alter table public.visits drop constraint visits_status_check;
alter table public.visits add constraint visits_status_check check(status in ('scheduled','in_progress','submitted','issued','cancelled'));
alter table public.visits add column cancelled_at timestamptz,add column cancelled_by uuid references auth.users(id),add column cancellation_reason text not null default '';
alter table public.visits add constraint cancellation_details check((status='cancelled' and cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason)) between 1 and 2000) or (status<>'cancelled' and cancelled_at is null and cancelled_by is null and cancellation_reason=''));
grant delete on public.visit_assignees to hvac_identity_executor;
create table hvac_private.schedule_events(
 organization_id uuid not null references public.organizations(id),visit_id uuid not null,actor_id uuid not null references auth.users(id),operation_id uuid not null,
 payload jsonb not null,before_data jsonb not null,created_at timestamptz not null default now(),
 primary key(organization_id,actor_id,operation_id),foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
create index schedule_events_visit_idx on hvac_private.schedule_events(organization_id,visit_id,created_at);
revoke all on hvac_private.schedule_events from public,anon,authenticated,service_role;
grant select,insert on hvac_private.schedule_events to hvac_identity_executor;
create function public.schedule_visit_command(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();v public.visits;previous hvac_private.schedule_events;members uuid[];zone text;starts timestamptz;finishes timestamptz;
 expected jsonb:=jsonb_build_object('visit',p_visit_id,'kind',p_kind,'version',p_version,'data',p_data);before_data jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'schedule_denied' using errcode='42501';end if;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found then raise exception 'schedule_denied' using errcode='42501';end if;
 if p_operation_id is null or p_kind is null or p_kind not in ('reschedule','reassign','cancel') or p_version is null or p_version<1 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into previous from hvac_private.schedule_events where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if previous.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;
  return p_visit_id;
 end if;
 if v.version<>p_version then raise exception 'stale_schedule' using errcode='PT409';end if;
 if v.status not in ('scheduled','in_progress') then raise exception 'visit_locked' using errcode='PT409';end if;
 before_data:=to_jsonb(v)||jsonb_build_object('members',coalesce((select jsonb_agg(membership_id order by membership_id) from public.visit_assignees where organization_id=p_organization_id and visit_id=p_visit_id),'[]'));
 if p_kind='reschedule' then
  if p_data - array['start','end','timeZone']<>'{}'::jsonb or jsonb_typeof(p_data->'start') is distinct from 'string' or jsonb_typeof(p_data->'end') is distinct from 'string' or coalesce(p_data->>'start','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or coalesce(p_data->>'end','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'invalid_time' using errcode='22023';end if;
  select time_zone into zone from public.sites where organization_id=p_organization_id and id=v.site_id;
  if p_data->>'timeZone' is distinct from zone then raise exception 'time_zone_changed' using errcode='PT409';end if;
  starts:=(p_data->>'start')::timestamp at time zone zone;finishes:=(p_data->>'end')::timestamp at time zone zone;
  if finishes<=starts or to_char(starts at time zone zone,'YYYY-MM-DD"T"HH24:MI')<>p_data->>'start' or to_char(finishes at time zone zone,'YYYY-MM-DD"T"HH24:MI')<>p_data->>'end' then raise exception 'invalid_time' using errcode='22023';end if;
  update public.visits set scheduled_at=starts,ends_at=finishes,version=version+1 where organization_id=p_organization_id and id=p_visit_id;
 elsif p_kind='reassign' then
  if p_data-'members'<>'{}'::jsonb or jsonb_typeof(p_data->'members') is distinct from 'array' or jsonb_array_length(p_data->'members') not between 1 and 50 then raise exception 'invalid_assignment' using errcode='22023';end if;
  select array_agg(distinct value::uuid order by value::uuid) into members from jsonb_array_elements_text(p_data->'members');
  if exists(select 1 from unnest(members) member where not exists(select 1 from public.memberships m where m.organization_id=p_organization_id and m.id=member and m.active)) then raise exception 'invalid_assignment' using errcode='22023';end if;
  delete from public.visit_assignees where organization_id=p_organization_id and visit_id=p_visit_id;
  insert into public.visit_assignees(organization_id,visit_id,membership_id) select p_organization_id,p_visit_id,unnest(members);
  update public.visits set version=version+1 where organization_id=p_organization_id and id=p_visit_id;
 else
  if p_data-'reason'<>'{}'::jsonb or jsonb_typeof(p_data->'reason') is distinct from 'string' or length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'cancellation_reason_required' using errcode='22023';end if;
  update public.visits set status='cancelled',cancelled_at=now(),cancelled_by=actor,cancellation_reason=trim(p_data->>'reason'),version=version+1 where organization_id=p_organization_id and id=p_visit_id;
 end if;
 insert into hvac_private.schedule_events(organization_id,visit_id,actor_id,operation_id,payload,before_data) values(p_organization_id,p_visit_id,actor,p_operation_id,expected,before_data);
 return p_visit_id;
end $$;

create function public.schedule_snapshot(p_organization_id uuid,p_from date,p_until date,p_site_id uuid default null,p_member_id uuid default null,p_include_cancelled boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();result jsonb;begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'schedule_denied' using errcode='42501';end if;
 if p_from is null or p_until is null or p_until<p_from or p_until-p_from>30 then raise exception 'invalid_range' using errcode='22023';end if;
 select jsonb_build_object(
 'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code) order by s.name) from public.sites s where s.organization_id=p_organization_id),'[]'),
 'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'siteId',s.id,'site',s.name,'address',s.address,'accessNote',s.access_note,'timeZone',s.time_zone,'start',v.scheduled_at,'end',v.ends_at,'visitType',v.visit_type,'assigned',false,'cancellationReason',v.cancellation_reason,
 'members',coalesce((select jsonb_agg(a.membership_id order by a.membership_id) from public.visit_assignees a where a.organization_id=p_organization_id and a.visit_id=v.id),'[]'),
 'systems',coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'room',sys.room) order by sys.code) from public.visit_items i join public.systems sys on sys.organization_id=i.organization_id and sys.id=i.system_id where i.organization_id=p_organization_id and i.visit_id=v.id),'[]')) order by v.scheduled_at,v.id)
 from public.visits v join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 where v.organization_id=p_organization_id and v.scheduled_at >= (p_from::timestamp at time zone 'UTC')-interval '1 day' and v.scheduled_at < ((p_until+2)::timestamp at time zone 'UTC') and (v.scheduled_at at time zone s.time_zone)::date between p_from and p_until
 and (p_include_cancelled or v.status<>'cancelled') and (p_site_id is null or s.id=p_site_id) and (p_member_id is null or exists(select 1 from public.visit_assignees a where a.organization_id=p_organization_id and a.visit_id=v.id and a.membership_id=p_member_id))),'[]')) into result;
 return result;
end $$;

create function public.schedule_visit_detail(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();v public.visits;result jsonb;begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'schedule_denied' using errcode='42501';end if;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id;
 if not found then raise exception 'schedule_denied' using errcode='42501';end if;
 result:=jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'start',v.scheduled_at,'end',v.ends_at,'cancellationReason',v.cancellation_reason,'cancelledAt',v.cancelled_at,
 'timeZone',(select time_zone from public.sites where organization_id=p_organization_id and id=v.site_id),'site',(select name from public.sites where organization_id=p_organization_id and id=v.site_id),
 'members',coalesce((select jsonb_agg(membership_id order by membership_id) from public.visit_assignees where organization_id=p_organization_id and visit_id=v.id),'[]'),
 'history',coalesce((select jsonb_agg(jsonb_build_object('operationId',e.operation_id,'kind',e.payload->>'kind','data',e.payload->'data','before',e.before_data-'created_by'-'cancelled_by','actor',e.actor_id,'at',e.created_at) order by e.created_at desc,e.operation_id) from hvac_private.schedule_events e where e.organization_id=p_organization_id and e.visit_id=v.id),'[]'));
 return result;
end $$;
alter function public.schedule_visit_command(uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
alter function public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean) owner to hvac_identity_executor;
alter function public.schedule_visit_detail(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.schedule_visit_command(uuid,uuid,uuid,text,integer,jsonb),public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean),public.schedule_visit_detail(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.schedule_visit_command(uuid,uuid,uuid,text,integer,jsonb),public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean),public.schedule_visit_detail(uuid,uuid) to authenticated;

create or replace function hvac_private.can_access_visit(org uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select hvac_private.has_workspace_role(org,array['owner','coordinator']) or
 (hvac_private.has_workspace_role(org,array['technician']) and exists(
 select 1 from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id join public.visits v on v.organization_id=a.organization_id and v.id=a.visit_id
 where a.organization_id=org and a.visit_id=target and v.status<>'cancelled' and m.active and m.user_id=hvac_private.request_actor_id()))
$$;
create or replace function public.replay_field_command(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); previous hvac_private.field_replay_receipts;
 payload jsonb:=jsonb_build_object('visit',p_visit_id,'kind',p_kind,'version',p_version,'data',p_data);
 b jsonb; result jsonb; saved_item jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 perform 1 from public.visits where organization_id=p_organization_id and id=p_visit_id and status<>'cancelled' for update;
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
create or replace function public.replay_photo_command(p_organization_id uuid,p_visit_id uuid,p_attachment_id uuid,p_kind text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();v public.visits;a public.attachments;before_version integer;
 previous hvac_private.photo_replay_receipts;payload jsonb;result jsonb;effects jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found or v.status='cancelled' or not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) or not exists(
  select 1 from public.visit_assignees va join public.memberships m on m.organization_id=va.organization_id and m.id=va.membership_id
  where va.organization_id=p_organization_id and va.visit_id=p_visit_id and m.active and m.user_id=actor)
 then raise exception 'attachment_denied' using errcode='42501';end if;
 if p_kind not in ('reserve','complete','remove') or p_kind is null or p_data is null or p_attachment_id is null or octet_length(p_data::text)>10000 then raise exception 'invalid_attachment' using errcode='22023';end if;
 select * into a from public.attachments where organization_id=p_organization_id and id=p_attachment_id;
 if a.id is not null and (a.visit_id<>p_visit_id or a.author_id<>actor) then raise exception 'attachment_denied' using errcode='42501';end if;
 -- Fresh server attestations may expire; the logical verified object remains the same operation.
 payload:=jsonb_build_object('visit',p_visit_id,'data',case when p_kind='complete' then p_data-'proof'-'expires' else p_data end);
 select * into previous from hvac_private.photo_replay_receipts r where r.organization_id=p_organization_id and r.actor_id=actor and r.attachment_id=p_attachment_id and r.phase=p_kind;
 if found then
  if previous.payload<>payload then raise exception 'attachment_conflict' using errcode='PT409';end if;
  return previous.result;
 end if;
 -- Reserve before removal to leave a tombstone even when a preparation response was lost.
 if p_kind='remove' and a.id is null then
  perform public.replay_photo_command(p_organization_id,p_visit_id,p_attachment_id,'reserve',p_data);
 end if;
 select version into before_version from public.visits where id=p_visit_id;
 perform public.attachment_command(p_organization_id,p_visit_id,p_attachment_id,p_kind,p_data);
 select * into v from public.visits where id=p_visit_id;
 select * into a from public.attachments where id=p_attachment_id and organization_id=p_organization_id;
 select coalesce(jsonb_object_agg(r.phase,(r.result->'effects'->r.phase)),'{}'::jsonb) into effects from hvac_private.photo_replay_receipts r where r.organization_id=p_organization_id and r.actor_id=actor and r.attachment_id=p_attachment_id;
 effects:=effects||jsonb_build_object(p_kind,v.version-before_version);
 result:=jsonb_build_object('id',a.id,'visitId',p_visit_id,'itemId',a.item_id,'actorId',actor,'phase',p_kind,'state',a.state,'effects',effects,'confirmedAt',clock_timestamp(),
  'visit',jsonb_build_object('version',v.version,'status',v.status,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason));
 insert into hvac_private.photo_replay_receipts values(p_organization_id,actor,p_attachment_id,p_kind,payload,result);
 return result;
end $$;
create or replace function hvac_private.require_field_assignment(org uuid,target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();begin
 perform 1 from public.organizations where id=org for update;
 perform 1 from public.visits where organization_id=org and id=target and status<>'cancelled' for update;
 if not found or not hvac_private.has_workspace_role(org,array['owner','coordinator','technician']) or not exists(
 select 1 from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id
 where a.organization_id=org and a.visit_id=target and m.active and m.user_id=actor)
 then raise exception 'visit_denied' using errcode='42501';end if;
 return actor;
end $$;
create or replace function public.offline_assignment_ids(p_organization_id uuid) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) then raise exception 'visit_denied' using errcode='42501';end if;
 return coalesce((select array_agg(a.visit_id order by a.visit_id) from public.visit_assignees a join public.visits v on v.organization_id=a.organization_id and v.id=a.visit_id join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where a.organization_id=p_organization_id and m.user_id=actor and m.active and v.status<>'cancelled'),'{}'::uuid[]);
end $$;
create or replace function public.operation_snapshot(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); office boolean; result jsonb;
begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) then raise exception 'operation_denied' using errcode='42501'; end if;
 office:=hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']);
 select jsonb_build_object(
 'customers',case when office then coalesce((select jsonb_agg(c order by c.name) from public.customers c where c.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'sites',case when office then coalesce((select jsonb_agg(s order by s.name) from public.sites s where s.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'systems',case when office then coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('unit_serials',coalesce((select jsonb_agg(u.serial order by u.created_at) from public.units u where u.organization_id=s.organization_id and u.system_id=s.id and u.serial<>''),'[]'::jsonb)) order by s.code) from public.systems s where s.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'visits',coalesce((select jsonb_agg(jsonb_build_object('assigned',exists(select 1 from public.visit_assignees va join public.memberships mm on mm.id=va.membership_id where va.visit_id=v.id and mm.user_id=actor and mm.active),'id',v.id,'site',s.name,'address',s.address,'accessNote',s.access_note,'timeZone',s.time_zone,'start',v.scheduled_at,'end',v.ends_at,'visitType',v.visit_type,'systems',(select jsonb_agg(jsonb_build_object('code',sys.code,'room',sys.room,'id',sys.id)) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.visit_id=v.id)) order by v.scheduled_at) from public.visits v join public.sites s on s.id=v.site_id where v.organization_id=p_organization_id and v.status<>'cancelled' and (office or exists(select 1 from public.visit_assignees a join public.memberships m on m.id=a.membership_id where a.visit_id=v.id and m.user_id=actor and m.active))),'[]')) into result;
 return result;
end $$;


create or replace function public.register_detail(p_organization_id uuid,p_kind text,p_entity_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); office boolean; scope_visit uuid; record jsonb; history jsonb; children jsonb:='[]'; components jsonb:='[]'; parent_data jsonb;begin
 office:=hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']);
 if not office then
  if p_kind<>'system' or not hvac_private.has_workspace_role(p_organization_id,array['technician']) or not exists(
   select 1 from public.visit_items i join public.visits v on v.organization_id=i.organization_id and v.id=i.visit_id
   join public.visit_assignees a on a.organization_id=v.organization_id and a.visit_id=v.id join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id
   where i.organization_id=p_organization_id and i.system_id=p_entity_id and m.user_id=actor and m.active and v.status<>'cancelled'
  ) then raise exception 'register_denied' using errcode='42501';end if;
 end if;
 if not office then
  select i.visit_id into scope_visit from public.visit_items i join public.visits v on v.organization_id=i.organization_id and v.id=i.visit_id join public.visit_assignees a on a.organization_id=i.organization_id and a.visit_id=i.visit_id join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where i.organization_id=p_organization_id and i.system_id=p_entity_id and m.user_id=actor and m.active and v.status<>'cancelled' limit 1;
 end if;
 if p_kind='customer' then
  select to_jsonb(c) into record from public.customers c where c.organization_id=p_organization_id and c.id=p_entity_id;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.code),'[]') into children from public.sites s where s.organization_id=p_organization_id and s.customer_id=p_entity_id;
 elsif p_kind='site' then
  select to_jsonb(s) into record from public.sites s where s.organization_id=p_organization_id and s.id=p_entity_id;
  select jsonb_build_object('id',c.id,'name',c.name,'archived',c.archived_at is not null) into parent_data from public.sites s join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where s.organization_id=p_organization_id and s.id=p_entity_id;
  select coalesce(jsonb_agg(to_jsonb(sys) order by sys.code),'[]') into children from public.systems sys where sys.organization_id=p_organization_id and sys.site_id=p_entity_id;
 elsif p_kind='system' then
  select to_jsonb(sys) into record from public.systems sys where sys.organization_id=p_organization_id and sys.id=p_entity_id;
  select jsonb_build_object('id',s.id,'name',s.name,'archived',s.archived_at is not null or c.archived_at is not null) into parent_data from public.systems sys join public.sites s on s.organization_id=sys.organization_id and s.id=sys.site_id join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where sys.organization_id=p_organization_id and sys.id=p_entity_id;
  select coalesce(jsonb_agg(to_jsonb(u) - 'updated_by' order by u.created_at,u.id),'[]') into components from public.units u where u.organization_id=p_organization_id and u.system_id=p_entity_id;
  if not office then record:=record-'updated_by'-'organization_id';end if;
 else raise exception 'invalid_kind' using errcode='22023';end if;
 if record is null then raise exception 'register_denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('visitId',v.id,'itemId',i.id,'systemId',i.system_id,'date',v.scheduled_at,'timeZone',s.time_zone,'code',sys.code,'outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'readings',hvac_private.report_readings(i.readings),'parts',hvac_private.report_parts(i.parts),'enteredBy',i.entered_by,'enteredByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,coalesce(scope_visit,v.id)) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.entered_by),'enteredAt',i.entered_at,'correctedAt',i.corrected_at,'followUp',(select jsonb_build_object('kind',f.kind,'state',f.state,'dueDate',f.due_date,'customerAction',f.customer_action) from public.follow_ups f where f.organization_id=p_organization_id and f.item_id=i.id)) order by v.scheduled_at desc,i.id),'[]') into history
 from public.visit_items i join public.visits v on v.organization_id=i.organization_id and v.id=i.visit_id join public.systems sys on sys.organization_id=i.organization_id and sys.id=i.system_id join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 where i.organization_id=p_organization_id and v.status in ('submitted','issued') and
  ((p_kind='system' and i.system_id=p_entity_id) or (office and p_kind='site' and s.id=p_entity_id) or (office and p_kind='customer' and s.customer_id=p_entity_id));
 return jsonb_build_object('record',record,'parent',parent_data,'children',children,'units',components,'history',history);
end $$;
create or replace function public.visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); result jsonb;
begin
 if not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501'; end if;
 select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'cancellationReason',v.cancellation_reason,'cancelledAt',v.cancelled_at,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason,
 'technicians',coalesce((select jsonb_agg(st.email order by st.email) from public.visit_assignees a join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=v.id),'[]'),'site',s.name,'address',s.address,'accessNote',s.access_note,'customer',c.name,'contact',coalesce(nullif(s.contact,''),c.contact),'timeZone',s.time_zone,'start',v.scheduled_at,'visitType',v.visit_type,
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'label',m.email)) from hvac_private.visit_staff(p_organization_id,p_visit_id) m),'[]'),
 'availableSystems',coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'room',sys.room)) from public.systems sys where sys.organization_id=p_organization_id and sys.site_id=v.site_id and sys.archived_at is null and s.archived_at is null and c.archived_at is null and not exists(select 1 from public.visit_items i where i.visit_id=v.id and i.system_id=sys.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'systemId',i.system_id,'version',i.version,'planned',i.planned,'code',sys.code,'room',sys.room,'model',sys.model,'serial',sys.serial,'outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'internalNote',i.internal_note,'readings',i.readings,'parts',i.parts,'enteredByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.entered_by),'correctedAt',i.corrected_at,'correctedByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.corrected_by),'enteredBy',i.entered_by,'enteredAt',i.entered_at,'followUp',(select jsonb_build_object('id',f.id,'managedAt',f.managed_at,'state',f.state,'version',f.version,'ownerLabel',f.owner_label,'completedAt',f.completed_at,'kind',f.kind,'ownerId',f.owner_id,'dueDate',f.due_date,'customerAction',f.customer_action) from public.follow_ups f where f.item_id=i.id)) order by sys.code) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.organization_id=p_organization_id and i.visit_id=v.id),'[]')) into result
 from public.visits v join public.sites s on s.id=v.site_id join public.customers c on c.id=s.customer_id where v.organization_id=p_organization_id and v.id=p_visit_id;
 if result is null then raise exception 'visit_denied' using errcode='42501'; end if;
 return result;
end $$;



revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
