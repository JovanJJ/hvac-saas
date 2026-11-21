-- Entire suite runs in the runner's rollback-only transaction.
insert into public.memberships(organization_id,user_id,role) values('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000104','technician') on conflict(organization_id,user_id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare
 org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();sys uuid:=gen_random_uuid();sibling uuid:=gen_random_uuid();v uuid:=gen_random_uuid();future uuid:=gen_random_uuid();op uuid:=gen_random_uuid();u uuid:=gen_random_uuid();replacement uuid:=gen_random_uuid();m uuid;owner_m uuid;i uuid;b jsonb;r uuid;frozen jsonb;
begin
 select membership_id into m from public.workspace_roster(org) where email='technician.a@hvac.example.invalid';
 select membership_id into owner_m from public.workspace_roster(org) where email='owner.a@hvac.example.invalid';
 perform set_config('hvac_test.m5a_system',sys::text,true);
 perform public.save_operation(org,c,'customer','{"name":"Fiktivan M5a klijent"}');
 perform public.save_operation(org,s,'site',jsonb_build_object('customerId',c,'code',s,'name','Fiktivna M5a lokacija','address','Primer 5','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,sys,'system',jsonb_build_object('siteId',s,'code','KL-01','room','Recepcija','model','Stari model'));
 perform public.save_operation(org,sibling,'system',jsonb_build_object('siteId',s,'code','KL-02','room','Druga prostorija'));
 perform public.save_operation(org,v,'visit',jsonb_build_object('siteId',s,'visitType','maintenance','start','2026-11-20T09:00','end','2026-11-20T10:00','members',jsonb_build_array(owner_m),'systems',jsonb_build_array(sys)));
 b:=public.visit_bundle(org,v);i:=(b->'items'->0->>'id')::uuid;
 perform public.visit_command(org,v,gen_random_uuid(),'save',1,jsonb_build_object('itemId',i,'outcome','serviced','work','Čišćenje','finding','Izvorni M5a nalaz','internalNote','NE-OTKRIVAJ','readings','[{"kind":"Struja","mode":"Hlađenje","status":"measured","value":0,"unit":"A","private":"NE-OTKRIVAJ"}]'::jsonb,'parts','[]'::jsonb));
 b:=public.visit_bundle(org,v);perform public.visit_command(org,v,gen_random_uuid(),'submit',(b->>'version')::integer,'{}');
 b:=public.visit_bundle(org,v);r:=public.issue_report(org,v,gen_random_uuid(),(b->>'version')::integer);
 frozen:=public.report_revision(org,r);
 perform public.save_operation(org,future,'visit',jsonb_build_object('siteId',s,'visitType','maintenance','start','2026-11-21T09:00','end','2026-11-21T10:00','members',jsonb_build_array(m),'systems',jsonb_build_array(sys)));
 perform public.register_command(org,sys,u,'unit.create',1,'{"role":"indoor","manufacturer":"Fiktivan proizvođač","model":"Stara jedinica","serial":"OLD-M5A"}');
 perform public.register_command(org,u,replacement,'unit.replace',1,'{"role":"indoor","model":"Nova jedinica","serial":"NEW-M5A"}');
 if public.register_command(org,u,replacement,'unit.replace',1,'{"role":"indoor","model":"Nova jedinica","serial":"NEW-M5A"}')<>replacement then raise exception 'replacement replay changed identity';end if;
 begin perform public.register_command(org,u,gen_random_uuid(),'unit.replace',1,'{"role":"indoor"}');raise exception 'stale replacement succeeded';exception when sqlstate 'PT409' then null;end;
 begin perform public.register_command(org,u,replacement,'unit.replace',1,'{"role":"outdoor"}');raise exception 'changed retry succeeded';exception when sqlstate 'PT409' then null;end;
 b:=public.register_detail(org,'system',sys);
 if jsonb_array_length(b->'units')<>2 or (b->'units'->0->>'system_id')::uuid<>sys then raise exception 'component history lost';end if;
 if not exists(select 1 from jsonb_array_elements(b->'units') unit where unit->>'serial'='OLD-M5A' and unit->>'archived_at' is not null) then raise exception 'original component not preserved';end if;
 perform public.register_command(org,sys,op,'system.update',1,'{"code":"KL-01","room":"Recepcija","model":"Promenjen model","manufacturer":"Fiktivno","systemType":"Split","serial":"CURRENT"}');
 begin perform public.register_command(org,sys,gen_random_uuid(),'system.update',1,'{"code":"STALE","room":"Staro"}');raise exception 'stale metadata succeeded';exception when sqlstate 'PT409' then null;end;
 perform public.register_command(org,sys,gen_random_uuid(),'system.archive',2,'{}');
 if public.report_revision(org,r)<>frozen then raise exception 'issued revision changed';end if;
 begin perform public.register_command(org,sys,gen_random_uuid(),'unit.create',3,'{"role":"indoor"}');raise exception 'component on archived system';exception when invalid_parameter_value or sqlstate 'PT409' then null;end;
 begin perform public.save_operation(org,gen_random_uuid(),'visit',jsonb_build_object('siteId',s,'visitType','repair','start','2026-11-22T09:00','end','2026-11-22T10:00','members',jsonb_build_array(m),'systems',jsonb_build_array(sys)));raise exception 'archived system scheduled';exception when invalid_parameter_value then null;end;
 -- Archive ancestors without deleting any existing visits, then restore them independently.
 perform public.register_command(org,s,gen_random_uuid(),'site.archive',1,'{}');
 begin perform public.save_operation(org,gen_random_uuid(),'system',jsonb_build_object('siteId',s,'code','DENIED','room','Test'));raise exception 'archived site accepted a system';exception when invalid_parameter_value then null;end;
 perform public.register_command(org,s,gen_random_uuid(),'site.restore',2,'{}');
 perform public.register_command(org,c,gen_random_uuid(),'customer.archive',1,'{}');
 begin perform public.save_operation(org,gen_random_uuid(),'site',jsonb_build_object('customerId',c,'code','DENIED','name','Test','address','Test','timeZone','Europe/Belgrade'));raise exception 'archived customer accepted site';exception when invalid_parameter_value then null;end;
 perform public.register_command(org,c,gen_random_uuid(),'customer.restore',2,'{}');
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 b:=public.register_detail(org,'system',sys);
 if jsonb_array_length(b->'history')<>1 or b->'history'->0->>'finding'<>'Izvorni M5a nalaz' or b::text like '%NE-OTKRIVAJ%' or jsonb_array_length(b->'children')<>0 then raise exception 'assigned history missing or leaks private fields';end if;
 if (b->'history'->0->'readings'->0->>'value')::numeric<>0 then raise exception 'zero lost';end if;
 if exists(select 1 from public.units where system_id=sys) then raise exception 'technician raw unit access';end if;
 begin perform public.register_detail(org,'system',sibling);raise exception 'unassigned sibling history';exception when insufficient_privilege then null;end;
 begin perform public.register_detail(org,'site',s);raise exception 'technician browsed site';exception when insufficient_privilege then null;end;
 begin perform public.register_command(org,sys,gen_random_uuid(),'system.restore',3,'{}');raise exception 'technician register write';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
 begin perform public.register_detail(org,'system',sys);raise exception 'unassigned technician read history';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
 begin perform public.register_detail(org,'system',sys);raise exception 'cross tenant history';exception when insufficient_privilege then null;end;
 begin perform public.register_command(org,sys,gen_random_uuid(),'system.restore',3,'{}');raise exception 'cross tenant write';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Coordinators can maintain equipment; revoked members and anonymous callers cannot.
update public.memberships set role='coordinator' where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';sys uuid:=current_setting('hvac_test.m5a_system')::uuid;begin
 perform public.register_command(org,sys,gen_random_uuid(),'system.restore',3,'{}');
 begin update public.systems set room='Denied' where id=sys;raise exception 'raw register write';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
do $$ begin begin perform public.register_detail('a1000000-0000-4000-8000-000000000001','system',current_setting('hvac_test.m5a_system')::uuid);raise exception 'revoked history read';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role anon;
do $$ begin begin perform public.register_detail('a1000000-0000-4000-8000-000000000001','system',current_setting('hvac_test.m5a_system')::uuid);raise exception 'anonymous history read';exception when insufficient_privilege then null;end;end $$;
reset role;
