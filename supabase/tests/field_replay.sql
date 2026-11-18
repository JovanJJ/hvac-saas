-- Reuses the rolled-back handover fixture. Every replay reauthorizes before reading a receipt.
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:='e4000000-0000-4000-8000-000000000001';member uuid;b jsonb;payload jsonb;ack jsonb;again jsonb;op uuid:='e4000000-0000-4000-8000-000000000002';submit_op uuid:=gen_random_uuid();ver int;actor text;
begin
 select membership_id into member from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000102';
 perform public.save_operation(org,v,'visit',jsonb_build_object('siteId','d1000000-0000-4000-8000-000000000002','visitType','maintenance','start','2026-12-22T09:00','end','2026-12-22T10:00','members',jsonb_build_array(member),'systems',jsonb_build_array('d1000000-0000-4000-8000-000000000003')));
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 b:=public.offline_visit_bundle(org,v)->'visit';
 payload:=jsonb_build_object('itemId',b->'items'->0->'id','outcome','serviced','work','Fictional replay','finding','','internalNote','','noAccessReason','','readings','[{"kind":"Struja","mode":"Hlađenje","status":"measured","value":0,"unit":"A"}]'::jsonb,'parts','[]'::jsonb,'followUp',jsonb_build_object('kind','quote','ownerId',member,'dueDate','2026-12-23','customerAction',''));
 ack:=public.replay_field_command(org,v,op,'save',1,payload);
 again:=public.replay_field_command(org,v,op,'save',1,payload);
 if ack<>again or ack->'item'->>'version'<>'2' or ack->'item'->>'enteredBy'<>'a1000000-0000-4000-8000-000000000102' or ack->'item'->'readings'->0->>'value'<>'0' then raise exception 'save replay acknowledgement mismatch';end if;
 begin perform public.replay_field_command(org,v,op,'save',1,payload||'{"work":"Changed"}');raise exception 'changed replay accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.replay_field_command(org,v,gen_random_uuid(),'save',1,payload);raise exception 'stale accepted';exception when sqlstate 'PT409' then null;end;
 b:=public.offline_visit_bundle(org,v)->'visit';ver:=(b->>'version')::int;
 perform public.replay_field_command(org,v,submit_op,'submit',ver,'{}');
 perform public.replay_field_command(org,v,submit_op,'submit',ver,'{}');
 -- An old save retry after submission still returns its ORIGINAL acknowledgement.
 if public.replay_field_command(org,v,op,'save',1,payload)<>ack then raise exception 'historical replay changed';end if;
 b:=public.offline_visit_bundle(org,v)->'visit';
 if b->>'status'<>'submitted' or (b->>'version')::int<>ver+1 or b->'items'->0->>'version'<>'2' then raise exception 'duplicate writes';end if;
 foreach actor in array array['a1000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
  perform set_config('request.jwt.claim.sub',actor,true);
  begin perform public.replay_field_command(org,v,op,'save',1,payload);raise exception 'unassigned replay accepted';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 begin perform public.replay_field_command('a1000000-0000-4000-8000-000000000002',v,op,'save',1,payload);raise exception 'tenant replay accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.visit_assignees where visit_id='e4000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin perform public.replay_field_command('a1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','save',1,'{}');raise exception 'withdrawn replay accepted';exception when insufficient_privilege then null;end;
 begin perform count(*) from hvac_private.field_replay_receipts;raise exception 'private receipts readable';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.replay_field_command('a1000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',gen_random_uuid(),'submit',1,'{}');raise exception 'anonymous replay accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
