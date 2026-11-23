-- Fictional, rollback-only export acceptance.
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();sys uuid:=gen_random_uuid();sys2 uuid:=gen_random_uuid();v uuid:=gen_random_uuid();v2 uuid:=gen_random_uuid();u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();begin
 insert into public.customers(id,organization_id,name,contact) values(c,org,'Fiktivni izvoz čćžšđ','064001234');
 insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values(s,org,c,s::text,'Fiktivna lokacija A','Primer 1','Europe/Belgrade'),(s2,org,c,s2::text,'Fiktivna lokacija B','Primer 2','Europe/Belgrade');
 insert into public.systems(id,organization_id,site_id,code,room,serial) values(sys,org,s,'ISTA-OZNAKA','Arhiva','000123'),(sys2,org,s2,'ISTA-OZNAKA','Recepcija','000456');
 insert into public.units(id,organization_id,system_id,role,serial,updated_by) values(u,org,sys,'indoor','00100','a1000000-0000-4000-8000-000000000101');
 insert into public.units(id,organization_id,system_id,role,serial,updated_by,replaces_id) values(u2,org,sys,'indoor','00200','a1000000-0000-4000-8000-000000000101',u);
 update public.units set archived_at=now() where id=u;
 insert into public.visits(id,organization_id,site_id,visit_type,scheduled_at,ends_at,created_by) values(v,org,s,'maintenance',now(),now()+interval '1 hour','a1000000-0000-4000-8000-000000000101'),(v2,org,s2,'maintenance',now(),now()+interval '1 hour','a1000000-0000-4000-8000-000000000101');
 insert into public.visit_items(organization_id,site_id,visit_id,system_id,outcome,work,entered_by,entered_at) values(org,s,v,sys,'serviced','Fiktivan rad čćžšđ','a1000000-0000-4000-8000-000000000102',now()),(org,s2,v2,sys2,'pending','','a1000000-0000-4000-8000-000000000102',now());
 update public.visits set status='cancelled',cancelled_at=now(),cancelled_by='a1000000-0000-4000-8000-000000000101',cancellation_reason='Fiktivno otkazivanje' where id=v;
 update public.systems set archived_at=now() where id=sys;
 update public.sites set archived_at=now() where id=s;
 perform set_config('hvac_test.export_site',s::text,true);perform set_config('hvac_test.export_site2',s2::text,true);perform set_config('hvac_test.export_system',sys::text,true);perform set_config('hvac_test.export_visit',v::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';s uuid:=current_setting('hvac_test.export_site')::uuid;result jsonb;preview jsonb;row jsonb;begin
 preview:=public.owner_export(org,'{}',s);
 if preview->'counts'->>'systems'<>'1' or preview->'counts'->>'units'<>'2' or preview->'counts'->>'visits'<>'1' or preview->>'includesArchived'<>'true' or preview->'datasets'<>'{}' then raise exception 'scoped catalog counts';end if;
 result:=public.owner_export(org,array['customers','sites','systems','units','visits','visit_items'],s);
 if result->>'scope'<>'site' or result->>'siteId'<>s::text or jsonb_array_length(result->'datasets'->'sites')<>1 or result ? 'sites' then raise exception 'scope or download catalog leak';end if;
 if result->'datasets'->'systems'->0->>'serial'<>'000123' or result->'datasets'->'systems'->0->>'system_id'<>current_setting('hvac_test.export_system') or result->'datasets'->'systems'->0->>'archived_at' is null then raise exception 'identity/text/archive changed';end if;
 if result->'datasets'->'visits'->0->>'status'<>'cancelled' or result->'datasets'->'visit_items'->0->>'visit_id'<>current_setting('hvac_test.export_visit') or result->'datasets'->'visit_items'->0->>'system_id'<>current_setting('hvac_test.export_system') then raise exception 'visit/system join lost';end if;
 if result->'datasets'->'visit_items'->0->>'entered_by'<>'a1000000-0000-4000-8000-000000000102' then raise exception 'finding author lost';end if;
 if not exists(select 1 from jsonb_array_elements(result->'datasets'->'units') x where x->>'replaces_id' is not null) then raise exception 'component replacement lost';end if;
 result:=public.owner_export(org,array['systems','visits','visit_items']);
 if (select count(*) from jsonb_array_elements(result->'datasets'->'systems') x where x->>'code'='ISTA-OZNAKA')<>2 then raise exception 'same labels collapsed';end if;
 begin perform public.owner_export(org,array['bad']);raise exception 'bad dataset';exception when invalid_parameter_value then null;end;
 begin perform public.owner_export(org,array['sites','sites']);raise exception 'duplicate dataset';exception when invalid_parameter_value then null;end;
 begin perform public.owner_export(org,array['sites'],gen_random_uuid());raise exception 'foreign/missing site';exception when insufficient_privilege then null;end;
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000002',array['sites']);raise exception 'other organization';exception when insufficient_privilege then null;end;
 begin perform hvac_private.export_rows(org,'sites',s);raise exception 'private helper exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Empty datasets still have explicit zero counts. Export limits reject the entire request.
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';s uuid:=gen_random_uuid();c uuid;begin
 select customer_id into c from public.sites where id=current_setting('hvac_test.export_site2')::uuid;
 insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values(s,org,c,s::text,'Fiktivno prazna lokacija','Primer 3','Europe/Belgrade');
 perform set_config('hvac_test.export_empty',s::text,true);
 insert into public.systems(id,organization_id,site_id,code,room) select gen_random_uuid(),org,current_setting('hvac_test.export_site2')::uuid,'LIMIT-'||n,'Example' from generate_series(1,10000) n;
end $$;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.owner_export('a1000000-0000-4000-8000-000000000001',array['systems','visits'],current_setting('hvac_test.export_empty')::uuid);
 if r->'datasets'->'systems'<>'[]' or r->'counts'->>'visits'<>'0' then raise exception 'empty result';end if;
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001',array['sites','systems'],current_setting('hvac_test.export_site2')::uuid);raise exception 'row limit truncated';exception when program_limit_exceeded then null;end;
end $$;
reset role;
update public.sites set access_note=repeat('x',16777217) where id=current_setting('hvac_test.export_empty')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001',array['sites'],current_setting('hvac_test.export_empty')::uuid);raise exception 'byte limit ignored';exception when program_limit_exceeded then null;end;
end $$;
reset role;
-- Coordinator can manage operations, but cannot use either export catalog or download RPC.
update public.memberships set role='coordinator' where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001');raise exception 'coordinator catalog';exception when insufficient_privilege then null;end;
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001',array['customers']);raise exception 'coordinator export';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set role='owner',active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001');raise exception 'withdrawn owner';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001',array['visits']);raise exception 'technician';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001');raise exception 'unassigned';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001');raise exception 'other owner';exception when insufficient_privilege then null;end;
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000002',array['sites'],current_setting('hvac_test.export_site')::uuid);raise exception 'foreign site in own organization';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.owner_export('a1000000-0000-4000-8000-000000000001');raise exception 'anonymous';exception when insufficient_privilege then null;end;
end $$;
reset role;
