-- Enforce the source-item/visit relationship for SQL tooling as well as RPC callers.
alter table public.visit_items add constraint visit_items_visit_identity unique(organization_id,visit_id,id);
alter table public.attachments add constraint attachments_source_visit_fk
 foreign key(organization_id,visit_id,item_id) references public.visit_items(organization_id,visit_id,id);
