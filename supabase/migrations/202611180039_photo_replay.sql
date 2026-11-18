-- Stable per-phase acknowledgements make photo version effects recoverable after a lost response.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
grant create on schema public,hvac_private to hvac_identity_executor;
create table hvac_private.photo_replay_receipts (
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references auth.users(id),
 attachment_id uuid not null, phase text not null check(phase in ('reserve','complete','remove')),
 payload jsonb not null, result jsonb not null,
 primary key(organization_id,actor_id,attachment_id,phase)
);
revoke all on hvac_private.photo_replay_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on hvac_private.photo_replay_receipts to hvac_identity_executor;
create function public.replay_photo_command(p_organization_id uuid,p_visit_id uuid,p_attachment_id uuid,p_kind text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();v public.visits;a public.attachments;before_version integer;
 previous hvac_private.photo_replay_receipts;payload jsonb;result jsonb;effects jsonb;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found or not hvac_private.has_workspace_role(p_organization_id,array['owner','coordinator','technician']) or not exists(
  select 1 from public.visit_assignees va join public.memberships m on m.organization_id=va.organization_id and m.id=va.membership_id
  where va.organization_id=p_organization_id and va.visit_id=p_visit_id and m.active and m.user_id=actor)
 then raise exception 'attachment_denied' using errcode='42501';end if;
 if p_kind not in ('reserve','complete','remove') or p_kind is null or p_data is null or p_attachment_id is null or octet_length(p_data::text)>10000 then raise exception 'invalid_attachment' using errcode='22023';end if;
 select * into a from public.attachments where organization_id=p_organization_id and id=p_attachment_id;
 if a.id is not null and (a.visit_id<>p_visit_id or a.author_id<>actor) then raise exception 'attachment_denied' using errcode='42501';end if;
 -- Fresh server attestations may expire; the logical verified object remains the same operation.
 payload:=jsonb_build_object('visit',p_visit_id,'data',case when p_kind='complete' then p_data-'proof'-'expires' else p_data end);
 select * into previous from hvac_private.photo_replay_receipts r where r.organization_id=p_organization_id and r.actor_id=actor and r.attachment_id=p_attachment_id and r.phase=p_kind;
 if found then
  if previous.payload<>payload then raise exception 'attachment_conflict' using errcode='PT409';end if;
  return previous.result;
 end if;
 -- Reserve before removal to leave a tombstone even when a preparation response was lost.
 if p_kind='remove' and a.id is null then
  perform public.replay_photo_command(p_organization_id,p_visit_id,p_attachment_id,'reserve',p_data);
 end if;
 select version into before_version from public.visits where id=p_visit_id;
 perform public.attachment_command(p_organization_id,p_visit_id,p_attachment_id,p_kind,p_data);
 select * into v from public.visits where id=p_visit_id;
 select * into a from public.attachments where id=p_attachment_id and organization_id=p_organization_id;
 select coalesce(jsonb_object_agg(r.phase,(r.result->'effects'->r.phase)),'{}'::jsonb) into effects from hvac_private.photo_replay_receipts r where r.organization_id=p_organization_id and r.actor_id=actor and r.attachment_id=p_attachment_id;
 effects:=effects||jsonb_build_object(p_kind,v.version-before_version);
 result:=jsonb_build_object('id',a.id,'visitId',p_visit_id,'itemId',a.item_id,'actorId',actor,'phase',p_kind,'state',a.state,'effects',effects,'confirmedAt',clock_timestamp(),
  'visit',jsonb_build_object('version',v.version,'status',v.status,'startedAt',v.started_at,'submittedAt',v.submitted_at,'submittedBy',v.submitted_by,'correctionReason',v.correction_reason));
 insert into hvac_private.photo_replay_receipts values(p_organization_id,actor,p_attachment_id,p_kind,payload,result);
 return result;
end $$;
alter function public.replay_photo_command(uuid,uuid,uuid,text,jsonb) owner to hvac_identity_executor;
revoke all on function public.replay_photo_command(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.replay_photo_command(uuid,uuid,uuid,text,jsonb) to authenticated;
revoke create on schema public,hvac_private from hvac_identity_executor;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
