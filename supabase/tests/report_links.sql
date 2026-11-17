-- After report_issuance.sql and pdf_worker.sql, within their rollback transaction.
reset role;
insert into hvac_private.report_artifacts(organization_id,revision_id,storage_path,sha256,size_bytes,renderer_version)
 select organization_id,revision_id,organization_id||'/'||revision_id||'.pdf',repeat('a',64),123,'test'
 from hvac_private.render_jobs where id=current_setting('hvac_test.job')::uuid;
update hvac_private.render_jobs set state='ready',lease_until=null where id=current_setting('hvac_test.job')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare org uuid:='a1000000-0000-4000-8000-000000000001';rev uuid:=current_setting('hvac_test.revision')::uuid;op uuid:=gen_random_uuid();r jsonb; again jsonb;hash text:=encode(extensions.digest(repeat('x',43),'sha256'),'hex');begin
 r:=public.create_report_link(org,rev,op,hash,7);
 perform set_config('hvac_test.link',r->>'id',true);
 perform set_config('hvac_test.link_operation',op::text,true);
 again:=public.create_report_link(org,rev,op,hash,7);
 if again<>r then raise exception 'link retry changed identity/expiry';end if;
 begin perform public.create_report_link(org,rev,op,hash,30);raise exception 'changed retry accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.create_report_link(org,rev,gen_random_uuid(),repeat('b',64),0);raise exception 'invalid expiry';exception when invalid_parameter_value then null;end;
 if jsonb_array_length(public.report_links(org,rev))<>1 or public.report_links(org,rev)::text like '%'||hash||'%' then raise exception 'link metadata exposes digest';end if;
end $$;
reset role;
set local role anon;
do $$ declare r jsonb;begin
 r:=public.guest_report(repeat('x',43));
 if r->>'revisionId'<>current_setting('hvac_test.revision') or r::text like '%SECRET%' then raise exception 'guest scope/privacy';end if;
 if public.guest_report(repeat('a',64)) is not null or public.guest_report(repeat('y',43)) is not null or public.guest_report(null) is not null then raise exception 'invalid token granted';end if;
 begin perform public.create_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid,gen_random_uuid(),repeat('d',64),7);raise exception 'anonymous create';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- API roles cannot name private-schema functions as anon. Storage policies
-- reference the helper by OID; exercise the helper with authenticated schema usage.
set local role authenticated;
do $$ declare r jsonb:=public.guest_report(repeat('x',43));begin
 perform set_config('request.headers',jsonb_build_object('x-report-token',repeat('x',43))::text,true);
 perform set_config('storage.operation','storage.object.list',true);
 if hvac_private.guest_pdf_read(r->'artifact'->>'path') then raise exception 'guest list allowed';end if;
 perform set_config('storage.operation','storage.object.sign',true);
 if hvac_private.guest_pdf_read(r->'artifact'->>'path') then raise exception 'guest durable signed URL allowed';end if;
 perform set_config('storage.operation','storage.object.get_authenticated',true);
 if not hvac_private.guest_pdf_read(r->'artifact'->>'path') or hvac_private.guest_pdf_read('another/path.pdf') then raise exception 'guest storage scope';end if;
end $$;
reset role;
set local role authenticated;
do $$ declare actor text;begin
 foreach actor in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103'] loop
 perform set_config('request.jwt.claim.sub',actor,true);
 begin perform public.report_links('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid);raise exception 'denied link list';exception when insufficient_privilege then null;end;
 begin perform public.revoke_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.link')::uuid);raise exception 'denied link revoke';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
-- A valid capability does not outlive its deadline.
update hvac_private.report_links set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id=current_setting('hvac_test.link')::uuid;
set local role anon;
do $$ begin if public.guest_report(repeat('x',43)) is not null then raise exception 'expired guest read';end if;end $$;
reset role;
update hvac_private.report_links set expires_at=now()+interval '1 day' where id=current_setting('hvac_test.link')::uuid;
-- Coordinator from the issuance fixture can revoke, idempotently.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
select public.revoke_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.link')::uuid);
select public.revoke_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.link')::uuid);
reset role;
set local role anon;
do $$ begin if public.guest_report(repeat('x',43)) is not null then raise exception 'revoked guest read';end if;end $$;
reset role;
do $$ begin
 if (select count(*) from hvac_private.identity_events where subject_id=current_setting('hvac_test.link')::uuid and event_type='report_link_revoked')<>1 then raise exception 'duplicate revoke audit';end if;
 if has_table_privilege('anon','hvac_private.report_links','SELECT') or has_table_privilege('authenticated','hvac_private.report_links','UPDATE') then raise exception 'raw link grants';end if;
end $$;
-- Older links remain discoverable once more than fifty newer links exist.
insert into hvac_private.report_links(organization_id,revision_id,token_hash,created_by,operation_id,ttl_days,expires_at)
 select 'a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid,encode(extensions.digest('fictional-history-'||n,'sha256'),'hex'),'a1000000-0000-4000-8000-000000000101',gen_random_uuid(),7,now()+interval '7 days' from generate_series(1,51) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ declare links jsonb;begin
 links:=public.report_links('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid);
 if jsonb_array_length(links)<>52 or not exists(select 1 from jsonb_array_elements(links) l where l->>'id'=current_setting('hvac_test.link')) then raise exception 'older link hidden';end if;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ begin
 begin perform public.create_report_link('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid,current_setting('hvac_test.link_operation')::uuid,encode(extensions.digest(repeat('x',43),'sha256'),'hex'),7);raise exception 'withdrawn creator replay';exception when insufficient_privilege then null;end;
end $$;
reset role;
