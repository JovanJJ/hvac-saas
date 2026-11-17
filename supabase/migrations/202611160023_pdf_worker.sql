alter table hvac_private.render_jobs drop constraint render_jobs_state_check;
alter table hvac_private.render_jobs add constraint render_jobs_state_check check(state in ('queued','rendering','ready','failed'));
alter table hvac_private.render_jobs add column attempts integer not null default 0,
 add column available_at timestamptz not null default now(), add column lease_token uuid,
 add column lease_until timestamptz, add column claimed_by uuid references auth.users(id),
 add column expected_sha256 text, add column expected_size integer, add column renderer_version text,
 add column last_error text, add column completed_at timestamptz;
alter table hvac_private.render_jobs add constraint render_manifest_check check(
 (expected_sha256 is null and expected_size is null) or
 (expected_sha256 ~ '^[a-f0-9]{64}$' and expected_size between 1 and 33554432));
create table hvac_private.pdf_worker_identity(
 singleton boolean primary key default true check(singleton), user_id uuid not null unique references auth.users(id),
 installation_id uuid not null default gen_random_uuid()
);
create table hvac_private.report_artifacts(
 organization_id uuid not null, revision_id uuid primary key, storage_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), size_bytes integer not null check(size_bytes between 1 and 33554432),
 renderer_version text not null, created_at timestamptz not null default now(),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id)
);
create table hvac_private.report_retry_receipts(
 organization_id uuid not null, actor_id uuid not null, operation_id uuid not null, revision_id uuid not null,
 primary key(organization_id,actor_id,operation_id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id)
);
revoke all on hvac_private.pdf_worker_identity,hvac_private.report_artifacts,hvac_private.report_retry_receipts from public,anon,authenticated,service_role;
grant select on hvac_private.pdf_worker_identity to hvac_identity_executor;
grant select,insert on hvac_private.report_artifacts,hvac_private.report_retry_receipts to hvac_identity_executor;
grant update on hvac_private.render_jobs to hvac_identity_executor;

do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create function hvac_private.require_pdf_worker() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();begin
 if not exists(select 1 from hvac_private.pdf_worker_identity where user_id=actor) then raise exception 'worker_denied' using errcode='42501';end if;
 return actor;
end $$;
alter function hvac_private.require_pdf_worker() owner to hvac_identity_executor;
revoke all on function hvac_private.require_pdf_worker() from public,anon,authenticated,service_role;

create function public.pdf_claim(p_revision_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_pdf_worker(); job hvac_private.render_jobs; snapshot jsonb;
begin
 update hvac_private.render_jobs set state='failed',last_error='lease_expired',lease_until=null
 where state='rendering' and lease_until<=now() and attempts>=3 and (p_revision_id is null or revision_id=p_revision_id);
 select * into job from hvac_private.render_jobs where (p_revision_id is null or revision_id=p_revision_id) and attempts<3
 and ((state='queued' and available_at<=now()) or (state='rendering' and lease_until<=now())) order by created_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update hvac_private.render_jobs set state='rendering',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',claimed_by=actor
 where id=job.id returning * into job;
 select r.snapshot into snapshot from public.report_revisions r where r.organization_id=job.organization_id and r.id=job.revision_id;
 return jsonb_build_object('jobId',job.id,'organizationId',job.organization_id,'revisionId',job.revision_id,'leaseToken',job.lease_token,
 'attempts',job.attempts,'path',job.organization_id||'/'||job.revision_id||'.pdf','sha256',job.expected_sha256,'size',job.expected_size,'rendererVersion',job.renderer_version,'data',snapshot);
end $$;
create function public.pdf_heartbeat(p_job_id uuid,p_lease_token uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform hvac_private.require_pdf_worker();
 update hvac_private.render_jobs set lease_until=now()+interval '120 seconds' where id=p_job_id and state='rendering' and lease_token=p_lease_token and lease_until>now();
 if not found then raise exception 'lease_lost' using errcode='PT409';end if;
end $$;
create function public.pdf_manifest(p_job_id uuid,p_lease_token uuid,p_sha256 text,p_size integer,p_renderer text) returns void
language plpgsql security definer set search_path='' as $$
declare job hvac_private.render_jobs;begin
 perform hvac_private.require_pdf_worker();
 select * into job from hvac_private.render_jobs where id=p_job_id for update;
 if not found or job.state<>'rendering' or job.lease_token is distinct from p_lease_token or job.lease_until<=now() then raise exception 'lease_lost' using errcode='PT409';end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 33554432 or length(coalesce(p_renderer,'')) not between 1 and 120 then raise exception 'invalid_manifest' using errcode='22023';end if;
 if job.expected_sha256 is not null then
  if job.expected_sha256<>p_sha256 or job.expected_size<>p_size then raise exception 'artifact_mismatch' using errcode='PT409';end if;
  return;
 end if;
 update hvac_private.render_jobs set expected_sha256=p_sha256,expected_size=p_size,renderer_version=p_renderer where id=job.id;
end $$;
create function public.pdf_complete(p_job_id uuid,p_lease_token uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare job hvac_private.render_jobs; stored_size bigint; path text;begin
 perform hvac_private.require_pdf_worker();
 select * into job from hvac_private.render_jobs where id=p_job_id for update;
 if not found or job.lease_token is distinct from p_lease_token then raise exception 'lease_lost' using errcode='PT409';end if;
 if job.state='ready' and job.expected_sha256=p_sha256 then return;end if;
 if job.state<>'rendering' or job.lease_until<=now() then raise exception 'lease_lost' using errcode='PT409';end if;
 if job.expected_sha256 is null or job.expected_sha256 is distinct from p_sha256 then raise exception 'artifact_mismatch' using errcode='PT409';end if;
 path:=job.organization_id||'/'||job.revision_id||'.pdf';
 select (o.metadata->>'size')::bigint into stored_size from storage.objects o where o.bucket_id='report-pdfs' and o.name=path;
 if stored_size is distinct from job.expected_size::bigint then raise exception 'object_missing' using errcode='22023';end if;
 insert into hvac_private.report_artifacts(organization_id,revision_id,storage_path,sha256,size_bytes,renderer_version)
 values(job.organization_id,job.revision_id,path,job.expected_sha256,job.expected_size,job.renderer_version);
 update hvac_private.render_jobs set state='ready',completed_at=now(),lease_until=null,last_error=null where id=job.id;
end $$;
create function public.pdf_fail(p_job_id uuid,p_lease_token uuid,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare job hvac_private.render_jobs;begin
 perform hvac_private.require_pdf_worker();
 select * into job from hvac_private.render_jobs where id=p_job_id for update;
 if not found or job.state<>'rendering' or job.lease_token is distinct from p_lease_token or job.lease_until<=now() then raise exception 'lease_lost' using errcode='PT409';end if;
 if p_error is null or p_error not in ('render_failed','evidence_unavailable','evidence_mismatch','artifact_mismatch','storage_unavailable','unsupported_template','render_limit') then raise exception 'invalid_failure' using errcode='22023';end if;
 update hvac_private.render_jobs set state=case when attempts>=3 then 'failed' else 'queued' end,
 available_at=now()+make_interval(secs=>10*power(2,attempts-1)::int),last_error=p_error,lease_until=null where id=job.id;
end $$;
create function public.retry_report(p_organization_id uuid,p_revision_id uuid,p_operation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); previous uuid; job hvac_private.render_jobs;begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 if p_operation_id is null then raise exception 'invalid_retry' using errcode='22023';end if;
 select revision_id into previous from hvac_private.report_retry_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then if previous<>p_revision_id then raise exception 'operation_conflict' using errcode='PT409';end if;return;end if;
 select * into job from hvac_private.render_jobs where organization_id=p_organization_id and revision_id=p_revision_id for update;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 if job.state<>'failed' then raise exception 'render_not_failed' using errcode='PT409';end if;
 update hvac_private.render_jobs set state='queued',attempts=0,available_at=now(),lease_token=null,lease_until=null,last_error=null where id=job.id;
 insert into hvac_private.report_retry_receipts values(p_organization_id,actor,p_operation_id,p_revision_id);
 insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_render_retried',p_revision_id);
end $$;

-- Storage policies call only these narrow predicates; no object-name tenant inference is trusted.
create function hvac_private.pdf_storage_read(object_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();begin
 if exists(select 1 from hvac_private.pdf_worker_identity where user_id=actor) then
  return exists(select 1 from hvac_private.render_jobs j where object_name=j.organization_id||'/'||j.revision_id||'.pdf' and j.state='rendering' and j.lease_until>now() and j.expected_sha256 is not null);
 end if;
 return exists(select 1 from hvac_private.report_artifacts a join hvac_private.render_jobs j on j.revision_id=a.revision_id and j.organization_id=a.organization_id where a.storage_path=object_name and j.state='ready' and hvac_private.has_workspace_role(a.organization_id,array['owner','coordinator']));
end $$;
create function hvac_private.pdf_storage_insert(object_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from hvac_private.pdf_worker_identity where user_id=hvac_private.require_verified_actor()) then return false;end if;
 return exists(select 1 from hvac_private.render_jobs j where object_name=j.organization_id||'/'||j.revision_id||'.pdf' and j.state='rendering' and j.lease_until>now() and j.expected_sha256 is not null);
end $$;

create or replace function public.report_revision(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select jsonb_build_object('id',r.id,'visitId',r.visit_id,'issuedBy',r.issued_by,'issuedAt',r.issued_at,'revision',r.revision_no,'renderState',j.state,
 'attempts',j.attempts,'availableAt',j.available_at,'lastError',j.last_error,
 'artifact',case when a.revision_id is null then null else jsonb_build_object('path',a.storage_path,'sha256',a.sha256,'size',a.size_bytes,'createdAt',a.created_at) end,'data',r.snapshot) into result
 from public.report_revisions r join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id
 left join hvac_private.report_artifacts a on a.organization_id=r.organization_id and a.revision_id=r.id where r.organization_id=p_organization_id and r.id=p_revision_id;
 if result is null then raise exception 'report_denied' using errcode='42501';end if;return result;
end $$;

do $$ declare signature text;begin
 foreach signature in array array['public.pdf_claim(uuid)','public.pdf_heartbeat(uuid,uuid)','public.pdf_manifest(uuid,uuid,text,integer,text)','public.pdf_complete(uuid,uuid,text)','public.pdf_fail(uuid,uuid,text)','public.retry_report(uuid,uuid,uuid)','hvac_private.pdf_storage_read(text)','hvac_private.pdf_storage_insert(text)'] loop
 execute 'alter function '||signature||' owner to hvac_identity_executor';
 execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role';
 execute 'grant execute on function '||signature||' to authenticated';
 end loop;
end $$;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
