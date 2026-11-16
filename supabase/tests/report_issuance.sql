insert into public.memberships(organization_id,user_id,role) values('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000104','technician');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001'; m uuid; payload jsonb; snap jsonb; n integer;
begin
 perform public.save_operation(org,'f1000000-0000-4000-8000-000000000001','customer','{"name":"M2 test"}');
 perform public.save_operation(org,'f1000000-0000-4000-8000-000000000002','site','{"customerId":"f1000000-0000-4000-8000-000000000001","code":"M3B-TEST","name":"M2 site","address":"Primer","timeZone":"Europe/Belgrade"}');
 perform public.save_operation(org,'f1000000-0000-4000-8000-000000000003','system','{"siteId":"f1000000-0000-4000-8000-000000000002","code":"KL-01","room":"Recepcija"}');
 select membership_id into m from public.workspace_roster(org) where email='technician.a@hvac.example.invalid';
 payload:=jsonb_build_object('siteId','f1000000-0000-4000-8000-000000000002','visitType','maintenance','start','2026-11-16T09:00','end','2026-11-16T10:00','members',jsonb_build_array(m),'systems',jsonb_build_array('f1000000-0000-4000-8000-000000000003'));
 perform public.save_operation(org,'f1000000-0000-4000-8000-000000000004','visit',payload);
 perform public.save_operation(org,'f1000000-0000-4000-8000-000000000004','visit',payload);
 if (select count(*) from public.visits where id='f1000000-0000-4000-8000-000000000004')<>1 then raise exception 'duplicate visit'; end if;
 begin
 perform public.save_operation(org,'f1000000-0000-4000-8000-000000000005','visit',payload||'{"systems":["f1000000-0000-4000-8000-000000000009"]}');
 raise exception 'invalid system allowed'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('hvac_test.counter',coalesce((select sum(last_number) from hvac_private.report_counters where organization_id='a1000000-0000-4000-8000-000000000001'),0)::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001'; v uuid:='f1000000-0000-4000-8000-000000000004'; b jsonb; i uuid;
begin
 begin perform public.issue_report(org,v,gen_random_uuid(),1);raise exception 'technician issued';exception when insufficient_privilege then null;end;
 b:=public.visit_bundle(org,v);i:=(b->'items'->0->>'id')::uuid;
 begin perform public.visit_command(org,v,gen_random_uuid(),'save',1,jsonb_build_object('itemId',i,'outcome','serviced','readings','[{"kind":{"bad":true},"mode":"Hlađenje","status":"measured","unit":"A","value":0}]'::jsonb,'parts','[]'::jsonb));raise exception 'malformed draft accepted';exception when invalid_parameter_value then null;end;
 perform public.visit_command(org,v,gen_random_uuid(),'save',1,jsonb_build_object('itemId',i,'outcome','serviced','work','Čišćenje','internalNote','SECRET-INTERNAL',
 'readings','[{"kind":"Struja","mode":"Hlađenje","status":"measured","value":0,"unit":"A","private":"SECRET-READING"},{"kind":"Temperatura","mode":"Hlađenje","status":"not_measured","value":null,"unit":"°C"}]'::jsonb,
 'parts','[{"name":"Filter","quantity":0.5,"unit":"kom","cost":"SECRET-COST"}]'::jsonb));
end $$;
reset role;
insert into public.attachments(id,organization_id,visit_id,item_id,author_id,caption,visibility,expected_bytes,mime_type,state,asset_id,asset_version,format,width,height,verified_bytes)
 select x.id::uuid,i.organization_id,i.visit_id,i.id,'a1000000-0000-4000-8000-000000000102',x.caption,x.visibility,68,'image/png',x.state,'fictional-asset',1,'png',1,1,67
 from public.visit_items i cross join (values
 ('f1000000-0000-4000-8000-000000000010','Filter','customer','verified'),
 ('f1000000-0000-4000-8000-000000000011','SECRET-PHOTO','internal','verified'),
 ('f1000000-0000-4000-8000-000000000012','SECRET-REMOVED','customer','removed'),
 ('f1000000-0000-4000-8000-000000000013','SECRET-PENDING','customer','reserved')
 ) x(id,caption,visibility,state) where i.visit_id='f1000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ declare b jsonb;begin
 perform public.attachment_command('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000013','remove','{}');
 b:=public.visit_bundle('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004');
 perform public.visit_command('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004',gen_random_uuid(),'submit',(b->>'version')::int,'{}');
end $$;
reset role;
-- Simulate a legacy/in-flight invalid record: issuance must revalidate, not trust status.
update public.attachments set state='reserved' where id='f1000000-0000-4000-8000-000000000013';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare b jsonb;begin
 b:=public.report_preview('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004');
 begin perform public.issue_report('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004',gen_random_uuid(),(b->>'visitVersion')::int);raise exception 'pending photo issued';exception when invalid_parameter_value then null;end;
 if exists(select 1 from public.report_revisions where visit_id='f1000000-0000-4000-8000-000000000004') then raise exception 'partial revision';end if;
end $$;
reset role;
update public.attachments set state='removed' where id='f1000000-0000-4000-8000-000000000013';
insert into public.follow_ups(organization_id,item_id,kind,due_date) select organization_id,id,'quote','2026-12-10'::date from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ declare b jsonb;begin
 b:=public.report_preview('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004');
 begin
  perform public.issue_report('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004',gen_random_uuid(),(b->>'visitVersion')::int);
  raise exception 'missing owner issued';
 exception when invalid_parameter_value then if sqlerrm<>'missing_follow_up' then raise;end if;end;
end $$;
reset role;
delete from public.follow_ups where item_id in(select id from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004');
do $$ declare original jsonb; corrupted jsonb; version integer; item_id uuid;begin
 select id,readings into item_id,original from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004';
 select v.version into version from public.visits v where v.id='f1000000-0000-4000-8000-000000000004';
 for corrupted in select value from jsonb_array_elements(jsonb_build_array(jsonb_set(original,'{0,kind}','{"private":"SECRET"}'::jsonb),jsonb_set(original,'{0,value}','1e309'::jsonb))) loop
  update public.visit_items set readings=corrupted where id=item_id;
  begin
   perform public.issue_report('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004',gen_random_uuid(),version);
   raise exception 'invalid JSON reading issued';
  exception when invalid_parameter_value then if sqlerrm<>'invalid_reading' then raise;end if;end;
 end loop;
 update public.visit_items set readings=original where id=item_id;
end $$;
set local role authenticated;
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001'; v uuid:='f1000000-0000-4000-8000-000000000004'; b jsonb; r jsonb; id uuid; op uuid:=gen_random_uuid(); ver integer;
begin
 b:=public.report_preview(org,v);ver:=(b->>'visitVersion')::int;
 perform set_config('hvac_test.preview',(b->'data')::text,true);
 begin perform public.issue_report(org,v,gen_random_uuid(),ver-1);raise exception 'stale issue';exception when sqlstate 'PT409' then null;end;
 id:=public.issue_report(org,v,op,ver);
 if public.issue_report(org,v,op,ver)<>id or public.issue_report(org,v,gen_random_uuid(),ver)<>id then raise exception 'duplicate issue';end if;
 begin perform public.issue_report(org,v,op,ver+1);raise exception 'payload mismatch';exception when sqlstate 'PT409' then null;end;
 perform set_config('hvac_test.revision',id::text,true);
 r:=public.report_revision(org,id);
 if r->>'renderState'<>'queued' or (r->'data'->>'revision')::int<>1 or r->'data'->>'locale'<>'sr-Latn-RS' or r->'data'->>'templateVersion'<>'service-report-v1' then raise exception 'revision metadata';end if;
 if ((r->'data')-array['reference','revision','issuedAt','issuer'])<>((b->'data')-array['reference','revision','issuedAt','issuer']) then raise exception 'preview mapping differs';end if;
 if r->'data'->'items'->0->'readings'->0->>'value'<>'0' or r->'data'->'items'->0->'readings'->1->'value'<>'null'::jsonb or jsonb_array_length(r->'data'->'items'->0->'photos')<>1 or r->'data'->'items'->0->'photos'->0->>'assetVersion'<>'1' or r->'data'->'items'->0->'photos'->0->>'bytes'<>'67' then raise exception 'reading/evidence mapping';end if;
 if (r->'data')::text like '%SECRET%' then raise exception 'private fields leaked';end if;
 begin update public.report_revisions set snapshot='{}' where visit_id=v;raise exception 'raw snapshot update';exception when insufficient_privilege then null;end;
 begin select count(*) from hvac_private.render_jobs;raise exception 'job table exposed';exception when insufficient_privilege then null;end;
 begin perform public.visit_command(org,v,gen_random_uuid(),'return',(public.visit_bundle(org,v)->>'version')::int,'{"reason":"Cannot rewrite issued work"}');raise exception 'issued return';exception when invalid_parameter_value then null;end;
 begin perform public.visit_command(org,v,gen_random_uuid(),'save',2,jsonb_build_object('itemId',public.visit_bundle(org,v)->'items'->0->>'id','outcome','serviced','readings','[]'::jsonb,'parts','[]'::jsonb));raise exception 'issued save';exception when invalid_parameter_value then null;end;
 begin perform public.attachment_command(org,v,'f1000000-0000-4000-8000-000000000010','remove','{}');raise exception 'issued photo removed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
update public.customers set name='Changed customer' where id='f1000000-0000-4000-8000-000000000001';
update public.sites set name='Changed site',access_note='SECRET-ACCESS' where id='f1000000-0000-4000-8000-000000000002';
update public.systems set model='Changed model' where id='f1000000-0000-4000-8000-000000000003';
update public.organizations set display_name='Changed company' where id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001'; id uuid:=current_setting('hvac_test.revision')::uuid; r jsonb;
begin
 r:=public.report_revision(org,id);
 if r->'data'->>'company'='Changed company' or r->'data'->>'customer'='Changed customer' or r->'data'->>'site'='Changed site' or r->'data'->'items'->0->>'model'='Changed model' then raise exception 'snapshot changed with register';end if;
 if public.report_preview(org,'f1000000-0000-4000-8000-000000000004')->'data'<>r->'data' then raise exception 'issued preview reads live';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 begin perform public.report_revision(org,id);raise exception 'assigned tech read';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.report_revisions rr where rr.id=current_setting('hvac_test.revision')::uuid) then raise exception 'technician raw read';end if;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
 begin perform public.report_revision(org,id);raise exception 'unassigned tech read';exception when insufficient_privilege then null;end;
 begin perform public.issue_report(org,'f1000000-0000-4000-8000-000000000004',gen_random_uuid(),1);raise exception 'unassigned issue';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
 begin perform public.report_revision(org,id);raise exception 'other org read';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';begin
 if (select count(*) from public.report_revisions where visit_id='f1000000-0000-4000-8000-000000000004')<>1 or (select count(*) from hvac_private.render_jobs where revision_id=current_setting('hvac_test.revision')::uuid)<>1 then raise exception 'duplicate revision/job';end if;
 if (select sum(last_number) from hvac_private.report_counters where organization_id=org)<>current_setting('hvac_test.counter')::bigint+1 then raise exception 'counter did not advance once';end if;
 if has_table_privilege('hvac_identity_executor','public.report_revisions','UPDATE') or has_table_privilege('hvac_identity_executor','public.report_revisions','DELETE') then raise exception 'mutable revision executor';end if;
end $$;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ begin begin perform public.issue_report('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004',gen_random_uuid(),1);raise exception 'revoked issue';exception when insufficient_privilege then null;end;end $$;
reset role;
-- Coordinators can issue; numbering must grow beyond the four-digit minimum.
update public.memberships set role='coordinator' where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
update hvac_private.report_counters set last_number=9999 where organization_id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001'; v uuid:='f1000000-0000-4000-8000-000000000005'; m uuid; b jsonb; id uuid;
begin
 select membership_id into m from public.workspace_roster(org) where email='technician.a@hvac.example.invalid';
 perform public.save_operation(org,v,'visit',jsonb_build_object('siteId','f1000000-0000-4000-8000-000000000002','visitType','maintenance','start','2026-11-17T09:00','end','2026-11-17T10:00','members',jsonb_build_array(m),'systems',jsonb_build_array('f1000000-0000-4000-8000-000000000003')));
 b:=public.visit_bundle(org,v);
 perform public.visit_command(org,v,gen_random_uuid(),'save',1,jsonb_build_object('itemId',b->'items'->0->>'id','outcome','serviced','work','Čišćenje','readings','[]'::jsonb,'parts','[]'::jsonb));
 b:=public.visit_bundle(org,v);perform public.visit_command(org,v,gen_random_uuid(),'submit',(b->>'version')::int,'{}');
 b:=public.visit_bundle(org,v);id:=public.issue_report(org,v,gen_random_uuid(),(b->>'version')::int);
 if public.report_revision(org,id)->'data'->>'reference' not like 'RN-%-10000' then raise exception 'report counter truncated';end if;
end $$;
reset role;
