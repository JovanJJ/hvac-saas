create table hvac_private.report_links(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, revision_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users(id), operation_id uuid not null,
 ttl_days integer not null check(ttl_days between 1 and 90),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, revoked_by uuid references auth.users(id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id),
 unique(organization_id,created_by,operation_id),
 check(expires_at>created_at), check((revoked_at is null)=(revoked_by is null))
);
alter table hvac_private.report_links enable row level security;
revoke all on hvac_private.report_links from public,anon,authenticated,service_role;
grant select,insert,update on hvac_private.report_links to hvac_identity_executor;
create policy executor_access on hvac_private.report_links to hvac_identity_executor using(true) with check(true);
create index report_links_revision_idx on hvac_private.report_links(organization_id,revision_id,created_at desc);
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
grant create on schema public,hvac_private to hvac_identity_executor;

create function public.create_report_link(p_organization_id uuid,p_revision_id uuid,p_operation_id uuid,p_token_hash text,p_ttl_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); link hvac_private.report_links;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 if p_operation_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_ttl_days is null or p_ttl_days not between 1 and 90 then raise exception 'invalid_link' using errcode='22023';end if;
 if not exists(select 1 from hvac_private.render_jobs j join hvac_private.report_artifacts a on a.organization_id=j.organization_id and a.revision_id=j.revision_id where j.organization_id=p_organization_id and j.revision_id=p_revision_id and j.state='ready') then raise exception 'report_not_ready' using errcode='PT409';end if;
 select * into link from hvac_private.report_links where organization_id=p_organization_id and created_by=actor and operation_id=p_operation_id;
 if found then
  if link.revision_id<>p_revision_id or link.token_hash<>p_token_hash or link.ttl_days<>p_ttl_days then raise exception 'operation_conflict' using errcode='PT409';end if;
 else
  insert into hvac_private.report_links(organization_id,revision_id,token_hash,created_by,operation_id,ttl_days,expires_at)
  values(p_organization_id,p_revision_id,p_token_hash,actor,p_operation_id,p_ttl_days,now()+make_interval(days=>p_ttl_days)) returning * into link;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_link_created',link.id);
 end if;
 return jsonb_build_object('id',link.id,'expiresAt',link.expires_at,'revokedAt',link.revoked_at);
end $$;
create function public.report_links(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) or not exists(select 1 from public.report_revisions where organization_id=p_organization_id and id=p_revision_id) then raise exception 'report_denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'expired',expires_at<=now()) order by created_at desc,id) from (select * from hvac_private.report_links where organization_id=p_organization_id and revision_id=p_revision_id order by created_at desc,id limit 50) links),'[]'::jsonb);
end $$;
create function public.revoke_report_link(p_organization_id uuid,p_link_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();link hvac_private.report_links;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select * into link from hvac_private.report_links where organization_id=p_organization_id and id=p_link_id for update;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 if link.revoked_at is null then
  update hvac_private.report_links set revoked_at=now(),revoked_by=actor where id=link.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_link_revoked',link.id);
 end if;
end $$;

-- Raw capability is hashed inside the boundary. A database digest is not a bearer token.
create function public.guest_report(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null;end if;
 select jsonb_build_object('linkId',l.id,'revisionId',r.id,'expiresAt',l.expires_at,'data',r.snapshot,
 'artifact',jsonb_build_object('path',a.storage_path,'sha256',a.sha256,'size',a.size_bytes)) into result
 from hvac_private.report_links l join public.report_revisions r on r.organization_id=l.organization_id and r.id=l.revision_id
 join hvac_private.report_artifacts a on a.organization_id=r.organization_id and a.revision_id=r.id
 join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id
 where l.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and l.revoked_at is null and l.expires_at>now() and j.state='ready';
 return result;
end $$;
create function hvac_private.guest_pdf_read(object_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare token text;begin
 -- This release supplies operation and headers for each Storage transaction.
 -- No listing, metadata probes, S3 access or durable signed URLs via this policy.
 if coalesce(current_setting('storage.operation',true),'')<>'storage.object.get_authenticated' then return false;end if;
 token:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-report-token';
 if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then return false;end if;
 return exists(select 1 from hvac_private.report_links l join hvac_private.report_artifacts a on a.organization_id=l.organization_id and a.revision_id=l.revision_id
 join hvac_private.render_jobs j on j.organization_id=a.organization_id and j.revision_id=a.revision_id
 where l.token_hash=encode(extensions.digest(token,'sha256'),'hex') and l.revoked_at is null and l.expires_at>now() and j.state='ready' and a.storage_path=object_name);
end $$;

do $$ declare signature text;begin
 foreach signature in array array['public.create_report_link(uuid,uuid,uuid,text,integer)','public.report_links(uuid,uuid)','public.revoke_report_link(uuid,uuid)','public.guest_report(text)','hvac_private.guest_pdf_read(text)'] loop
 execute 'alter function '||signature||' owner to hvac_identity_executor';
 execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role';
 execute 'grant execute on function '||signature||' to authenticated';
 end loop;
end $$;
grant execute on function public.guest_report(text),hvac_private.guest_pdf_read(text) to anon;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
