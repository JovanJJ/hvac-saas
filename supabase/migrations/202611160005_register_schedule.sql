create table public.customers(id uuid primary key,organization_id uuid not null references public.organizations(id),name text not null check(length(trim(name)) between 1 and 120),contact text not null default '',unique(organization_id,id));
create table public.sites(id uuid primary key,organization_id uuid not null,customer_id uuid not null,code text not null,name text not null,address text not null,time_zone text not null,access_note text not null default '',unique(organization_id,id),unique(organization_id,code),foreign key(organization_id,customer_id) references public.customers(organization_id,id));
create table public.systems(id uuid primary key,organization_id uuid not null,site_id uuid not null,code text not null,room text not null,model text not null default '',serial text not null default '',unique(organization_id,id),unique(organization_id,site_id,id),unique(organization_id,site_id,code),foreign key(organization_id,site_id) references public.sites(organization_id,id));
create table public.visits(id uuid primary key,organization_id uuid not null,site_id uuid not null,visit_type text not null check(visit_type in ('maintenance','repair','installation')),scheduled_at timestamptz not null,ends_at timestamptz not null,created_by uuid not null references auth.users(id),status text not null default 'scheduled' check(status='scheduled'),unique(organization_id,id),unique(organization_id,site_id,id),check(ends_at>scheduled_at),foreign key(organization_id,site_id) references public.sites(organization_id,id));
create table public.visit_assignees(organization_id uuid not null,visit_id uuid not null,membership_id uuid not null,primary key(organization_id,visit_id,membership_id),foreign key(organization_id,visit_id) references public.visits(organization_id,id),foreign key(organization_id,membership_id) references public.memberships(organization_id,id));
create table public.visit_items(id uuid primary key default gen_random_uuid(),organization_id uuid not null,site_id uuid not null,visit_id uuid not null,system_id uuid not null,planned boolean not null default true,outcome text not null default 'pending' check(outcome='pending'),unique(organization_id,visit_id,system_id),foreign key(organization_id,site_id,visit_id) references public.visits(organization_id,site_id,id),foreign key(organization_id,site_id,system_id) references public.systems(organization_id,site_id,id));
create index visits_schedule_idx on public.visits(organization_id,scheduled_at);
create index assignees_member_idx on public.visit_assignees(membership_id,organization_id,visit_id);
create index systems_site_idx on public.systems(organization_id,site_id);
create index sites_customer_idx on public.sites(organization_id,customer_id);
create table hvac_private.operation_receipts(organization_id uuid not null,actor_id uuid not null,operation_id uuid not null,payload jsonb not null,primary key(organization_id,actor_id,operation_id));
revoke all on hvac_private.operation_receipts from public,anon,authenticated;
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
grant create on schema public to hvac_identity_executor;
grant select,insert on hvac_private.operation_receipts to hvac_identity_executor;
do $$ declare t text; begin
 foreach t in array array['customers','sites','systems','visits','visit_assignees','visit_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert on public.%I to hvac_identity_executor',t);
 execute format('create policy executor_access on public.%I to hvac_identity_executor using(true) with check(true)',t);
 execute format('create policy office_read on public.%I for select to authenticated using(hvac_private.has_workspace_role(organization_id,array[''owner'',''coordinator'']))',t);
 end loop;
end $$;
-- Policy predicate is actor-scoped and does not reveal roster or arbitrary user access.
grant execute on function hvac_private.has_workspace_role(uuid,text[]) to authenticated;
create function public.save_operation(p_organization_id uuid,p_operation_id uuid,p_kind text,p_data jsonb) returns uuid
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
 insert into public.customers values(p_operation_id,p_organization_id,trim(p_data->>'name'),coalesce(p_data->>'contact',''));
 elsif p_kind='site' then
 zone:=p_data->>'timeZone';
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) or length(trim(coalesce(p_data->>'code','')))=0 or length(trim(coalesce(p_data->>'address','')))=0 then raise exception 'invalid_site' using errcode='22023'; end if;
 insert into public.sites values(p_operation_id,p_organization_id,(p_data->>'customerId')::uuid,upper(trim(p_data->>'code')),trim(p_data->>'name'),trim(p_data->>'address'),zone,coalesce(p_data->>'accessNote',''));
 elsif p_kind='system' then
 if length(trim(coalesce(p_data->>'code','')))=0 or length(trim(coalesce(p_data->>'room','')))=0 then raise exception 'invalid_system' using errcode='22023'; end if;
 insert into public.systems values(p_operation_id,p_organization_id,(p_data->>'siteId')::uuid,upper(trim(p_data->>'code')),trim(p_data->>'room'),coalesce(p_data->>'model',''),coalesce(p_data->>'serial',''));
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
create function public.operation_snapshot(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); office boolean; result jsonb;
begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) then raise exception 'operation_denied' using errcode='42501'; end if;
 office:=hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']);
 select jsonb_build_object(
 'customers',case when office then coalesce((select jsonb_agg(c order by c.name) from public.customers c where c.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'sites',case when office then coalesce((select jsonb_agg(s order by s.name) from public.sites s where s.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'systems',case when office then coalesce((select jsonb_agg(s order by s.code) from public.systems s where s.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'site',s.name,'address',s.address,'accessNote',s.access_note,'timeZone',s.time_zone,'start',v.scheduled_at,'end',v.ends_at,'visitType',v.visit_type,'systems',(select jsonb_agg(jsonb_build_object('code',sys.code,'room',sys.room,'id',sys.id)) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.visit_id=v.id)) order by v.scheduled_at) from public.visits v join public.sites s on s.id=v.site_id where v.organization_id=p_organization_id and (office or exists(select 1 from public.visit_assignees a join public.memberships m on m.id=a.membership_id where a.visit_id=v.id and m.user_id=actor and m.active))),'[]')) into result;
 return result;
end $$;
alter function public.save_operation(uuid,uuid,text,jsonb) owner to hvac_identity_executor;
alter function public.operation_snapshot(uuid) owner to hvac_identity_executor;
revoke all on function public.save_operation(uuid,uuid,text,jsonb),public.operation_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_operation(uuid,uuid,text,jsonb),public.operation_snapshot(uuid) to authenticated;
revoke create on schema public from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
