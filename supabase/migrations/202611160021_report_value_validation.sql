-- Reject malformed nested JSON and values that cannot be represented by report consumers.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
create or replace function public.issue_report(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_version integer) returns uuid
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
    if jsonb_typeof(reading->'kind') is distinct from 'string' or jsonb_typeof(reading->'mode') is distinct from 'string' or jsonb_typeof(reading->'status') is distinct from 'string' or (reading->'unit' is not null and reading->'unit'<>'null'::jsonb and jsonb_typeof(reading->'unit')<>'string') or coalesce(reading->>'status','') not in ('measured','not_measured','not_applicable') or length(trim(coalesce(reading->>'kind','')))=0 or length(trim(coalesce(reading->>'mode','')))=0 then raise exception 'invalid_reading' using errcode='22023'; end if;
    if reading->>'status'='measured' then
     if (case when jsonb_typeof(reading->'value')='number' then abs((reading->>'value')::numeric)>1e308 else true end) or length(trim(coalesce(reading->>'unit','')))=0 or item.outcome='no_access' then raise exception 'invalid_reading' using errcode='22023'; end if;
    elsif reading->'value' is distinct from 'null'::jsonb then raise exception 'invalid_reading' using errcode='22023'; end if;
   end loop;
   for part in select value from jsonb_array_elements(item.parts) loop
    if jsonb_typeof(part->'name') is distinct from 'string' or jsonb_typeof(part->'unit') is distinct from 'string' or length(trim(coalesce(part->>'name','')))=0 or (case when jsonb_typeof(part->'quantity')='number' then (part->>'quantity')::numeric<=0 or (part->>'quantity')::numeric>1e308 else true end) or length(trim(coalesce(part->>'unit','')))=0 then raise exception 'invalid_part' using errcode='22023'; end if;
   end loop;
  end loop;
  if exists(select 1 from public.visit_items vi left join public.follow_ups f on f.item_id=vi.id and f.organization_id=p_organization_id left join public.memberships m on m.id=f.owner_id and m.organization_id=p_organization_id and m.active where vi.organization_id=p_organization_id and vi.visit_id=v.id and ((vi.outcome in ('repair_needed','no_access') and f.id is null) or (f.id is not null and (m.id is null or f.due_date is null)))) then raise exception 'missing_follow_up' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=p_organization_id and visit_id=v.id and state='reserved') then raise exception 'pending_attachments' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=p_organization_id and visit_id=v.id and state='verified' and (asset_id is null or length(trim(asset_id))=0 or asset_version is null or asset_version<1 or format is null or format not in ('jpg','png','webp') or verified_bytes is null or width is null or height is null or width<1 or height<1 or width::bigint*height::bigint>40000000)) then raise exception 'invalid_evidence' using errcode='22023'; end if;
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

do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
