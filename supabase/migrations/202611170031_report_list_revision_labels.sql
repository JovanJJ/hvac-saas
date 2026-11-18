-- Make every office list entry identify its exact revision.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public to hvac_identity_executor;
create or replace function public.report_list(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform hvac_private.require_verified_actor();
 if not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator']) then raise exception 'report_denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(t order by t."issuedAt" desc) from (select r.id,r.revision_no as revision,r.report_number as number,r.snapshot->>'site' as site,r.issued_at as "issuedAt",j.state as "renderState" from public.report_revisions r join hvac_private.render_jobs j on j.organization_id=r.organization_id and j.revision_id=r.id where r.organization_id=p_organization_id order by r.issued_at desc limit 20) t),'[]');
end $$;
revoke create on schema public from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
