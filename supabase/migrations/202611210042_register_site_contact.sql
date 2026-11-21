-- Prefer the site contact for new field/report data; issued snapshots remain frozen.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
create or replace function public.visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); result jsonb;
begin
 if not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'visit_denied' using errcode='42501'; end if;
 select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason,
 'technicians',coalesce((select jsonb_agg(st.email order by st.email) from public.visit_assignees a join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=v.id),'[]'),'site',s.name,'address',s.address,'accessNote',s.access_note,'customer',c.name,'contact',coalesce(nullif(s.contact,''),c.contact),'timeZone',s.time_zone,'start',v.scheduled_at,'visitType',v.visit_type,
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'label',m.email)) from hvac_private.visit_staff(p_organization_id,p_visit_id) m),'[]'),
 'availableSystems',coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'room',sys.room)) from public.systems sys where sys.organization_id=p_organization_id and sys.site_id=v.site_id and sys.archived_at is null and s.archived_at is null and c.archived_at is null and not exists(select 1 from public.visit_items i where i.visit_id=v.id and i.system_id=sys.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'systemId',i.system_id,'version',i.version,'planned',i.planned,'code',sys.code,'room',sys.room,'model',sys.model,'serial',sys.serial,'outcome',i.outcome,'work',i.work,'finding',i.finding,'noAccessReason',i.no_access_reason,'internalNote',i.internal_note,'readings',i.readings,'parts',i.parts,'enteredByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.entered_by),'correctedAt',i.corrected_at,'correctedByLabel',(select st.email from public.memberships m join hvac_private.visit_staff(p_organization_id,p_visit_id) st on st.id=m.id where m.organization_id=p_organization_id and m.user_id=i.corrected_by),'enteredBy',i.entered_by,'enteredAt',i.entered_at,'followUp',(select jsonb_build_object('id',f.id,'managedAt',f.managed_at,'state',f.state,'version',f.version,'ownerLabel',f.owner_label,'completedAt',f.completed_at,'kind',f.kind,'ownerId',f.owner_id,'dueDate',f.due_date,'customerAction',f.customer_action) from public.follow_ups f where f.item_id=i.id)) order by sys.code) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.organization_id=p_organization_id and i.visit_id=v.id),'[]')) into result
 from public.visits v join public.sites s on s.id=v.site_id join public.customers c on c.id=s.customer_id where v.organization_id=p_organization_id and v.id=p_visit_id;
 if result is null then raise exception 'visit_denied' using errcode='42501'; end if;
 return result;
end $$;


do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
