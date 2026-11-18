reset role;
select set_config('hvac_test.verifier',(select secret from hvac_private.evidence_verifier where singleton),true);
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';v uuid:='e5000000-0000-4000-8000-000000000001';a uuid:='e5000000-0000-4000-8000-000000000002';discard uuid:=gen_random_uuid();member uuid;i uuid;b jsonb;p jsonb;ack jsonb;fresh jsonb;verified jsonb;exp bigint;signature text;ver integer;actor text;
begin
 select membership_id into member from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000102';
 perform public.save_operation(org,v,'visit',jsonb_build_object('siteId','d1000000-0000-4000-8000-000000000002','visitType','maintenance','start','2026-12-24T09:00','end','2026-12-24T10:00','members',jsonb_build_array(member),'systems',jsonb_build_array('d1000000-0000-4000-8000-000000000003')));
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 b:=public.offline_visit_bundle(org,v)->'visit';i:=(b->'items'->0->>'id')::uuid;
 perform public.visit_command(org,v,gen_random_uuid(),'save',1,jsonb_build_object('itemId',i,'outcome','serviced','work','Fictional photo test','readings','[]'::jsonb,'parts','[]'::jsonb));
 p:=jsonb_build_object('visitId',v,'attachmentId',a,'itemId',i,'caption','Fictional offline photo','visibility','customer','bytes',68,'mimeType','image/png');
 ack:=public.replay_photo_command(org,v,a,'reserve',p);
 if public.replay_photo_command(org,v,a,'reserve',p)<>ack or ack->'effects'->>'reserve'<>'1' then raise exception 'reservation replay changed';end if;
 begin perform public.replay_photo_command(org,v,a,'reserve',p||'{"caption":"Different"}');raise exception 'changed reservation accepted';exception when sqlstate 'PT409' then null;end;
 b:=public.visit_bundle(org,v);ver:=(b->>'version')::int;
 begin perform public.visit_command(org,v,gen_random_uuid(),'submit',ver,'{}');raise exception 'pending photo submitted';exception when invalid_parameter_value then null;end;
 -- An expired server attestation cannot create a completion receipt. Renew it for the same object/ID.
 exp:=extract(epoch from now())::bigint-60;
 verified:=jsonb_build_object('assetId','fictional-offline','version',1,'bytes',67,'format','png','width',1,'height',1,'expires',exp);
 signature:=encode(extensions.hmac(concat_ws(E'\n',org,v,a,'a1000000-0000-4000-8000-000000000102','fictional-offline',1,67,'png',1,1,exp),current_setting('hvac_test.verifier'),'sha256'),'hex');
 begin perform public.replay_photo_command(org,v,a,'complete',verified||jsonb_build_object('proof',signature));raise exception 'expired attestation accepted';exception when insufficient_privilege then null;end;
 exp:=extract(epoch from now())::bigint+120;
 verified:=verified||jsonb_build_object('expires',exp);
 signature:=encode(extensions.hmac(concat_ws(E'\n',org,v,a,'a1000000-0000-4000-8000-000000000102','fictional-offline',1,67,'png',1,1,exp),current_setting('hvac_test.verifier'),'sha256'),'hex');
 verified:=verified||jsonb_build_object('proof',signature);
 fresh:=public.replay_photo_command(org,v,a,'complete',verified);
 if fresh->>'state'<>'verified' or fresh->'effects'<>'{"reserve":1,"complete":1}'::jsonb then raise exception 'completion effects mismatch';end if;
 if public.replay_photo_command(org,v,a,'complete',verified||jsonb_build_object('expires',exp+1,'proof','renewed-attestation'))<>fresh then raise exception 'renewed retry changed acknowledgement';end if;
 b:=public.visit_bundle(org,v);if (b->>'version')::int<>ver+1 then raise exception 'duplicate completion mutation';end if;
 ack:=public.replay_photo_command(org,v,a,'remove',p);
 if ack->'effects'<>'{"reserve":1,"complete":1,"remove":1}'::jsonb or ack->>'state'<>'removed' or public.replay_photo_command(org,v,a,'remove',p)<>ack then raise exception 'remove replay mismatch';end if;
 p:=p||jsonb_build_object('attachmentId',discard);
 ack:=public.replay_photo_command(org,v,discard,'remove',p);
 if ack->'effects'<>'{"reserve":1,"remove":1}'::jsonb then raise exception 'unknown removal effects lost';end if;
 perform public.replay_photo_command(org,v,discard,'reserve',p);
 if public.attachment_read(org,v,discard)->0->>'state'<>'removed' then raise exception 'late prepare revived tombstone';end if;
 foreach actor in array array['a1000000-0000-4000-8000-000000000101','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
  perform set_config('request.jwt.claim.sub',actor,true);
  begin perform public.replay_photo_command(org,v,a,'complete',verified);raise exception 'unassigned replay accepted';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
 begin perform public.replay_photo_command('a1000000-0000-4000-8000-000000000002',v,a,'complete',verified);raise exception 'tenant photo replay';exception when insufficient_privilege then null;end;
 begin perform count(*) from hvac_private.photo_replay_receipts;raise exception 'private receipts exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.visit_assignees where visit_id='e5000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin perform public.replay_photo_command('a1000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','remove','{}');raise exception 'withdrawn replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.replay_photo_command('a1000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001',gen_random_uuid(),'reserve','{}');raise exception 'anonymous replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
