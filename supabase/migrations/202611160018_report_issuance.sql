-- Revision data is append-only for runtime roles; job state is kept separately.
alter table public.visits drop constraint visits_status_check;
alter table public.visits add constraint visits_status_check check(status in ('scheduled','in_progress','submitted','issued'));

create table public.report_revisions(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 visit_id uuid not null, revision_no integer not null check(revision_no>0),
 report_number text not null, snapshot jsonb not null,
 locale text not null check(locale='sr-Latn-RS'), template_version text not null,
 issued_at timestamptz not null, issued_by uuid not null references auth.users(id),
 unique(organization_id,id), unique(organization_id,visit_id,revision_no),
 unique(organization_id,report_number,revision_no),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
create index report_revisions_office_idx on public.report_revisions(organization_id,issued_at desc);
alter table public.report_revisions enable row level security;
revoke all on public.report_revisions from public,anon,authenticated,service_role;
grant select on public.report_revisions to authenticated;
create policy office_read on public.report_revisions for select to authenticated using(hvac_private.has_workspace_role(organization_id,array['owner','coordinator']));
create policy executor_read on public.report_revisions for select to hvac_identity_executor using(true);
create policy executor_insert on public.report_revisions for insert to hvac_identity_executor with check(true);
grant select,insert on public.report_revisions to hvac_identity_executor;

create table hvac_private.report_counters(
 organization_id uuid not null references public.organizations(id), year integer not null,
 last_number bigint not null check(last_number>0), primary key(organization_id,year)
);
create table hvac_private.render_jobs(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 revision_id uuid not null, logical_key text not null unique,
 kind text not null default 'report_pdf' check(kind='report_pdf'),
 state text not null default 'queued' check(state='queued'),
 created_at timestamptz not null default now(),
 unique(organization_id,revision_id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id)
);
create index render_jobs_queue_idx on hvac_private.render_jobs(state,created_at);
create table hvac_private.report_issue_receipts(
 organization_id uuid not null, actor_id uuid not null, operation_id uuid not null,
 visit_id uuid not null, base_version integer not null, revision_id uuid not null,
 primary key(organization_id,actor_id,operation_id),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id)
);
revoke all on hvac_private.report_counters,hvac_private.render_jobs,hvac_private.report_issue_receipts from public,anon,authenticated,service_role;
grant select,insert,update on hvac_private.report_counters to hvac_identity_executor;
grant select,insert on hvac_private.render_jobs,hvac_private.report_issue_receipts to hvac_identity_executor;

do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
grant create on schema public,hvac_private to hvac_identity_executor;

-- The single allowlist used by both live preview and issuance. No caller DTO is trusted.
create function hvac_private.customer_report_data(org uuid,target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb:=public.visit_bundle(org,target); company text; items jsonb;
begin
 select display_name into company from public.organizations where id=org;
 select coalesce(jsonb_agg(jsonb_build_object(
  'code',entry->'code','room',entry->'room','model',entry->'model','serial',entry->'serial',
  'planned',entry->'planned','outcome',entry->'outcome','work',entry->'work','finding',entry->'finding',
  'noAccessReason',entry->'noAccessReason',
  'readings',coalesce((select jsonb_agg(jsonb_build_object('kind',r->'kind','mode',r->'mode','status',r->'status','value',r->'value','unit',r->'unit')) from jsonb_array_elements(entry->'readings') r),'[]'),
  'parts',coalesce((select jsonb_agg(jsonb_build_object('name',p->'name','quantity',p->'quantity','unit',p->'unit')) from jsonb_array_elements(entry->'parts') p),'[]'),
  'followUp',case when entry->'followUp'='null'::jsonb then null else jsonb_build_object(
    'kind',entry->'followUp'->'kind','owner',coalesce((select staff->>'label' from jsonb_array_elements(b->'staff') staff where staff->>'id'=entry->'followUp'->>'ownerId'),''),
    'dueDate',entry->'followUp'->'dueDate','customerAction',entry->'followUp'->'customerAction') end,
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'caption',a.caption,'width',a.width,'height',a.height,
    'provider','cloudinary','deliveryType','authenticated','publicId','hvac/'||a.organization_id||'/'||a.id,
    'assetId',a.asset_id,'assetVersion',a.asset_version,'format',a.format,'bytes',a.verified_bytes) order by a.created_at,a.id)
    from public.attachments a where a.organization_id=org and a.visit_id=target and a.item_id=(entry->>'id')::uuid and a.state='verified' and a.visibility='customer'),'[]')
 ) order by position),'[]') into items from jsonb_array_elements(b->'items') with ordinality e(entry,position);
 return jsonb_build_object('schemaVersion',1,'templateVersion','service-report-v1','locale','sr-Latn-RS',
  'branding',jsonb_build_object('displayName',company,'logo',null,'accentColor','#165d4c'),
  'company',company,'visitId',target,'reference',target,'revision',null,'issuedAt',null,'issuer',null,
  'customer',b->'customer','contact',b->'contact','site',b->'site','address',b->'address',
  'start',b->'start','actualStart',b->'startedAt','timeZone',b->'timeZone','visitType',b->'visitType',
  'technicians',b->'technicians','completedAt',b->'submittedAt',
  'totals',jsonb_build_object('planned',(select count(*) from jsonb_array_elements(items) i where (i->>'planned')::boolean),
    'inspected',(select count(*) from jsonb_array_elements(items) i where i->>'outcome' in ('serviced','repair_needed')),
    'actions',(select count(*) from jsonb_array_elements(items) i where i->'followUp'<>'null'::jsonb)), 'items',items);
end $$;
alter function hvac_private.customer_report_data(uuid,uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.customer_report_data(uuid,uuid) from public,anon,authenticated,service_role;

create function public.report_preview(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v public.visits; r public.report_revisions;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501'; end if;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id;
 if not found then raise exception 'report_denied' using errcode='42501'; end if;
 select * into r from public.report_revisions where organization_id=p_organization_id and visit_id=v.id order by revision_no desc limit 1;
 return jsonb_build_object('visitVersion',v.version,'revisionId',r.id,'data',case when r.id is null then hvac_private.customer_report_data(p_organization_id,v.id) else r.snapshot end);
end $$;

create function public.issue_report(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); v public.visits; receipt hvac_private.report_issue_receipts;
 revision_id uuid; revision_snapshot jsonb; zone text; report_year integer; sequence_no bigint; number text;
 issued_time timestamptz:=transaction_timestamp(); item public.visit_items; reading jsonb; part jsonb;
begin
 -- Same lock order as membership, field and photo commands. Reauthorize before replay.
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501'; end if;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found then raise exception 'report_denied' using errcode='42501'; end if;
 if p_operation_id is null or p_version is null or p_version<1 then raise exception 'invalid_issue' using errcode='22023'; end if;
 select * into receipt from hvac_private.report_issue_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if receipt.visit_id<>v.id or receipt.base_version<>p_version then raise exception 'operation_conflict' using errcode='PT409'; end if;
  return receipt.revision_id;
 end if;
 -- Simultaneous first-issue requests (including different operation IDs) converge.
 select id into revision_id from public.report_revisions where organization_id=p_organization_id and visit_id=v.id and revision_no=1;
 if revision_id is null then
  if v.version<>p_version then raise exception 'stale_version' using errcode='PT409'; end if;
  if v.status<>'submitted' then raise exception 'visit_not_submitted' using errcode='22023'; end if;
  if not exists(select 1 from public.visit_items where organization_id=p_organization_id and visit_id=v.id) then raise exception 'invalid_findings' using errcode='22023'; end if;
  for item in select * from public.visit_items where organization_id=p_organization_id and visit_id=v.id for update loop
   if item.outcome not in ('serviced','repair_needed','no_access') or item.entered_by is null or item.entered_at is null or jsonb_typeof(item.readings) is distinct from 'array' or jsonb_typeof(item.parts) is distinct from 'array' or jsonb_array_length(item.readings)>10 or jsonb_array_length(item.parts)>20 then raise exception 'invalid_findings' using errcode='22023'; end if;
   if item.outcome='repair_needed' and length(trim(item.finding))=0 then raise exception 'invalid_findings' using errcode='22023'; end if;
   if item.outcome='no_access' and (length(trim(item.no_access_reason))=0 or length(trim(item.work))>0 or jsonb_array_length(item.parts)>0) then raise exception 'invalid_findings' using errcode='22023'; end if;
   for reading in select value from jsonb_array_elements(item.readings) loop
    if coalesce(reading->>'status','') not in ('measured','not_measured','not_applicable') or length(trim(coalesce(reading->>'kind','')))=0 or length(trim(coalesce(reading->>'mode','')))=0 then raise exception 'invalid_reading' using errcode='22023'; end if;
    if reading->>'status'='measured' then
     if jsonb_typeof(reading->'value') is distinct from 'number' or length(trim(coalesce(reading->>'unit','')))=0 or item.outcome='no_access' then raise exception 'invalid_reading' using errcode='22023'; end if;
    elsif reading->'value' is distinct from 'null'::jsonb then raise exception 'invalid_reading' using errcode='22023'; end if;
   end loop;
   for part in select value from jsonb_array_elements(item.parts) loop
    if length(trim(coalesce(part->>'name','')))=0 or jsonb_typeof(part->'quantity') is distinct from 'number' or (part->>'quantity')::numeric<=0 or length(trim(coalesce(part->>'unit','')))=0 then raise exception 'invalid_part' using errcode='22023'; end if;
   end loop;
  end loop;
  if exists(select 1 from public.visit_items vi left join public.follow_ups f on f.item_id=vi.id and f.organization_id=p_organization_id left join public.memberships m on m.id=f.owner_id and m.organization_id=p_organization_id and m.active where vi.organization_id=p_organization_id and vi.visit_id=v.id and ((vi.outcome in ('repair_needed','no_access') and f.id is null) or (f.id is not null and (m.id is null or f.due_date is null)))) then raise exception 'missing_follow_up' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=p_organization_id and visit_id=v.id and state='reserved') then raise exception 'pending_attachments' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=p_organization_id and visit_id=v.id and state='verified' and (asset_id is null or asset_version is null or format is null or format not in ('jpg','png','webp') or verified_bytes is null or width is null or height is null or width<1 or height<1 or width::bigint*height::bigint>40000000)) then raise exception 'invalid_evidence' using errcode='22023'; end if;
  select time_zone into zone from public.organizations where id=p_organization_id;
  report_year:=extract(year from issued_time at time zone zone)::integer;
  insert into hvac_private.report_counters values(p_organization_id,report_year,1)
   on conflict(organization_id,year) do update set last_number=hvac_private.report_counters.last_number+1 returning last_number into sequence_no;
  number:='RN-'||report_year||'-'||lpad(sequence_no::text,greatest(4,length(sequence_no::text)),'0');
  revision_snapshot:=hvac_private.customer_report_data(p_organization_id,v.id)||jsonb_build_object('reference',number,'revision',1,'issuedAt',issued_time,'issuer',hvac_private.actor_email());
  insert into public.report_revisions(organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by)
   values(p_organization_id,v.id,1,number,revision_snapshot,'sr-Latn-RS','service-report-v1',issued_time,actor) returning id into revision_id;
  insert into hvac_private.render_jobs(organization_id,revision_id,logical_key) values(p_organization_id,revision_id,'report-pdf:'||revision_id);
  update public.visits set status='issued',version=version+1 where id=v.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_issued',revision_id);
 end if;
 insert into hvac_private.report_issue_receipts values(p_organization_id,actor,p_operation_id,v.id,p_version,revision_id);
 return revision_id;
end $$;

create function public.report_revision(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501'; end if;
 select jsonb_build_object('id',r.id,'visitId',r.visit_id,'issuedBy',r.issued_by,'issuedAt',r.issued_at,'revision',r.revision_no,'renderState',j.state,'data',r.snapshot) into result
 from public.report_revisions r join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id where r.organization_id=p_organization_id and r.id=p_revision_id;
 if result is null then raise exception 'report_denied' using errcode='42501'; end if;
 return result;
end $$;
create function public.report_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(t order by t."issuedAt" desc) from (select r.id,r.report_number as number,r.snapshot->>'site' as site,r.issued_at as "issuedAt",j.state as "renderState" from public.report_revisions r join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id where r.organization_id=p_organization_id order by r.issued_at desc limit 20) t),'[]');
end $$;

alter function public.report_preview(uuid,uuid) owner to hvac_identity_executor;
alter function public.issue_report(uuid,uuid,uuid,integer) owner to hvac_identity_executor;
alter function public.report_revision(uuid,uuid) owner to hvac_identity_executor;
alter function public.report_list(uuid) owner to hvac_identity_executor;
revoke all on function public.report_preview(uuid,uuid),public.issue_report(uuid,uuid,uuid,integer),public.report_revision(uuid,uuid),public.report_list(uuid) from public,anon,authenticated,service_role;
grant execute on function public.report_preview(uuid,uuid),public.issue_report(uuid,uuid,uuid,integer),public.report_revision(uuid,uuid),public.report_list(uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
