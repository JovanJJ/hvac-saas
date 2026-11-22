-- Configuration and a shared deterministic recurrence preview; generation belongs to M5f.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table public.maintenance_plans (
 id uuid primary key,organization_id uuid not null references public.organizations(id),site_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),anchor_date date not null check(anchor_date between date '2000-01-01' and date '2100-12-31'),
 anchor_time time not null check(anchor_time<'24:00'::time and extract(second from anchor_time)=0),time_zone text not null,
 interval_months integer not null check(interval_months between 1 and 120),duration_minutes integer not null check(duration_minutes between 15 and 1440),
 enabled boolean not null default true,version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,site_id,id),foreign key(organization_id,site_id) references public.sites(organization_id,id)
);
create table public.plan_systems (
 organization_id uuid not null,site_id uuid not null,plan_id uuid not null,system_id uuid not null,
 primary key(organization_id,plan_id,system_id),
 foreign key(organization_id,site_id,plan_id) references public.maintenance_plans(organization_id,site_id,id),
 foreign key(organization_id,site_id,system_id) references public.systems(organization_id,site_id,id)
);
create table public.maintenance_plan_assignees (
 organization_id uuid not null,plan_id uuid not null,membership_id uuid not null,
 primary key(organization_id,plan_id,membership_id),
 foreign key(organization_id,plan_id) references public.maintenance_plans(organization_id,id),
 foreign key(organization_id,membership_id) references public.memberships(organization_id,id)
);
create index maintenance_plans_list_idx on public.maintenance_plans(organization_id,enabled,site_id,id);
create index plan_systems_system_idx on public.plan_systems(organization_id,system_id);
create index maintenance_plan_assignees_member_idx on public.maintenance_plan_assignees(organization_id,membership_id);
do $$ declare t text;begin
 foreach t in array array['maintenance_plans','plan_systems','maintenance_plan_assignees'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert on public.%I to hvac_identity_executor',t);
  execute format('create policy office_read on public.%I for select to authenticated using(hvac_private.has_workspace_role(organization_id,array[''owner'',''coordinator'']))',t);
  execute format('create policy executor_access on public.%I to hvac_identity_executor using(true) with check(true)',t);
 end loop;
end $$;
grant update on public.maintenance_plans to hvac_identity_executor;
grant delete on public.plan_systems,public.maintenance_plan_assignees to hvac_identity_executor;
create table hvac_private.maintenance_events (
 organization_id uuid not null,plan_id uuid not null,actor_id uuid not null references auth.users(id),actor_label text not null,operation_id uuid not null,
 payload jsonb not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now(),
 primary key(organization_id,actor_id,operation_id),foreign key(organization_id,plan_id) references public.maintenance_plans(organization_id,id)
);
create index maintenance_events_plan_idx on hvac_private.maintenance_events(organization_id,plan_id,created_at);
revoke all on hvac_private.maintenance_events from public,anon,authenticated,service_role;
grant select,insert on hvac_private.maintenance_events to hvac_identity_executor;

create function hvac_private.maintenance_local_time(p_local timestamp,p_zone text) returns jsonb
language plpgsql stable set search_path='' as $$
declare offsets interval[];delta interval;candidate timestamptz;chosen timestamptz;choices integer;step integer;resolved timestamp;
begin
 if p_local is null or p_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'invalid_time_zone' using errcode='22023';end if;
 -- Nearby observed offsets cover ordinary, half-hour and whole-day transitions.
 select array_agg(distinct (sample at time zone p_zone)-(sample at time zone 'UTC')) into offsets
 from generate_series((p_local at time zone p_zone)-interval '3 days',(p_local at time zone p_zone)+interval '3 days',interval '6 hours') sample;
 for step in 0..2880 loop
  resolved:=p_local+make_interval(mins=>step);chosen:=null;choices:=0;
  foreach delta in array offsets loop
   candidate:=(resolved at time zone 'UTC')-delta;
   if candidate at time zone p_zone=resolved then choices:=choices+1;if chosen is null or candidate<chosen then chosen:=candidate;end if;end if;
  end loop;
  if chosen is not null then
   return jsonb_build_object('intendedLocal',to_char(p_local,'YYYY-MM-DD"T"HH24:MI'),'resolvedLocal',to_char(resolved,'YYYY-MM-DD"T"HH24:MI'),'startsAt',chosen,'resolution',case when step>0 then 'gap_forward' when choices>1 then 'overlap_earlier' else 'exact' end,'shiftMinutes',step,'timeZone',p_zone);
  end if;
 end loop;
 raise exception 'local_time_unresolvable' using errcode='22023';
end $$;
create function hvac_private.maintenance_occurrences(p_anchor date,p_time time,p_months integer,p_zone text,p_duration integer,p_from date,p_count integer) returns jsonb
language plpgsql stable set search_path='' as $$
declare period integer;month_start date;intended date;day_number integer:=extract(day from p_anchor)::integer;result jsonb:='[]';entry jsonb;
begin
 if p_anchor is null or p_time is null or p_anchor not between date '2000-01-01' and date '2100-12-31' or p_time>='24:00'::time or extract(second from p_time)<>0 or p_from is null or p_from not between date '2000-01-01' and date '2200-12-31' or p_months is null or p_months not between 1 and 120 or p_count is null or p_count not between 1 and 12 or p_duration is null or p_duration not between 15 and 1440 then raise exception 'invalid_recurrence' using errcode='22023';end if;
 period:=greatest(0,((extract(year from p_from)::integer-extract(year from p_anchor)::integer)*12+extract(month from p_from)::integer-extract(month from p_anchor)::integer)/p_months);
 while jsonb_array_length(result)<p_count loop
  month_start:=(date_trunc('month',p_anchor::timestamp)+make_interval(months=>period*p_months))::date;
  intended:=month_start+least(day_number,extract(day from (month_start+interval '1 month - 1 day'))::integer)-1;
  if intended>=p_from then
   entry:=hvac_private.maintenance_local_time(intended+p_time,p_zone);
   result:=result||jsonb_build_array(entry||jsonb_build_object('intendedDate',intended,'monthEndClamped',extract(day from intended)::integer<>day_number,'endsAt',(entry->>'startsAt')::timestamptz+make_interval(mins=>p_duration)));
  end if;
  period:=period+1;
 end loop;
 return result;
end $$;
create function hvac_private.validate_maintenance_plan(p_org uuid,p_data jsonb) returns void
language plpgsql stable set search_path='' as $$
declare site public.sites;systems uuid[];members uuid[];
begin
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>80000 or p_data-array['siteId','name','anchorDate','anchorTime','timeZone','intervalMonths','durationMinutes','systems','members']<>'{}'::jsonb then raise exception 'invalid_plan' using errcode='22023';end if;
 if jsonb_typeof(p_data->'name') is distinct from 'string' or length(btrim(p_data->>'name')) not between 1 and 120 or coalesce(p_data->>'anchorDate','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'anchorTime','')!~'^([01]\d|2[0-3]):[0-5]\d$' or (p_data->>'anchorDate')::date not between date '2000-01-01' and date '2100-12-31' or jsonb_typeof(p_data->'intervalMonths') is distinct from 'number' or coalesce(p_data->>'intervalMonths','')!~'^\d{1,3}$' or (p_data->>'intervalMonths')::integer not between 1 and 120 or jsonb_typeof(p_data->'durationMinutes') is distinct from 'number' or coalesce(p_data->>'durationMinutes','')!~'^\d{1,4}$' or (p_data->>'durationMinutes')::integer not between 15 and 1440 then raise exception 'invalid_plan' using errcode='22023';end if;
 select * into site from public.sites where organization_id=p_org and id=(p_data->>'siteId')::uuid;
 if not found or site.archived_at is not null or not exists(select 1 from public.customers c where c.organization_id=p_org and c.id=site.customer_id and c.archived_at is null) then raise exception 'invalid_plan_site' using errcode='22023';end if;
 if p_data->>'timeZone' is distinct from site.time_zone then raise exception 'plan_time_zone_changed' using errcode='PT409';end if;
 if jsonb_typeof(p_data->'systems') is distinct from 'array' or jsonb_typeof(p_data->'members') is distinct from 'array' or jsonb_array_length(p_data->'systems') not between 1 and 500 or jsonb_array_length(p_data->'members') not between 1 and 50 then raise exception 'invalid_plan_selection' using errcode='22023';end if;
 select array_agg(distinct value::uuid) into systems from jsonb_array_elements_text(p_data->'systems');
 select array_agg(distinct value::uuid) into members from jsonb_array_elements_text(p_data->'members');
 if cardinality(systems)<>jsonb_array_length(p_data->'systems') or cardinality(members)<>jsonb_array_length(p_data->'members') or exists(select 1 from unnest(systems) selected where not exists(select 1 from public.systems s where s.organization_id=p_org and s.site_id=site.id and s.id=selected and s.archived_at is null)) or exists(select 1 from unnest(members) selected where not exists(select 1 from public.memberships m where m.organization_id=p_org and m.id=selected and m.active)) then raise exception 'invalid_plan_selection' using errcode='22023';end if;
end $$;

create function public.maintenance_plan_command(p_organization_id uuid,p_plan_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();plan public.maintenance_plans;previous hvac_private.maintenance_events;expected jsonb:=jsonb_build_object('plan',p_plan_id,'kind',p_kind,'version',p_version,'data',p_data);before_data jsonb;after_data jsonb;validation jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 if p_plan_id is null or p_operation_id is null or p_kind is null or p_kind not in ('create','edit','set_enabled') or p_version is null or p_version<0 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>80000 then raise exception 'invalid_plan_command' using errcode='22023';end if;
 select * into previous from hvac_private.maintenance_events where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then if previous.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;return previous.plan_id;end if;
 select * into plan from public.maintenance_plans where organization_id=p_organization_id and id=p_plan_id for update;
 if p_kind='create' then
  if found or p_version<>0 then raise exception 'plan_conflict' using errcode='PT409';end if;
 else
  if not found then raise exception 'maintenance_denied' using errcode='42501';end if;
  if p_version<>plan.version then raise exception 'stale_plan' using errcode='PT409';end if;
  before_data:=to_jsonb(plan)||jsonb_build_object('systems',(select jsonb_agg(system_id order by system_id) from public.plan_systems where organization_id=p_organization_id and plan_id=p_plan_id),'members',(select jsonb_agg(membership_id order by membership_id) from public.maintenance_plan_assignees where organization_id=p_organization_id and plan_id=p_plan_id));
 end if;
 if p_kind in ('create','edit') then
  perform hvac_private.validate_maintenance_plan(p_organization_id,p_data);
  if p_kind='edit' and (p_data->>'siteId')::uuid<>plan.site_id then raise exception 'plan_site_locked' using errcode='22023';end if;
  if p_kind='create' then
   insert into public.maintenance_plans(id,organization_id,site_id,name,anchor_date,anchor_time,time_zone,interval_months,duration_minutes,created_by,updated_by)
   values(p_plan_id,p_organization_id,(p_data->>'siteId')::uuid,btrim(p_data->>'name'),(p_data->>'anchorDate')::date,(p_data->>'anchorTime')::time,p_data->>'timeZone',(p_data->>'intervalMonths')::integer,(p_data->>'durationMinutes')::integer,actor,actor);
  else
   update public.maintenance_plans set name=btrim(p_data->>'name'),anchor_date=(p_data->>'anchorDate')::date,anchor_time=(p_data->>'anchorTime')::time,time_zone=p_data->>'timeZone',interval_months=(p_data->>'intervalMonths')::integer,duration_minutes=(p_data->>'durationMinutes')::integer,version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=p_plan_id;
   delete from public.plan_systems where organization_id=p_organization_id and plan_id=p_plan_id;
   delete from public.maintenance_plan_assignees where organization_id=p_organization_id and plan_id=p_plan_id;
  end if;
  insert into public.plan_systems(organization_id,site_id,plan_id,system_id) select p_organization_id,(p_data->>'siteId')::uuid,p_plan_id,value::uuid from jsonb_array_elements_text(p_data->'systems');
  insert into public.maintenance_plan_assignees(organization_id,plan_id,membership_id) select p_organization_id,p_plan_id,value::uuid from jsonb_array_elements_text(p_data->'members');
 else
  if p_data-'enabled'<>'{}'::jsonb or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'invalid_enabled' using errcode='22023';end if;
  if (p_data->>'enabled')::boolean then
   validation:=jsonb_build_object('siteId',plan.site_id,'name',plan.name,'anchorDate',plan.anchor_date,'anchorTime',to_char(plan.anchor_date+plan.anchor_time,'HH24:MI'),'timeZone',plan.time_zone,'intervalMonths',plan.interval_months,'durationMinutes',plan.duration_minutes,'systems',before_data->'systems','members',before_data->'members');
   perform hvac_private.validate_maintenance_plan(p_organization_id,validation);
  end if;
  update public.maintenance_plans set enabled=(p_data->>'enabled')::boolean,version=version+1,updated_by=actor,updated_at=now() where organization_id=p_organization_id and id=p_plan_id;
 end if;
 select to_jsonb(p)||jsonb_build_object('systems',(select jsonb_agg(system_id order by system_id) from public.plan_systems where organization_id=p_organization_id and plan_id=p_plan_id),'members',(select jsonb_agg(membership_id order by membership_id) from public.maintenance_plan_assignees where organization_id=p_organization_id and plan_id=p_plan_id)) into after_data from public.maintenance_plans p where organization_id=p_organization_id and id=p_plan_id;
 insert into hvac_private.maintenance_events(organization_id,plan_id,actor_id,actor_label,operation_id,payload,before_data,after_data) values(p_organization_id,p_plan_id,actor,hvac_private.actor_email(),p_operation_id,expected,before_data,after_data);
 return p_plan_id;
end $$;

create function public.maintenance_preview(p_organization_id uuid,p_data jsonb,p_from date,p_count integer default 6) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 perform hvac_private.validate_maintenance_plan(p_organization_id,p_data);
 return hvac_private.maintenance_occurrences((p_data->>'anchorDate')::date,(p_data->>'anchorTime')::time,(p_data->>'intervalMonths')::integer,p_data->>'timeZone',(p_data->>'durationMinutes')::integer,p_from,p_count);
end $$;

create function public.maintenance_editor(p_organization_id uuid,p_site_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sites jsonb;systems jsonb:='[]';site jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]') into sites from (select s.id,s.code,s.name,s.time_zone as "timeZone" from public.sites s join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where s.organization_id=p_organization_id and s.archived_at is null and c.archived_at is null order by s.code,s.id limit 1000) x;
 if p_site_id is not null then
  select jsonb_build_object('id',s.id,'name',s.name,'code',s.code,'timeZone',s.time_zone,'active',s.archived_at is null and c.archived_at is null) into site from public.sites s join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id where s.organization_id=p_organization_id and s.id=p_site_id;
  if not found then raise exception 'maintenance_denied' using errcode='42501';end if;
  select coalesce(jsonb_agg(x),'[]') into systems from(select s.id,s.code,s.room,s.archived_at is null as active from public.systems s where s.organization_id=p_organization_id and s.site_id=p_site_id order by s.code,s.id limit 1000) x;
 end if;
 return jsonb_build_object('sites',sites,'site',site,'systems',systems);
end $$;
create function public.maintenance_list(p_organization_id uuid,p_state text default 'all',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;total integer;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 if p_state is null or p_state not in ('all','active','paused') or p_page is null or p_page not between 1 and 1000 then raise exception 'invalid_list' using errcode='22023';end if;
 select count(*) into total from public.maintenance_plans p where p.organization_id=p_organization_id and (p_state='all' or p.enabled=(p_state='active'));
 select coalesce(jsonb_agg(x),'[]') into result from(select p.id,p.name,p.enabled,p.version,p.anchor_date as "anchorDate",to_char(p.anchor_date+p.anchor_time,'HH24:MI') as "anchorTime",p.interval_months as "intervalMonths",p.time_zone as "timeZone",s.name as site,s.code as "siteCode",(select count(*) from public.plan_systems ps where ps.organization_id=p_organization_id and ps.plan_id=p.id) as "systemCount" from public.maintenance_plans p join public.sites s on s.organization_id=p.organization_id and s.id=p.site_id where p.organization_id=p_organization_id and (p_state='all' or p.enabled=(p_state='active')) order by p.created_at desc,p.id limit 30 offset (p_page-1)*30) x;
 return jsonb_build_object('plans',result,'total',total);
end $$;
create function public.maintenance_detail(p_organization_id uuid,p_plan_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.maintenance_plans;history jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 select * into p from public.maintenance_plans where organization_id=p_organization_id and id=p_plan_id;
 if not found then raise exception 'maintenance_denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind',e.payload->>'kind','enabled',e.after_data->'enabled','actor',e.actor_label,'at',e.created_at,'version',e.after_data->'version') order by (e.after_data->>'version')::integer desc),'[]') into history from hvac_private.maintenance_events e where e.organization_id=p_organization_id and e.plan_id=p_plan_id;
 return jsonb_build_object('id',p.id,'version',p.version,'siteId',p.site_id,'name',p.name,'anchorDate',p.anchor_date,'anchorTime',to_char(p.anchor_date+p.anchor_time,'HH24:MI'),'timeZone',p.time_zone,'intervalMonths',p.interval_months,'durationMinutes',p.duration_minutes,'enabled',p.enabled,
 'systems',(select coalesce(jsonb_agg(system_id order by system_id),'[]') from public.plan_systems where organization_id=p_organization_id and plan_id=p_plan_id),
 'members',(select coalesce(jsonb_agg(membership_id order by membership_id),'[]') from public.maintenance_plan_assignees where organization_id=p_organization_id and plan_id=p_plan_id),
 'history',history,'occurrences',hvac_private.maintenance_occurrences(p.anchor_date,p.anchor_time,p.interval_months,p.time_zone,p.duration_minutes,(now() at time zone p.time_zone)::date,6));
end $$;

alter function hvac_private.maintenance_local_time(timestamp,text) owner to hvac_identity_executor;
revoke all on function hvac_private.maintenance_local_time(timestamp,text) from public,anon,authenticated,service_role;
alter function hvac_private.maintenance_occurrences(date,time,integer,text,integer,date,integer) owner to hvac_identity_executor;
revoke all on function hvac_private.maintenance_occurrences(date,time,integer,text,integer,date,integer) from public,anon,authenticated,service_role;
alter function hvac_private.validate_maintenance_plan(uuid,jsonb) owner to hvac_identity_executor;
revoke all on function hvac_private.validate_maintenance_plan(uuid,jsonb) from public,anon,authenticated,service_role;
alter function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
revoke all on function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) to authenticated;
alter function public.maintenance_preview(uuid,jsonb,date,integer) owner to hvac_identity_executor;
revoke all on function public.maintenance_preview(uuid,jsonb,date,integer) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_preview(uuid,jsonb,date,integer) to authenticated;
alter function public.maintenance_editor(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.maintenance_editor(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_editor(uuid,uuid) to authenticated;
alter function public.maintenance_list(uuid,text,integer) owner to hvac_identity_executor;
revoke all on function public.maintenance_list(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_list(uuid,text,integer) to authenticated;
alter function public.maintenance_detail(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.maintenance_detail(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_detail(uuid,uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
