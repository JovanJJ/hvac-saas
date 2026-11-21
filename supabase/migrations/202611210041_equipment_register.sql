-- M5a: versioned register maintenance and assignment-scoped equipment history.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
do $$ declare target text;begin
 foreach target in array array['customers','sites','systems'] loop
  execute format('alter table public.%I add column version integer not null default 1 check(version>0), add column archived_at timestamptz, add column updated_at timestamptz not null default now(), add column updated_by uuid references auth.users(id)',target);
  execute format('grant update on public.%I to hvac_identity_executor',target);
 end loop;
end $$;
alter table public.sites add column contact text not null default '';
alter table public.systems add column manufacturer text not null default '', add column system_type text not null default '';
create table public.units(
 id uuid primary key, organization_id uuid not null, system_id uuid not null,
 role text not null check(role in ('indoor','outdoor')), manufacturer text not null default '' check(length(manufacturer)<=120),
 model text not null default '' check(length(model)<=120), serial text not null default '' check(length(serial)<=120),
 version integer not null default 1 check(version>0), archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id), replaces_id uuid,
 unique(organization_id,id), unique(organization_id,system_id,id),
 foreign key(organization_id,system_id) references public.systems(organization_id,id),
 foreign key(organization_id,system_id,replaces_id) references public.units(organization_id,system_id,id)
);
create index units_system_idx on public.units(organization_id,system_id,created_at);
create index units_serial_idx on public.units(organization_id,serial);
create index item_system_history_idx on public.visit_items(organization_id,system_id,visit_id);
alter table public.units enable row level security;
revoke all on public.units from public,anon,authenticated,service_role;
grant select on public.units to authenticated;
grant select,insert,update on public.units to hvac_identity_executor;
create policy executor_access on public.units to hvac_identity_executor using(true) with check(true);
create policy office_read on public.units for select to authenticated using(hvac_private.has_workspace_role(organization_id,array['owner','coordinator']));
create table hvac_private.register_events(
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references auth.users(id),
 operation_id uuid not null, entity_id uuid not null, payload jsonb not null, before_data jsonb,
 result uuid not null, created_at timestamptz not null default now(),
 primary key(organization_id,actor_id,operation_id)
);
revoke all on hvac_private.register_events from public,anon,authenticated,service_role;
grant select,insert on hvac_private.register_events to hvac_identity_executor;

-- Existing scheduled work survives archival; new children/visits/items cannot use archived parents.
create function hvac_private.require_active_register_parent() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='sites' then
  if not exists(select 1 from public.customers where organization_id=new.organization_id and id=new.customer_id and archived_at is null) then raise exception 'archived_parent' using errcode='22023';end if;
 elsif tg_table_name='systems' or tg_table_name='visits' then
  if not exists(select 1 from public.sites s join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where s.organization_id=new.organization_id and s.id=new.site_id and s.archived_at is null and c.archived_at is null) then raise exception 'archived_parent' using errcode='22023';end if;
 elsif tg_table_name='visit_items' then
  if not exists(select 1 from public.systems sys join public.sites s on s.organization_id=sys.organization_id and s.id=sys.site_id join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where sys.organization_id=new.organization_id and sys.id=new.system_id and sys.archived_at is null and s.archived_at is null and c.archived_at is null) then raise exception 'archived_parent' using errcode='22023';end if;
 end if;
 return new;
end $$;
create trigger active_parent before insert on public.sites for each row execute function hvac_private.require_active_register_parent();
create trigger active_parent before insert on public.systems for each row execute function hvac_private.require_active_register_parent();
create trigger active_parent before insert on public.visits for each row execute function hvac_private.require_active_register_parent();
create trigger active_parent before insert on public.visit_items for each row execute function hvac_private.require_active_register_parent();
alter function hvac_private.require_active_register_parent() owner to hvac_identity_executor;
revoke all on function hvac_private.require_active_register_parent() from public,anon,authenticated,service_role;
create or replace function public.save_operation(p_organization_id uuid,p_operation_id uuid,p_kind text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); previous jsonb; payload jsonb:=jsonb_build_object('kind',p_kind,'data',p_data); target uuid; zone text; starts timestamptz; finishes timestamptz; members uuid[]; systems uuid[];
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'operation_denied' using errcode='42501'; end if;
 if p_operation_id is null or p_data is null then raise exception 'invalid_operation' using errcode='22023'; end if;
 select r.payload into previous from hvac_private.operation_receipts r where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then if previous<>payload then raise exception 'operation_conflict' using errcode='22023'; end if; return p_operation_id; end if;
 if p_kind in ('customer','site') and (length(trim(coalesce(p_data->>'name',''))) not between 1 and 120) then raise exception 'invalid_name' using errcode='22023'; end if;
 if octet_length(p_data::text)>20000 then raise exception 'invalid_size' using errcode='22023'; end if;
 if p_kind='customer' then
 insert into public.customers(id,organization_id,name,contact) values(p_operation_id,p_organization_id,trim(p_data->>'name'),coalesce(p_data->>'contact',''));
 elsif p_kind='site' then
 zone:=p_data->>'timeZone';
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) or length(trim(coalesce(p_data->>'code','')))=0 or length(trim(coalesce(p_data->>'address','')))=0 then raise exception 'invalid_site' using errcode='22023'; end if;
 insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone,access_note) values(p_operation_id,p_organization_id,(p_data->>'customerId')::uuid,upper(trim(p_data->>'code')),trim(p_data->>'name'),trim(p_data->>'address'),zone,coalesce(p_data->>'accessNote',''));
 update public.sites set contact=coalesce(p_data->>'contact','') where organization_id=p_organization_id and id=p_operation_id;
 elsif p_kind='system' then
 if length(trim(coalesce(p_data->>'code','')))=0 or length(trim(coalesce(p_data->>'room','')))=0 then raise exception 'invalid_system' using errcode='22023'; end if;
 insert into public.systems(id,organization_id,site_id,code,room,model,serial) values(p_operation_id,p_organization_id,(p_data->>'siteId')::uuid,upper(trim(p_data->>'code')),trim(p_data->>'room'),coalesce(p_data->>'model',''),coalesce(p_data->>'serial',''));
 update public.systems set manufacturer=coalesce(p_data->>'manufacturer',''),system_type=coalesce(p_data->>'systemType','') where organization_id=p_organization_id and id=p_operation_id;
 elsif p_kind='visit' then
 target:=(p_data->>'siteId')::uuid;
 select time_zone into zone from public.sites where organization_id=p_organization_id and id=target;
 if zone is null then raise exception 'invalid_site' using errcode='22023'; end if;
 starts:=(p_data->>'start')::timestamp at time zone zone; finishes:=(p_data->>'end')::timestamp at time zone zone;
 if starts is null or finishes is null or finishes<=starts or to_char(starts at time zone zone,'YYYY-MM-DD"T"HH24:MI')<>p_data->>'start' then raise exception 'invalid_time' using errcode='22023'; end if;
 select array_agg(distinct value::uuid) into members from jsonb_array_elements_text(p_data->'members');
 select array_agg(distinct value::uuid) into systems from jsonb_array_elements_text(p_data->'systems');
 if coalesce(cardinality(members),0)=0 or coalesce(cardinality(systems),0)=0 or exists(select 1 from unnest(members) m where not exists(select 1 from public.memberships where organization_id=p_organization_id and id=m and active)) or exists(select 1 from unnest(systems) s where not exists(select 1 from public.systems where organization_id=p_organization_id and site_id=target and id=s)) then raise exception 'invalid_selection' using errcode='22023'; end if;
 insert into public.visits(id,organization_id,site_id,visit_type,scheduled_at,ends_at,created_by) values(p_operation_id,p_organization_id,target,p_data->>'visitType',starts,finishes,actor);
 insert into public.visit_assignees select p_organization_id,p_operation_id,unnest(members);
 insert into public.visit_items(organization_id,site_id,visit_id,system_id) select p_organization_id,target,p_operation_id,unnest(systems);
 else raise exception 'invalid_kind' using errcode='22023'; end if;
 insert into hvac_private.operation_receipts values(p_organization_id,actor,p_operation_id,payload);
 return p_operation_id;
end $$;
create or replace function public.visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); result jsonb;
begin
 if not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501'; end if;
 select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason,
 'technicians',coalesce((select jsonb_agg(st.email order by st.email) from public.visit_assignees a join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=v.id),'[]'),'site',s.name,'address',s.address,'accessNote',s.access_note,'customer',c.name,'contact',c.contact,'timeZone',s.time_zone,'start',v.scheduled_at,'visitType',v.visit_type,
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'label',m.email)) from hvac_private.visit_staff(p_organization_id,p_visit_id) m),'[]'),
 'availableSystems',coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'room',sys.room)) from public.systems sys where sys.organization_id=p_organization_id and sys.site_id=v.site_id and sys.archived_at is null and s.archived_at is null and c.archived_at is null and not exists(select 1 from public.visit_items i where i.visit_id=v.id and i.system_id=sys.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'systemId',i.system_id,'version',i.version,'planned',i.planned,'code',sys.code,'room',sys.room,'model',sys.model,'serial',sys.serial,'outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'internalNote',i.internal_note,'readings',i.readings,'parts',i.parts,'enteredByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.entered_by),'correctedAt',i.corrected_at,'correctedByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.corrected_by),'enteredBy',i.entered_by,'enteredAt',i.entered_at,'followUp',(select jsonb_build_object('id',f.id,'managedAt',f.managed_at,'state',f.state,'version',f.version,'ownerLabel',f.owner_label,'completedAt',f.completed_at,'kind',f.kind,'ownerId',f.owner_id,'dueDate',f.due_date,'customerAction',f.customer_action) from public.follow_ups f where f.item_id=i.id)) order by sys.code) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.organization_id=p_organization_id and i.visit_id=v.id),'[]')) into result
 from public.visits v join public.sites s on s.id=v.site_id join public.customers c on c.id=s.customer_id where v.organization_id=p_organization_id and v.id=p_visit_id;
 if result is null then raise exception 'visit_denied' using errcode='42501'; end if;
 return result;
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
 'visits',coalesce((select jsonb_agg(jsonb_build_object('assigned',exists(select 1 from public.visit_assignees va join public.memberships mm on mm.id=va.membership_id where va.visit_id=v.id and mm.user_id=actor and mm.active),'id',v.id,'site',s.name,'address',s.address,'accessNote',s.access_note,'timeZone',s.time_zone,'start',v.scheduled_at,'end',v.ends_at,'visitType',v.visit_type,'systems',(select jsonb_agg(jsonb_build_object('code',sys.code,'room',sys.room,'id',sys.id)) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.visit_id=v.id)) order by v.scheduled_at) from public.visits v join public.sites s on s.id=v.site_id where v.organization_id=p_organization_id and (office or exists(select 1 from public.visit_assignees a join public.memberships m on m.id=a.membership_id where a.visit_id=v.id and m.user_id=actor and m.active))),'[]')) into result;
 return result;
end $$;


create function public.register_command(p_organization_id uuid,p_entity_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=hvac_private.require_verified_actor(); entity text:=split_part(p_kind,'.',1); action text:=split_part(p_kind,'.',2);
 table_name text; old_data jsonb; expected jsonb:=jsonb_build_object('entity',p_entity_id,'kind',p_kind,'version',p_version,'data',p_data);
 previous hvac_private.register_events; result uuid:=p_entity_id; parent uuid; field text;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'register_denied' using errcode='42501';end if;
 if p_operation_id is null or p_entity_id is null or p_version is null or p_version<1 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into previous from hvac_private.register_events where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if previous.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;
  return previous.result;
 end if;
 if p_kind is null or entity not in ('customer','site','system','unit') or action not in ('update','archive','restore','create','replace') or (entity<>'unit' and action not in ('update','archive','restore')) or (entity='unit' and action='restore') or p_kind<>entity||'.'||action then raise exception 'invalid_kind' using errcode='22023';end if;
 table_name:=case entity when 'customer' then 'customers' when 'site' then 'sites' when 'system' then 'systems' else 'units' end;
 if entity='unit' and action='create' then
  select to_jsonb(s) into old_data from public.systems s where s.organization_id=p_organization_id and s.id=p_entity_id for update;
  parent:=p_entity_id;
 else
  execute format('select to_jsonb(t) from public.%I t where organization_id=$1 and id=$2 for update',table_name) into old_data using p_organization_id,p_entity_id;
  if entity='unit' then parent:=(old_data->>'system_id')::uuid;end if;
 end if;
 if old_data is null then raise exception 'register_denied' using errcode='42501';end if;
 if (old_data->>'version')::integer<>p_version then raise exception 'stale_register' using errcode='PT409';end if;
 if action in ('update','create','replace') and old_data->>'archived_at' is not null then raise exception 'archived_record' using errcode='PT409';end if;
 for field in select jsonb_object_keys(p_data) loop
  if field not in ('name','contact','code','address','timeZone','accessNote','room','model','serial','manufacturer','systemType','role')
    or jsonb_typeof(p_data->field) is distinct from 'string'
    or length(p_data->>field)>(case when field in ('contact','accessNote') then 2000 else 120 end)
  then raise exception 'invalid_input' using errcode='22023';end if;
 end loop;
 if action in ('create','replace') or (entity='unit' and action='update') then
  if not exists(select 1 from public.systems sys join public.sites s on s.organization_id=sys.organization_id and s.id=sys.site_id join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where sys.organization_id=p_organization_id and sys.id=parent and sys.archived_at is null and s.archived_at is null and c.archived_at is null) or coalesce(p_data->>'role','') not in ('indoor','outdoor') then raise exception 'invalid_component' using errcode='22023';end if;
 end if;
 if action in ('archive','restore') then
  if (action='archive' and old_data->>'archived_at' is not null) or (action='restore' and old_data->>'archived_at' is null) then raise exception 'stale_register' using errcode='PT409';end if;
  execute format('update public.%I set archived_at=$1,version=version+1,updated_at=now(),updated_by=$2 where organization_id=$3 and id=$4',table_name)
   using case when action='archive' then now() else null::timestamptz end,actor,p_organization_id,p_entity_id;
 elsif entity='customer' then
  if length(trim(coalesce(p_data->>'name',''))) not between 1 and 120 then raise exception 'invalid_name' using errcode='22023';end if;
  update public.customers set name=trim(p_data->>'name'),contact=coalesce(p_data->>'contact',''),version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=p_entity_id;
 elsif entity='site' then
  if length(trim(coalesce(p_data->>'name','')))=0 or length(trim(coalesce(p_data->>'code','')))=0 or length(trim(coalesce(p_data->>'address','')))=0 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timeZone') then raise exception 'invalid_site' using errcode='22023';end if;
  update public.sites set name=trim(p_data->>'name'),code=upper(trim(p_data->>'code')),address=trim(p_data->>'address'),time_zone=p_data->>'timeZone',access_note=coalesce(p_data->>'accessNote',''),contact=coalesce(p_data->>'contact',''),version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=p_entity_id;
 elsif entity='system' then
  if length(trim(coalesce(p_data->>'code','')))=0 or length(trim(coalesce(p_data->>'room','')))=0 then raise exception 'invalid_system' using errcode='22023';end if;
  update public.systems set code=upper(trim(p_data->>'code')),room=trim(p_data->>'room'),model=coalesce(p_data->>'model',''),serial=coalesce(p_data->>'serial',''),manufacturer=coalesce(p_data->>'manufacturer',''),system_type=coalesce(p_data->>'systemType',''),version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=p_entity_id;
 elsif action='update' then
  update public.units set role=p_data->>'role',manufacturer=coalesce(p_data->>'manufacturer',''),model=coalesce(p_data->>'model',''),serial=coalesce(p_data->>'serial',''),version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=p_entity_id;
 else
  if action='replace' then
   update public.units set archived_at=now(),version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=p_entity_id;
  end if;
  result:=p_operation_id;
  insert into public.units(id,organization_id,system_id,role,manufacturer,model,serial,updated_by,replaces_id)
   values(result,p_organization_id,parent,p_data->>'role',coalesce(p_data->>'manufacturer',''),coalesce(p_data->>'model',''),coalesce(p_data->>'serial',''),actor,case when action='replace' then p_entity_id else null end);
 end if;
 insert into hvac_private.register_events(organization_id,actor_id,operation_id,entity_id,payload,before_data,result) values(p_organization_id,actor,p_operation_id,p_entity_id,expected,old_data,result);
 return result;
end $$;

create function public.register_detail(p_organization_id uuid,p_kind text,p_entity_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); office boolean; scope_visit uuid; record jsonb; history jsonb; children jsonb:='[]'; components jsonb:='[]'; parent_data jsonb;begin
 office:=hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']);
 if not office then
  if p_kind<>'system' or not hvac_private.has_workspace_role(p_organization_id,array['technician']) or not exists(
   select 1 from public.visit_items i join public.visits v on v.organization_id=i.organization_id and v.id=i.visit_id
   join public.visit_assignees a on a.organization_id=v.organization_id and a.visit_id=v.id join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id
   where i.organization_id=p_organization_id and i.system_id=p_entity_id and m.user_id=actor and m.active
  ) then raise exception 'register_denied' using errcode='42501';end if;
 end if;
 if not office then
  select i.visit_id into scope_visit from public.visit_items i join public.visit_assignees a on a.organization_id=i.organization_id and a.visit_id=i.visit_id join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where i.organization_id=p_organization_id and i.system_id=p_entity_id and m.user_id=actor and m.active limit 1;
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
alter function public.register_command(uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
alter function public.register_detail(uuid,text,uuid) owner to hvac_identity_executor;
revoke all on function public.register_command(uuid,uuid,uuid,text,integer,jsonb),public.register_detail(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.register_command(uuid,uuid,uuid,text,integer,jsonb),public.register_detail(uuid,text,uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
