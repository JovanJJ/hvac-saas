-- Guest receipt is independent of the frozen report, follow-ups and billing.
alter table hvac_private.report_links add constraint report_links_receipt_target_key unique(organization_id,id,revision_id);
create table hvac_private.report_receipts(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 link_id uuid not null unique, revision_id uuid not null,
 recipient_name text not null check(length(trim(recipient_name)) between 1 and 120 and recipient_name=trim(recipient_name)),
 recipient_role text not null check(length(trim(recipient_role)) between 1 and 120 and recipient_role=trim(recipient_role)),
 confirmed_at timestamptz not null default clock_timestamp(),
 method text not null default 'guest_link' check(method='guest_link'),
 statement_version text not null default 'receipt-v1' check(statement_version='receipt-v1'),
 foreign key(organization_id,link_id,revision_id) references hvac_private.report_links(organization_id,id,revision_id)
);
alter table hvac_private.report_receipts enable row level security;
revoke all on hvac_private.report_receipts from public,anon,authenticated,service_role;
grant select,insert on hvac_private.report_receipts to hvac_identity_executor;
create policy executor_read on hvac_private.report_receipts for select to hvac_identity_executor using(true);
create policy executor_insert on hvac_private.report_receipts for insert to hvac_identity_executor with check(true);
create index report_receipts_revision_idx on hvac_private.report_receipts(organization_id,revision_id,confirmed_at);
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create function hvac_private.receipt_data(receipt hvac_private.report_receipts) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',receipt.id,'linkId',receipt.link_id,'revisionId',receipt.revision_id,'name',receipt.recipient_name,'role',receipt.recipient_role,'confirmedAt',receipt.confirmed_at,'method',receipt.method,'statementVersion',receipt.statement_version);
$$;
alter function hvac_private.receipt_data(hvac_private.report_receipts) owner to hvac_identity_executor;
revoke all on function hvac_private.receipt_data(hvac_private.report_receipts) from public,anon,authenticated,service_role;
create function public.acknowledge_report(p_token text,p_name text,p_role text,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link hvac_private.report_links; receipt hvac_private.report_receipts;begin
 if p_token is null or length(p_token)<>43 or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'report_denied' using errcode='42501';end if;
 select * into link from hvac_private.report_links where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 -- Match office command lock order, then recheck live permission after waiting.
 perform 1 from public.organizations where id=link.organization_id for update;
 select * into link from hvac_private.report_links where id=link.id for update;
 if link.revoked_at is not null or link.expires_at<=clock_timestamp() or not exists(select 1 from hvac_private.render_jobs j join hvac_private.report_artifacts a on a.organization_id=j.organization_id and a.revision_id=j.revision_id where j.organization_id=link.organization_id and j.revision_id=link.revision_id and j.state='ready') then raise exception 'report_denied' using errcode='42501';end if;
 if p_acknowledged is distinct from true or p_name is null or length(trim(p_name)) not between 1 and 120 or p_role is null or length(trim(p_role)) not between 1 and 120 then raise exception 'invalid_receipt' using errcode='22023';end if;
 select * into receipt from hvac_private.report_receipts where link_id=link.id;
 if found then
  if receipt.recipient_name<>trim(p_name) or receipt.recipient_role<>trim(p_role) then raise exception 'receipt_already_recorded' using errcode='PT409';end if;
  return hvac_private.receipt_data(receipt);
 end if;
 insert into hvac_private.report_receipts(organization_id,link_id,revision_id,recipient_name,recipient_role)
 values(link.organization_id,link.id,link.revision_id,trim(p_name),trim(p_role)) returning * into receipt;
 return hvac_private.receipt_data(receipt);
end $$;
create function public.report_receipts(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) or not exists(select 1 from public.report_revisions where organization_id=p_organization_id and id=p_revision_id) then raise exception 'report_denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(hvac_private.receipt_data(r) order by r.confirmed_at,r.id) from hvac_private.report_receipts r where r.organization_id=p_organization_id and r.revision_id=p_revision_id),'[]'::jsonb);
end $$;
-- Live receipt belongs to this link only; never mutate or render it into issued bytes.
create or replace function public.guest_report(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_token is null or length(p_token)<>43 or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null;end if;
 select jsonb_build_object('linkId',l.id,'revisionId',r.id,'expiresAt',l.expires_at,'data',r.snapshot,
 'artifact',jsonb_build_object('path',a.storage_path,'sha256',a.sha256,'size',a.size_bytes),
 'receipt',case when receipt.id is null then null else hvac_private.receipt_data(receipt) end) into result
 from hvac_private.report_links l join public.report_revisions r on r.organization_id=l.organization_id and r.id=l.revision_id
 join hvac_private.report_artifacts a on a.organization_id=r.organization_id and a.revision_id=r.id
 join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id
 left join hvac_private.report_receipts receipt on receipt.link_id=l.id and receipt.organization_id=l.organization_id and receipt.revision_id=l.revision_id
 where l.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and l.revoked_at is null and l.expires_at>statement_timestamp() and j.state='ready';
 return result;
end $$;
alter function public.acknowledge_report(text,text,text,boolean) owner to hvac_identity_executor;
alter function public.report_receipts(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.acknowledge_report(text,text,text,boolean),public.report_receipts(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.acknowledge_report(text,text,text,boolean) to anon,authenticated;
grant execute on function public.report_receipts(uuid,uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
