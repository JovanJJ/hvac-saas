-- Owner-only, allowlisted current-data exports; no files or export jobs are persisted.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create function hvac_private.export_rows(p_org uuid,p_dataset text,p_site uuid) returns setof jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('organization_id',c.organization_id,'customer_id',c.id,'name',c.name,'contact',c.contact,'version',c.version,'archived_at',c.archived_at)
 from public.customers c where p_dataset='customers' and c.organization_id=p_org and (p_site is null or exists(select 1 from public.sites s where s.organization_id=p_org and s.id=p_site and s.customer_id=c.id))
 union all
 select jsonb_build_object('organization_id',s.organization_id,'customer_id',s.customer_id,'site_id',s.id,'code',s.code,'name',s.name,'address',s.address,'time_zone',s.time_zone,'contact',s.contact,'access_note',s.access_note,'version',s.version,'archived_at',s.archived_at)
 from public.sites s where p_dataset='sites' and s.organization_id=p_org and (p_site is null or s.id=p_site)
 union all
 select jsonb_build_object('organization_id',sys.organization_id,'customer_id',s.customer_id,'site_id',sys.site_id,'system_id',sys.id,'code',sys.code,'room',sys.room,'system_type',sys.system_type,'manufacturer',sys.manufacturer,'model',sys.model,'serial',sys.serial,'version',sys.version,'archived_at',sys.archived_at)
 from public.systems sys join public.sites s on s.organization_id=sys.organization_id and s.id=sys.site_id where p_dataset='systems' and sys.organization_id=p_org and (p_site is null or sys.site_id=p_site)
 union all
 select jsonb_build_object('organization_id',u.organization_id,'customer_id',s.customer_id,'site_id',s.id,'system_id',u.system_id,'unit_id',u.id,'role',u.role,'manufacturer',u.manufacturer,'model',u.model,'serial',u.serial,'replaces_id',u.replaces_id,'version',u.version,'archived_at',u.archived_at)
 from public.units u join public.systems sys on sys.organization_id=u.organization_id and sys.id=u.system_id join public.sites s on s.organization_id=sys.organization_id and s.id=sys.site_id
 where p_dataset='units' and u.organization_id=p_org and (p_site is null or s.id=p_site)
 union all
 select jsonb_build_object('organization_id',v.organization_id,'customer_id',s.customer_id,'site_id',v.site_id,'visit_id',v.id,'visit_type',v.visit_type,'status',v.status,'scheduled_at',v.scheduled_at,'ends_at',v.ends_at,'time_zone',s.time_zone,'started_at',v.started_at,'submitted_at',v.submitted_at,'version',v.version,
 'cancelled_at',v.cancelled_at,'cancellation_reason',v.cancellation_reason,'plan_id',o.plan_id,'intended_date',o.intended_date,
 'latest_revision_id',(select r.id from public.report_revisions r where r.organization_id=p_org and r.visit_id=v.id order by revision_no desc limit 1),
 'billing_ready',coalesce(b.ready,false),'billing_needs_recheck',coalesce(b.ready and b.source_version<>v.version,false),'billing_reviewed_at',b.updated_at)
 from public.visits v join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 left join public.maintenance_occurrences o on o.organization_id=v.organization_id and o.visit_id=v.id
 left join hvac_private.visit_billing_review b on b.organization_id=v.organization_id and b.visit_id=v.id
 where p_dataset='visits' and v.organization_id=p_org and (p_site is null or v.site_id=p_site)
 union all
 select jsonb_build_object('organization_id',i.organization_id,'customer_id',s.customer_id,'site_id',i.site_id,'visit_id',i.visit_id,'visit_item_id',i.id,'system_id',i.system_id,'planned',i.planned,'outcome',i.outcome,'work',i.work,'finding',i.finding,'no_access_reason',i.no_access_reason,'entered_by',i.entered_by,'entered_at',i.entered_at,'corrected_by',i.corrected_by,'corrected_at',i.corrected_at,
 'follow_up_id',f.id,'follow_up_kind',f.kind,'follow_up_state',f.state,'follow_up_owner_id',f.owner_id,'follow_up_due_date',f.due_date,'customer_action',f.customer_action,'return_visit_id',f.return_visit_id)
 from public.visit_items i join public.sites s on s.organization_id=i.organization_id and s.id=i.site_id left join public.follow_ups f on f.organization_id=i.organization_id and f.item_id=i.id
 where p_dataset='visit_items' and i.organization_id=p_org and (p_site is null or i.site_id=p_site);
$$;
create function public.owner_export(p_organization_id uuid,p_datasets text[] default '{}'::text[],p_site_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;counts jsonb;datasets jsonb:='{}';dataset text;rows jsonb;bytes bigint:=0;size bigint;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner']) then raise exception 'export_denied' using errcode='42501';end if;
 if p_datasets is null or cardinality(p_datasets)>6 or exists(select 1 from unnest(p_datasets) x where x is null or x not in ('customers','sites','systems','units','visits','visit_items')) or cardinality(p_datasets)<>(select count(distinct x) from unnest(p_datasets) x) then raise exception 'invalid_export' using errcode='22023';end if;
 if p_site_id is not null and not exists(select 1 from public.sites where organization_id=p_organization_id and id=p_site_id) then raise exception 'export_denied' using errcode='42501';end if;
 select jsonb_build_object(
 'customers',(select count(*) from public.customers c where c.organization_id=p_organization_id and (p_site_id is null or exists(select 1 from public.sites s where s.organization_id=p_organization_id and s.id=p_site_id and s.customer_id=c.id))),
 'sites',(select count(*) from public.sites where organization_id=p_organization_id and (p_site_id is null or id=p_site_id)),
 'systems',(select count(*) from public.systems where organization_id=p_organization_id and (p_site_id is null or site_id=p_site_id)),
 'units',(select count(*) from public.units u join public.systems s on s.organization_id=u.organization_id and s.id=u.system_id where u.organization_id=p_organization_id and (p_site_id is null or s.site_id=p_site_id)),
 'visits',(select count(*) from public.visits where organization_id=p_organization_id and (p_site_id is null or site_id=p_site_id)),
 'visit_items',(select count(*) from public.visit_items where organization_id=p_organization_id and (p_site_id is null or site_id=p_site_id))) into counts;
 foreach dataset in array p_datasets loop
  if (counts->>dataset)::bigint>10000 then raise exception 'export_too_large' using errcode='54000';end if;
  select coalesce(sum(octet_length(value::text)+32),0) into size from hvac_private.export_rows(p_organization_id,dataset,p_site_id) value;
  bytes:=bytes+size;
  if bytes>16777216 then raise exception 'export_too_large' using errcode='54000';end if;
  select coalesce(jsonb_agg(value order by coalesce(value->>'visit_item_id',value->>'unit_id',value->>'system_id',value->>'visit_id',value->>'site_id',value->>'customer_id')),'[]') into rows from hvac_private.export_rows(p_organization_id,dataset,p_site_id) value;
  datasets:=datasets||jsonb_build_object(dataset,rows);
  if octet_length(datasets::text)>16777216 then raise exception 'export_too_large' using errcode='54000';end if;
 end loop;
 result:=jsonb_build_object('schemaVersion',1,'exportedAt',statement_timestamp(),'organizationId',p_organization_id,'scope',case when p_site_id is null then 'organization' else 'site' end,'siteId',p_site_id,'includesArchived',true,'counts',counts,'datasets',datasets);
 -- Only catalog reads return the site selector; downloads contain only the selected scope.
 if cardinality(p_datasets)=0 then result:=result||jsonb_build_object('sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'archived',s.archived_at is not null) order by s.name,s.id) from public.sites s where s.organization_id=p_organization_id),'[]'::jsonb));end if;
 return result;
end $$;
alter function hvac_private.export_rows(uuid,text,uuid) owner to hvac_identity_executor;
alter function public.owner_export(uuid,text[],uuid) owner to hvac_identity_executor;
revoke all on function hvac_private.export_rows(uuid,text,uuid),public.owner_export(uuid,text[],uuid) from public,anon,authenticated,service_role;
grant execute on function public.owner_export(uuid,text[],uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
