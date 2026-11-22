-- Fictional isolated records; caller runs this suite inside a rollback transaction.
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';s uuid:=gen_random_uuid();c uuid:=gen_random_uuid();sys uuid:=gen_random_uuid();v uuid:=gen_random_uuid();item uuid:=gen_random_uuid();f uuid:=gen_random_uuid();p uuid:=gen_random_uuid();tech uuid;today date:=(now() at time zone 'Europe/Belgrade')::date;
begin
 select id into tech from public.memberships where organization_id=org and user_id='a1000000-0000-4000-8000-000000000102';
 insert into public.customers(id,organization_id,name) values(c,org,'Fictional queue customer');
 insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values(s,org,c,s::text,'Fictional queue site','Example','Europe/Belgrade');
 insert into public.systems(id,organization_id,site_id,code,room) values(sys,org,s,'QUEUE-01','Example');
 insert into public.visits(id,organization_id,site_id,visit_type,scheduled_at,ends_at,status,created_by) values(v,org,s,'maintenance',now()-interval '2 days',now()-interval '2 days'+interval '1 hour','submitted','a1000000-0000-4000-8000-000000000101');
 insert into public.visit_items(id,organization_id,site_id,visit_id,system_id,outcome,finding,no_access_reason) values(item,org,s,v,sys,'no_access','Fictional source finding','Locked door');
 insert into public.follow_ups(id,organization_id,item_id,kind,owner_id,owner_label,due_date,customer_action) values(f,org,item,'revisit',tech,'Fictional technician',today-1,'Please unlock the room');
 insert into public.maintenance_plans(id,organization_id,site_id,name,anchor_date,anchor_time,time_zone,interval_months,duration_minutes,created_by,updated_by) values(p,org,s,'Fictional queue plan',today,'08:00','Europe/Belgrade',6,60,'a1000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000101');
 insert into public.maintenance_plan_assignees values(org,p,tech);
 insert into public.plan_systems values(org,s,p,sys);
 perform set_config('hvac_test.queue_site',s::text,true);perform set_config('hvac_test.queue_plan',p::text,true);perform set_config('hvac_test.queue_action',f::text,true);perform set_config('hvac_test.queue_tech',tech::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';s text:=current_setting('hvac_test.queue_site');f uuid:=current_setting('hvac_test.queue_action')::uuid;p uuid:=current_setting('hvac_test.queue_plan')::uuid;tech uuid:=current_setting('hvac_test.queue_tech')::uuid;r jsonb;v uuid;payload jsonb;
begin
 r:=public.office_work_queue(org,jsonb_build_object('site',s,'due','overdue','dependency','required','owner',tech));
 if r->>'total'<>'1' or r->'rows'->0->>'overdue'<>'true' or r->'rows'->0->>'bookingState'<>'proposed' then raise exception 'overdue dependency queue failed: %',r;end if;
 if public.office_work_queue(org,jsonb_build_object('site',s,'due','upcoming'))->>'total'<>'0' then raise exception 'deadline filter failed';end if;
 if public.office_work_queue(org,jsonb_build_object('site',s,'dependency','none'))->>'total'<>'0' then raise exception 'dependency filter failed';end if;
 if public.office_work_queue(org,jsonb_build_object('site',s,'owner','a1000000-0000-4000-8000-000000000001'))->>'total'<>'0' then raise exception 'owner filter failed';end if;
 payload:=jsonb_build_object('start',((now() at time zone 'Europe/Belgrade')::date+1)::text||'T08:00','end',((now() at time zone 'Europe/Belgrade')::date+1)::text||'T09:00','members',jsonb_build_array(tech));
 v:=public.follow_up_command(org,f,gen_random_uuid(),1,'book',payload);
 if public.follow_up_command(org,f,gen_random_uuid(),1,'book',payload)<>v then raise exception 'duplicated return';end if;
 r:=public.office_work_queue(org,jsonb_build_object('site',s,'booking','booked','due','overdue'));
 if r->>'total'<>'1' or r->'rows'->0->>'state'<>'open' or (r->'rows'->0->>'dueDate')::date<>(now() at time zone 'Europe/Belgrade')::date-1 or r->'rows'->0->>'returnVisitId'<>v::text then raise exception 'booking changed action deadline/state';end if;
 r:=public.office_work_queue(org,jsonb_build_object('queue','maintenance','site',s));
 if r->>'total'<>'1' or r->'rows'->0->>'planId'<>p::text or r->'rows'->0->>'state'<>'proposed' then raise exception 'maintenance proposal missing: %',r;end if;
 if public.office_work_queue(org,jsonb_build_object('queue','maintenance','site',s,'booking','booked'))->>'total'<>'0' then raise exception 'proposal treated as booked';end if;
 if public.office_work_queue(org,jsonb_build_object('site',s,'page',2))->>'total'<>'1' or jsonb_array_length(public.office_work_queue(org,jsonb_build_object('site',s,'page',2))->'rows')<>0 then raise exception 'pagination failed';end if;
 begin perform public.office_work_queue(org,'{"state":"bad"}');raise exception 'invalid filter accepted';exception when invalid_parameter_value then null;end;
 begin perform public.office_work_queue(org,'{"queue":"maintenance","state":"quote"}');raise exception 'incompatible filter';exception when invalid_parameter_value then null;end;
 begin perform public.office_work_queue('a1000000-0000-4000-8000-000000000002');raise exception 'other org read';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('hvac_test.queue_worker',(select user_id::text from hvac_private.pdf_worker_identity),true);
set local role authenticated;
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';p uuid:=current_setting('hvac_test.queue_plan')::uuid;j jsonb;r jsonb;v uuid;b jsonb;begin
 perform set_config('request.jwt.claim.sub',current_setting('hvac_test.queue_worker'),true);
 perform public.maintenance_tick(p);j:=public.maintenance_claim(p);
 perform public.maintenance_execute((j->>'jobId')::uuid,(j->>'leaseToken')::uuid);
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 r:=public.office_work_queue(org,jsonb_build_object('queue','maintenance','site',current_setting('hvac_test.queue_site'),'due','today'));
 if r->>'total'<>'1' or r->'rows'->0->>'state'<>'scheduled' then raise exception 'generated maintenance due filter';end if;
 v:=(r->'rows'->0->>'visitId')::uuid;b:=public.visit_bundle(org,v);
 perform public.schedule_visit_command(org,v,gen_random_uuid(),'cancel',(b->>'version')::int,'{"reason":"Fictional cancellation"}');
 r:=public.office_work_queue(org,jsonb_build_object('queue','maintenance','site',current_setting('hvac_test.queue_site'),'state','cancelled'));
 if r->>'total'<>'1' then raise exception 'cancelled occurrence missing';end if;
 r:=public.office_work_queue(org,jsonb_build_object('queue','maintenance','site',current_setting('hvac_test.queue_site')));
 if r->>'total'<>'1' or r->'rows'->0->>'state'<>'proposed' then raise exception 'cancelled date reproposed';end if;
end $$;
reset role;
update public.maintenance_plans set enabled=false where id=current_setting('hvac_test.queue_plan')::uuid;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('queue','maintenance','site',current_setting('hvac_test.queue_site'),'state','paused'));
 if r->>'total'<>'1' then raise exception 'paused filter failed';end if;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin perform public.office_work_queue('a1000000-0000-4000-8000-000000000001');raise exception 'technician queue read';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ begin
 begin perform public.office_work_queue('a1000000-0000-4000-8000-000000000001');raise exception 'unassigned queue read';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.office_work_queue('a1000000-0000-4000-8000-000000000001');raise exception 'anonymous queue read';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Exact counts and pagination remain bounded after the first page.
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';s uuid:=current_setting('hvac_test.queue_site')::uuid;v uuid;sys uuid;i uuid;n integer;begin
 select id into v from public.visits where organization_id=org and site_id=s and status='submitted';
 for n in 1..35 loop
  sys:=gen_random_uuid();i:=gen_random_uuid();
  insert into public.systems(id,organization_id,site_id,code,room) values(sys,org,s,'PAGE-'||n,'Example');
  insert into public.visit_items(id,organization_id,site_id,visit_id,system_id,outcome,finding) values(i,org,s,v,sys,'repair_needed','Fictional pagination finding');
  insert into public.follow_ups(organization_id,item_id,kind,due_date) values(org,i,'quote',(now() at time zone 'Europe/Belgrade')::date-1);
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare r jsonb;r2 jsonb;begin
 r:=public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('site',current_setting('hvac_test.queue_site')));
 r2:=public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('site',current_setting('hvac_test.queue_site'),'page',2));
 if r->>'total'<>'36' or jsonb_array_length(r->'rows')<>30 or jsonb_array_length(r2->'rows')<>6 then raise exception 'bounded page count failed';end if;
 if exists(select 1 from jsonb_array_elements(r->'rows') a join jsonb_array_elements(r2->'rows') b on a->>'id'=b->>'id') then raise exception 'page overlap';end if;
 begin perform hvac_private.office_work_rows('a1000000-0000-4000-8000-000000000001','actions');raise exception 'raw helper exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- A missing deadline has a separate category and is never silently overdue.
update public.follow_ups set due_date=null where id=current_setting('hvac_test.queue_action')::uuid;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('site',current_setting('hvac_test.queue_site'),'due','missing'));
 if r->>'total'<>'1' then raise exception 'missing deadline category failed';end if;
 r:=public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('site',current_setting('hvac_test.queue_site'),'due','overdue'));
 if r->>'total'<>'35' then raise exception 'missing deadline counted overdue';end if;
end $$;
reset role;
-- Coordinator reads are allowed; inactive membership and other organization are denied.
update public.memberships set role='coordinator' where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('site',current_setting('hvac_test.queue_site')))->>'total';
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
do $$ begin
 begin perform public.office_work_queue('a1000000-0000-4000-8000-000000000001');raise exception 'revoked membership read';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
do $$ begin
 begin perform public.office_work_queue('a1000000-0000-4000-8000-000000000001');raise exception 'other organization owner read';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Due classification follows each site's local date, not the SQL session zone.
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
update public.sites set time_zone='Pacific/Kiritimati' where id=current_setting('hvac_test.queue_site')::uuid;
update public.follow_ups set due_date=(now() at time zone 'Pacific/Kiritimati')::date where id=current_setting('hvac_test.queue_action')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare r jsonb;begin
 r:=public.office_work_queue('a1000000-0000-4000-8000-000000000001',jsonb_build_object('site',current_setting('hvac_test.queue_site'),'due','today'));
 if r->>'total'<>'1' or r->'rows'->0->>'overdue'<>'false' then raise exception 'site-local due classification failed';end if;
end $$;
reset role;
