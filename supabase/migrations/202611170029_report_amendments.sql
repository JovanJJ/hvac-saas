-- Private binding preserves stable item identity without putting database IDs in customer snapshots.
alter table public.visit_items add column corrected_by uuid references auth.users(id),add column corrected_at timestamptz;
create table hvac_private.report_item_bindings(
 organization_id uuid not null,revision_id uuid not null,item_id uuid not null,position integer not null check(position>0),
 primary key(revision_id,item_id),unique(revision_id,position),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id),
 foreign key(organization_id,item_id) references public.visit_items(organization_id,id)
);
-- Legacy snapshots have no item IDs: backfill only a complete, unambiguous code match.
with candidates as (
 select r.organization_id,r.id revision_id,i.id item_id,e.position::integer,
 count(*) over(partition by r.id) matched,jsonb_array_length(r.snapshot->'items') expected
 from public.report_revisions r cross join lateral jsonb_array_elements(r.snapshot->'items') with ordinality e(item,position)
 join public.visit_items i on i.organization_id=r.organization_id and i.visit_id=r.visit_id
 join public.systems s on s.organization_id=i.organization_id and s.id=i.system_id and s.code=e.item->>'code'
) insert into hvac_private.report_item_bindings select organization_id,revision_id,item_id,position from candidates where matched=expected;
create table hvac_private.report_amendments(
 organization_id uuid not null,revision_id uuid primary key,previous_revision_id uuid not null,
 actor_id uuid not null references auth.users(id),reason text not null check(length(trim(reason)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),changes jsonb not null,
 unique(previous_revision_id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id),
 foreign key(organization_id,previous_revision_id) references public.report_revisions(organization_id,id)
);
create table hvac_private.report_amendment_receipts(
 organization_id uuid not null,actor_id uuid not null references auth.users(id),operation_id uuid not null,
 payload_hash text not null,revision_id uuid not null,
 primary key(organization_id,actor_id,operation_id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id)
);
revoke all on hvac_private.report_item_bindings,hvac_private.report_amendments,hvac_private.report_amendment_receipts from public,anon,authenticated,service_role;
grant select,insert on hvac_private.report_item_bindings,hvac_private.report_amendments,hvac_private.report_amendment_receipts to hvac_identity_executor;
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create function hvac_private.validate_report_visit(org uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item public.visit_items;reading jsonb;part jsonb;begin
  if not exists(select 1 from public.visit_items where organization_id=org and visit_id=target) then raise exception 'invalid_findings' using errcode='22023'; end if;
  for item in select * from public.visit_items where organization_id=org and visit_id=target for update loop
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
  if exists(select 1 from public.visit_items vi left join public.follow_ups f on f.item_id=vi.id and f.organization_id=org left join public.memberships m on m.id=f.owner_id and m.organization_id=org and m.active where vi.organization_id=org and vi.visit_id=target and ((vi.outcome in ('repair_needed','no_access') and f.id is null) or (f.id is not null and (m.id is null or f.due_date is null)))) then raise exception 'missing_follow_up' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=org and visit_id=target and state='reserved') then raise exception 'pending_attachments' using errcode='22023'; end if;
  if exists(select 1 from public.attachments where organization_id=org and visit_id=target and state='verified' and (asset_id is null or length(trim(asset_id))=0 or asset_version is null or asset_version<1 or format is null or format not in ('jpg','png','webp') or verified_bytes is null or width is null or height is null or width<1 or height<1 or width::bigint*height::bigint>40000000)) then raise exception 'invalid_evidence' using errcode='22023'; end if;

end $$;
alter function hvac_private.validate_report_visit(uuid,uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.validate_report_visit(uuid,uuid) from public,anon,authenticated,service_role;
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
  perform hvac_private.validate_report_visit(p_organization_id,v.id);
  select time_zone into zone from public.organizations where id=p_organization_id;
  report_year:=extract(year from issued_time at time zone zone)::integer;
  insert into hvac_private.report_counters values(p_organization_id,report_year,1)
   on conflict(organization_id,year) do update set last_number=hvac_private.report_counters.last_number+1 returning last_number into sequence_no;
  number:='RN-'||report_year||'-'||lpad(sequence_no::text,greatest(4,length(sequence_no::text)),'0');
  revision_snapshot:=hvac_private.customer_report_data(p_organization_id,v.id)||jsonb_build_object('reference',number,'revision',1,'issuedAt',issued_time,'issuer',hvac_private.actor_email());
  insert into public.report_revisions(organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by)
   values(p_organization_id,v.id,1,number,revision_snapshot,'sr-Latn-RS','service-report-v1',issued_time,actor) returning id into revision_id;
  insert into hvac_private.report_item_bindings(organization_id,revision_id,item_id,position)
   select p_organization_id,revision_id,i.id,row_number() over(order by sys.code)::integer from public.visit_items i join public.systems sys on sys.id=i.system_id and sys.organization_id=i.organization_id where i.organization_id=p_organization_id and i.visit_id=v.id;
  insert into hvac_private.render_jobs(organization_id,revision_id,logical_key) values(p_organization_id,revision_id,'report-pdf:'||revision_id);
  update public.visits set status='issued',version=version+1 where id=v.id;
  insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_issued',revision_id);
 end if;
 insert into hvac_private.report_issue_receipts values(p_organization_id,actor,p_operation_id,v.id,p_version,revision_id);
 return revision_id;
end $$;
create or replace function public.visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); result jsonb;
begin
 if not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501'; end if;
 select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason,
 'technicians',coalesce((select jsonb_agg(st.email order by st.email) from public.visit_assignees a join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=v.id),'[]'),'site',s.name,'address',s.address,'accessNote',s.access_note,'customer',c.name,'contact',c.contact,'timeZone',s.time_zone,'start',v.scheduled_at,'visitType',v.visit_type,
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'label',m.email)) from hvac_private.visit_staff(p_organization_id,p_visit_id) m),'[]'),
 'availableSystems',coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'room',sys.room)) from public.systems sys where sys.organization_id=p_organization_id and sys.site_id=v.site_id and not exists(select 1 from public.visit_items i where i.visit_id=v.id and i.system_id=sys.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'version',i.version,'planned',i.planned,'code',sys.code,'room',sys.room,'model',sys.model,'serial',sys.serial,'outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'internalNote',i.internal_note,'readings',i.readings,'parts',i.parts,'enteredByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.entered_by),'correctedAt',i.corrected_at,'correctedByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.corrected_by),'enteredBy',i.entered_by,'enteredAt',i.entered_at,'followUp',(select jsonb_build_object('kind',f.kind,'ownerId',f.owner_id,'dueDate',f.due_date,'customerAction',f.customer_action) from public.follow_ups f where f.item_id=i.id)) order by sys.code) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.organization_id=p_organization_id and i.visit_id=v.id),'[]')) into result
 from public.visits v join public.sites s on s.id=v.site_id join public.customers c on c.id=s.customer_id where v.organization_id=p_organization_id and v.id=p_visit_id;
 if result is null then raise exception 'visit_denied' using errcode='42501'; end if;
 return result;
end $$;

create function public.amend_report(p_organization_id uuid,p_base_revision_id uuid,p_operation_id uuid,p_version integer,p_reason text,p_items jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();base public.report_revisions;v public.visits;i public.visit_items;
 receipt hvac_private.report_amendment_receipts;payload_hash text;entry jsonb;f jsonb;binding record;old_value jsonb;new_value jsonb;changes jsonb:='[]';
 updated_items jsonb:='[]';snapshot jsonb;live_items jsonb;live_item jsonb;new_id uuid:=gen_random_uuid();issued_time timestamptz;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select * into base from public.report_revisions where organization_id=p_organization_id and id=p_base_revision_id;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 select * into v from public.visits where organization_id=p_organization_id and id=base.visit_id for update;
 if p_operation_id is null or p_version is null or p_version<1 or p_reason is null or length(trim(p_reason)) not between 1 and 2000 or jsonb_typeof(p_items) is distinct from 'array' or octet_length(p_items::text)>524288 then raise exception 'invalid_amendment' using errcode='22023';end if;
 payload_hash:=encode(extensions.digest(jsonb_build_object('base',base.id,'version',p_version,'reason',trim(p_reason),'items',p_items)::text,'sha256'),'hex');
 select * into receipt from hvac_private.report_amendment_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if receipt.payload_hash<>payload_hash then raise exception 'operation_conflict' using errcode='PT409';end if;
  return receipt.revision_id;
 end if;
 if v.status<>'issued' or v.version<>p_version or exists(select 1 from public.report_revisions where organization_id=p_organization_id and visit_id=v.id and revision_no>base.revision_no) then raise exception 'stale_revision' using errcode='PT409';end if;
 if jsonb_array_length(p_items) not between 1 and 500 or jsonb_array_length(p_items)<>(select count(*) from public.visit_items where organization_id=p_organization_id and visit_id=v.id)
 or jsonb_array_length(p_items)<>(select count(*) from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id)
 or (select count(distinct e->>'itemId') from jsonb_array_elements(p_items) e)<>jsonb_array_length(p_items) then raise exception 'incomplete_replacement' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(entry) is distinct from 'object' or entry-array['itemId','version','outcome','work','finding','noAccessReason','readings','parts','followUp']<>'{}'::jsonb
   or jsonb_typeof(entry->'itemId') is distinct from 'string' or coalesce(entry->>'itemId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or jsonb_typeof(entry->'version') is distinct from 'number' then raise exception 'invalid_item' using errcode='22023';end if;
  select vi.* into i from public.visit_items vi join hvac_private.report_item_bindings b on b.organization_id=vi.organization_id and b.item_id=vi.id and b.revision_id=base.id where vi.organization_id=p_organization_id and vi.visit_id=v.id and vi.id=(entry->>'itemId')::uuid for update of vi;
  if not found then raise exception 'invalid_item' using errcode='22023';end if;
  if i.version::numeric<>(entry->>'version')::numeric then raise exception 'stale_item' using errcode='PT409';end if;
  if jsonb_typeof(entry->'outcome') is distinct from 'string' or entry->>'outcome' not in ('serviced','repair_needed','no_access') then raise exception 'invalid_outcome' using errcode='22023';end if;
  if jsonb_typeof(entry->'work') is distinct from 'string' or length(entry->>'work')>2000 or jsonb_typeof(entry->'finding') is distinct from 'string' or length(entry->>'finding')>2000 or jsonb_typeof(entry->'noAccessReason') is distinct from 'string' or length(entry->>'noAccessReason')>2000 then raise exception 'invalid_details' using errcode='22023';end if;
  old_value:=jsonb_build_object('outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'readings',i.readings,'parts',i.parts,'followUp',(select jsonb_build_object('kind',fu.kind,'ownerId',fu.owner_id,'dueDate',fu.due_date,'customerAction',fu.customer_action) from public.follow_ups fu where fu.organization_id=p_organization_id and fu.item_id=i.id));
  new_value:=entry-array['itemId','version'];f:=entry->'followUp';
  if f is null then raise exception 'invalid_follow_up' using errcode='22023';end if;
  if f<>'null'::jsonb then
   if jsonb_typeof(f) is distinct from 'object' or f-array['kind','ownerId','dueDate','customerAction']<>'{}'::jsonb or jsonb_typeof(f->'kind') is distinct from 'string' or f->>'kind' not in ('quote','repair','revisit') or jsonb_typeof(f->'ownerId') is distinct from 'string' or coalesce(f->>'ownerId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(f->'dueDate') is distinct from 'string' or coalesce(f->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(f->'customerAction') is distinct from 'string' or length(f->>'customerAction')>2000 then raise exception 'invalid_follow_up' using errcode='22023';end if;
   if not exists(select 1 from public.memberships where organization_id=p_organization_id and id=(f->>'ownerId')::uuid and active) then raise exception 'missing_follow_up' using errcode='22023';end if;
   insert into public.follow_ups(organization_id,item_id,kind,owner_id,due_date,customer_action) values(p_organization_id,i.id,f->>'kind',(f->>'ownerId')::uuid,(f->>'dueDate')::date,f->>'customerAction')
    on conflict(organization_id,item_id) do update set kind=excluded.kind,owner_id=excluded.owner_id,due_date=excluded.due_date,customer_action=excluded.customer_action;
  else delete from public.follow_ups where organization_id=p_organization_id and item_id=i.id;end if;
  if old_value<>new_value then
   changes:=changes||jsonb_build_array(jsonb_build_object('itemId',i.id,'enteredBy',i.entered_by,'enteredAt',i.entered_at,'before',old_value,'after',new_value));
   update public.visit_items set outcome=entry->>'outcome',work=entry->>'work',finding=entry->>'finding',no_access_reason=entry->>'noAccessReason',readings=entry->'readings',parts=entry->'parts',version=version+1,corrected_by=actor,corrected_at=clock_timestamp() where organization_id=p_organization_id and id=i.id;
  end if;
 end loop;
 perform hvac_private.validate_report_visit(p_organization_id,v.id);
 if changes='[]'::jsonb then raise exception 'no_corrections' using errcode='22023';end if;
 -- Reuse the canonical field mapping, but retain frozen identities/evidence from the predecessor.
 live_items:=hvac_private.customer_report_data(p_organization_id,v.id)->'items';
 for binding in select b.position,b.item_id,s.code from hvac_private.report_item_bindings b join public.visit_items vi on vi.organization_id=b.organization_id and vi.id=b.item_id join public.systems s on s.organization_id=vi.organization_id and s.id=vi.system_id where b.organization_id=p_organization_id and b.revision_id=base.id order by b.position loop
  select value into live_item from jsonb_array_elements(live_items) where value->>'code'=binding.code;
  updated_items:=updated_items||jsonb_build_array((base.snapshot->'items'->(binding.position-1))||jsonb_build_object('outcome',live_item->'outcome','work',live_item->'work','finding',live_item->'finding','noAccessReason',live_item->'noAccessReason','readings',live_item->'readings','parts',live_item->'parts','followUp',live_item->'followUp'));
 end loop;
 issued_time:=clock_timestamp();
 snapshot:=base.snapshot||jsonb_build_object('templateVersion','service-report-v2','revision',base.revision_no+1,'issuedAt',issued_time,'issuer',hvac_private.actor_email(),
 'amendment',jsonb_build_object('reason',trim(p_reason),'previousRevision',base.revision_no),'items',updated_items,
 'totals',jsonb_build_object('planned',(select count(*) from jsonb_array_elements(updated_items) e where (e->>'planned')::boolean),'inspected',(select count(*) from jsonb_array_elements(updated_items) e where e->>'outcome' in ('serviced','repair_needed')),'actions',(select count(*) from jsonb_array_elements(updated_items) e where e->'followUp'<>'null'::jsonb)));
 insert into public.report_revisions(id,organization_id,visit_id,revision_no,report_number,snapshot,locale,template_version,issued_at,issued_by) values(new_id,p_organization_id,v.id,base.revision_no+1,base.report_number,snapshot,base.locale,'service-report-v2',issued_time,actor);
 insert into hvac_private.report_item_bindings select organization_id,new_id,item_id,position from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id;
 insert into hvac_private.report_amendments(organization_id,revision_id,previous_revision_id,actor_id,reason,changes) values(p_organization_id,new_id,base.id,actor,trim(p_reason),changes);
 insert into hvac_private.render_jobs(organization_id,revision_id,logical_key) values(p_organization_id,new_id,'report-pdf:'||new_id);
 update public.visits set version=version+1 where organization_id=p_organization_id and id=v.id;
 insert into hvac_private.identity_events(organization_id,actor_id,event_type,subject_id) values(p_organization_id,actor,'report_amended',new_id);
 insert into hvac_private.report_amendment_receipts values(p_organization_id,actor,p_operation_id,payload_hash,new_id);
 return new_id;
end $$;

create function public.report_amendment(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base public.report_revisions;b jsonb;items jsonb;begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select * into base from public.report_revisions where organization_id=p_organization_id and id=p_revision_id;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 if exists(select 1 from public.report_revisions where organization_id=p_organization_id and visit_id=base.visit_id and revision_no>base.revision_no) then raise exception 'stale_revision' using errcode='PT409';end if;
 b:=public.visit_bundle(p_organization_id,base.visit_id);
 if (select count(*) from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id)<>jsonb_array_length(b->'items') then raise exception 'legacy_binding_unavailable' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('itemId',e->'id','version',e->'version','outcome',e->'outcome','work',e->'work','finding',e->'finding','noAccessReason',e->'noAccessReason','readings',e->'readings','parts',e->'parts','followUp',e->'followUp') order by binding.position) into items
 from jsonb_array_elements(b->'items') e join hvac_private.report_item_bindings binding on binding.item_id=(e->>'id')::uuid and binding.revision_id=base.id and binding.organization_id=p_organization_id;
 return jsonb_build_object('visitVersion',b->'version','items',items,'staff',b->'staff');
end $$;

create or replace function public.report_revision(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select jsonb_build_object('id',r.id,'visitId',r.visit_id,'issuedBy',r.issued_by,'issuedAt',r.issued_at,'revision',r.revision_no,'renderState',j.state,
 'latestRevisionId',(select rr.id from public.report_revisions rr where rr.organization_id=r.organization_id and rr.visit_id=r.visit_id order by rr.revision_no desc limit 1),'previousRevisionId',am.previous_revision_id,'reason',am.reason,
 'history',(select jsonb_agg(jsonb_build_object('id',rr.id,'revision',rr.revision_no,'issuedAt',rr.issued_at,'reason',aa.reason) order by rr.revision_no) from public.report_revisions rr left join hvac_private.report_amendments aa on aa.revision_id=rr.id and aa.organization_id=rr.organization_id where rr.organization_id=r.organization_id and rr.visit_id=r.visit_id),
 'attempts',j.attempts,'availableAt',j.available_at,'lastError',j.last_error,
 'artifact',case when a.revision_id is null then null else jsonb_build_object('path',a.storage_path,'sha256',a.sha256,'size',a.size_bytes,'createdAt',a.created_at) end,'data',r.snapshot) into result
 from public.report_revisions r join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id
 left join hvac_private.report_amendments am on am.organization_id=r.organization_id and am.revision_id=r.id
 left join hvac_private.report_artifacts a on a.organization_id=r.organization_id and a.revision_id=r.id where r.organization_id=p_organization_id and r.id=p_revision_id;
 if result is null then raise exception 'report_denied' using errcode='42501';end if;return result;
end $$;

alter function public.amend_report(uuid,uuid,uuid,integer,text,jsonb) owner to hvac_identity_executor;
alter function public.report_amendment(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.amend_report(uuid,uuid,uuid,integer,text,jsonb),public.report_amendment(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.amend_report(uuid,uuid,uuid,integer,text,jsonb),public.report_amendment(uuid,uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
