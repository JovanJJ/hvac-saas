-- Append-only upload and reviewed previews. No register mutation entry point in M5c.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table hvac_private.import_batches (
 organization_id uuid not null references public.organizations(id),id uuid not null,actor_id uuid not null references auth.users(id),
 filename text not null,source_digest text not null,content_digest text not null,grid jsonb not null,created_at timestamptz not null default now(),
 primary key(organization_id,id)
);
create table hvac_private.import_previews (
 sequence bigint generated always as identity primary key,
 organization_id uuid not null,id uuid not null,actor_id uuid not null references auth.users(id),batch_id uuid not null,
 mapping jsonb not null,resolutions jsonb not null,rows jsonb not null,digest text not null,created_at timestamptz not null default now(),
 unique(organization_id,actor_id,id),foreign key(organization_id,batch_id) references hvac_private.import_batches(organization_id,id)
);
create index import_previews_batch_idx on hvac_private.import_previews(organization_id,batch_id,sequence desc);
revoke all on hvac_private.import_batches,hvac_private.import_previews from public,anon,authenticated,service_role;
grant select,insert on hvac_private.import_batches,hvac_private.import_previews to hvac_identity_executor;
grant usage on sequence hvac_private.import_previews_sequence_seq to hvac_identity_executor;
create function hvac_private.import_key(value text) returns text language sql immutable set search_path='' as $$
 select upper(regexp_replace(normalize(btrim(coalesce(value,'')),NFKC),'\s+',' ','g'))
$$;
alter function hvac_private.import_key(text) owner to hvac_identity_executor;
revoke all on function hvac_private.import_key(text) from public,anon,authenticated,service_role;

create function public.import_upload(p_organization_id uuid,p_id uuid,p_filename text,p_source_digest text,p_grid jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b hvac_private.import_batches; r jsonb;c jsonb;n integer;cols integer;seen integer[]:='{}';hash text;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'import_denied' using errcode='42501';end if;
 if p_id is null or p_filename is null or length(p_filename) not between 1 and 160 or p_filename!~*'\.(csv|xlsx)$' or p_source_digest is null or p_source_digest!~'^[a-f0-9]{64}$' or jsonb_typeof(p_grid) is distinct from 'object' or octet_length(p_grid::text)>524288 or p_grid-array['headers','rows']<>'{}'::jsonb then raise exception 'invalid_import' using errcode='22023';end if;
 if jsonb_typeof(p_grid->'headers') is distinct from 'array' or jsonb_typeof(p_grid->'rows') is distinct from 'array' then raise exception 'invalid_grid' using errcode='22023';end if;
 cols:=jsonb_array_length(p_grid->'headers');
 if cols not between 2 and 32 or jsonb_array_length(p_grid->'rows') not between 1 and 500 then raise exception 'import_limits' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(p_grid->'headers') loop
  if jsonb_typeof(c)<>'string' or length(btrim(c#>>'{}')) not between 1 and 120 then raise exception 'invalid_header' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(p_grid->'headers'))<>cols then raise exception 'duplicate_header' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_grid->'rows') loop
  if jsonb_typeof(r) is distinct from 'object' or r-array['number','cells']<>'{}'::jsonb or jsonb_typeof(r->'number') is distinct from 'number' or (r->>'number')!~'^\d+$' or jsonb_typeof(r->'cells') is distinct from 'array' then raise exception 'invalid_row' using errcode='22023';end if;
  n:=(r->>'number')::integer;
  if n not between 2 and 501 or n=any(seen) or jsonb_array_length(r->'cells')<>cols then raise exception 'invalid_row' using errcode='22023';end if;
  seen:=array_append(seen,n);
  for c in select value from jsonb_array_elements(r->'cells') loop
   if jsonb_typeof(c)<>'string' or length(c#>>'{}')>2000 then raise exception 'invalid_cell' using errcode='22023';end if;
  end loop;
 end loop;
 hash:=encode(extensions.digest(p_grid::text,'sha256'),'hex');
 select * into b from hvac_private.import_batches where organization_id=p_organization_id and id=p_id;
 if found then
  if b.actor_id<>actor or b.filename<>p_filename or b.source_digest<>p_source_digest or b.grid<>p_grid then raise exception 'upload_conflict' using errcode='PT409';end if;
  return b.id;
 end if;
 insert into hvac_private.import_batches(organization_id,id,actor_id,filename,source_digest,content_digest,grid) values(p_organization_id,p_id,actor,p_filename,p_source_digest,hash,p_grid);
 return p_id;
end $$;

create function public.import_preview(p_organization_id uuid,p_batch_id uuid,p_id uuid,p_mapping jsonb,p_resolutions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b hvac_private.import_batches;old hvac_private.import_previews;
 r jsonb;kv record;val text;vals jsonb;errs jsonb;result jsonb:='[]';candidates jsonb;systems jsonb;
 site public.sites;system public.systems;site_id uuid;system_id uuid;resolution jsonb;key text;keys text[]:='{}';num text;action text;before_data jsonb;digest text;
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
  vals:='{}';errs:='[]';num:=r->>'number';resolution:=coalesce(p_resolutions->num,'{}');site_id:=null;system_id:=null;before_data:=null;systems:='[]';
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
   if not exists(select 1 from jsonb_array_elements(candidates) x where x->>'id'=resolution->>'siteId') then errs:=errs||'["Izabrana lokacija ne odgovara oznaci iz reda."]';else site_id:=(resolution->>'siteId')::uuid;end if;
  elsif jsonb_array_length(candidates)=1 then site_id:=(candidates->0->>'id')::uuid;
  elsif jsonb_array_length(candidates)=0 then errs:=errs||'["Lokacija ne postoji. Dodajte je u registru, pa ponovite pregled."]';
  else errs:=errs||'["Više lokacija odgovara oznaci. Izaberite lokaciju."]';end if;
  if site_id is not null then
   select * into site from public.sites where organization_id=p_organization_id and id=site_id;
   if site.archived_at is not null or exists(select 1 from public.customers c where c.organization_id=p_organization_id and c.id=site.customer_id and c.archived_at is not null) then errs:=errs||'["Lokacija ili njen klijent su arhivirani."]';end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.code||' · '||s.room) order by s.id),'[]') into systems from public.systems s where s.organization_id=p_organization_id and s.site_id=site_id and hvac_private.import_key(s.code)=vals->>'systemCode';
   if resolution?'systemId' then
    if not exists(select 1 from jsonb_array_elements(systems) x where x->>'id'=resolution->>'systemId') then errs:=errs||'["Izabrani sistem ne odgovara lokaciji i oznaci iz reda."]';else system_id:=(resolution->>'systemId')::uuid;end if;
   elsif jsonb_array_length(systems)=1 then system_id:=(systems->0->>'id')::uuid;
   elsif jsonb_array_length(systems)>1 then errs:=errs||'["Više sistema odgovara oznaci. Izaberite sistem."]';end if;
   if system_id is not null then
    select * into system from public.systems where organization_id=p_organization_id and id=system_id;
    before_data:=jsonb_build_object('id',system.id,'version',system.version,'room',system.room,'manufacturer',system.manufacturer,'model',system.model,'serial',system.serial,'systemType',system.system_type,'code',system.code);
    if system.archived_at is not null then errs:=errs||'["Sistem je arhiviran; uvoz ga neće obnoviti."]';end if;
   end if;
  end if;
  if (vals?'room' and vals->>'room'='') or (system_id is null and coalesce(vals->>'room','')='') then errs:=errs||'["Prostorija je obavezna za novi sistem i ne može se obrisati."]';end if;
  key:=jsonb_build_array(coalesce(site_id::text,vals->>'siteCode'),coalesce(system_id::text,vals->>'systemCode'))::text;
  keys:=array_append(keys,key);
  action:=case when jsonb_array_length(errs)>0 then 'error' when system_id is null then 'new' else 'matched' end;
  result:=result||jsonb_build_array(jsonb_build_object('number',num::integer,'values',vals,'key',key,'action',action,'errors',errs,'siteId',site_id,'systemId',system_id,'sites',candidates,'systems',systems,'before',before_data,
   'siteVersion',case when site_id is not null then site.version else null end,'customerId',case when site_id is not null then site.customer_id else null end,
   'customerVersion',(select c.version from public.customers c where c.organization_id=p_organization_id and c.id=case when site_id is not null then site.customer_id else null end)));
 end loop;
 select jsonb_agg(case when (select count(*) from unnest(keys) k where k=x->>'key')>1 then x||jsonb_build_object('action','error','errors',(x->'errors')||'["Ponovljen sistem u istom fajlu. Zadržite samo jedan red."]'::jsonb) else x end order by (x->>'number')::integer) into result from jsonb_array_elements(result) x;
 digest:=encode(extensions.digest(jsonb_build_object('schemaVersion',1,'batch',b.id,'sourceDigest',b.source_digest,'contentDigest',b.content_digest,'mapping',p_mapping,'resolutions',p_resolutions,'rows',result)::text,'sha256'),'hex');
 insert into hvac_private.import_previews(organization_id,id,actor_id,batch_id,mapping,resolutions,rows,digest) values(p_organization_id,p_id,actor,p_batch_id,p_mapping,p_resolutions,result,digest);
 return p_id;
end $$;

create function public.import_detail(p_organization_id uuid,p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b hvac_private.import_batches;preview jsonb;
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'import_denied' using errcode='42501';end if;
 select * into b from hvac_private.import_batches where organization_id=p_organization_id and id=p_batch_id;
 if not found then raise exception 'import_denied' using errcode='42501';end if;
 select jsonb_build_object('id',p.id,'digest',p.digest,'mapping',p.mapping,'resolutions',p.resolutions,'rows',p.rows,'createdAt',p.created_at) into preview from hvac_private.import_previews p where organization_id=p_organization_id and batch_id=p_batch_id order by sequence desc limit 1;
 return jsonb_build_object('id',b.id,'filename',b.filename,'grid',b.grid,'sourceDigest',b.source_digest,'contentDigest',b.content_digest,'createdAt',b.created_at,'preview',preview);
end $$;
alter function public.import_upload(uuid,uuid,text,text,jsonb) owner to hvac_identity_executor;
alter function public.import_preview(uuid,uuid,uuid,jsonb,jsonb) owner to hvac_identity_executor;
alter function public.import_detail(uuid,uuid) owner to hvac_identity_executor;
revoke all on function public.import_upload(uuid,uuid,text,text,jsonb),public.import_preview(uuid,uuid,uuid,jsonb,jsonb),public.import_detail(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.import_upload(uuid,uuid,text,text,jsonb),public.import_preview(uuid,uuid,uuid,jsonb,jsonb),public.import_detail(uuid,uuid) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
