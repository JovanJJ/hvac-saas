-- Read-only action state travels separately from the complete finding replacement.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
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
 select jsonb_agg(jsonb_build_object('itemId',e->'id','version',e->'version','outcome',e->'outcome','work',e->'work','finding',e->'finding','noAccessReason',e->'noAccessReason','readings',hvac_private.report_readings(e->'readings'),'parts',hvac_private.report_parts(e->'parts'),'followUp',case when e->'followUp'='null'::jsonb then 'null'::jsonb else jsonb_build_object('kind',e->'followUp'->'kind','ownerId',e->'followUp'->'ownerId','dueDate',e->'followUp'->'dueDate','customerAction',e->'followUp'->'customerAction') end) order by binding.position) into items
 from jsonb_array_elements(b->'items') e join hvac_private.report_item_bindings binding on binding.item_id=(e->>'id')::uuid and binding.revision_id=base.id and binding.organization_id=p_organization_id;
 return jsonb_build_object('visitVersion',b->'version','items',items,'staff',b->'staff','actions',coalesce((select jsonb_object_agg(f.item_id::text,jsonb_build_object('id',f.id,'state',f.state,'managedAt',f.managed_at,'ownerLabel',f.owner_label,'completedAt',f.completed_at)) from public.follow_ups f join public.visit_items vi on vi.organization_id=f.organization_id and vi.id=f.item_id where f.organization_id=p_organization_id and vi.visit_id=base.visit_id),'{}'::jsonb));
end $$;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
