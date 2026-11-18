-- Uses issuance + worker rollback fixtures; caller wraps this file in a savepoint.
reset role;
select set_config('hvac_test.original_attribution',(select jsonb_build_object('by',entered_by,'at',entered_at)::text from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';base uuid:=current_setting('hvac_test.revision')::uuid;b jsonb;items jsonb;id uuid;op uuid:=gen_random_uuid();r jsonb;begin
 b:=public.report_amendment(org,base);items:=b->'items';
 begin perform public.amend_report(org,base,op,(b->>'visitVersion')::int,'',items);raise exception 'missing reason';exception when invalid_parameter_value then null;end;
 begin perform public.amend_report(org,base,op,(b->>'visitVersion')::int,'No change',items);raise exception 'empty amendment';exception when invalid_parameter_value then null;end;
 begin perform public.amend_report(org,base,op,(b->>'visitVersion')::int,'Missing item','[]');raise exception 'incomplete items';exception when invalid_parameter_value then null;end;
 begin perform public.amend_report(org,base,op,(b->>'visitVersion')::int,'Bad zero',jsonb_set(items,'{0,readings,0,value}','null'));raise exception 'invalid reading';exception when invalid_parameter_value then null;end;
 begin perform public.amend_report(org,base,op,(b->>'visitVersion')::int,'Private override',jsonb_set(items,'{0,photos}','[]'));raise exception 'untrusted snapshot';exception when invalid_parameter_value then null;end;
 items:=jsonb_set(items,'{0,finding}','"Ispravljen nalaz čćšžđ"');
 id:=public.amend_report(org,base,op,(b->>'visitVersion')::int,'Ispravljen opis nalaza',items);
 if public.amend_report(org,base,op,(b->>'visitVersion')::int,'Ispravljen opis nalaza',items)<>id then raise exception 'duplicate amendment';end if;
 begin perform public.amend_report(org,base,op,(b->>'visitVersion')::int,'Different',items);raise exception 'changed operation';exception when sqlstate 'PT409' then null;end;
 begin perform public.amend_report(org,base,gen_random_uuid(),(b->>'visitVersion')::int,'Competing amendment',items);raise exception 'forked history';exception when sqlstate 'PT409' then null;end;
 r:=public.report_revision(org,id);
 if r->>'revision'<>'2' or r->>'previousRevisionId'<>base::text or r->>'latestRevisionId'<>id::text or r->>'renderState'<>'queued' or r->'data'->>'templateVersion'<>'service-report-v2' then raise exception 'amendment metadata';end if;
 if r->'data'->'items'->0->>'finding'<>'Ispravljen nalaz čćšžđ' or (r->'data')::text like '%SECRET%' or r->'data'->'items'->0->'photos'<>public.report_revision(org,base)->'data'->'items'->0->'photos' then raise exception 'amended field/privacy/evidence';end if;
 if r->'data'->>'customer'='Changed customer' or r->'data'->>'company'='Changed company' or r->'data'->'items'->0->>'model'='Changed model' then raise exception 'silently refreshed frozen identity';end if;
 if public.report_preview(org,'f1000000-0000-4000-8000-000000000004')->>'revisionId'<>id::text then raise exception 'latest preview not updated';end if;
 perform set_config('hvac_test.amendment',id::text,true);
 perform set_config('hvac_test.amendment_payload',jsonb_build_object('op',op,'version',b->'visitVersion','items',items)::text,true);
end $$;
reset role;
do $$ begin
 if (select jsonb_build_object('by',entered_by,'at',entered_at) from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004')<>current_setting('hvac_test.original_attribution')::jsonb then raise exception 'field author overwritten';end if;
 if not exists(select 1 from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004' and corrected_by='a1000000-0000-4000-8000-000000000101' and corrected_at is not null) then raise exception 'missing office attribution';end if;
 if (select count(*) from hvac_private.render_jobs where revision_id=current_setting('hvac_test.amendment')::uuid)<>1 or (select count(*) from hvac_private.report_amendments where revision_id=current_setting('hvac_test.amendment')::uuid)<>1 then raise exception 'duplicate job/audit';end if;
 if (select readings->0->>'private' from public.visit_items where visit_id='f1000000-0000-4000-8000-000000000004')<>'SECRET-READING' then raise exception 'unchanged private reading lost';end if;
 if has_table_privilege('hvac_identity_executor','hvac_private.report_amendments','UPDATE') or has_table_privilege('hvac_identity_executor','public.report_revisions','UPDATE') then raise exception 'mutable history';end if;
end $$;
set local role authenticated;
do $$ declare actor text;begin
 foreach actor in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103'] loop
 perform set_config('request.jwt.claim.sub',actor,true);
 begin perform public.report_amendment('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.amendment')::uuid);raise exception 'unauthorized amendment read';exception when insufficient_privilege then null;end;
 begin perform public.amend_report('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.amendment')::uuid,gen_random_uuid(),1,'Denied','[]');raise exception 'unauthorized amendment';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare p jsonb:=current_setting('hvac_test.amendment_payload')::jsonb;begin
 begin perform public.amend_report('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid,(p->>'op')::uuid,(p->>'version')::int,'Ispravljen opis nalaza',p->'items');raise exception 'withdrawn replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
