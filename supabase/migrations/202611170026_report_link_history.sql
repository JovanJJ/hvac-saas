-- Keep older links available for office review/revocation as history grows.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user); end $$;
grant create on schema public to hvac_identity_executor;
create or replace function public.report_links(p_organization_id uuid,p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) or not exists(select 1 from public.report_revisions where organization_id=p_organization_id and id=p_revision_id) then raise exception 'report_denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'expired',expires_at<=now()) order by created_at desc,id) from (select * from hvac_private.report_links where organization_id=p_organization_id and revision_id=p_revision_id order by created_at desc,id) links),'[]'::jsonb);
end $$;
revoke create on schema public from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user); end $$;
