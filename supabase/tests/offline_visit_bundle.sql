-- Reuses the handover fixture, without changing any committed development records.
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
update public.visit_items set readings='[{"kind":"Struja","mode":"Hlađenje","status":"measured","value":0,"unit":"A","private":"EXCLUDED-METADATA"}]',parts='[{"name":"Filter","quantity":1,"unit":"kom","cost":"EXCLUDED-METADATA"}]' where visit_id='d1000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ declare b jsonb;begin
 b:=public.offline_visit_bundle('a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');
 if b->>'schemaVersion'<>'1' or b->>'userId'<>'a1000000-0000-4000-8000-000000000102' or b->>'organizationId'<>'a1000000-0000-4000-8000-000000000001' or jsonb_array_length(b->'visit'->'items')<>1 or b->'visit'->'items'->0->'readings'->0->>'value'<>'0' or b->'visit' ? 'availableSystems' or b::text like '%EXCLUDED-METADATA%' then raise exception 'offline projection mismatch';end if;
 begin perform public.offline_visit_bundle('a1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000004');raise exception 'tenant mismatch';exception when insufficient_privilege then null;end;
end $$;
do $$ declare actor text;begin
 foreach actor in array array['a1000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
 perform set_config('request.jwt.claim.sub',actor,true);
 begin perform public.offline_visit_bundle('a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');raise exception 'unassigned download';exception when insufficient_privilege then null;end;
 end loop;
end $$;
-- Incomplete online drafts are downloadable without inventing an owner, deadline or reading.
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';target uuid:=gen_random_uuid();member uuid;b jsonb;begin
 select membership_id into member from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000102';
 perform public.save_operation(org,target,'visit',jsonb_build_object('siteId','d1000000-0000-4000-8000-000000000002','visitType','maintenance','start','2026-12-21T09:00','end','2026-12-21T10:00','members',jsonb_build_array(member),'systems',jsonb_build_array('d1000000-0000-4000-8000-000000000003')));
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 b:=public.offline_visit_bundle(org,target);
 if b->'visit'->>'status'<>'scheduled' or b->'visit'->'items'->0->>'outcome'<>'pending' then raise exception 'pending download lost';end if;
 perform public.visit_command(org,target,gen_random_uuid(),'save',1,jsonb_build_object('itemId',b->'visit'->'items'->0->'id','outcome','pending','work','','finding','','noAccessReason','','internalNote','','readings','[{"kind":"Struja","mode":"Hlađenje","status":"not_measured","value":null,"unit":null}]'::jsonb,'parts','[]'::jsonb,'followUp','{"kind":"quote","ownerId":"","dueDate":"","customerAction":""}'::jsonb));
 b:=public.offline_visit_bundle(org,target);
 if b->'visit'->'items'->0->'followUp'->'ownerId'<>'null'::jsonb or b->'visit'->'items'->0->'followUp'->'dueDate'<>'null'::jsonb or b->'visit'->'items'->0->'readings'->0->'value'<>'null'::jsonb or b->'visit'->'items'->0->'readings'->0->'unit'<>'null'::jsonb then raise exception 'incomplete draft values invented';end if;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin perform public.offline_visit_bundle('a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');raise exception 'revoked download';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.offline_visit_bundle('a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004');raise exception 'anonymous download';exception when insufficient_privilege then null;end;
end $$;
reset role;
