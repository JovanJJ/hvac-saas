-- Use built-in, data-free normalization in indexes so ordinary SQL maintenance
-- never needs new execution privileges on a private application helper.
drop index public.sites_import_key_idx;
drop index public.systems_import_key_idx;
create index sites_import_key_idx on public.sites(organization_id,(upper(btrim(regexp_replace(normalize(coalesce(code,''),NFKC),'\s+',' ','g')))));
create index systems_import_key_idx on public.systems(organization_id,site_id,(upper(btrim(regexp_replace(normalize(coalesce(code,''),NFKC),'\s+',' ','g')))));
