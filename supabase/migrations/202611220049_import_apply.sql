-- Exact reviewed import confirmation; all business writes and receipts commit together.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
alter table hvac_private.import_previews add constraint import_previews_tenant_sequence unique(organization_id,batch_id,sequence);
create table hvac_private.import_applications (
 organization_id uuid not null,batch_id uuid not null,preview_sequence bigint not null,digest text not null,
 actor_id uuid not null references auth.users(id),result jsonb not null,created_at timestamptz not null default now(),
 primary key(organization_id,batch_id),
 foreign key(organization_id,batch_id) references hvac_private.import_batches(organization_id,id),
 foreign key(organization_id,batch_id,preview_sequence) references hvac_private.import_previews(organization_id,batch_id,sequence)
);
create table hvac_private.import_apply_receipts (
 organization_id uuid not null,actor_id uuid not null references auth.users(id),operation_id uuid not null,batch_id uuid not null,
 payload jsonb not null,created_at timestamptz not null default now(),primary key(organization_id,actor_id,operation_id),
 foreign key(organization_id,batch_id) references hvac_private.import_applications(organization_id,batch_id)
);
create index import_apply_receipts_batch_idx on hvac_private.import_apply_receipts(organization_id,batch_id);
revoke all on hvac_private.import_applications,hvac_private.import_apply_receipts from public,anon,authenticated,service_role;
grant select,insert on hvac_private.import_applications,hvac_private.import_apply_receipts to hvac_identity_executor;
create function hvac_private.evaluate_import_rows(p_organization_id uuid,p_grid jsonb,p_mapping jsonb,p_resolutions jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare r jsonb;kv record;val text;vals jsonb;errs jsonb;result jsonb:='[]';candidates jsonb;systems jsonb;
 site public.sites;system public.systems;selected_site uuid;selected_system uuid;resolution jsonb;key text;keys text[]:='{}';num text;action text;before_data jsonb;
begin
 for r in select value from jsonb_array_elements(p_grid->'rows') order by (value->>'number')::integer loop
  vals:='{}';errs:='[]';num:=r->>'number';resolution:=coalesce(p_resolutions->num,'{}');selected_site:=null;selected_system:=null;before_data:=null;systems:='[]';
  for kv in select * from jsonb_each(p_mapping) loop
   val:=btrim(r->'cells'->>((kv.value::text)::integer));
   if kv.key in ('siteCode','systemCode') then val:=hvac_private.import_key(val);end if;
   vals:=vals||jsonb_build_object(kv.key,val);
   if length(val)>120 then errs:=errs||jsonb_build_array('Polje '||kv.key||' ima više od 120 znakova.');end if;
   if val~'^[=]' then errs:=errs||jsonb_build_array('Formule nisu dozvoljene; unesite vrednost.');end if;
  end loop;
  if vals->>'siteCode'='' or vals->>'systemCode'='' then errs:=errs||'["Oznake lokacije i sistema su obavezne."]'::jsonb;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.code||' · '||s.name) order by s.id),'[]') into candidates from public.sites s where s.organization_id=p_organization_id and hvac_private.import_key(s.code)=vals->>'siteCode';
  if resolution?'siteId' then
   if not exists(select 1 from jsonb_array_elements(candidates) x where x->>'id'=resolution->>'siteId') then errs:=errs||'["Izabrana lokacija ne odgovara oznaci iz reda."]';else selected_site:=(resolution->>'siteId')::uuid;end if;
  elsif jsonb_array_length(candidates)=1 then selected_site:=(candidates->0->>'id')::uuid;
  elsif jsonb_array_length(candidates)=0 then errs:=errs||'["Lokacija ne postoji. Dodajte je u registru, pa ponovite pregled."]';
  else errs:=errs||'["Više lokacija odgovara oznaci. Izaberite lokaciju."]';end if;
  if selected_site is not null then
   select * into site from public.sites where organization_id=p_organization_id and id=selected_site;
   if site.archived_at is not null or exists(select 1 from public.customers c where c.organization_id=p_organization_id and c.id=site.customer_id and c.archived_at is not null) then errs:=errs||'["Lokacija ili njen klijent su arhivirani."]';end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.code||' · '||s.room) order by s.id),'[]') into systems from public.systems s where s.organization_id=p_organization_id and s.site_id=selected_site and hvac_private.import_key(s.code)=vals->>'systemCode';
   if resolution?'systemId' then
    if not exists(select 1 from jsonb_array_elements(systems) x where x->>'id'=resolution->>'systemId') then errs:=errs||'["Izabrani sistem ne odgovara lokaciji i oznaci iz reda."]';else selected_system:=(resolution->>'systemId')::uuid;end if;
   elsif jsonb_array_length(systems)=1 then selected_system:=(systems->0->>'id')::uuid;
   elsif jsonb_array_length(systems)>1 then errs:=errs||'["Više sistema odgovara oznaci. Izaberite sistem."]';end if;
   if selected_system is not null then
    select * into system from public.systems where organization_id=p_organization_id and id=selected_system;
    before_data:=jsonb_build_object('id',system.id,'version',system.version,'room',system.room,'manufacturer',system.manufacturer,'model',system.model,'serial',system.serial,'systemType',system.system_type,'code',system.code);
    if system.archived_at is not null then errs:=errs||'["Sistem je arhiviran; uvoz ga neće obnoviti."]';end if;
   end if;
  end if;
  if (vals?'room' and vals->>'room'='') or (selected_system is null and coalesce(vals->>'room','')='') then errs:=errs||'["Prostorija je obavezna za novi sistem i ne može se obrisati."]';end if;
  key:=jsonb_build_array(coalesce(selected_site::text,vals->>'siteCode'),coalesce(selected_system::text,vals->>'systemCode'))::text;
  keys:=array_append(keys,key);
  action:=case when jsonb_array_length(errs)>0 then 'error' when selected_system is null then 'new' else 'matched' end;
  result:=result||jsonb_build_array(jsonb_build_object('number',num::integer,'values',vals,'key',key,'action',action,'errors',errs,'siteId',selected_site,'systemId',selected_system,'sites',candidates,'systems',systems,'before',before_data,
   'siteVersion',case when selected_site is not null then site.version else null end,'customerId',case when selected_site is not null then site.customer_id else null end,
   'customerVersion',(select c.version from public.customers c where c.organization_id=p_organization_id and c.id=case when selected_site is not null then site.customer_id else null end)));
 end loop;
 select jsonb_agg(case when (select count(*) from unnest(keys) k where k=x->>'key')>1 then x||jsonb_build_object('action','error','errors',(x->'errors')||'["Ponovljen sistem u istom fajlu. Zadržite samo jedan red."]'::jsonb) else x end order by (x->>'number')::integer) into result from jsonb_array_elements(result) x;
 return result;
end $$;
alter function hvac_private.evaluate_import_rows(uuid,jsonb,jsonb,jsonb) owner to hvac_identity_executor;
revoke all on function hvac_private.evaluate_import_rows(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.import_preview(p_organization_id uuid,p_batch_id uuid,p_id uuid,p_mapping jsonb,p_resolutions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b hvac_private.import_batches;old hvac_private.import_previews;
 r jsonb;kv record;val text;vals jsonb;errs jsonb;result jsonb:='[]';candidates jsonb;systems jsonb;
 site public.sites;system public.systems;selected_site uuid;selected_system uuid;resolution jsonb;key text;keys text[]:='{}';num text;action text;before_data jsonb;digest text;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'import_denied' using errcode='42501';end if;
 select * into b from hvac_private.import_batches where organization_id=p_organization_id and id=p_batch_id;
 if not found then raise exception 'import_denied' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_mapping) is distinct from 'object' or jsonb_typeof(p_resolutions) is distinct from 'object' or octet_length(p_mapping::text)>1000 or octet_length(p_resolutions::text)>100000 then raise exception 'invalid_mapping' using errcode='22023';end if;
 if not(p_mapping?'siteCode' and p_mapping?'systemCode') then raise exception 'required_mapping' using errcode='22023';end if;
 for kv in select * from jsonb_each(p_mapping) loop
  if kv.key not in ('siteCode','systemCode','room','manufacturer','model','serial','systemType') or jsonb_typeof(kv.value)<>'number' or kv.value::text!~'^\d+$' or (kv.value::text)::integer>=jsonb_array_length(b.grid->'headers') then raise exception 'invalid_mapping' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_each(p_mapping))<>(select count(*) from jsonb_each(p_mapping)) then raise exception 'duplicate_mapping' using errcode='22023';end if;
 for kv in select * from jsonb_each(p_resolutions) loop
  if not exists(select 1 from jsonb_array_elements(b.grid->'rows') item where item->>'number'=kv.key) or jsonb_typeof(kv.value)<>'object' or kv.value-array['siteId','systemId']<>'{}'::jsonb then raise exception 'invalid_resolution' using errcode='22023';end if;
  if exists(select 1 from jsonb_each(kv.value) x where jsonb_typeof(x.value)<>'string' or (x.value#>>'{}')!~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$') then raise exception 'invalid_resolution' using errcode='22023';end if;
 end loop;
 select * into old from hvac_private.import_previews where organization_id=p_organization_id and actor_id=actor and id=p_id;
 if found then
  if old.batch_id<>p_batch_id or old.mapping<>p_mapping or old.resolutions<>p_resolutions then raise exception 'preview_conflict' using errcode='PT409';end if;
  return p_id;
 end if;
 if exists(select 1 from hvac_private.import_applications a where a.organization_id=p_organization_id and a.batch_id=p_batch_id) then raise exception 'import_already_applied' using errcode='PT409';end if;
 result:=hvac_private.evaluate_import_rows(p_organization_id,b.grid,p_mapping,p_resolutions);
 digest:=encode(extensions.digest(jsonb_build_object('schemaVersion',1,'batch',b.id,'sourceDigest',b.source_digest,'contentDigest',b.content_digest,'mapping',p_mapping,'resolutions',p_resolutions,'rows',result)::text,'sha256'),'hex');
 insert into hvac_private.import_previews(organization_id,id,actor_id,batch_id,mapping,resolutions,rows,digest) values(p_organization_id,p_id,actor,p_batch_id,p_mapping,p_resolutions,result,digest);
 return p_id;
end $$;
create function public.import_apply(p_organization_id uuid,p_batch_id uuid,p_preview_id uuid,p_digest text,p_operation_id uuid,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b hvac_private.import_batches;p hvac_private.import_previews;
 application hvac_private.import_applications;receipt hvac_private.import_apply_receipts;
 expected jsonb:=jsonb_build_object('batch',p_batch_id,'preview',p_preview_id,'digest',p_digest,'confirmed',p_confirmed);
 fresh jsonb;r jsonb;vals jsonb;sys public.systems;target uuid;outcome text;entries jsonb:='[]';result jsonb;
 created_count integer:=0;updated_count integer:=0;skipped_count integer:=0;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'import_denied' using errcode='42501';end if;
 select * into b from hvac_private.import_batches where organization_id=p_organization_id and id=p_batch_id;
 if not found then raise exception 'import_denied' using errcode='42501';end if;
 if p_operation_id is null or p_preview_id is null or p_digest is null or p_digest!~'^[a-f0-9]{64}$' or p_confirmed is distinct from true then raise exception 'import_confirmation_required' using errcode='22023';end if;
 select * into receipt from hvac_private.import_apply_receipts where organization_id=p_organization_id and actor_id=actor and operation_id=p_operation_id;
 if found then
  if receipt.payload<>expected then raise exception 'operation_conflict' using errcode='PT409';end if;
  select * into application from hvac_private.import_applications where organization_id=p_organization_id and batch_id=receipt.batch_id;
  return application.result;
 end if;
 select * into application from hvac_private.import_applications where organization_id=p_organization_id and batch_id=p_batch_id;
 if found then
  select * into p from hvac_private.import_previews where sequence=application.preview_sequence and organization_id=p_organization_id and batch_id=p_batch_id;
  if p.id<>p_preview_id or application.digest<>p_digest then raise exception 'import_already_applied' using errcode='PT409';end if;
  insert into hvac_private.import_apply_receipts(organization_id,actor_id,operation_id,batch_id,payload) values(p_organization_id,actor,p_operation_id,p_batch_id,expected);
  return application.result;
 end if;
 select * into p from hvac_private.import_previews where organization_id=p_organization_id and batch_id=p_batch_id order by sequence desc limit 1;
 if not found or p.id<>p_preview_id or p.digest<>p_digest then raise exception 'preview_changed' using errcode='PT409';end if;
 if jsonb_array_length(p.rows)=0 or exists(select 1 from jsonb_array_elements(p.rows) x where x->>'action' not in ('new','matched') or jsonb_array_length(x->'errors')>0) then raise exception 'invalid_preview' using errcode='22023';end if;
 -- Register commands share the organization lock. Lock the selected records too,
 -- in deterministic order, before deriving the complete live comparison.
 perform 1 from public.customers c where c.organization_id=p_organization_id and c.id in(select (x->>'customerId')::uuid from jsonb_array_elements(p.rows) x) order by c.id for update;
 perform 1 from public.sites s where s.organization_id=p_organization_id and s.id in(select (x->>'siteId')::uuid from jsonb_array_elements(p.rows) x) order by s.id for update;
 perform 1 from public.systems s where s.organization_id=p_organization_id and s.id in(select (x->>'systemId')::uuid from jsonb_array_elements(p.rows) x where x->>'systemId' is not null) order by s.id for update;
 fresh:=hvac_private.evaluate_import_rows(p_organization_id,b.grid,p.mapping,p.resolutions);
 if fresh<>p.rows then raise exception 'preview_stale' using errcode='PT409';end if;
 for r in select value from jsonb_array_elements(p.rows) order by (value->>'number')::integer loop
  vals:=r->'values';target:=(r->>'systemId')::uuid;
  if r->>'action'='new' then
   target:=gen_random_uuid();outcome:='created';created_count:=created_count+1;
   insert into public.systems(id,organization_id,site_id,code,room,manufacturer,model,serial,system_type,updated_by)
    values(target,p_organization_id,(r->>'siteId')::uuid,vals->>'systemCode',vals->>'room',coalesce(vals->>'manufacturer',''),coalesce(vals->>'model',''),coalesce(vals->>'serial',''),coalesce(vals->>'systemType',''),actor);
  else
   select * into sys from public.systems where organization_id=p_organization_id and id=target;
   if (vals?'room' and vals->>'room' is distinct from sys.room) or (vals?'manufacturer' and vals->>'manufacturer' is distinct from sys.manufacturer) or (vals?'model' and vals->>'model' is distinct from sys.model) or (vals?'serial' and vals->>'serial' is distinct from sys.serial) or (vals?'systemType' and vals->>'systemType' is distinct from sys.system_type) then
    outcome:='updated';updated_count:=updated_count+1;
    update public.systems set room=case when vals?'room' then vals->>'room' else room end,
      manufacturer=case when vals?'manufacturer' then vals->>'manufacturer' else manufacturer end,
      model=case when vals?'model' then vals->>'model' else model end,
      serial=case when vals?'serial' then vals->>'serial' else serial end,
      system_type=case when vals?'systemType' then vals->>'systemType' else system_type end,
      version=version+1,updated_at=now(),updated_by=actor where organization_id=p_organization_id and id=target;
   else outcome:='skipped';skipped_count:=skipped_count+1;
   end if;
  end if;
  entries:=entries||jsonb_build_array(jsonb_build_object('number',(r->>'number')::integer,'systemId',target,'siteId',r->>'siteId','code',vals->>'systemCode','action',outcome));
 end loop;
 result:=jsonb_build_object('created',created_count,'updated',updated_count,'skipped',skipped_count,'rows',entries);
 insert into hvac_private.import_applications(organization_id,batch_id,preview_sequence,digest,actor_id,result) values(p_organization_id,p_batch_id,p.sequence,p_digest,actor,result);
 insert into hvac_private.import_apply_receipts(organization_id,actor_id,operation_id,batch_id,payload) values(p_organization_id,actor,p_operation_id,p_batch_id,expected);
 return result;
end $$;
alter function public.import_apply(uuid,uuid,uuid,text,uuid,boolean) owner to hvac_identity_executor;
revoke all on function public.import_apply(uuid,uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.import_apply(uuid,uuid,uuid,text,uuid,boolean) to authenticated;

create or replace function public.import_detail(p_organization_id uuid,p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b hvac_private.import_batches;preview jsonb;application jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'import_denied' using errcode='42501';end if;
 select * into b from hvac_private.import_batches where organization_id=p_organization_id and id=p_batch_id;
 if not found then raise exception 'import_denied' using errcode='42501';end if;
 select jsonb_build_object('id',p.id,'digest',p.digest,'mapping',p.mapping,'resolutions',p.resolutions,'rows',p.rows,'createdAt',p.created_at) into preview from hvac_private.import_previews p where organization_id=p_organization_id and batch_id=p_batch_id order by sequence desc limit 1;
 select a.result||jsonb_build_object('appliedAt',a.created_at,'digest',a.digest) into application from hvac_private.import_applications a where a.organization_id=p_organization_id and a.batch_id=p_batch_id;
 return jsonb_build_object('id',b.id,'filename',b.filename,'grid',b.grid,'sourceDigest',b.source_digest,'contentDigest',b.content_digest,'createdAt',b.created_at,'preview',preview,'application',application);
end $$;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
