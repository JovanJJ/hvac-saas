-- Durable bounded recurrence generation. The worker shares the existing verified service identity.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
alter table public.maintenance_plans add column next_generation_at timestamptz not null default now();
create index maintenance_generation_due_idx on public.maintenance_plans(next_generation_at,id) where enabled;
create table hvac_private.maintenance_jobs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,plan_id uuid not null,plan_version integer not null,
 from_date date not null,until_date date not null,requested_by uuid not null references auth.users(id),
 state text not null default 'queued' check(state in ('queued','running','ready','failed','superseded')),
 attempts integer not null default 0 check(attempts between 0 and 3),available_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,claimed_by uuid references auth.users(id),last_error text,result jsonb,
 created_at timestamptz not null default now(),completed_at timestamptz,
 unique(organization_id,id),unique(organization_id,plan_id,id),unique(organization_id,plan_id,plan_version,from_date,until_date),
 foreign key(organization_id,plan_id) references public.maintenance_plans(organization_id,id),
 check(until_date>=from_date and until_date-from_date<90)
);
create index maintenance_jobs_claim_idx on hvac_private.maintenance_jobs(state,available_at,created_at,id);
create index maintenance_jobs_plan_idx on hvac_private.maintenance_jobs(organization_id,plan_id,created_at desc);
create table hvac_private.maintenance_generation_receipts(
 organization_id uuid not null,actor_id uuid not null references auth.users(id),operation_id uuid not null,job_id uuid not null,payload jsonb not null,
 primary key(organization_id,actor_id,operation_id),foreign key(organization_id,job_id) references hvac_private.maintenance_jobs(organization_id,id)
);
create index maintenance_generation_receipts_job_idx on hvac_private.maintenance_generation_receipts(organization_id,job_id);
revoke all on hvac_private.maintenance_jobs,hvac_private.maintenance_generation_receipts from public,anon,authenticated,service_role;
grant select,insert,update on hvac_private.maintenance_jobs to hvac_identity_executor;
grant select,insert on hvac_private.maintenance_generation_receipts to hvac_identity_executor;
create table public.maintenance_occurrences(
 organization_id uuid not null,site_id uuid not null,plan_id uuid not null,intended_date date not null,visit_id uuid not null unique,
 plan_version integer not null,job_id uuid not null,time_zone text not null,intended_local text not null,resolved_local text not null,
 starts_at timestamptz not null,ends_at timestamptz not null,created_at timestamptz not null default now(),
 primary key(organization_id,plan_id,intended_date),
 foreign key(organization_id,site_id,plan_id) references public.maintenance_plans(organization_id,site_id,id),
 foreign key(organization_id,site_id,visit_id) references public.visits(organization_id,site_id,id),
 foreign key(organization_id,plan_id,job_id) references hvac_private.maintenance_jobs(organization_id,plan_id,id)
);
alter table public.maintenance_occurrences enable row level security;
revoke all on public.maintenance_occurrences from public,anon,authenticated,service_role;
grant select on public.maintenance_occurrences to authenticated;
grant select,insert on public.maintenance_occurrences to hvac_identity_executor;
create policy office_read on public.maintenance_occurrences for select to authenticated using(hvac_private.has_workspace_role(organization_id,array['owner','coordinator']));
create policy executor_access on public.maintenance_occurrences to hvac_identity_executor using(true) with check(true);

create function hvac_private.schedule_visit(p_org uuid,p_site uuid,p_id uuid,p_start timestamptz,p_end timestamptz,p_type text,p_systems uuid[],p_members uuid[],p_actor uuid) returns uuid
language plpgsql set search_path='' as $$
begin
 if p_id is null or p_actor is null or p_start is null or p_end is null or p_end<=p_start or p_type is null or p_type not in ('maintenance','repair','installation') or coalesce(cardinality(p_systems),0) not between 1 and 500 or coalesce(cardinality(p_members),0) not between 1 and 50 then raise exception 'invalid_schedule' using errcode='22023';end if;
 if exists(select 1 from unnest(p_members) x where not exists(select 1 from public.memberships m where m.organization_id=p_org and m.id=x and m.active)) or exists(select 1 from unnest(p_systems) x where not exists(select 1 from public.systems s where s.organization_id=p_org and s.site_id=p_site and s.id=x and s.archived_at is null)) then raise exception 'invalid_selection' using errcode='22023';end if;
 insert into public.visits(id,organization_id,site_id,visit_type,scheduled_at,ends_at,created_by) values(p_id,p_org,p_site,p_type,p_start,p_end,p_actor);
 insert into public.visit_assignees(organization_id,visit_id,membership_id) select p_org,p_id,unnest(p_members);
 insert into public.visit_items(organization_id,site_id,visit_id,system_id) select p_org,p_site,p_id,unnest(p_systems);
 return p_id;
end $$;

create function hvac_private.enqueue_maintenance(p_org uuid,p_plan uuid,p_from date,p_until date,p_actor uuid) returns uuid
language plpgsql set search_path='' as $$
declare plan public.maintenance_plans;job uuid;
begin
 select * into plan from public.maintenance_plans where organization_id=p_org and id=p_plan for update;
 if not found or not plan.enabled then raise exception 'plan_paused' using errcode='PT409';end if;
 insert into hvac_private.maintenance_jobs(organization_id,plan_id,plan_version,from_date,until_date,requested_by)
 values(p_org,p_plan,plan.version,p_from,p_until,p_actor) on conflict(organization_id,plan_id,plan_version,from_date,until_date) do nothing;
 select id into job from hvac_private.maintenance_jobs where organization_id=p_org and plan_id=p_plan and plan_version=plan.version and from_date=p_from and until_date=p_until;
 update public.maintenance_plans set next_generation_at=clock_timestamp()+interval '24 hours' where organization_id=p_org and id=p_plan;
 return job;
end $$;
-- Preserve the existing command/replay implementation behind a narrow public wrapper.
alter function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) set schema hvac_private;
alter function hvac_private.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) rename to configure_maintenance_plan;
revoke all on function hvac_private.configure_maintenance_plan(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
create function public.maintenance_plan_command(p_organization_id uuid,p_plan_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();replay boolean;plan public.maintenance_plans;today date;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 replay:=exists(select 1 from hvac_private.maintenance_events where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id);
 perform hvac_private.configure_maintenance_plan(p_organization_id,p_plan_id,p_operation_id,p_kind,p_version,p_data);
 if replay then return p_plan_id;end if;
 select * into plan from public.maintenance_plans where organization_id=p_organization_id and id=p_plan_id;
 update hvac_private.maintenance_jobs set state='superseded',last_error='plan_changed',completed_at=clock_timestamp(),lease_until=null
 where organization_id=p_organization_id and plan_id=p_plan_id and plan_version<>plan.version and state in ('queued','running');
 if plan.enabled then today:=(clock_timestamp() at time zone plan.time_zone)::date;perform hvac_private.enqueue_maintenance(p_organization_id,p_plan_id,today,today+89,actor);end if;
 return p_plan_id;
end $$;

create function public.maintenance_generation_command(p_organization_id uuid,p_plan_id uuid,p_operation_id uuid,p_kind text,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();plan public.maintenance_plans;previous hvac_private.maintenance_generation_receipts;job hvac_private.maintenance_jobs;result uuid;from_day date;until_day date;today date;expected jsonb:=jsonb_build_object('plan',p_plan_id,'kind',p_kind,'version',p_version,'data',p_data);
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 select * into plan from public.maintenance_plans where organization_id=p_organization_id and id=p_plan_id for update;
 if not found then raise exception 'maintenance_denied' using errcode='42501';end if;
 if p_operation_id is null or p_kind is null or p_kind not in ('generate','retry') or p_version is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>2000 then raise exception 'invalid_generation' using errcode='22023';end if;
 select * into previous from hvac_private.maintenance_generation_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then if previous.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;return previous.job_id;end if;
 if plan.version<>p_version or not plan.enabled then raise exception 'stale_or_paused_plan' using errcode='PT409';end if;
 if p_kind='generate' then
  if p_data-array['from','until']<>'{}'::jsonb or coalesce(p_data->>'from','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'until','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_window' using errcode='22023';end if;
  from_day:=(p_data->>'from')::date;until_day:=(p_data->>'until')::date;today:=(clock_timestamp() at time zone plan.time_zone)::date;
  if from_day<today or until_day>today+365 or until_day<from_day or until_day-from_day>=90 then raise exception 'invalid_window' using errcode='22023';end if;
  result:=hvac_private.enqueue_maintenance(p_organization_id,p_plan_id,from_day,until_day,actor);
 else
  if p_data-'jobId'<>'{}'::jsonb then raise exception 'invalid_retry' using errcode='22023';end if;
  select * into job from hvac_private.maintenance_jobs where organization_id=p_organization_id and plan_id=p_plan_id and id=(p_data->>'jobId')::uuid for update;
  if not found or job.plan_version<>plan.version or job.state='superseded' then raise exception 'stale_job' using errcode='PT409';end if;
  if job.state='failed' then update hvac_private.maintenance_jobs set state='queued',attempts=0,available_at=clock_timestamp(),lease_token=null,lease_until=null,claimed_by=null,last_error=null,completed_at=null where id=job.id;end if;
  result:=job.id;
 end if;
 insert into hvac_private.maintenance_generation_receipts(organization_id,actor_id,operation_id,job_id,payload) values(p_organization_id,actor,p_operation_id,result,expected);
 return result;
end $$;

create function public.maintenance_tick(p_plan_id uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_pdf_worker();candidate record;plan public.maintenance_plans;today date;count integer:=0;
begin
 for candidate in select p.id,p.organization_id from public.maintenance_plans p where p.enabled and p.next_generation_at<=clock_timestamp() and (p_plan_id is null or p.id=p_plan_id) order by p.next_generation_at,p.id limit 20 loop
  perform 1 from public.organizations where id=candidate.organization_id for update skip locked;
  if not found then continue;end if;
  select * into plan from public.maintenance_plans where organization_id=candidate.organization_id and id=candidate.id for update;
  if not plan.enabled or plan.next_generation_at>clock_timestamp() then continue;end if;
  today:=(clock_timestamp() at time zone plan.time_zone)::date;
  perform hvac_private.enqueue_maintenance(plan.organization_id,plan.id,today,today+89,actor);count:=count+1;
 end loop;
 return count;
end $$;
create function public.maintenance_claim(p_plan_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_pdf_worker();job hvac_private.maintenance_jobs;
begin
 update hvac_private.maintenance_jobs set state='failed',last_error='lease_expired',lease_until=null,completed_at=clock_timestamp()
 where id in(select id from hvac_private.maintenance_jobs where state='running' and lease_until<=clock_timestamp() and attempts>=3 and (p_plan_id is null or plan_id=p_plan_id) order by created_at,id limit 50 for update skip locked);
 select * into job from hvac_private.maintenance_jobs where (p_plan_id is null or plan_id=p_plan_id) and attempts<3 and ((state='queued' and available_at<=clock_timestamp()) or (state='running' and lease_until<=clock_timestamp())) order by created_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update hvac_private.maintenance_jobs set state='running',attempts=attempts+1,claimed_by=actor,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds' where id=job.id returning * into job;
 return jsonb_build_object('jobId',job.id,'planId',job.plan_id,'organizationId',job.organization_id,'leaseToken',job.lease_token,'attempts',job.attempts);
end $$;
create function public.maintenance_execute(p_job_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_pdf_worker();job hvac_private.maintenance_jobs;plan public.maintenance_plans;config jsonb;row jsonb;rows jsonb;existing uuid;target uuid;systems uuid[];members uuid[];created integer:=0;kept integer:=0;past integer:=0;visits jsonb:='[]';today date;
begin
 select * into job from hvac_private.maintenance_jobs where id=p_job_id;
 if not found then raise exception 'job_denied' using errcode='42501';end if;
 perform 1 from public.organizations where id=job.organization_id for update;
 select * into plan from public.maintenance_plans where organization_id=job.organization_id and id=job.plan_id for update;
 select * into job from hvac_private.maintenance_jobs where id=p_job_id for update;
 if job.claimed_by is distinct from actor or job.lease_token is distinct from p_lease_token then raise exception 'lease_lost' using errcode='PT409';end if;
 if job.state in ('ready','superseded') then return jsonb_build_object('state',job.state,'result',job.result);end if;
 if job.state<>'running' or job.lease_until<=clock_timestamp() then raise exception 'lease_lost' using errcode='PT409';end if;
 if not plan.enabled or plan.version<>job.plan_version then
  update hvac_private.maintenance_jobs set state='superseded',last_error='plan_changed',completed_at=clock_timestamp(),lease_until=null where id=job.id;
  return '{"state":"superseded"}'::jsonb;
 end if;
 select array_agg(system_id order by system_id) into systems from public.plan_systems where organization_id=job.organization_id and plan_id=plan.id;
 select array_agg(membership_id order by membership_id) into members from public.maintenance_plan_assignees where organization_id=job.organization_id and plan_id=plan.id;
 config:=jsonb_build_object('siteId',plan.site_id,'name',plan.name,'anchorDate',plan.anchor_date,'anchorTime',to_char(plan.anchor_date+plan.anchor_time,'HH24:MI'),'timeZone',plan.time_zone,'intervalMonths',plan.interval_months,'durationMinutes',plan.duration_minutes,'systems',to_jsonb(systems),'members',to_jsonb(members));
 begin
  perform hvac_private.validate_maintenance_plan(job.organization_id,config);
  rows:=hvac_private.maintenance_occurrences(plan.anchor_date,plan.anchor_time,plan.interval_months,plan.time_zone,plan.duration_minutes,job.from_date,12);
  today:=(clock_timestamp() at time zone plan.time_zone)::date;
  for row in select value from jsonb_array_elements(rows) loop
   exit when (row->>'intendedDate')::date>job.until_date;
   select visit_id into existing from public.maintenance_occurrences where organization_id=job.organization_id and plan_id=plan.id and intended_date=(row->>'intendedDate')::date;
   if found then kept:=kept+1;visits:=visits||jsonb_build_array(jsonb_build_object('visitId',existing,'intendedDate',row->>'intendedDate','created',false));continue;end if;
   if (row->>'intendedDate')::date<today then past:=past+1;continue;end if;
   target:=gen_random_uuid();
   perform hvac_private.schedule_visit(job.organization_id,plan.site_id,target,(row->>'startsAt')::timestamptz,(row->>'endsAt')::timestamptz,'maintenance',systems,members,actor);
   insert into public.maintenance_occurrences(organization_id,site_id,plan_id,intended_date,visit_id,plan_version,job_id,time_zone,intended_local,resolved_local,starts_at,ends_at)
    values(job.organization_id,plan.site_id,plan.id,(row->>'intendedDate')::date,target,plan.version,job.id,plan.time_zone,row->>'intendedLocal',row->>'resolvedLocal',(row->>'startsAt')::timestamptz,(row->>'endsAt')::timestamptz);
   visits:=visits||jsonb_build_array(jsonb_build_object('visitId',target,'intendedDate',row->>'intendedDate','created',true));created:=created+1;
  end loop;
 exception when invalid_parameter_value or foreign_key_violation or check_violation or sqlstate 'PT409' then
  update hvac_private.maintenance_jobs set state='failed',last_error='configuration_invalid',lease_until=null,completed_at=clock_timestamp() where id=job.id;
  return '{"state":"failed","error":"configuration_invalid"}'::jsonb;
 end;
 update hvac_private.maintenance_jobs set state='ready',last_error=null,lease_until=null,completed_at=clock_timestamp(),result=jsonb_build_object('created',created,'existing',kept,'skippedPast',past,'visits',visits) where id=job.id returning * into job;
 return jsonb_build_object('state','ready','result',job.result);
end $$;
create function public.maintenance_fail(p_job_id uuid,p_lease_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_pdf_worker();job hvac_private.maintenance_jobs;
begin
 select * into job from hvac_private.maintenance_jobs where id=p_job_id for update;
 if not found or job.claimed_by is distinct from actor or job.lease_token is distinct from p_lease_token then raise exception 'lease_lost' using errcode='PT409';end if;
 if job.state in ('ready','superseded') then return;end if;
 if job.state<>'running' or job.lease_until<=clock_timestamp() then raise exception 'lease_lost' using errcode='PT409';end if;
 update hvac_private.maintenance_jobs set state=case when attempts>=3 then 'failed' else 'queued' end,last_error='generation_failed',available_at=clock_timestamp()+make_interval(secs=>10*power(2,attempts-1)::integer),lease_until=null where id=job.id;
end $$;
create function public.maintenance_generation_state(p_organization_id uuid,p_plan_id uuid,p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare plan public.maintenance_plans;jobs jsonb;visits jsonb;total integer;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'maintenance_denied' using errcode='42501';end if;
 select * into plan from public.maintenance_plans where organization_id=p_organization_id and id=p_plan_id;
 if not found then raise exception 'maintenance_denied' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 1000 then raise exception 'invalid_page' using errcode='22023';end if;
 select coalesce(jsonb_agg(x),'[]') into jobs from(select j.id,j.plan_version as version,j.from_date as "from",j.until_date as "until",j.state,j.attempts,j.last_error as error,j.result,j.created_at as "createdAt" from hvac_private.maintenance_jobs j where j.organization_id=p_organization_id and j.plan_id=p_plan_id order by j.created_at desc,j.id desc limit 20) x;
 select count(*) into total from public.maintenance_occurrences where organization_id=p_organization_id and plan_id=p_plan_id;
 select coalesce(jsonb_agg(x),'[]') into visits from(select o.visit_id as id,o.intended_date as "intendedDate",o.plan_version as "planVersion",o.time_zone as "timeZone",o.starts_at as "originalStart",v.scheduled_at as start,v.ends_at as "end",v.status from public.maintenance_occurrences o join public.visits v on v.organization_id=o.organization_id and v.id=o.visit_id where o.organization_id=p_organization_id and o.plan_id=p_plan_id order by o.intended_date desc limit 30 offset (p_page-1)*30) x;
 return jsonb_build_object('jobs',jobs,'visits',visits,'totalVisits',total,'nextScanAt',plan.next_generation_at,'today',(now() at time zone plan.time_zone)::date,'windowUntil',(now() at time zone plan.time_zone)::date+89);
end $$;
create function hvac_private.maintenance_visit_source(p_org uuid,p_visit uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('planId',o.plan_id,'planName',p.name,'intendedDate',o.intended_date) from public.maintenance_occurrences o join public.maintenance_plans p on p.organization_id=o.organization_id and p.id=o.plan_id where o.organization_id=p_org and o.visit_id=p_visit),'{}'::jsonb)
$$;

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
 perform hvac_private.schedule_visit(p_organization_id,target,p_operation_id,starts,finishes,p_data->>'visitType',systems,members,actor);
 else raise exception 'invalid_kind' using errcode='22023'; end if;
 insert into hvac_private.operation_receipts values(p_organization_id,actor,p_operation_id,payload);
 return p_operation_id;
end $$;

alter function public.visit_bundle(uuid,uuid) set schema hvac_private;
alter function hvac_private.visit_bundle(uuid,uuid) rename to base_visit_bundle;
revoke all on function hvac_private.base_visit_bundle(uuid,uuid) from public,anon,authenticated,service_role;
create function public.visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin result:=hvac_private.base_visit_bundle(p_organization_id,p_visit_id);return result||hvac_private.maintenance_visit_source(p_organization_id,p_visit_id); end $$;
alter function public.operation_snapshot(uuid) set schema hvac_private;
alter function hvac_private.operation_snapshot(uuid) rename to base_operation_snapshot;
revoke all on function hvac_private.base_operation_snapshot(uuid) from public,anon,authenticated,service_role;
create function public.operation_snapshot(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin result:=hvac_private.base_operation_snapshot(p_organization_id);return jsonb_set(result,'{visits}',coalesce((select jsonb_agg(x||hvac_private.maintenance_visit_source(p_organization_id,(x->>'id')::uuid) order by n) from jsonb_array_elements(result->'visits') with ordinality a(x,n)),'[]'::jsonb)); end $$;
alter function public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean) set schema hvac_private;
alter function hvac_private.schedule_snapshot(uuid,date,date,uuid,uuid,boolean) rename to base_schedule_snapshot;
revoke all on function hvac_private.base_schedule_snapshot(uuid,date,date,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.schedule_snapshot(p_organization_id uuid,p_from date,p_until date,p_site_id uuid default null,p_member_id uuid default null,p_include_cancelled boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin result:=hvac_private.base_schedule_snapshot(p_organization_id,p_from,p_until,p_site_id,p_member_id,p_include_cancelled);return jsonb_set(result,'{visits}',coalesce((select jsonb_agg(x||hvac_private.maintenance_visit_source(p_organization_id,(x->>'id')::uuid) order by n) from jsonb_array_elements(result->'visits') with ordinality a(x,n)),'[]'::jsonb)); end $$;
alter function hvac_private.schedule_visit(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid[],uuid[],uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.schedule_visit(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid[],uuid[],uuid) from public,anon,authenticated,service_role;
alter function hvac_private.enqueue_maintenance(uuid,uuid,date,date,uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.enqueue_maintenance(uuid,uuid,date,date,uuid) from public,anon,authenticated,service_role;
alter function hvac_private.maintenance_visit_source(uuid,uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.maintenance_visit_source(uuid,uuid) from public,anon,authenticated,service_role;
alter function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
revoke all on function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_plan_command(uuid,uuid,uuid,text,integer,jsonb) to authenticated;
alter function public.maintenance_generation_command(uuid,uuid,uuid,text,integer,jsonb) owner to hvac_identity_executor;
revoke all on function public.maintenance_generation_command(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_generation_command(uuid,uuid,uuid,text,integer,jsonb) to authenticated;
alter function public.maintenance_tick(uuid) owner to hvac_identity_executor;
revoke all on function public.maintenance_tick(uuid) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_tick(uuid) to authenticated;
alter function public.maintenance_claim(uuid) owner to hvac_identity_executor;
revoke all on function public.maintenance_claim(uuid) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_claim(uuid) to authenticated;
alter function public.maintenance_execute(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.maintenance_execute(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_execute(uuid,uuid) to authenticated;
alter function public.maintenance_fail(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.maintenance_fail(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_fail(uuid,uuid) to authenticated;
alter function public.maintenance_generation_state(uuid,uuid,integer) owner to hvac_identity_executor;
revoke all on function public.maintenance_generation_state(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.maintenance_generation_state(uuid,uuid,integer) to authenticated;
alter function public.visit_bundle(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.visit_bundle(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.visit_bundle(uuid,uuid) to authenticated;
alter function public.operation_snapshot(uuid) owner to hvac_identity_executor;
revoke all on function public.operation_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.operation_snapshot(uuid) to authenticated;
alter function public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean) owner to hvac_identity_executor;
revoke all on function public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.schedule_snapshot(uuid,date,date,uuid,uuid,boolean) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
