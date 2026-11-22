-- Normalize surrounding compatibility spaces before indexing stable import keys.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema hvac_private to hvac_identity_executor;
create or replace function hvac_private.import_key(value text) returns text language sql immutable set search_path='' as $$
 select upper(btrim(regexp_replace(normalize(coalesce(value,''),NFKC),'\s+',' ','g')))
$$;
create index sites_import_key_idx on public.sites(organization_id,hvac_private.import_key(code));
create index systems_import_key_idx on public.systems(organization_id,site_id,hvac_private.import_key(code));
revoke create on schema hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
