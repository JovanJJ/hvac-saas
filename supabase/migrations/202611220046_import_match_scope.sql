do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
-- Disambiguate local match identifiers from system relationship columns.
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
 for r in select value from jsonb_array_elements(b.grid->'rows') order by (value->>'number')::integer loop
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
 digest:=encode(extensions.digest(jsonb_build_object('schemaVersion',1,'batch',b.id,'sourceDigest',b.source_digest,'contentDigest',b.content_digest,'mapping',p_mapping,'resolutions',p_resolutions,'rows',result)::text,'sha256'),'hex');
 insert into hvac_private.import_previews(organization_id,id,actor_id,batch_id,mapping,resolutions,rows,digest) values(p_organization_id,p_id,actor,p_batch_id,p_mapping,p_resolutions,result,digest);
 return p_id;
end $$;


revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
