set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$ declare target uuid; again uuid; invitation uuid; before_count integer; member_id uuid; member_version integer;
begin
  target:=public.create_workspace('b1000000-0000-4000-8000-000000000001','M1b test workspace','Europe/Belgrade');
  again:=public.create_workspace('b1000000-0000-4000-8000-000000000001','M1b test workspace','Europe/Belgrade');
  if target<>again then raise exception 'Workspace retry duplicated organization'; end if;
  begin
    perform public.create_workspace('b1000000-0000-4000-8000-000000000001','Changed payload','Europe/Belgrade');
    raise exception 'Changed operation payload accepted';
  exception when invalid_parameter_value then null; end;
  select id,version into member_id,member_version from public.memberships where organization_id=target;
  begin
    perform public.update_workspace_member(target,member_id,'technician',true,member_version);
    raise exception 'Last owner demoted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.update_workspace_member(target,member_id,'owner',false,member_version);
    raise exception 'Last owner revoked';
  exception when invalid_parameter_value then null; end;
  invitation:=public.create_workspace_invitation(target,'b1000000-0000-4000-8000-000000000002','unassigned@hvac.example.invalid','technician',repeat('a',64));
  again:=public.create_workspace_invitation(target,'b1000000-0000-4000-8000-000000000002','unassigned@hvac.example.invalid','technician',repeat('a',64));
  if invitation<>again then raise exception 'Invitation retry duplicated link'; end if;
  if (select count(*) from public.workspace_invitations(target))<>1 then raise exception 'Duplicate invitation'; end if;
  begin
    perform public.accept_workspace_invitation(repeat('a',64));
    raise exception 'Mismatched email accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
  if public.accept_workspace_invitation(repeat('a',64))<>target then raise exception 'Wrong accepted organization'; end if;
  perform public.accept_workspace_invitation(repeat('a',64));
  if (select count(*) from public.memberships where organization_id=target)<>1 then raise exception 'Wrong self membership after retry'; end if;
  begin
    perform public.create_workspace_invitation(target,'b1000000-0000-4000-8000-000000000003','owner.b@hvac.example.invalid','owner',repeat('b',64));
    raise exception 'Technician issued invitation';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.workspace_roster(target);
    raise exception 'Technician accessed roster';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
  select r.membership_id,r.version into member_id,member_version from public.workspace_roster(target) r where r.email='unassigned@hvac.example.invalid';
  perform public.update_workspace_member(target,member_id,'coordinator',true,member_version);
  begin
    perform public.update_workspace_member(target,member_id,'owner',true,member_version);
    raise exception 'Stale version accepted';
  exception when sqlstate 'PT409' then null; end;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
  if (select count(*) from public.workspace_roster(target))<>2 then raise exception 'Coordinator cannot read active roster'; end if;
  begin
    perform public.update_workspace_member(target,member_id,'owner',true,member_version+1);
    raise exception 'Coordinator escalated role';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
  begin
    perform 1 from public.workspace_roster(target);
    raise exception 'Other organization accessed roster';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
  perform public.update_workspace_member(target,member_id,'coordinator',false,member_version+1);
  perform public.create_workspace_invitation(target,'b1000000-0000-4000-8000-000000000003','owner.b@hvac.example.invalid','technician',repeat('b',64));
  perform public.revoke_workspace_invitation(target,'b1000000-0000-4000-8000-000000000003');
  if exists(select 1 from public.lookup_workspace_invitation(repeat('b',64))) then raise exception 'Revoked link preview leaked'; end if;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
  begin
    perform public.accept_workspace_invitation(repeat('a',64));
    raise exception 'Accepted link restored revoked membership';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.organizations where id=target) then raise exception 'Revoked member retained RLS access'; end if;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000105',true);
  begin
    perform public.create_workspace('b1000000-0000-4000-8000-000000000005','Unconfirmed owner','Europe/Belgrade');
    raise exception 'Unconfirmed actor created workspace';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Expiry is checked independently at acceptance, not merely in the UI.
update hvac_private.invitations set revoked_at=null,expires_at=now()-interval '1 minute' where id='b1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000103',true);
do $$ begin
  if exists(select 1 from public.lookup_workspace_invitation(repeat('b',64))) then raise exception 'Expired preview leaked'; end if;
  begin
    perform public.accept_workspace_invitation(repeat('b',64));
    raise exception 'Expired invitation accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.create_workspace('b1000000-0000-4000-8000-000000000007','Anonymous owner','Europe/Belgrade');
    raise exception 'Anonymous command allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
