do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
create or replace function public.operation_snapshot(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); office boolean; result jsonb;
begin
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) then raise exception 'operation_denied' using errcode='42501'; end if;
 office:=hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']);
 select jsonb_build_object(
 'customers',case when office then coalesce((select jsonb_agg(c order by c.name) from public.customers c where c.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'sites',case when office then coalesce((select jsonb_agg(s order by s.name) from public.sites s where s.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'systems',case when office then coalesce((select jsonb_agg(s order by s.code) from public.systems s where s.organization_id=p_organization_id),'[]') else '[]'::jsonb end,
 'visits',coalesce((select jsonb_agg(jsonb_build_object('assigned',exists(select 1 from public.visit_assignees va join public.memberships mm on mm.id=va.membership_id where va.visit_id=v.id and mm.user_id=actor and mm.active),'id',v.id,'site',s.name,'address',s.address,'accessNote',s.access_note,'timeZone',s.time_zone,'start',v.scheduled_at,'end',v.ends_at,'visitType',v.visit_type,'systems',(select jsonb_agg(jsonb_build_object('code',sys.code,'room',sys.room,'id',sys.id)) from public.visit_items i join public.systems sys on sys.id=i.system_id where i.visit_id=v.id)) order by v.scheduled_at) from public.visits v join public.sites s on s.id=v.site_id where v.organization_id=p_organization_id and (office or exists(select 1 from public.visit_assignees a join public.memberships m on m.id=a.membership_id where a.visit_id=v.id and m.user_id=actor and m.active))),'[]')) into result;
 return result;
end $$;

do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
