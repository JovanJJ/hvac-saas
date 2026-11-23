-- Independent office billing preparation; receipts and issued revisions remain immutable.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table hvac_private.visit_billing_review(
 organization_id uuid not null,visit_id uuid not null,version integer not null check(version>0),ready boolean not null,
 note text not null check(length(btrim(note)) between 1 and 2000),actor_id uuid not null references auth.users(id),actor_label text not null,
 updated_at timestamptz not null,source_version integer not null,revision_id uuid,
 primary key(organization_id,visit_id),foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,revision_id) references public.report_revisions(organization_id,id)
);
create table hvac_private.billing_review_events(
 organization_id uuid not null,visit_id uuid not null,actor_id uuid not null references auth.users(id),operation_id uuid not null,
 payload jsonb not null,before_data jsonb not null,after_data jsonb not null,created_at timestamptz not null,
 primary key(organization_id,actor_id,operation_id),foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
create index billing_review_events_visit_idx on hvac_private.billing_review_events(organization_id,visit_id,created_at desc);
revoke all on hvac_private.visit_billing_review,hvac_private.billing_review_events from public,anon,authenticated,service_role;
grant select,insert,update on hvac_private.visit_billing_review to hvac_identity_executor;
grant select,insert on hvac_private.billing_review_events to hvac_identity_executor;
alter table hvac_private.visit_billing_review enable row level security;
alter table hvac_private.billing_review_events enable row level security;
create policy executor_access on hvac_private.visit_billing_review to hvac_identity_executor using(true) with check(true);
create policy executor_access on hvac_private.billing_review_events to hvac_identity_executor using(true) with check(true);

create function hvac_private.billing_review_value(p_org uuid,p_visit uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('version',coalesce(b.version,0),'ready',coalesce(b.ready,false),'note',coalesce(b.note,''),
 'actor',b.actor_label,'updatedAt',b.updated_at,'sourceVersion',b.source_version,'revisionId',b.revision_id,
 'stale',coalesce(b.ready and b.source_version<>v.version,false))
 from public.visits v left join hvac_private.visit_billing_review b on b.organization_id=v.organization_id and b.visit_id=v.id
 where v.organization_id=p_org and v.id=p_visit;
$$;
create function public.billing_review_command(p_organization_id uuid,p_visit_id uuid,p_operation_id uuid,p_version integer,p_visit_version integer,p_ready boolean,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();v public.visits;prior hvac_private.billing_review_events;before_value jsonb;after_value jsonb;revision uuid;at_time timestamptz:=clock_timestamp();
 expected jsonb:=jsonb_build_object('visit',p_visit_id,'version',p_version,'visitVersion',p_visit_version,'ready',p_ready,'note',p_note);
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'billing_denied' using errcode='42501';end if;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found then raise exception 'billing_denied' using errcode='42501';end if;
 if p_operation_id is null or p_version is null or p_version<0 or p_visit_version is null or p_visit_version<1 or p_ready is null or p_note is null or length(p_note)>2000 or length(btrim(p_note)) not between 1 and 2000 then raise exception 'invalid_billing_input' using errcode='22023';end if;
 select * into prior from hvac_private.billing_review_events where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if prior.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;
  return prior.after_data;
 end if;
 if v.status not in ('submitted','issued') then raise exception 'visit_not_handed_over' using errcode='PT409';end if;
 before_value:=hvac_private.billing_review_value(p_organization_id,p_visit_id);
 if (before_value->>'version')::integer<>p_version or v.version<>p_visit_version then raise exception 'stale_billing_review' using errcode='PT409';end if;
 select id into revision from public.report_revisions where organization_id=p_organization_id and visit_id=p_visit_id order by revision_no desc limit 1;
 at_time:=clock_timestamp();
 insert into hvac_private.visit_billing_review(organization_id,visit_id,version,ready,note,actor_id,actor_label,updated_at,source_version,revision_id)
 values(p_organization_id,p_visit_id,p_version+1,p_ready,btrim(p_note),actor,hvac_private.actor_email(),at_time,v.version,revision)
 on conflict(organization_id,visit_id) do update set version=excluded.version,ready=excluded.ready,note=excluded.note,actor_id=excluded.actor_id,actor_label=excluded.actor_label,updated_at=excluded.updated_at,source_version=excluded.source_version,revision_id=excluded.revision_id;
 after_value:=hvac_private.billing_review_value(p_organization_id,p_visit_id);
 insert into hvac_private.billing_review_events values(p_organization_id,p_visit_id,actor,p_operation_id,expected,before_value,after_value,at_time);
 return after_value;
end $$;

create function public.billing_review_detail(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'billing_denied' using errcode='42501';end if;
 select jsonb_build_object('visitId',v.id,'visitVersion',v.version,'status',v.status,'site',s.name,'customer',c.name,'start',v.scheduled_at,'timeZone',s.time_zone,
 'billing',hvac_private.billing_review_value(p_organization_id,v.id),
 'history',coalesce((select jsonb_agg(jsonb_build_object('operationId',e.operation_id,'before',e.before_data,'after',e.after_data,'at',e.created_at) order by e.created_at desc,e.operation_id) from (select * from hvac_private.billing_review_events where organization_id=p_organization_id and visit_id=v.id order by created_at desc,operation_id limit 20) e),'[]'::jsonb),
 'revisionId',(select id from public.report_revisions where organization_id=p_organization_id and visit_id=v.id order by revision_no desc limit 1)) into result
 from public.visits v join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 where v.organization_id=p_organization_id and v.id=p_visit_id;
 if result is null then raise exception 'billing_denied' using errcode='42501';end if;
 return result;
end $$;

create function hvac_private.handover_rows(p_org uuid,p_queue text) returns table(data jsonb,site_id uuid,customer_id uuid,local_date date,state text,is_latest boolean)
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'revisionId',r.id,'visitId',v.id,'number',r.report_number,'revision',r.revision_no,
 'latest',not exists(select 1 from public.report_revisions x where x.organization_id=p_org and x.visit_id=v.id and x.revision_no>r.revision_no),
 'site',s.name,'customer',c.name,'at',r.issued_at,'timeZone',s.time_zone,'visitStatus',v.status,'renderState',j.state,
 'receiptCount',(select count(*) from hvac_private.report_receipts x where x.organization_id=p_org and x.revision_id=r.id),
 'activeLinks',(select count(*) from hvac_private.report_links l where l.organization_id=p_org and l.revision_id=r.id and l.revoked_at is null and l.expires_at>statement_timestamp())),
 s.id,c.id,(r.issued_at at time zone s.time_zone)::date,
 case when exists(select 1 from hvac_private.report_receipts x where x.organization_id=p_org and x.revision_id=r.id) then 'received' else 'missing' end,
 not exists(select 1 from public.report_revisions x where x.organization_id=p_org and x.visit_id=v.id and x.revision_no>r.revision_no)
 from public.report_revisions r join public.visits v on v.organization_id=r.organization_id and v.id=r.visit_id
 join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 left join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id
 where p_queue='receipts' and r.organization_id=p_org
 union all
 select jsonb_build_object('id',v.id,'visitId',v.id,'site',s.name,'customer',c.name,'at',v.scheduled_at,'timeZone',s.time_zone,'visitStatus',v.status,'billing',b.value,
 'revisionId',(select id from public.report_revisions where organization_id=p_org and visit_id=v.id order by revision_no desc limit 1)),
 s.id,c.id,(v.scheduled_at at time zone s.time_zone)::date,
 case when (b.value->>'stale')::boolean then 'recheck' when (b.value->>'ready')::boolean then 'ready' else 'pending' end,true
 from public.visits v join public.sites s on s.organization_id=v.organization_id and s.id=v.site_id
 join public.customers c on c.organization_id=s.organization_id and c.id=s.customer_id
 cross join lateral (select hvac_private.billing_review_value(p_org,v.id) as value) b
 where p_queue='billing' and v.organization_id=p_org and v.status in ('submitted','issued');
$$;
create function public.handover_queue(p_organization_id uuid,p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=coalesce(p_filters->>'queue','receipts');st text;rev text:=coalesce(p_filters->>'revision','all');site uuid;customer uuid;from_date date;until_date date;page integer;result jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'handover_denied' using errcode='42501';end if;
 st:=coalesce(p_filters->>'state',case when q='billing' then 'pending' else 'missing' end);page:=coalesce((p_filters->>'page')::integer,1);
 if jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>8000 or p_filters-array['queue','state','revision','site','customer','from','until','page']<>'{}'::jsonb or q not in ('receipts','billing') or rev not in ('all','latest') or page not between 1 and 10000
 or (q='receipts' and st not in ('all','missing','received')) or (q='billing' and st not in ('all','pending','ready','recheck')) then raise exception 'invalid_handover_filters' using errcode='22023';end if;
 site:=nullif(p_filters->>'site','')::uuid;customer:=nullif(p_filters->>'customer','')::uuid;from_date:=nullif(p_filters->>'from','')::date;until_date:=nullif(p_filters->>'until','')::date;
 if from_date>until_date then raise exception 'invalid_date_range' using errcode='22023';end if;
 with rows as materialized(select * from hvac_private.handover_rows(p_organization_id,q)),filtered as (
 select data,local_date,data->>'id' as id from rows r where (site is null or r.site_id=site) and (customer is null or r.customer_id=customer)
 and (st='all' or r.state=st or (q='billing' and st='pending' and r.state='recheck')) and (rev='all' or r.is_latest)
 and (from_date is null or r.local_date>=from_date) and (until_date is null or r.local_date<=until_date))
 select jsonb_build_object('total',(select count(*) from filtered),'page',page,'rows',coalesce((select jsonb_agg(data order by local_date desc,id) from(select * from filtered order by local_date desc,id limit 30 offset (page-1)*30) x),'[]'::jsonb),
 'sites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from(select distinct r.site_id as id,r.data->>'site' as name from rows r) x),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from(select distinct r.customer_id as id,r.data->>'customer' as name from rows r) x),'[]'::jsonb)) into result;
 return result;
end $$;

alter function hvac_private.billing_review_value(uuid,uuid) owner to hvac_identity_executor;
alter function hvac_private.handover_rows(uuid,text) owner to hvac_identity_executor;
alter function public.billing_review_command(uuid,uuid,uuid,integer,integer,boolean,text) owner to hvac_identity_executor;
alter function public.billing_review_detail(uuid,uuid) owner to hvac_identity_executor;
alter function public.handover_queue(uuid,jsonb) owner to hvac_identity_executor;
revoke all on function hvac_private.billing_review_value(uuid,uuid),hvac_private.handover_rows(uuid,text),public.billing_review_command(uuid,uuid,uuid,integer,integer,boolean,text),public.billing_review_detail(uuid,uuid),public.handover_queue(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.billing_review_command(uuid,uuid,uuid,integer,integer,boolean,text),public.billing_review_detail(uuid,uuid),public.handover_queue(uuid,jsonb) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
