-- Enforce tenant identity on private action relationships as well as at RPC entry points.
alter table public.follow_ups add unique(organization_id,id);
alter table hvac_private.follow_up_events add foreign key(organization_id,action_id) references public.follow_ups(organization_id,id);
alter table hvac_private.follow_up_bookings add foreign key(organization_id,action_id) references public.follow_ups(organization_id,id);
alter table hvac_private.follow_up_receipts add foreign key(organization_id) references public.organizations(id);
