-- Reuses the issued single-system fixture; the caller rolls this entire slice back.
reset role;
update public.memberships set role='technician',active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
insert into public.follow_ups(organization_id,item_id,kind,owner_id,due_date,customer_action)
 select i.organization_id,i.id,'revisit',m.id,'2026-12-10','Obezbediti pristup'
 from public.visit_items i join public.memberships m on m.organization_id=i.organization_id and m.user_id='a1000000-0000-4000-8000-000000000102'
 where i.visit_id='f1000000-0000-4000-8000-000000000004';
select set_config('hvac_test.snapshot',(select snapshot::text from public.report_revisions where id=current_setting('hvac_test.revision')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';a jsonb;member uuid;other_member uuid;op uuid:=gen_random_uuid();book jsonb;result uuid;b jsonb;items jsonb;begin
 select value into a from jsonb_array_elements(public.follow_up_list(org)) where value->>'visitId'='f1000000-0000-4000-8000-000000000004';
 select membership_id into member from public.workspace_roster(org) where email='owner.a@hvac.example.invalid';
 select membership_id into other_member from public.workspace_roster(org) where email='unassigned@hvac.example.invalid';
 -- Seed naming is checked via user ID rather than trusting a display label.
 if other_member is null then select membership_id into other_member from public.workspace_roster(org) where user_id='a1000000-0000-4000-8000-000000000104';end if;
 perform public.follow_up_command(org,(a->>'id')::uuid,op,1,'assign',jsonb_build_object('ownerId',member,'dueDate','2026-12-11'));
 perform public.follow_up_command(org,(a->>'id')::uuid,op,1,'assign',jsonb_build_object('ownerId',member,'dueDate','2026-12-11'));
 begin perform public.follow_up_command(org,(a->>'id')::uuid,op,1,'assign',jsonb_build_object('ownerId',member,'dueDate','2026-12-12'));raise exception 'changed retry';exception when sqlstate 'PT409' then null;end;
 begin perform public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),1,'complete','{"note":"stale"}');raise exception 'stale action';exception when sqlstate 'PT409' then null;end;
 begin update public.follow_ups set due_date='2027-01-01' where id=(a->>'id')::uuid;raise exception 'raw write';exception when insufficient_privilege then null;end;
 book:=jsonb_build_object('start','2026-12-15T09:00','end','2026-12-15T10:00','members',jsonb_build_array(other_member));op:=gen_random_uuid();
 result:=public.follow_up_command(org,(a->>'id')::uuid,op,2,'book',book);
 if public.follow_up_command(org,(a->>'id')::uuid,op,2,'book',book)<>result or public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),2,'book',book)<>result then raise exception 'duplicate booking';end if;
 begin perform public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),3,'book',book||'{"start":"2026-12-16T09:00"}');raise exception 'changed booking';exception when sqlstate 'PT409' then null;end;
 select value into a from jsonb_array_elements(public.follow_up_list(org)) where value->>'visitId'='f1000000-0000-4000-8000-000000000004';
 if a->>'dueDate'<>'2026-12-11' or a->>'state'<>'open' or a->>'version'<>'3' then raise exception 'booking changed deadline/state';end if;
 b:=public.visit_bundle(org,result);
 if jsonb_array_length(b->'items')<>1 or b->'items'->0->>'code'<>'KL-01' then raise exception 'wrong return scope';end if;
 begin perform public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),3,'complete','{"note":" "}');raise exception 'missing completion note';exception when invalid_parameter_value then null;end;
 perform public.follow_up_command(org,(a->>'id')::uuid,gen_random_uuid(),3,'complete','{"note":"Fiktivni završetak"}');
 b:=public.report_amendment(org,current_setting('hvac_test.revision')::uuid);items:=b->'items';
 begin perform public.amend_report(org,current_setting('hvac_test.revision')::uuid,gen_random_uuid(),(b->>'visitVersion')::int,'Remove managed action',jsonb_set(items,'{0,followUp}','null'));raise exception 'managed action erased';exception when sqlstate 'PT409' then if sqlerrm<>'follow_up_managed' then raise;end if;end;
 perform public.amend_report(org,current_setting('hvac_test.revision')::uuid,gen_random_uuid(),(b->>'visitVersion')::int,'Correct finding',jsonb_set(items,'{0,finding}','"Dopunjen nalaz"'));
 perform set_config('hvac_test.return',result::text,true);perform set_config('hvac_test.action',a->>'id',true);
end $$;
reset role;
do $$ begin
 if (select count(*) from hvac_private.follow_up_events where action_id=current_setting('hvac_test.action')::uuid)<>3 then raise exception 'missing/duplicate audit';end if;
 if (select snapshot from public.report_revisions where id=current_setting('hvac_test.revision')::uuid)<>current_setting('hvac_test.snapshot')::jsonb then raise exception 'issued history changed';end if;
 if has_table_privilege('hvac_identity_executor','hvac_private.follow_up_events','UPDATE') or has_table_privilege('authenticated','hvac_private.follow_up_events','SELECT') then raise exception 'audit privileges';end if;
 if (select snapshot->'totals'->>'actions' from public.report_revisions where visit_id='f1000000-0000-4000-8000-000000000004' order by revision_no desc limit 1)<>'0' then raise exception 'completed action counted open';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ declare source jsonb;begin
 source:=public.return_visit_source('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.return')::uuid);
 if source->>'code'<>'KL-01' or source::text like '%SECRET%' then raise exception 'missing/overbroad source';end if;
 begin perform public.visit_bundle('a1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000004');raise exception 'source visit leaked';exception when insufficient_privilege then null;end;
end $$;
do $$ declare actor text;begin
 foreach actor in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
 perform set_config('request.jwt.claim.sub',actor,true);
 begin perform public.follow_up_list('a1000000-0000-4000-8000-000000000001');raise exception 'unauthorized list';exception when insufficient_privilege then null;end;
 begin perform public.follow_up_command('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.action')::uuid,gen_random_uuid(),4,'complete','{"note":"Denied"}');raise exception 'unauthorized command';exception when insufficient_privilege then null;end;
 if actor<>'a1000000-0000-4000-8000-000000000104' then
 begin perform public.return_visit_source('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.return')::uuid);raise exception 'unauthorized return source';exception when insufficient_privilege then null;end;
 end if;
 end loop;
end $$;
reset role;
-- Replaying an accepted office operation still requires current membership.
select set_config('hvac_test.action_replay',(select jsonb_build_object('op',operation_id,'payload',payload)::text from hvac_private.follow_up_receipts where organization_id='a1000000-0000-4000-8000-000000000001' and payload->>'action'=current_setting('hvac_test.action') limit 1),true);
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare r jsonb:=current_setting('hvac_test.action_replay')::jsonb;p jsonb:=r->'payload';begin
 begin perform public.follow_up_command('a1000000-0000-4000-8000-000000000001',(p->>'action')::uuid,(r->>'op')::uuid,(p->>'version')::int,p->>'kind',p->'data');raise exception 'revoked replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
