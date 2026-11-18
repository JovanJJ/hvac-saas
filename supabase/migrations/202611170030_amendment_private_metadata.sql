-- One customer projection also permits equality checks without dropping private operational metadata.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create function hvac_private.report_readings(values_json jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',r->'kind','mode',r->'mode','status',r->'status','value',r->'value','unit',r->'unit') order by pos),'[]'::jsonb) from jsonb_array_elements(values_json) with ordinality e(r,pos);
$$;
create function hvac_private.report_parts(values_json jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('name',r->'name','quantity',r->'quantity','unit',r->'unit') order by pos),'[]'::jsonb) from jsonb_array_elements(values_json) with ordinality e(r,pos);
$$;
alter function hvac_private.report_readings(jsonb) owner to hvac_identity_executor;
alter function hvac_private.report_parts(jsonb) owner to hvac_identity_executor;
revoke all on function hvac_private.report_readings(jsonb),hvac_private.report_parts(jsonb) from public,anon,authenticated,service_role;
create or replace function hvac_private.customer_report_data(org uuid,target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb:=public.visit_bundle(org,target); company text; items jsonb;
begin
 select display_name into company from public.organizations where id=org;
 select coalesce(jsonb_agg(jsonb_build_object(
  'code',entry->'code','room',entry->'room','model',entry->'model','serial',entry->'serial',
  'planned',entry->'planned','outcome',entry->'outcome','work',entry->'work','finding',entry->'finding',
  'noAccessReason',entry->'noAccessReason',
  'readings',hvac_private.report_readings(entry->'readings'),'parts',hvac_private.report_parts(entry->'parts'),
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
create or replace function public.amend_report(p_organization_id uuid,p_base_revision_id uuid,p_operation_id uuid,p_version integer,p_reason text,p_items jsonb) returns uuid
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
  -- An edit to a finding must not erase private metadata of unchanged readings/parts.
  if hvac_private.report_readings(i.readings)=entry->'readings' then new_value:=jsonb_set(new_value,'{readings}',i.readings);end if;
  if hvac_private.report_parts(i.parts)=entry->'parts' then new_value:=jsonb_set(new_value,'{parts}',i.parts);end if;
  if f is null then raise exception 'invalid_follow_up' using errcode='22023';end if;
  if f<>'null'::jsonb then
   if jsonb_typeof(f) is distinct from 'object' or f-array['kind','ownerId','dueDate','customerAction']<>'{}'::jsonb or jsonb_typeof(f->'kind') is distinct from 'string' or f->>'kind' not in ('quote','repair','revisit') or jsonb_typeof(f->'ownerId') is distinct from 'string' or coalesce(f->>'ownerId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(f->'dueDate') is distinct from 'string' or coalesce(f->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(f->'customerAction') is distinct from 'string' or length(f->>'customerAction')>2000 then raise exception 'invalid_follow_up' using errcode='22023';end if;
   if not exists(select 1 from public.memberships where organization_id=p_organization_id and id=(f->>'ownerId')::uuid and active) then raise exception 'missing_follow_up' using errcode='22023';end if;
   insert into public.follow_ups(organization_id,item_id,kind,owner_id,due_date,customer_action) values(p_organization_id,i.id,f->>'kind',(f->>'ownerId')::uuid,(f->>'dueDate')::date,f->>'customerAction')
    on conflict(organization_id,item_id) do update set kind=excluded.kind,owner_id=excluded.owner_id,due_date=excluded.due_date,customer_action=excluded.customer_action;
  else delete from public.follow_ups where organization_id=p_organization_id and item_id=i.id;end if;
  if old_value<>new_value then
   changes:=changes||jsonb_build_array(jsonb_build_object('itemId',i.id,'enteredBy',i.entered_by,'enteredAt',i.entered_at,'before',old_value,'after',new_value));
   update public.visit_items set outcome=entry->>'outcome',work=entry->>'work',finding=entry->>'finding',no_access_reason=entry->>'noAccessReason',readings=new_value->'readings',parts=new_value->'parts',version=version+1,corrected_by=actor,corrected_at=clock_timestamp() where organization_id=p_organization_id and id=i.id;
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

create or replace function public.report_amendment(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base public.report_revisions;b jsonb;items jsonb;begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501';end if;
 select * into base from public.report_revisions where organization_id=p_organization_id and id=p_revision_id;
 if not found then raise exception 'report_denied' using errcode='42501';end if;
 if exists(select 1 from public.report_revisions where organization_id=p_organization_id and visit_id=base.visit_id and revision_no>base.revision_no) then raise exception 'stale_revision' using errcode='PT409';end if;
 b:=public.visit_bundle(p_organization_id,base.visit_id);
 if (select count(*) from hvac_private.report_item_bindings where organization_id=p_organization_id and revision_id=base.id)<>jsonb_array_length(b->'items') then raise exception 'legacy_binding_unavailable' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('itemId',e->'id','version',e->'version','outcome',e->'outcome','work',e->'work','finding',e->'finding','noAccessReason',e->'noAccessReason','readings',hvac_private.report_readings(e->'readings'),'parts',hvac_private.report_parts(e->'parts'),'followUp',e->'followUp') order by binding.position) into items
 from jsonb_array_elements(b->'items') e join hvac_private.report_item_bindings binding on binding.item_id=(e->>'id')::uuid and binding.revision_id=base.id and binding.organization_id=p_organization_id;
 return jsonb_build_object('visitVersion',b->'version','items',items,'staff',b->'staff');
end $$;

revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
