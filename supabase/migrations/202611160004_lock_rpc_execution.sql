-- Revoke under inherited function-owner authority. SET-only membership can transfer
-- ownership but cannot revoke the new owner's default execution grants.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('create_workspace','update_workspace','create_workspace_invitation','lookup_workspace_invitation','accept_workspace_invitation','revoke_workspace_invitation','update_workspace_member','workspace_roster','workspace_invitations'))
      or (n.nspname='hvac_private' and p.proname='has_workspace_role')
  loop execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature); end loop;
end $$;
grant execute on function public.create_workspace(uuid,text,text),public.update_workspace(uuid,text,text,integer),
  public.create_workspace_invitation(uuid,uuid,text,text,text),public.accept_workspace_invitation(text),
  public.revoke_workspace_invitation(uuid,uuid),public.update_workspace_member(uuid,uuid,text,boolean,integer),
  public.workspace_roster(uuid),public.workspace_invitations(uuid) to authenticated;
grant execute on function public.lookup_workspace_invitation(text) to anon,authenticated;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
