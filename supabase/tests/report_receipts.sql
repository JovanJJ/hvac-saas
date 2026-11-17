-- Extends report issuance/link fixtures in their rollback transaction.
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare r jsonb;begin
 r:=public.create_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid,gen_random_uuid(),encode(extensions.digest(repeat('r',43),'sha256'),'hex'),7);
 perform set_config('hvac_test.receipt_link',r->>'id',true);
end $$;
reset role;
-- Simulate a later revision without implementing the amendment workflow (M3f).
insert into public.report_revisions(organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by)
 select organization_id,visit_id,2,report_number,jsonb_set(snapshot,'{revision}','2'),locale,template_version,issued_at,issued_by from public.report_revisions where id=current_setting('hvac_test.revision')::uuid;
select set_config('hvac_test.later_revision',(select id::text from public.report_revisions where visit_id='f1000000-0000-4000-8000-000000000004' and revision_no=2),true);
set local role anon;
do $$ declare first jsonb;again jsonb;begin
 if public.guest_report(repeat('r',43))->'receipt'<>'null'::jsonb then raise exception 'view acknowledged';end if;
 begin perform public.acknowledge_report(repeat('r',43),'Primaoc','Upravnik',false);raise exception 'implicit consent';exception when invalid_parameter_value then null;end;
 begin perform public.acknowledge_report(repeat('r',43),' ','Upravnik',true);raise exception 'empty recipient';exception when invalid_parameter_value then null;end;
 begin perform public.acknowledge_report(repeat('r',43),'Primaoc',repeat('a',121),true);raise exception 'oversized role';exception when invalid_parameter_value then null;end;
 begin perform public.acknowledge_report(repeat('z',43),'Primaoc','Upravnik',true);raise exception 'unknown token';exception when insufficient_privilege then null;end;
 first:=public.acknowledge_report(repeat('r',43),' Čačak Đurić ',' Upravnik ',true);
 again:=public.acknowledge_report(repeat('r',43),'Čačak Đurić','Upravnik',true);
 if first<>again or first->>'revisionId'<>current_setting('hvac_test.revision') or first->>'linkId'<>current_setting('hvac_test.receipt_link') or first->>'name'<>'Čačak Đurić' or first->>'method'<>'guest_link' then raise exception 'receipt replay/binding';end if;
 if public.guest_report(repeat('r',43))->'receipt'<>first then raise exception 'guest receipt result';end if;
 begin perform public.acknowledge_report(repeat('r',43),'Changed','Upravnik',true);raise exception 'receipt overwritten';exception when sqlstate 'PT409' then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from hvac_private.report_receipts where link_id=current_setting('hvac_test.receipt_link')::uuid)<>1 then raise exception 'duplicate receipt';end if;
 if has_table_privilege('hvac_identity_executor','hvac_private.report_receipts','UPDATE') or has_table_privilege('hvac_identity_executor','hvac_private.report_receipts','DELETE') or has_table_privilege('anon','hvac_private.report_receipts','SELECT') then raise exception 'receipt grants';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ begin
 if jsonb_array_length(public.report_receipts('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid))<>1 or public.report_receipts('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.later_revision')::uuid)<>'[]'::jsonb then raise exception 'office revision receipt scope';end if;
end $$;
do $$ declare actor text;begin
 foreach actor in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103'] loop
 perform set_config('request.jwt.claim.sub',actor,true);
 begin perform public.report_receipts('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid);raise exception 'unauthorized receipt read';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
update hvac_private.report_links set expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '2 days' where id=current_setting('hvac_test.receipt_link')::uuid;
set local role anon;
do $$ begin
 begin perform public.acknowledge_report(repeat('r',43),'Čačak Đurić','Upravnik',true);raise exception 'expired receipt replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
update hvac_private.report_links set expires_at=clock_timestamp()+interval '1 day' where id=current_setting('hvac_test.receipt_link')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
select public.revoke_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.receipt_link')::uuid);
set local role anon;
do $$ begin
 begin perform public.acknowledge_report(repeat('r',43),'Čačak Đurić','Upravnik',true);raise exception 'revoked receipt replay';exception when insufficient_privilege then null;end;
 if public.guest_report(repeat('r',43)) is not null then raise exception 'revoked receipt exposed';end if;
end $$;
reset role;
