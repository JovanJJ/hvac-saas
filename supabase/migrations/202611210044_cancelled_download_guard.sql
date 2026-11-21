-- Cancelled assignments cannot produce new device downloads, including for assigned office staff.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
create or replace function public.offline_visit_bundle(p_organization_id uuid,p_visit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor();b jsonb;items jsonb;begin
 if not exists(select 1 from public.visit_assignees a join public.visits v on v.organization_id=a.organization_id and v.id=a.visit_id join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id where a.organization_id=p_organization_id and a.visit_id=p_visit_id and m.user_id=actor and m.active and v.status<>'cancelled')
 then raise exception 'visit_denied' using errcode='42501';end if;
 b:=public.visit_bundle(p_organization_id,p_visit_id);
 select jsonb_agg(item||jsonb_build_object('readings',hvac_private.report_readings(item->'readings'),'parts',hvac_private.report_parts(item->'parts')) order by position) into items from jsonb_array_elements(b->'items') with ordinality entries(item,position);
 b:=jsonb_set(b,'{items}',coalesce(items,'[]'::jsonb));
 return jsonb_build_object('schemaVersion',1,'userId',actor,'organizationId',p_organization_id,'downloadedAt',statement_timestamp(),
  'visit',b-'availableSystems','source',public.return_visit_source(p_organization_id,p_visit_id),
  'photoCount',(select count(*) from public.attachments where organization_id=p_organization_id and visit_id=p_visit_id and state='verified'));
end $$;
create or replace function public.attachment_command(p_organization_id uuid,p_visit_id uuid,p_attachment_id uuid,p_kind text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=hvac_private.require_verified_actor(); v public.visits; a public.attachments; secret text; message text; signature text;
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 select * into v from public.visits where organization_id=p_organization_id and id=p_visit_id for update;
 if not found or v.status='cancelled' or not hvac_private.can_access_visit(p_organization_id,p_visit_id) then raise exception 'attachment_denied' using errcode='42501'; end if;
 if p_attachment_id is null or p_data is null or octet_length(p_data::text)>10000 then raise exception 'invalid_attachment' using errcode='22023'; end if;
 select * into a from public.attachments where organization_id=p_organization_id and id=p_attachment_id for update;
 if found and a.visit_id<>p_visit_id then raise exception 'attachment_denied' using errcode='42501'; end if;
 if p_kind='reserve' then
 if a.id is not null then
 if a.state='removed' or a.author_id<>actor or a.item_id<>(p_data->>'itemId')::uuid or a.caption is distinct from trim(p_data->>'caption') or a.visibility is distinct from p_data->>'visibility' or a.expected_bytes is distinct from (p_data->>'bytes')::integer or a.mime_type is distinct from p_data->>'mimeType' then raise exception 'attachment_conflict' using errcode='PT409'; end if;
 return a.id;
 end if;
 if v.status not in ('scheduled','in_progress') then raise exception 'visit_locked' using errcode='22023'; end if;
 if not exists(select 1 from public.visit_items where organization_id=p_organization_id and visit_id=p_visit_id and id=(p_data->>'itemId')::uuid) then raise exception 'invalid_item' using errcode='22023'; end if;
 if (select count(*) from public.attachments where visit_id=p_visit_id and state<>'removed')>=100 then raise exception 'attachment_limit' using errcode='22023'; end if;
 insert into public.attachments(id,organization_id,visit_id,item_id,author_id,caption,visibility,expected_bytes,mime_type)
 values(p_attachment_id,p_organization_id,p_visit_id,(p_data->>'itemId')::uuid,actor,trim(p_data->>'caption'),p_data->>'visibility',(p_data->>'bytes')::integer,p_data->>'mimeType');
 elsif p_kind='complete' then
 if a.id is null or a.state='removed' then raise exception 'invalid_attachment' using errcode='22023'; end if;
 -- An authenticated API caller cannot forge the server's provider verification.
 select ev.secret into secret from hvac_private.evidence_verifier ev where singleton;
 message:=concat_ws(E'\n',p_organization_id,p_visit_id,p_attachment_id,actor,p_data->>'assetId',p_data->>'version',p_data->>'bytes',p_data->>'format',p_data->>'width',p_data->>'height',p_data->>'expires');
 signature:=encode(extensions.hmac(message,secret,'sha256'),'hex');
 if secret is null or signature is distinct from p_data->>'proof' or (p_data->>'expires')::bigint<extract(epoch from now()) or (p_data->>'expires')::bigint>extract(epoch from now())+300 then raise exception 'verification_denied' using errcode='42501'; end if;
 if (p_data->>'bytes')::integer not between 1 and 8388608 or (p_data->>'format') not in ('jpg','png','webp') or (p_data->>'width')::integer<1 or (p_data->>'height')::integer<1 or (p_data->>'width')::bigint*(p_data->>'height')::bigint>40000000 or length(coalesce(p_data->>'assetId',''))=0 or (p_data->>'version')::bigint<1 then raise exception 'invalid_object' using errcode='22023'; end if;
 if a.state='verified' then
 if a.asset_id is distinct from p_data->>'assetId' or a.asset_version is distinct from (p_data->>'version')::bigint then raise exception 'attachment_conflict' using errcode='PT409'; end if;
 return a.id;
 end if;
 if v.status not in ('scheduled','in_progress') then raise exception 'visit_locked' using errcode='22023'; end if;
 update public.attachments set state='verified',asset_id=p_data->>'assetId',asset_version=(p_data->>'version')::bigint,format=p_data->>'format',verified_bytes=(p_data->>'bytes')::integer,width=(p_data->>'width')::integer,height=(p_data->>'height')::integer,verified_at=now() where id=a.id;
 elsif p_kind='remove' then
 if a.id is null then return p_attachment_id; end if;
 if a.state='removed' then return a.id; end if;
 if v.status not in ('scheduled','in_progress') then raise exception 'visit_locked' using errcode='22023'; end if;
 update public.attachments set state='removed' where id=a.id;
 else raise exception 'invalid_command' using errcode='22023'; end if;
 update public.visits set version=version+1 where id=v.id;
 return p_attachment_id;
end $$;

do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
notify pgrst,'reload schema';
