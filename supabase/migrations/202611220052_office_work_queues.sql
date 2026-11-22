-- Read-only operational queues. Existing follow-up and generation commands remain authoritative.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;

create function hvac_private.office_work_rows(p_org uuid,p_queue text) returns table(row_data jsonb,site_id uuid,owners uuid[],state text,due_date date,local_today date,unfinished boolean)
language sql stable set search_path='' as $$
 select jsonb_build_object('id',f.id,'kind',f.kind,'state',f.state,'siteId',s.id,'site',s.name,'customer',c.name,
 'owner',coalesce(f.owner_label,''),'ownerId',f.owner_id,'dueDate',f.due_date,'timeZone',s.time_zone,
 'code',sys.code,'room',sys.room,'finding',i.finding,'work',i.work,'noAccessReason',i.no_access_reason,'customerAction',f.customer_action,
 'visitId',v.id,'itemId',i.id,'systemId',sys.id,'returnVisitId',rv.id,'returnStart',rv.scheduled_at,'returnState',rv.status,
 'bookingState',case when rv.id is not null then 'booked' when f.kind in ('repair','revisit') and f.state='open' then 'proposed' else 'none' end),
 s.id,array[f.owner_id],f.state,f.due_date,(now() at time zone s.time_zone)::date,f.state='open'
 from public.follow_ups f
 join public.visit_items i on i.organization_id=f.organization_id and i.id=f.item_id
 join public.visits v on v.organization_id=i.organization_id and v.id=i.visit_id
 join public.systems sys on sys.organization_id=i.organization_id and sys.id=i.system_id
 join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 left join public.visits rv on rv.organization_id=f.organization_id and rv.id=f.return_visit_id
 where p_queue='actions' and f.organization_id=p_org and v.status in ('submitted','issued')
 union all
 select jsonb_build_object('id',o.visit_id,'kind','maintenance','state',v.status,'siteId',s.id,'site',s.name,'customer',c.name,
 'planId',p.id,'planName',p.name,'planEnabled',p.enabled,'dueDate',(v.scheduled_at at time zone s.time_zone)::date,'intendedDate',o.intended_date,
 'start',v.scheduled_at,'timeZone',s.time_zone,'visitId',v.id,'bookingState','booked',
 'owner',coalesce((select string_agg(u.email,', ' order by u.email) from public.visit_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id join hvac_private.workspace_emails(p_org) u on u.user_id=m.user_id where a.organization_id=p_org and a.visit_id=v.id),'')),
 s.id,array(select a.membership_id from public.visit_assignees a where a.organization_id=p_org and a.visit_id=v.id),v.status,
 (v.scheduled_at at time zone s.time_zone)::date,(now() at time zone s.time_zone)::date,v.status in ('scheduled','in_progress')
 from public.maintenance_occurrences o
 join public.maintenance_plans p on p.organization_id=o.organization_id and p.id=o.plan_id
 join public.visits v on v.organization_id=o.organization_id and v.id=o.visit_id
 join public.sites s on s.organization_id=p.organization_id and s.id=p.site_id
 join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 where p_queue='maintenance' and o.organization_id=p_org
 union all
 -- One next ungenerated proposal per plan, among its next twelve occurrences.
 select jsonb_build_object('id',p.id,'kind','maintenance','state',case when p.enabled then 'proposed' else 'paused' end,
 'siteId',s.id,'site',s.name,'customer',c.name,'planId',p.id,'planName',p.name,'planEnabled',p.enabled,
 'dueDate',next.value->>'intendedDate','intendedDate',next.value->>'intendedDate','start',next.value->>'startsAt','timeZone',p.time_zone,
 'bookingState','proposed','owner',coalesce((select string_agg(u.email,', ' order by u.email) from public.maintenance_plan_assignees a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id join hvac_private.workspace_emails(p_org) u on u.user_id=m.user_id where a.organization_id=p_org and a.plan_id=p.id),'')),
 s.id,array(select a.membership_id from public.maintenance_plan_assignees a where a.organization_id=p_org and a.plan_id=p.id),case when p.enabled then 'proposed' else 'paused' end,
 (next.value->>'intendedDate')::date,(now() at time zone p.time_zone)::date,p.enabled
 from public.maintenance_plans p
 join public.sites s on s.organization_id=p.organization_id and s.id=p.site_id
 join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 cross join lateral (
  select e.value from jsonb_array_elements(hvac_private.maintenance_occurrences(p.anchor_date,p.anchor_time,p.interval_months,p.time_zone,p.duration_minutes,(now() at time zone p.time_zone)::date,12)) with ordinality e(value,n)
  where not exists(select 1 from public.maintenance_occurrences o where o.organization_id=p.organization_id and o.plan_id=p.id and o.intended_date=(e.value->>'intendedDate')::date)
  order by e.n limit 1
 ) next
 where p_queue='maintenance' and p.organization_id=p_org;
$$;
alter function hvac_private.office_work_rows(uuid,text) owner to hvac_identity_executor;
revoke all on function hvac_private.office_work_rows(uuid,text) from public,anon,authenticated,service_role;

create function public.office_work_queue(p_organization_id uuid,p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=coalesce(p_filters->>'queue','actions');st text:=coalesce(p_filters->>'state','pending');due text:=coalesce(p_filters->>'due','all');
 booking text:=coalesce(p_filters->>'booking','all');dependency text:=coalesce(p_filters->>'dependency','all');site uuid;owner uuid;page integer;result jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'queue_denied' using errcode='42501';end if;
 page:=coalesce((p_filters->>'page')::integer,1);
 if jsonb_typeof(p_filters) is distinct from 'object' or p_filters-array['queue','state','due','booking','dependency','site','owner','page']<>'{}'::jsonb
 or q not in ('actions','maintenance') or st not in ('pending','all','open','completed','quote','repair','revisit','proposed','paused','scheduled','in_progress','submitted','issued','cancelled')
 or (q='actions' and st not in ('pending','all','open','completed','quote','repair','revisit'))
 or (q='maintenance' and st in ('open','completed','quote','repair','revisit'))
 or due not in ('all','overdue','today','upcoming','missing') or booking not in ('all','proposed','booked','cancelled') or dependency not in ('all','required','none') or page not between 1 and 10000 then raise exception 'invalid_queue_filters' using errcode='22023';end if;
 site:=nullif(p_filters->>'site','')::uuid;owner:=nullif(p_filters->>'owner','')::uuid;
 with rows as materialized (select * from hvac_private.office_work_rows(p_organization_id,q)),
 filtered as (
 select row_data||jsonb_build_object('overdue',unfinished and due_date<local_today) as data,due_date,row_data->>'id' as id
 from rows r where (site is null or r.site_id=site) and (owner is null or owner=any(r.owners))
 and (st='all' or (st='pending' and r.unfinished) or r.state=st or (q='actions' and r.row_data->>'kind'=st))
 and (due='all' or (due='missing' and due_date is null) or (r.unfinished and ((due='overdue' and due_date<local_today) or (due='today' and due_date=local_today) or (due='upcoming' and due_date between local_today and local_today+30))))
 and (booking='all' or (booking='cancelled' and row_data->>'returnState'='cancelled') or (booking in ('booked','proposed') and row_data->>'bookingState'=booking))
 and (dependency='all' or (dependency='required' and length(trim(coalesce(row_data->>'customerAction','')))>0) or (dependency='none' and length(trim(coalesce(row_data->>'customerAction','')))=0))
 )
 select jsonb_build_object('total',(select count(*) from filtered),'page',page,'rows',coalesce((select jsonb_agg(data order by due_date nulls first,id) from (select * from filtered order by due_date nulls first,id limit 30 offset (page-1)*30) part),'[]'::jsonb),
 'sites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from (select distinct r.site_id as id,r.row_data->>'site' as name from rows r) s),'[]'::jsonb)) into result;
 return result;
end $$;
alter function public.office_work_queue(uuid,jsonb) owner to hvac_identity_executor;
revoke all on function public.office_work_queue(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.office_work_queue(uuid,jsonb) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
