reset role;
select set_config('hvac_test.generation_worker',(select user_id::text from hvac_private.pdf_worker_identity),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();a uuid:=gen_random_uuid();p uuid:=gen_random_uuid();tech uuid;config jsonb;job jsonb;reclaimed jsonb;result jsonb;op uuid:=gen_random_uuid();queued uuid;first_id uuid;bundle jsonb;frozen jsonb;version integer;today date:=(now() at time zone 'Europe/Belgrade')::date;anchor date:=(date_trunc('month',now() at time zone 'Europe/Belgrade')+interval '2 months - 1 day')::date;
begin
 select membership_id into tech from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000102';
 perform public.save_operation(org,c,'customer','{"name":"Fiktivni generator M5f"}');
 perform public.save_operation(org,s,'site',jsonb_build_object('customerId',c,'code',s,'name','Fiktivna lokacija M5f','address','Primer 51','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,a,'system',jsonb_build_object('siteId',s,'code','KL-01','room','Recepcija'));
 config:=jsonb_build_object('siteId',s,'name','Fiktivan mesečni plan','anchorDate',anchor,'anchorTime','08:30','timeZone','Europe/Belgrade','intervalMonths',1,'durationMinutes',60,'systems',jsonb_build_array(a),'members',jsonb_build_array(tech));
 perform public.maintenance_plan_command(org,p,op,'create',0,config);
 perform public.maintenance_plan_command(org,p,op,'create',0,config);
 if jsonb_array_length(public.maintenance_generation_state(org,p)->'jobs')<>1 then raise exception 'automatic enqueue duplicated';end if;
 begin perform public.maintenance_tick(p);raise exception 'office tick';exception when insufficient_privilege then null;end;
 begin perform public.maintenance_claim(p);raise exception 'office claim';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);
 if public.maintenance_tick(p)<>0 then raise exception 'scan disregards due time';end if;
 job:=public.maintenance_claim(p);
 if job is null or public.maintenance_claim(p) is not null then raise exception 'duplicate claim';end if;
 begin perform public.maintenance_execute((job->>'jobId')::uuid,gen_random_uuid());raise exception 'wrong token';exception when sqlstate 'PT409' then null;end;
 perform set_config('hvac_test.generation_job',job::text,true);perform set_config('hvac_test.generation_plan',p::text,true);perform set_config('hvac_test.generation_config',config::text,true);perform set_config('hvac_test.generation_system',a::text,true);
end $$;
-- A killed worker leaves only its lease. Reclaim with a new token, then execute/replay.
reset role;
update hvac_private.maintenance_jobs set lease_until=clock_timestamp()-interval '1 second' where id=(current_setting('hvac_test.generation_job')::jsonb->>'jobId')::uuid;
set local role authenticated;
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';p uuid:=current_setting('hvac_test.generation_plan')::uuid;config jsonb:=current_setting('hvac_test.generation_config')::jsonb;old jsonb:=current_setting('hvac_test.generation_job')::jsonb;job jsonb;result jsonb;op uuid:=gen_random_uuid();queued uuid;today date:=(now() at time zone 'Europe/Belgrade')::date;bundle jsonb;frozen jsonb;first_id uuid;item uuid;version integer;token uuid;
begin
 job:=public.maintenance_claim(p);
 if job->>'attempts'<>'2' or job->>'leaseToken'=old->>'leaseToken' then raise exception 'crash recovery lease';end if;
 begin perform public.maintenance_execute((old->>'jobId')::uuid,(old->>'leaseToken')::uuid);raise exception 'stale lease accepted';exception when sqlstate 'PT409' then null;end;
 result:=public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
 if result->>'state'<>'ready' or (result->'result'->>'created')::integer<1 then raise exception 'generator failed: %',result;end if;
 if public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid)<>result then raise exception 'lost response replay';end if;
 perform public.maintenance_fail((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
 first_id:=(result->'result'->'visits'->0->>'visitId')::uuid;
 perform set_config('hvac_test.generation_visit',first_id::text,true);
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 queued:=public.maintenance_generation_command(org,p,op,'generate',1,jsonb_build_object('from',today,'until',today+89));
 if queued::text<>job->>'jobId' then raise exception 'same logical job duplicated';end if;
 perform public.maintenance_generation_command(org,p,op,'generate',1,jsonb_build_object('from',today,'until',today+89));
 begin perform public.maintenance_generation_command(org,p,op,'generate',1,jsonb_build_object('from',today,'until',today+88));raise exception 'changed enqueue replay';exception when sqlstate 'PT409' then null;end;
 begin perform public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',1,jsonb_build_object('from',today-1,'until',today+1));raise exception 'backfill permitted';exception when invalid_parameter_value then null;end;
 begin perform public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',1,jsonb_build_object('from',today,'until',today+90));raise exception 'unbounded window';exception when invalid_parameter_value then null;end;
 bundle:=public.visit_bundle(org,first_id);
 if bundle->>'planId'<>p::text or jsonb_array_length(bundle->'items')<>1 then raise exception 'generated bundle missing coverage/source';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 bundle:=public.visit_bundle(org,first_id);item:=(bundle->'items'->0->>'id')::uuid;
 perform public.visit_command(org,first_id,gen_random_uuid(),'save',1,jsonb_build_object('itemId',item,'outcome','serviced','work','Sačuvan rad iz ponavljanja','finding','','readings','[]'::jsonb,'parts','[]'::jsonb));
 bundle:=public.visit_bundle(org,first_id);perform public.visit_command(org,first_id,gen_random_uuid(),'submit',(bundle->>'version')::integer,'{}');
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 bundle:=public.visit_bundle(org,first_id);perform public.issue_report(org,first_id,gen_random_uuid(),(bundle->>'version')::integer);
 bundle:=public.visit_bundle(org,first_id);perform set_config('hvac_test.generation_frozen',bundle::text,true);
 -- An overlapping forward window reuses the old occurrence and preserves issued work.
 queued:=public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',1,jsonb_build_object('from',today,'until',today+80));
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);
 job:=public.maintenance_claim(p);result:=public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
 if result->'result'->>'created'<>'0' or (result->'result'->>'existing')::integer<1 then raise exception 'overlapping generation duplicated';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 if public.visit_bundle(org,first_id)<>bundle then raise exception 'generator rewrote issued work';end if;
 -- Claim a queued future window, then pause: its old token cannot generate work.
 queued:=public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',1,jsonb_build_object('from',today+60,'until',today+149));
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);job:=public.maintenance_claim(p);
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',1,'{"enabled":false}');
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);
 if public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid)->>'state'<>'superseded' then raise exception 'paused lease generated';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 begin perform public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',2,jsonb_build_object('from',today,'until',today+89));raise exception 'paused request';exception when sqlstate 'PT409' then null;end;
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'edit',2,config||'{"durationMinutes":120}');
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',3,'{"enabled":true}');
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);job:=public.maintenance_claim(p);result:=public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
 if result->'result'->>'created'<>'0' then raise exception 'edit recreated old dates';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 if public.visit_bundle(org,first_id)<>bundle then raise exception 'plan edit changed issued times/authors';end if;
 queued:=public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',4,jsonb_build_object('from',today+60,'until',today+149));
 perform public.register_command(org,(config->'systems'->>0)::uuid,gen_random_uuid(),'system.archive',1,'{}');
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);job:=public.maintenance_claim(p);result:=public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
 if result->>'state'<>'failed' or result->>'error'<>'configuration_invalid' then raise exception 'invalid config did not fail closed';end if;
 perform set_config('hvac_test.failed_generation',job::text,true);
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 perform public.register_command(org,(config->'systems'->>0)::uuid,gen_random_uuid(),'system.restore',2,'{}');
 perform public.maintenance_generation_command(org,p,gen_random_uuid(),'retry',4,jsonb_build_object('jobId',job->>'jobId'));
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);job:=public.maintenance_claim(p);result:=public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
 if result->>'state'<>'ready' then raise exception 'corrected job retry failed';end if;
end $$;
-- Actual generated instants must agree with the shared gap/overlap preview.
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';config jsonb:=current_setting('hvac_test.generation_config')::jsonb;today date:=(now() at time zone 'Europe/Belgrade')::date;d date;p uuid;job jsonb;preview jsonb;month integer;visit uuid;actual timestamptz;year integer:=extract(year from today)::integer;
begin
 foreach month in array array[3,10] loop
  d:=make_date(year,month,31)-extract(dow from make_date(year,month,31))::integer;
  if d<today then d:=make_date(year+1,month,31)-extract(dow from make_date(year+1,month,31))::integer;end if;
  p:=gen_random_uuid();config:=config||jsonb_build_object('anchorDate',d,'anchorTime','02:30','intervalMonths',12);
  perform public.maintenance_plan_command(org,p,gen_random_uuid(),'create',0,config);
  preview:=public.maintenance_preview(org,config,d,1)->0;
  perform public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',1,jsonb_build_object('from',d,'until',d));
  perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);
  loop
   job:=public.maintenance_claim(p);exit when job is null;
   perform public.maintenance_execute((job->>'jobId')::uuid,(job->>'leaseToken')::uuid);
  end loop;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
  select o.visit_id into visit from public.maintenance_occurrences o where o.organization_id=org and o.plan_id=p and o.intended_date=d;
  select scheduled_at into actual from public.visits where organization_id=org and id=visit;
  if actual is distinct from (preview->>'startsAt')::timestamptz then raise exception 'generation disagrees with DST preview';end if;
  if month=3 and preview->>'resolution'<>'gap_forward' or month=10 and preview->>'resolution'<>'overlap_earlier' then raise exception 'test transition missing';end if;
 end loop;
end $$;
-- Retry/backoff exhaustion and cancellation keep the same occurrence identity.
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';p uuid:=current_setting('hvac_test.generation_plan')::uuid;j uuid;claim jsonb;v uuid;today date:=(now() at time zone 'Europe/Belgrade')::date;begin
 j:=public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',4,jsonb_build_object('from',today+300,'until',today+300));
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);claim:=public.maintenance_claim(p);
 if claim->>'jobId'<>j::text then raise exception 'failure fixture wrong job';end if;
 perform public.maintenance_fail(j,(claim->>'leaseToken')::uuid);
 perform set_config('hvac_test.retry_job',j::text,true);
end $$;
reset role;
do $$ begin
 if not exists(select 1 from hvac_private.maintenance_jobs where id=current_setting('hvac_test.retry_job')::uuid and state='queued' and available_at>clock_timestamp() and attempts=1) then raise exception 'bounded backoff missing';end if;
end $$;
update hvac_private.maintenance_jobs set state='running',attempts=3,lease_until=clock_timestamp()-interval '1 second' where id=current_setting('hvac_test.retry_job')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);
do $$ begin if public.maintenance_claim(current_setting('hvac_test.generation_plan')::uuid) is not null then raise exception 'exhausted lease claimed';end if;end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';p uuid:=current_setting('hvac_test.generation_plan')::uuid;claim jsonb;result jsonb;v uuid;today date:=(now() at time zone 'Europe/Belgrade')::date;begin
 if not exists(select 1 from jsonb_array_elements(public.maintenance_generation_state(org,p)->'jobs') x where x->>'id'=current_setting('hvac_test.retry_job') and x->>'state'='failed' and x->>'error'='lease_expired') then raise exception 'lease exhaustion not visible';end if;
 perform public.maintenance_generation_command(org,p,gen_random_uuid(),'retry',4,jsonb_build_object('jobId',current_setting('hvac_test.retry_job')));
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);claim:=public.maintenance_claim(p);result:=public.maintenance_execute((claim->>'jobId')::uuid,(claim->>'leaseToken')::uuid);
 if claim->>'attempts'<>'1' or result->>'state'<>'ready' then raise exception 'manual retry after exhaustion';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 select o.visit_id into v from public.maintenance_occurrences o join public.visits vv on vv.organization_id=o.organization_id and vv.id=o.visit_id where o.organization_id=org and o.plan_id=p and vv.status='scheduled' order by o.intended_date limit 1;
 if v is null then raise exception 'no cancellable generated fixture';end if;
 perform public.schedule_visit_command(org,v,gen_random_uuid(),'cancel',1,'{"reason":"Fiktivno otkazivanje ponavljanja"}');
 perform public.maintenance_generation_command(org,p,gen_random_uuid(),'generate',4,jsonb_build_object('from',today+61,'until',today+149));
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.generation_worker'),true);claim:=public.maintenance_claim(p);result:=public.maintenance_execute((claim->>'jobId')::uuid,(claim->>'leaseToken')::uuid);
 if result->'result'->>'created'<>'0' then raise exception 'cancelled occurrence recreated';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 if public.visit_bundle(org,v)->>'status'<>'cancelled' then raise exception 'cancelled attendance restored';end if;
end $$;
-- No field/other-tenant/anonymous client can drive the service worker or read private jobs.
do $$ declare person text;org uuid:='a1000000-0000-4000-8000-000000000001';p uuid:=current_setting('hvac_test.generation_plan')::uuid;begin
 foreach person in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
  perform set_config('request.jwt.claim.sub',person,true);
  begin perform public.maintenance_generation_state(org,p);raise exception 'generation state leak';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_generation_command(org,p,gen_random_uuid(),'retry',4,jsonb_build_object('jobId',current_setting('hvac_test.failed_generation')::jsonb->>'jobId'));raise exception 'unauthorized retry';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_claim(p);raise exception 'unauthorized worker claim';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_tick(p);raise exception 'unauthorized tick';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_execute((current_setting('hvac_test.failed_generation')::jsonb->>'jobId')::uuid,gen_random_uuid());raise exception 'unauthorized execute';exception when insufficient_privilege then null;end;
  if exists(select 1 from public.maintenance_occurrences where organization_id=org) then raise exception 'raw ledger leak';end if;
 end loop;
end $$;
set local role anon;
do $$ begin begin perform public.maintenance_tick();raise exception 'anonymous tick';exception when insufficient_privilege then null;end;end $$;
reset role;

insert into public.memberships(organization_id,user_id,role) values('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000104','coordinator') on conflict(organization_id,user_id) do update set role='coordinator',active=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ declare today date:=(now() at time zone 'Europe/Belgrade')::date;op uuid:=gen_random_uuid();begin
 perform public.maintenance_generation_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.generation_plan')::uuid,op,'generate',4,jsonb_build_object('from',today+200,'until',today+220));
 perform set_config('hvac_test.coordinator_generation',op::text,true);
 begin perform count(*) from hvac_private.maintenance_jobs;raise exception 'raw job read';exception when insufficient_privilege then null;end;
 begin perform public.maintenance_claim();raise exception 'coordinator service privilege';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
do $$ declare today date:=(now() at time zone 'Europe/Belgrade')::date;begin
 begin perform public.maintenance_generation_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.generation_plan')::uuid,current_setting('hvac_test.coordinator_generation')::uuid,'generate',4,jsonb_build_object('from',today+200,'until',today+220));raise exception 'revoked receipt replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
