-- Pre-organization contacts; never exposed through tenant APIs or public listing.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table hvac_private.demo_requests (
 operation_id uuid primary key,
 name text not null check(length(name) between 1 and 100),
 email text not null check(length(email) between 3 and 254),
 company text not null check(length(company) between 1 and 160),
 plan text not null check(plan in ('','tim','solo')),
 created_at timestamptz not null default clock_timestamp()
);
create index demo_requests_created_idx on hvac_private.demo_requests(created_at);
create index demo_requests_email_created_idx on hvac_private.demo_requests(email,created_at);
revoke all on hvac_private.demo_requests from public,anon,authenticated,service_role;
alter table hvac_private.demo_requests enable row level security;
grant select,insert on hvac_private.demo_requests to hvac_identity_executor;
create policy executor_access on hvac_private.demo_requests to hvac_identity_executor using(true) with check(true);

create function public.submit_demo_request(p_operation_id uuid,p_name text,p_email text,p_company text,p_plan text) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior hvac_private.demo_requests;at_time timestamptz;
begin
 if p_operation_id is null or p_name is null or p_email is null or p_company is null or p_plan is null
 or length(btrim(p_name)) not between 1 and 100 or length(btrim(p_company)) not between 1 and 160
 or length(p_email)>254 or p_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$'
 or p_plan not in ('','tim','solo') then raise exception 'invalid_demo_input' using errcode='22023';end if;
 -- Serialize both quota checks and insertion across all app instances/direct API callers.
 perform pg_catalog.pg_advisory_xact_lock(240055,1);
 select * into prior from hvac_private.demo_requests where operation_id=p_operation_id;
 if found then
  if (prior.name,prior.email,prior.company,prior.plan) is distinct from (btrim(p_name),lower(p_email),btrim(p_company),p_plan) then
   raise exception 'demo_operation_conflict' using errcode='PT409';
  end if;
  return prior.operation_id;
 end if;
 at_time:=clock_timestamp();
 if (select count(*) from hvac_private.demo_requests where created_at>at_time-interval '1 hour')>=100
 or (select count(*) from hvac_private.demo_requests where email=lower(p_email) and created_at>at_time-interval '24 hours')>=3 then
  raise exception 'demo_rate_limited' using errcode='PT429';
 end if;
 insert into hvac_private.demo_requests(operation_id,name,email,company,plan) values(p_operation_id,btrim(p_name),lower(p_email),btrim(p_company),p_plan);
 return p_operation_id;
end $$;
alter function public.submit_demo_request(uuid,text,text,text,text) owner to hvac_identity_executor;
revoke all on function public.submit_demo_request(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_demo_request(uuid,text,text,text,text) to anon,authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
