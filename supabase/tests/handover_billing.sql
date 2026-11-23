-- All fictional setup and commands run inside a rollback transaction.
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();v uuid:=gen_random_uuid();r uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();link uuid:=gen_random_uuid();begin
 insert into public.customers(id,organization_id,name) values(c,org,'Fictional handover customer');
 insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values(s,org,c,s::text,'Fictional handover site','Example','Europe/Belgrade');
 insert into public.visits(id,organization_id,site_id,visit_type,scheduled_at,ends_at,status,created_by) values(v,org,s,'maintenance',now(),now()+interval '1 hour','issued','a1000000-0000-4000-8000-000000000101');
 insert into public.report_revisions(id,organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by) values
 (r,org,v,1,'SQL-'||v,'{}','sr-Latn-RS','test',now(),'a1000000-0000-4000-8000-000000000101'),
 (r2,org,v,2,'SQL-'||v,'{}','sr-Latn-RS','test',now(),'a1000000-0000-4000-8000-000000000101');
 insert into hvac_private.report_links(id,organization_id,revision_id,token_hash,created_by,operation_id,ttl_days,expires_at) values(link,org,r,encode(extensions.digest(v::text,'sha256'),'hex'),'a1000000-0000-4000-8000-000000000101',gen_random_uuid(),7,now()+interval '7 days');
 perform set_config('hvac_test.handover_visit',v::text,true);perform set_config('hvac_test.handover_site',s::text,true);perform set_config('hvac_test.handover_revision',r::text,true);perform set_config('hvac_test.handover_revision2',r2::text,true);perform set_config('hvac_test.handover_link',link::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:=current_setting('hvac_test.handover_visit')::uuid;s text:=current_setting('hvac_test.handover_site');op uuid:=gen_random_uuid();d jsonb;r jsonb;a jsonb;b jsonb;begin
 r:=public.handover_queue(org,jsonb_build_object('site',s));
 if r->>'total'<>'2' then raise exception 'missing-revision queue';end if;
 if public.handover_queue(org,jsonb_build_object('site',s,'revision','latest'))->>'total'<>'1' then raise exception 'latest revision filter';end if;
 d:=public.billing_review_detail(org,v);
 if d->'billing'->>'version'<>'0' or d->'billing'->>'ready'<>'false' then raise exception 'default billing state';end if;
 a:=public.billing_review_command(org,v,op,0,(d->>'visitVersion')::int,true,'Fictional ready review');
 b:=public.billing_review_command(org,v,op,0,(d->>'visitVersion')::int,true,'Fictional ready review');
 if a<>b or a->>'version'<>'1' or a->>'ready'<>'true' then raise exception 'billing retry duplicated';end if;
 begin perform public.billing_review_command(org,v,op,0,(d->>'visitVersion')::int,false,'Fictional ready review');raise exception 'changed replay';exception when sqlstate 'PT409' then null;end;
 begin perform public.billing_review_command(org,v,gen_random_uuid(),0,(d->>'visitVersion')::int,false,'Stale command');raise exception 'stale billing version';exception when sqlstate 'PT409' then null;end;
 begin perform public.billing_review_command(org,v,gen_random_uuid(),1,(d->>'visitVersion')::int+1,false,'Stale visit');raise exception 'stale visit version';exception when sqlstate 'PT409' then null;end;
 begin perform public.billing_review_command(org,v,gen_random_uuid(),1,(d->>'visitVersion')::int,false,' ');raise exception 'missing note';exception when invalid_parameter_value then null;end;
 if public.handover_queue(org,jsonb_build_object('site',s,'queue','billing','state','ready'))->>'total'<>'1' or public.handover_queue(org,jsonb_build_object('site',s))->>'total'<>'2' then raise exception 'readiness changed receipts';end if;
 perform set_config('hvac_test.handover_operation',op::text,true);perform set_config('hvac_test.handover_ack',a::text,true);
end $$;
reset role;
-- Simulate the existing guest receipt's persisted result; no rendering/network required in SQL suite.
insert into hvac_private.report_receipts(organization_id,link_id,revision_id,recipient_name,recipient_role) values('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_link')::uuid,current_setting('hvac_test.handover_revision')::uuid,'Fictional recipient','Manager');
update hvac_private.report_links set revoked_at=clock_timestamp(),revoked_by='a1000000-0000-4000-8000-000000000101' where id=current_setting('hvac_test.handover_link')::uuid;
set local role authenticated;
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:=current_setting('hvac_test.handover_visit')::uuid;s text:=current_setting('hvac_test.handover_site');d jsonb;r jsonb;begin
 r:=public.handover_queue(org,jsonb_build_object('site',s));
 if r->>'total'<>'1' or r->'rows'->0->>'id'<>current_setting('hvac_test.handover_revision2') then raise exception 'receipt affected wrong revision';end if;
 if public.handover_queue(org,jsonb_build_object('site',s,'state','received'))->>'total'<>'1' then raise exception 'revocation erased historical receipt';end if;
 d:=public.billing_review_detail(org,v);
 if d->'billing'<>current_setting('hvac_test.handover_ack')::jsonb then raise exception 'receipt changed billing';end if;
 perform public.billing_review_command(org,v,gen_random_uuid(),1,(d->>'visitVersion')::int,false,'Fictional readiness cleared');
 d:=public.billing_review_detail(org,v);
 if d->'billing'->>'ready'<>'false' or jsonb_array_length(d->'history')<>2 then raise exception 'clear/audit missing';end if;
 if public.handover_queue(org,jsonb_build_object('site',s,'page',2))->>'total'<>'1' or jsonb_array_length(public.handover_queue(org,jsonb_build_object('site',s,'page',2))->'rows')<>0 then raise exception 'pagination changed count';end if;
 begin perform public.handover_queue(org,'{"queue":"billing","state":"missing"}');raise exception 'bad state accepted';exception when invalid_parameter_value then null;end;
 begin perform public.handover_queue(org,'{"from":"2026-12-31","until":"2026-01-01"}');raise exception 'reversed dates';exception when invalid_parameter_value then null;end;
 begin perform public.handover_queue('a1000000-0000-4000-8000-000000000002');raise exception 'cross tenant queue';exception when insufficient_privilege then null;end;
 begin perform public.billing_review_detail('a1000000-0000-4000-8000-000000000002',v);raise exception 'cross tenant detail';exception when insufficient_privilege then null;end;
end $$;
-- A later visit correction is visible as recheck, without silently clearing the audited flag.
reset role;
update public.visits set version=version+1 where id=current_setting('hvac_test.handover_visit')::uuid;
update hvac_private.visit_billing_review set ready=true where visit_id=current_setting('hvac_test.handover_visit')::uuid;
set local role authenticated;
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:=current_setting('hvac_test.handover_visit')::uuid;d jsonb;begin
 d:=public.billing_review_detail(org,v);
 if d->'billing'->>'stale'<>'true' then raise exception 'changed work silently ready';end if;
 if public.handover_queue(org,jsonb_build_object('site',current_setting('hvac_test.handover_site'),'queue','billing','state','ready'))->>'total'<>'0' then raise exception 'stale readiness in ready queue';end if;
 if public.handover_queue(org,jsonb_build_object('site',current_setting('hvac_test.handover_site'),'queue','billing'))->>'total'<>'1' then raise exception 'stale readiness hidden from pending';end if;
 if public.billing_review_command(org,v,current_setting('hvac_test.handover_operation')::uuid,0,1,true,'Fictional ready review')<>current_setting('hvac_test.handover_ack')::jsonb then raise exception 'old acknowledgement replay changed';end if;
end $$;
reset role;
update public.visits set status='in_progress' where id=current_setting('hvac_test.handover_visit')::uuid;
set local role authenticated;
do $$ declare d jsonb;begin
 d:=public.billing_review_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid);
 begin perform public.billing_review_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid,gen_random_uuid(),2,(d->>'visitVersion')::int,false,'Returned draft');raise exception 'draft accepted';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin perform public.handover_queue('a1000000-0000-4000-8000-000000000001');raise exception 'technician queue read';exception when insufficient_privilege then null;end;
 begin perform public.billing_review_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid);raise exception 'technician detail';exception when insufficient_privilege then null;end;
 begin perform public.billing_review_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid,gen_random_uuid(),2,2,true,'Denied');raise exception 'technician write';exception when insufficient_privilege then null;end;
 begin perform hvac_private.handover_rows('a1000000-0000-4000-8000-000000000001','billing');raise exception 'private projection exposed';exception when insufficient_privilege then null;end;
 begin perform 1 from hvac_private.billing_review_events;raise exception 'private audit exposed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ begin
 begin perform public.handover_queue('a1000000-0000-4000-8000-000000000001');raise exception 'unassigned queue';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.handover_queue('a1000000-0000-4000-8000-000000000001');raise exception 'anonymous read';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Coordinator may review; raw writes and replay after membership withdrawal remain denied.
update public.visits set status='issued' where id=current_setting('hvac_test.handover_visit')::uuid;
update public.memberships set role='coordinator' where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare d jsonb;begin
 d:=public.billing_review_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid);
 perform public.billing_review_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid,gen_random_uuid(),(d->'billing'->>'version')::int,(d->>'visitVersion')::int,false,'Fictional coordinator review');
 begin update hvac_private.visit_billing_review set ready=true;raise exception 'raw update allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
do $$ begin
 begin perform public.billing_review_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid,current_setting('hvac_test.handover_operation')::uuid,0,1,true,'Fictional ready review');raise exception 'revoked replay';exception when insufficient_privilege then null;end;
 begin perform public.handover_queue('a1000000-0000-4000-8000-000000000001');raise exception 'revoked queue';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
do $$ begin
 begin perform public.billing_review_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.handover_visit')::uuid,gen_random_uuid(),3,2,true,'Other tenant');raise exception 'other tenant write';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
-- More than thirty revisions exercise stable exact-count pagination and date/customer filters.
do $$ declare n integer;org uuid:='a1000000-0000-4000-8000-000000000001';v uuid;site uuid:=current_setting('hvac_test.handover_site')::uuid;begin
 for n in 1..31 loop
  v:=gen_random_uuid();
  insert into public.visits(id,organization_id,site_id,visit_type,scheduled_at,ends_at,status,created_by) values(v,org,site,'maintenance',now(),now()+interval '1 hour','issued','a1000000-0000-4000-8000-000000000101');
  insert into public.report_revisions(organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by) values(org,v,1,'PAGE-'||v,'{}','sr-Latn-RS','test',now(),'a1000000-0000-4000-8000-000000000101');
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';s text:=current_setting('hvac_test.handover_site');r jsonb;r2 jsonb;customer uuid;begin
 r:=public.handover_queue(org,jsonb_build_object('site',s));r2:=public.handover_queue(org,jsonb_build_object('site',s,'page',2));
 if r->>'total'<>'32' or jsonb_array_length(r->'rows')<>30 or jsonb_array_length(r2->'rows')<>2 then raise exception 'queue pagination bounds';end if;
 if exists(select 1 from jsonb_array_elements(r->'rows') a join jsonb_array_elements(r2->'rows') b on a->>'id'=b->>'id') then raise exception 'page overlap';end if;
 select customer_id into customer from public.sites where id=s::uuid;
 if public.handover_queue(org,jsonb_build_object('site',s,'customer',customer,'from',(now() at time zone 'Europe/Belgrade')::date,'until',(now() at time zone 'Europe/Belgrade')::date))->>'total'<>'32' then raise exception 'customer/local date filter';end if;
 if public.handover_queue(org,jsonb_build_object('site',s,'customer',gen_random_uuid()))->>'total'<>'0' then raise exception 'unrelated customer filter';end if;
 if has_table_privilege('hvac_identity_executor','hvac_private.billing_review_events','UPDATE') or has_table_privilege('authenticated','hvac_private.visit_billing_review','UPDATE') then raise exception 'runtime audit privileges';end if;
end $$;
reset role;
