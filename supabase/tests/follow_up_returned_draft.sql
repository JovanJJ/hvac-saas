-- After visit_handover.sql: complete a quote before issuance, then request a field correction.
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:='d1000000-0000-4000-8000-000000000004';b jsonb;payload jsonb;a jsonb;owner uuid;begin
 b:=public.visit_bundle(org,v);
 payload:=b->'items'->0||jsonb_build_object('itemId',b->'items'->0->'id','outcome','repair_needed','finding','Deflektor','work','Pregled','readings','[]'::jsonb,'parts','[]'::jsonb,'noAccessReason','');
 payload:=jsonb_set(payload,'{followUp}',(payload->'followUp')-array['id','version','state','managedAt','ownerLabel','completedAt']);
 perform public.visit_command(org,v,gen_random_uuid(),'save',(b->'items'->0->>'version')::int,payload);
 b:=public.visit_bundle(org,v);
 perform public.visit_command(org,v,gen_random_uuid(),'submit',(b->>'version')::int,'{}');
 select value into a from jsonb_array_elements(public.follow_up_list(org)) where value->>'visitId'=v::text;
 select membership_id into owner from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000104';
 perform public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),(a->>'version')::int,'assign',jsonb_build_object('ownerId',owner,'dueDate','2026-12-20'));
 perform public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),(a->>'version')::int+1,'complete','{"note":"Ponuda pripremljena"}');
 b:=public.visit_bundle(org,v);
 perform public.visit_command(org,v,gen_random_uuid(),'return',(b->>'version')::int,'{"reason":"Dopuniti opis"}');
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:='d1000000-0000-4000-8000-000000000004';b jsonb;payload jsonb;begin
 b:=public.visit_bundle(org,v);
 if b->'items'->0->'followUp'->>'managedAt' is null then raise exception 'managed state unavailable';end if;
 payload:=b->'items'->0||jsonb_build_object('itemId',b->'items'->0->'id','finding','Dopunjen deflektor');
 payload:=jsonb_set(payload,'{followUp}',(payload->'followUp')-array['id','version','state','managedAt','ownerLabel','completedAt']);
 begin perform public.visit_command(org,v,gen_random_uuid(),'save',(b->'items'->0->>'version')::int,payload||'{"followUp":null}');raise exception 'field erased managed action';exception when sqlstate 'PT409' then null;end;
 perform public.visit_command(org,v,gen_random_uuid(),'save',(b->'items'->0->>'version')::int,payload);
 b:=public.visit_bundle(org,v);
 perform public.visit_command(org,v,gen_random_uuid(),'submit',(b->>'version')::int,'{}');
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:='d1000000-0000-4000-8000-000000000004';b jsonb;r uuid;begin
 b:=public.visit_bundle(org,v);r:=public.issue_report(org,v,gen_random_uuid(),(b->>'version')::int);
 b:=public.report_revision(org,r);
 if b->'data'->'totals'->>'actions'<>'0' or b->'data'->'items'->0->'followUp'->>'state'<>'completed' or coalesce(b->'data'->'items'->0->'followUp'->>'owner','')='' then raise exception 'completed task history lost';end if;
end $$;
reset role;
