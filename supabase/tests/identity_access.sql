-- Transaction is opened by the runner and always rolled back.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'Owner A organization scope failed'; end if;
  if exists(select 1 from public.organizations where id='a1000000-0000-4000-8000-000000000002') then raise exception 'Cross tenant read'; end if;
  if (select count(*) from public.memberships) <> 1 then raise exception 'Membership scope failed'; end if;
  begin
    insert into public.organizations(display_name) values('Disallowed write');
    raise exception 'Unexpected insert grant';
  exception when insufficient_privilege then null; end;
  begin
    update public.memberships set role='owner';
    raise exception 'Unexpected membership write grant';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000103', true);
do $$ begin
  if (select count(*) from public.organizations) <> 1 or not exists(select 1 from public.organizations where display_name='Primer servis B') then raise exception 'Owner B scope failed'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000102', true);
do $$ begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'Technician scope failed'; end if;
  if exists(select 1 from public.organizations where display_name='Primer servis B') then raise exception 'Technician cross tenant read'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000104', true);
do $$ begin
  if exists(select 1 from public.organizations) or exists(select 1 from public.memberships) then raise exception 'Unassigned identity gained access'; end if;
end $$;
reset role;
-- Revoke one fixture in the transaction, prove stale JWT identity is insufficient.
update public.memberships set active=false where user_id='a1000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000102', true);
do $$ begin
  if exists(select 1 from public.organizations) or exists(select 1 from public.memberships) then raise exception 'Revoked identity retained access'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.organizations;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
