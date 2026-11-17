-- Run through worker:configure using the Storage owner/superuser, never application runtime.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('report-pdfs','report-pdfs',false,33554432,array['application/pdf']) on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='report-pdfs' and not public and file_size_limit=33554432 and allowed_mime_types=array['application/pdf']) then raise exception 'report_bucket_configuration_mismatch';end if;
end $$;
grant usage on schema storage to hvac_identity_executor;
grant select on storage.objects to hvac_identity_executor;
drop policy if exists pdf_executor_metadata on storage.objects;
create policy pdf_executor_metadata on storage.objects for select to hvac_identity_executor using(bucket_id='report-pdfs');
drop policy if exists pdf_executor_scope on storage.objects;
create policy pdf_executor_scope on storage.objects as restrictive for select to hvac_identity_executor using(bucket_id='report-pdfs');
drop policy if exists pdf_read on storage.objects;
create policy pdf_read on storage.objects for select to authenticated using(bucket_id='report-pdfs' and hvac_private.pdf_storage_read(name));
drop policy if exists pdf_read_scope on storage.objects;
create policy pdf_read_scope on storage.objects as restrictive for select to authenticated using(bucket_id<>'report-pdfs' or hvac_private.pdf_storage_read(name));
drop policy if exists pdf_insert on storage.objects;
create policy pdf_insert on storage.objects for insert to authenticated with check(bucket_id='report-pdfs' and hvac_private.pdf_storage_insert(name));
drop policy if exists pdf_insert_scope on storage.objects;
create policy pdf_insert_scope on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'report-pdfs' or hvac_private.pdf_storage_insert(name));
drop policy if exists pdf_no_update on storage.objects;
create policy pdf_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'report-pdfs') with check(bucket_id<>'report-pdfs');
drop policy if exists pdf_no_delete on storage.objects;
create policy pdf_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'report-pdfs');
drop policy if exists pdf_no_anonymous on storage.objects;
create policy pdf_no_anonymous on storage.objects as restrictive for all to anon using(bucket_id<>'report-pdfs') with check(bucket_id<>'report-pdfs');

-- M3d: raw guest capability is supplied only in a request header, not a file URL.
-- Replace the M3c blanket SELECT denial; writes remain unconditionally denied.
drop policy if exists pdf_no_anonymous on storage.objects;
drop policy if exists pdf_guest_read on storage.objects;
create policy pdf_guest_read on storage.objects for select to anon using(bucket_id='report-pdfs' and hvac_private.guest_pdf_read(name));
drop policy if exists pdf_guest_scope on storage.objects;
create policy pdf_guest_scope on storage.objects as restrictive for select to anon using(bucket_id<>'report-pdfs' or hvac_private.guest_pdf_read(name));
drop policy if exists pdf_guest_no_insert on storage.objects;
create policy pdf_guest_no_insert on storage.objects as restrictive for insert to anon with check(bucket_id<>'report-pdfs');
drop policy if exists pdf_guest_no_update on storage.objects;
create policy pdf_guest_no_update on storage.objects as restrictive for update to anon using(bucket_id<>'report-pdfs') with check(bucket_id<>'report-pdfs');
drop policy if exists pdf_guest_no_delete on storage.objects;
create policy pdf_guest_no_delete on storage.objects as restrictive for delete to anon using(bucket_id<>'report-pdfs');
