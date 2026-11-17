-- Runs after report_issuance.sql in the same rolled-back transaction.
reset role;
update public.memberships set active=true where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000101';
select set_config('hvac_test.worker',(select user_id::text from hvac_private.pdf_worker_identity),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('hvac_test.worker'),true);
do $$ declare id uuid:=current_setting('hvac_test.revision')::uuid; j jsonb; job uuid; token uuid;begin
 j:=public.pdf_claim(id);job:=(j->>'jobId')::uuid;token:=(j->>'leaseToken')::uuid;
 if j->>'attempts'<>'1' or public.pdf_claim(id) is not null then raise exception 'double lease';end if;
 perform set_config('hvac_test.job',job::text,true);perform set_config('hvac_test.lease',token::text,true);
 perform public.pdf_heartbeat(job,token);
 begin perform public.pdf_manifest(job,gen_random_uuid(),repeat('a',64),123,'test');raise exception 'wrong token';exception when sqlstate 'PT409' then null;end;
 begin perform public.pdf_manifest(job,token,'invalid',123,'test');raise exception 'bad digest';exception when invalid_parameter_value then null;end;
 perform public.pdf_manifest(job,token,repeat('a',64),123,'test');
 perform public.pdf_manifest(job,token,repeat('a',64),123,'test');
 begin perform public.pdf_manifest(job,token,repeat('b',64),123,'test');raise exception 'changed manifest';exception when sqlstate 'PT409' then null;end;
 begin perform public.pdf_complete(job,token,repeat('a',64));raise exception 'completed missing storage object';exception when invalid_parameter_value then null;end;
 if not hvac_private.pdf_storage_insert(j->>'path') or hvac_private.pdf_storage_insert('other/path.pdf') then raise exception 'worker path scope';end if;
end $$;
reset role;
update hvac_private.render_jobs set attempts=3,lease_until=now()-interval '1 second' where id=current_setting('hvac_test.job')::uuid;
set local role authenticated;
do $$ declare job uuid:=current_setting('hvac_test.job')::uuid;token uuid:=current_setting('hvac_test.lease')::uuid;begin
 if public.pdf_claim(current_setting('hvac_test.revision')::uuid) is not null then raise exception 'exceeded attempts';end if;
 begin perform public.pdf_heartbeat(job,token);raise exception 'expired heartbeat';exception when sqlstate 'PT409' then null;end;
 begin perform public.pdf_complete(job,token,repeat('a',64));raise exception 'expired complete';exception when sqlstate 'PT409' then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare op uuid:=gen_random_uuid(); id uuid:=current_setting('hvac_test.revision')::uuid;begin
 perform public.retry_report('a1000000-0000-4000-8000-000000000001',id,op);
 perform public.retry_report('a1000000-0000-4000-8000-000000000001',id,op);
 begin perform public.retry_report('a1000000-0000-4000-8000-000000000001',gen_random_uuid(),op);raise exception 'retry operation changed';exception when sqlstate 'PT409' then null;end;
 begin perform public.pdf_claim(id);raise exception 'office worker authority';exception when insufficient_privilege then null;end;
 if hvac_private.pdf_storage_read('a1000000-0000-4000-8000-000000000001/'||id||'.pdf') then raise exception 'queued office storage read';end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from hvac_private.render_jobs where id=current_setting('hvac_test.job')::uuid and attempts=0 and state='queued' and expected_sha256=repeat('a',64) and expected_size=123) then raise exception 'retry changed manifest or job';end if;
 if has_table_privilege('hvac_identity_executor','hvac_private.report_artifacts','UPDATE') or has_table_privilege('hvac_identity_executor','hvac_private.report_artifacts','DELETE') then raise exception 'mutable archive';end if;
 if has_table_privilege('authenticated','hvac_private.render_jobs','UPDATE') or has_table_privilege('authenticated','hvac_private.report_artifacts','SELECT') then raise exception 'raw job/archive grants';end if;
end $$;
set local role authenticated;
do $$ declare actor text;begin
 foreach actor in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103'] loop
 perform set_config('request.jwt.claim.sub',actor,true);
 begin perform public.pdf_claim(current_setting('hvac_test.revision')::uuid);raise exception 'unauthorized claim';exception when insufficient_privilege then null;end;
 begin perform public.retry_report('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.revision')::uuid,gen_random_uuid());raise exception 'unauthorized retry';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
