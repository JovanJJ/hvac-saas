set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();sam uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();wrong uuid:=gen_random_uuid();p uuid:=gen_random_uuid();op uuid:=gen_random_uuid();v uuid:=gen_random_uuid();tech uuid;input jsonb;rows jsonb;detail jsonb;original jsonb;version integer;item uuid;before_count integer;
begin
 select count(*) into before_count from public.maintenance_plans where organization_id=org;
 select membership_id into tech from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000102';
 perform public.save_operation(org,c,'customer','{"name":"Fiktivni planovi M5e"}');
 perform public.save_operation(org,s,'site',jsonb_build_object('customerId',c,'code',s,'name','Fiktivna lokacija','address','Primer 50','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,s2,'site',jsonb_build_object('customerId',c,'code',s2,'name','Druga lokacija','address','Primer 51','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,sam,'site',jsonb_build_object('customerId',c,'code',sam,'name','Fiktivna pacifička lokacija','address','Primer 52','timeZone','Pacific/Apia'));
 perform public.save_operation(org,a,'system',jsonb_build_object('siteId',s,'code','KL-01','room','Recepcija'));
 perform public.save_operation(org,b,'system',jsonb_build_object('siteId',s,'code','KL-02','room','Kancelarija'));
 perform public.save_operation(org,wrong,'system',jsonb_build_object('siteId',s2,'code','KL-01','room','Druga lokacija'));
 perform public.save_operation(org,v,'visit',jsonb_build_object('siteId',s,'visitType','maintenance','start','2027-01-31T08:30','end','2027-01-31T09:30','members',jsonb_build_array(tech),'systems',jsonb_build_array(a)));
 input:=jsonb_build_object('siteId',s,'name','Fiktivni mesečni plan','anchorDate','2027-01-31','anchorTime','08:30','timeZone','Europe/Belgrade','intervalMonths',1,'durationMinutes',60,'systems',jsonb_build_array(a,b),'members',jsonb_build_array(tech));
 rows:=public.maintenance_preview(org,input,'2027-01-01',4);
 if rows->0->>'intendedDate'<>'2027-01-31' or rows->1->>'intendedDate'<>'2027-02-28' or rows->2->>'intendedDate'<>'2027-03-31' or rows->3->>'intendedDate'<>'2027-04-30' or rows->1->>'monthEndClamped'<>'true' then raise exception 'month-end drift: %',rows;end if;
 rows:=public.maintenance_preview(org,input||'{"anchorDate":"2028-01-31"}','2028-02-01',2);
 if rows->0->>'intendedDate'<>'2028-02-29' or rows->1->>'intendedDate'<>'2028-03-31' then raise exception 'leap anchor drift';end if;
 rows:=public.maintenance_preview(org,input||'{"anchorDate":"2026-08-31","intervalMonths":6}','2027-01-01',2);
 if rows->0->>'intendedDate'<>'2027-02-28' or rows->1->>'intendedDate'<>'2027-08-31' then raise exception 'multi-month drift';end if;
 rows:=public.maintenance_preview(org,input||'{"anchorDate":"2027-03-28","anchorTime":"02:30"}','2027-03-01',1);
 if rows->0->>'resolution'<>'gap_forward' or rows->0->>'resolvedLocal'<>'2027-03-28T03:00' or (rows->0->>'startsAt')::timestamptz<>'2027-03-28T01:00:00Z'::timestamptz or (rows->0->>'shiftMinutes')::int<>30 then raise exception 'DST gap: %',rows;end if;
 rows:=public.maintenance_preview(org,input||'{"anchorDate":"2027-10-31","anchorTime":"02:30"}','2027-10-01',1);
 if rows->0->>'resolution'<>'overlap_earlier' or (rows->0->>'startsAt')::timestamptz<>'2027-10-31T00:30:00Z'::timestamptz or (rows->0->>'endsAt')::timestamptz<>'2027-10-31T01:30:00Z'::timestamptz then raise exception 'DST overlap: %',rows;end if;
 -- An entire missing day retains the intended occurrence key.
 perform public.save_operation(org,gen_random_uuid(),'system',jsonb_build_object('siteId',sam,'code','KL-01','room','Fiktivna prostorija'));
 declare sam_system uuid;begin
  select id into sam_system from public.systems where organization_id=org and site_id=sam;
  rows:=public.maintenance_preview(org,input||jsonb_build_object('siteId',sam,'systems',jsonb_build_array(sam_system),'timeZone','Pacific/Apia','anchorDate','2011-12-30','anchorTime','00:00'),'2011-12-01',1);
  if rows->0->>'resolvedLocal'<>'2011-12-31T00:00' or rows->0->>'intendedDate'<>'2011-12-30' then raise exception 'skipped day failed';end if;
 end;
 if (select count(*) from public.maintenance_plans where organization_id=org)<>before_count then raise exception 'preview persisted a plan';end if;
 begin perform public.maintenance_preview(org,input||'{"intervalMonths":0}','2027-01-01',6);raise exception 'invalid interval';exception when invalid_parameter_value then null;end;
 begin perform public.maintenance_preview(org,input,'2027-01-01',13);raise exception 'unbounded preview';exception when invalid_parameter_value then null;end;
 begin perform public.maintenance_plan_command(org,p,op,'create',0,input||jsonb_build_object('systems',jsonb_build_array(wrong)));raise exception 'cross-site accepted';exception when invalid_parameter_value then null;end;
 begin perform public.maintenance_plan_command(org,p,op,'create',0,input||'{"members":[]}');raise exception 'empty team';exception when invalid_parameter_value then null;end;
 perform public.maintenance_plan_command(org,p,op,'create',0,input);
 perform public.maintenance_plan_command(org,p,op,'create',0,input);
 begin perform public.maintenance_plan_command(org,p,op,'create',0,input||'{"name":"Promenjen zahtev"}');raise exception 'mismatched retry';exception when sqlstate 'PT409' then null;end;
 detail:=public.maintenance_detail(org,p);
 if detail->>'version'<>'1' or jsonb_array_length(detail->'systems')<>2 then raise exception 'create state';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 item:=(public.visit_bundle(org,v)->'items'->0->>'id')::uuid;
 perform public.visit_command(org,v,gen_random_uuid(),'save',1,jsonb_build_object('itemId',item,'outcome','serviced','work','Sačuvan rad','finding','','readings','[]'::jsonb,'parts','[]'::jsonb));
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
 original:=public.visit_bundle(org,v);
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',1,'{"enabled":false}');
 if not exists(select 1 from jsonb_array_elements(public.maintenance_list(org,'paused',1)->'plans') x where x->>'id'=p::text) then raise exception 'paused filter';end if;
 begin perform public.maintenance_plan_command(org,p,gen_random_uuid(),'edit',1,input);raise exception 'stale edit';exception when sqlstate 'PT409' then null;end;
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'edit',2,input||'{"name":"Izmenjen plan","intervalMonths":3}');
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',3,'{"enabled":true}');
 if public.visit_bundle(org,v)<>original then raise exception 'plan changed prior work';end if;
 if public.maintenance_detail(org,p)->>'enabled'<>'true' then raise exception 'resume failed';end if;
 -- A broken plan can always be paused, but cannot resume until references are corrected.
 perform public.register_command(org,a,gen_random_uuid(),'system.archive',1,'{}');
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',4,'{"enabled":false}');
 begin perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',5,'{"enabled":true}');raise exception 'archived system resumed';exception when invalid_parameter_value then null;end;
 input:=input||jsonb_build_object('systems',jsonb_build_array(b));
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'edit',5,input);
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',6,'{"enabled":true}');
 perform public.register_command(org,c,gen_random_uuid(),'customer.archive',1,'{}');
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',7,'{"enabled":false}');
 begin perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',8,'{"enabled":true}');raise exception 'archived parent resumed';exception when invalid_parameter_value then null;end;
 perform public.register_command(org,c,gen_random_uuid(),'customer.restore',2,'{}');
 perform public.register_command(org,s,gen_random_uuid(),'site.update',1,jsonb_build_object('code',s,'name','Fiktivna lokacija','address','Primer 50','timeZone','Europe/London','accessNote','','contact',''));
 begin perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',8,'{"enabled":true}');raise exception 'stale zone resumed';exception when sqlstate 'PT409' then null;end;
 input:=input||'{"timeZone":"Europe/London"}';
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'edit',8,input);
 perform public.maintenance_plan_command(org,p,gen_random_uuid(),'set_enabled',9,'{"enabled":true}');
 if public.maintenance_detail(org,p)->>'timeZone'<>'Europe/London' then raise exception 'time-zone acknowledgement';end if;
 perform set_config('hvac_test.plan',p::text,true);perform set_config('hvac_test.plan_input',input::text,true);perform set_config('hvac_test.plan_operation',op::text,true);perform set_config('hvac_test.plan_site',s::text,true);perform set_config('hvac_test.plan_wrong',wrong::text,true);
end $$;
-- API reads/writes remain office-only, including direct table calls.
do $$ declare person text;org uuid:='a1000000-0000-4000-8000-000000000001';p uuid:=current_setting('hvac_test.plan')::uuid;begin
 foreach person in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
  perform set_config('request.jwt.claim.sub',person,true);
  begin perform public.maintenance_detail(org,p);raise exception 'unauthorized detail';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_list(org);raise exception 'unauthorized list';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_editor(org,current_setting('hvac_test.plan_site')::uuid);raise exception 'unauthorized options';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_preview(org,current_setting('hvac_test.plan_input')::jsonb,'2027-01-01',6);raise exception 'unauthorized preview';exception when insufficient_privilege then null;end;
  begin perform public.maintenance_plan_command(org,p,current_setting('hvac_test.plan_operation')::uuid,'create',0,current_setting('hvac_test.plan_input')::jsonb);raise exception 'unauthorized replay';exception when insufficient_privilege then null;end;
  if exists(select 1 from public.maintenance_plans where organization_id=org) then raise exception 'raw tenant plan leak';end if;
 end loop;
end $$;
reset role;
do $$ begin
 if (select count(*) from hvac_private.maintenance_events where plan_id=current_setting('hvac_test.plan')::uuid)<>10 then raise exception 'duplicate/missing plan audit';end if;
 begin insert into public.plan_systems(organization_id,site_id,plan_id,system_id) values('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.plan_site')::uuid,current_setting('hvac_test.plan')::uuid,current_setting('hvac_test.plan_wrong')::uuid);raise exception 'relationship accepts cross-site';exception when foreign_key_violation then null;end;
end $$;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
select public.maintenance_plan_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.plan')::uuid,gen_random_uuid(),'set_enabled',10,'{"enabled":false}');
do $$ begin
 begin perform public.maintenance_plan_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.plan')::uuid,gen_random_uuid(),'set_enabled',11,'{"enabled":true}');raise exception 'inactive assignee resumed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
insert into public.memberships(organization_id,user_id,role) values('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000104','coordinator') on conflict(organization_id,user_id) do update set role='coordinator',active=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
select public.maintenance_plan_command('a1000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),'create',0,current_setting('hvac_test.plan_input')::jsonb);
do $$ begin
 begin update public.maintenance_plans set enabled=false where id=current_setting('hvac_test.plan')::uuid;raise exception 'raw write allowed';exception when insufficient_privilege then null;end;
 begin perform count(*) from hvac_private.maintenance_events;raise exception 'raw event access';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
do $$ begin
 begin perform public.maintenance_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.plan')::uuid);raise exception 'revoked read';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.maintenance_list('a1000000-0000-4000-8000-000000000001');raise exception 'anonymous list';exception when insufficient_privilege then null;end;
end $$;
reset role;
