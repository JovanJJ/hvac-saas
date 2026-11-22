set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();sys uuid:=gen_random_uuid();batch uuid:=gen_random_uuid();op uuid:=gen_random_uuid();out jsonb;prior jsonb;grid jsonb;mapping jsonb:='{"siteCode":0,"systemCode":1,"room":2,"serial":3}';snapshot jsonb;
begin
 perform public.save_operation(org,c,'customer','{"name":"Fiktivan uvoz M5c"}');
 perform public.save_operation(org,s,'site',jsonb_build_object('customerId',c,'code',s,'name','Prva lokacija','address','Primer 5','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,s2,'site',jsonb_build_object('customerId',c,'code',s2,'name','Druga lokacija','address','Primer 6','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,sys,'system',jsonb_build_object('siteId',s,'code',' KL-01 ','room','Čačak','serial','0001'));
 snapshot:=public.register_detail(org,'system',sys);
 grid:=jsonb_build_object('headers',jsonb_build_array('Lokacija','Sistem','Prostorija','Serijski broj'),'rows',jsonb_build_array(
 jsonb_build_object('number',2,'cells',jsonb_build_array(s,'kl-01','Nova prostorija','00002')),
 jsonb_build_object('number',3,'cells',jsonb_build_array(s,'KL-02','Kancelarija','00003')),
 jsonb_build_object('number',4,'cells',jsonb_build_array(s,'','Nedostaje oznaka','')),
 jsonb_build_object('number',5,'cells',jsonb_build_array(s2,'KL-01','Druga lokacija',''))));
 perform public.import_upload(org,batch,'fiktivno.csv',repeat('a',64),grid);
 perform public.import_upload(org,batch,'fiktivno.csv',repeat('a',64),grid);
 begin perform public.import_upload(org,batch,'fiktivno.csv',repeat('b',64),grid);raise exception 'changed upload accepted';exception when sqlstate 'PT409' then null;end;
 perform public.import_preview(org,batch,op,mapping,'{}');
 out:=public.import_detail(org,batch);prior:=out->'preview';
 if prior->'rows'->0->>'action'<>'matched' or prior->'rows'->0->>'systemId'<>sys::text or prior->'rows'->1->>'action'<>'new' or prior->'rows'->2->>'action'<>'error' or prior->'rows'->3->>'action'<>'new' then raise exception 'row matching failed: %',prior;end if;
 if prior->'rows'->0->'values'->>'serial'<>'00002' then raise exception 'serial zero lost';end if;
 perform public.import_preview(org,batch,op,mapping,'{}');
 if public.import_detail(org,batch)->'preview'<>prior then raise exception 'retry changed immutable preview';end if;
 begin perform public.import_preview(org,batch,op,mapping-'serial','{}');raise exception 'changed retry';exception when sqlstate 'PT409' then null;end;
 begin perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":0}','{}');raise exception 'duplicate mapping';exception when invalid_parameter_value then null;end;
 begin perform public.import_preview(org,batch,gen_random_uuid(),mapping,jsonb_build_object('2',jsonb_build_object('siteId',s2)));exception when others then raise;end;
 if public.import_detail(org,batch)->'preview'->'rows'->0->>'action'<>'error' then raise exception 'foreign resolution accepted';end if;
 if public.register_detail(org,'system',sys)<>snapshot then raise exception 'preview mutated register';end if;
 perform set_config('hvac_test.import_batch',batch::text,true);
end $$;
-- Normalization collisions are legal legacy codes; require an explicit matching choice.
reset role;
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();batch uuid:=gen_random_uuid();preview jsonb;grid jsonb;count_before integer;
begin
 insert into public.customers(id,organization_id,name) values(c,org,'Fiktivne dvosmislene oznake');
 insert into public.sites(id,organization_id,customer_id,code,name,address,time_zone) values(a,org,c,'M5C  A','Prva','Primer','Europe/Belgrade'),(b,org,c,'M5C A','Druga','Primer','Europe/Belgrade');
 select count(*) into count_before from public.systems where organization_id=org;
 grid:='{"headers":["siteCode","systemCode","room"],"rows":[{"number":2,"cells":["m5c a","KL-01","Šuma"]}]}';
 perform public.import_upload(org,batch,'fiktivno.xlsx',repeat('c',64),grid);
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}','{}');
 preview:=public.import_detail(org,batch)->'preview';
 if preview->'rows'->0->>'action'<>'error' or jsonb_array_length(preview->'rows'->0->'sites')<>2 then raise exception 'ambiguity not exposed';end if;
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}',jsonb_build_object('2',jsonb_build_object('siteId',a)));
 if public.import_detail(org,batch)->'preview'->'rows'->0->>'action'<>'new' then raise exception 'resolution failed';end if;
 -- Both duplicate rows are rejected after normalization, regardless of different serials.
 batch:=gen_random_uuid();grid:=jsonb_set(grid,'{rows}',(grid->'rows')||jsonb_build_array(jsonb_build_object('number',3,'cells',jsonb_build_array('M5C  A','kl-01','Druga'))));
 perform public.import_upload(org,batch,'duplikati.csv',repeat('d',64),grid);
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}',jsonb_build_object('2',jsonb_build_object('siteId',a),'3',jsonb_build_object('siteId',a)));
 preview:=public.import_detail(org,batch)->'preview';
 if exists(select 1 from jsonb_array_elements(preview->'rows') x where x->>'action'<>'error') then raise exception 'duplicate accepted';end if;
 if (select count(*) from public.systems where organization_id=org)<>count_before then raise exception 'preview created systems';end if;
 -- Compatibility forms may collide even though legacy raw codes are distinct.
 insert into public.systems(id,organization_id,site_id,code,room) values(gen_random_uuid(),org,a,'KL-09','Prva'),(gen_random_uuid(),org,a,'ＫＬ-09','Druga');
 batch:=gen_random_uuid();grid:=jsonb_build_object('headers',jsonb_build_array('siteCode','systemCode','room'),'rows',jsonb_build_array(jsonb_build_object('number',2,'cells',jsonb_build_array(chr(160)||'m5c a'||chr(160),'kl-09','Šuma'))));
 perform public.import_upload(org,batch,'sistemi.csv',repeat('e',64),grid);
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}',jsonb_build_object('2',jsonb_build_object('siteId',a)));
 preview:=public.import_detail(org,batch)->'preview';
 if jsonb_array_length(preview->'rows'->0->'systems')<>2 or preview->'rows'->0->>'action'<>'error' then raise exception 'system ambiguity or compatibility-space normalization failed';end if;
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}',jsonb_build_object('2',jsonb_build_object('siteId',a,'systemId',preview->'rows'->0->'systems'->0->>'id')));
 preview:=public.import_detail(org,batch)->'preview';
 if preview->'rows'->0->>'action'<>'matched' then raise exception 'system resolution failed';end if;
 update public.systems set archived_at=now(),version=version+1 where id=(preview->'rows'->0->>'systemId')::uuid;
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}',jsonb_build_object('2',jsonb_build_object('siteId',a,'systemId',preview->'rows'->0->>'systemId')));
 if public.import_detail(org,batch)->'preview'->'rows'->0->>'action'<>'error' then raise exception 'archived system accepted';end if;
 update public.sites set archived_at=now(),version=version+1 where id=a;
 perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1,"room":2}',jsonb_build_object('2',jsonb_build_object('siteId',a)));
 if not(public.import_detail(org,batch)->'preview'->'rows'->0->'errors' ? 'Lokacija ili njen klijent su arhivirani.') then raise exception 'archived site accepted';end if;

end $$;
set local role authenticated;
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';batch uuid:=current_setting('hvac_test.import_batch')::uuid;person text;
begin
 foreach person in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
  perform set_config('request.jwt.claim.sub',person,true);
  begin perform public.import_detail(org,batch);raise exception 'unauthorized read';exception when insufficient_privilege then null;end;
  begin perform public.import_preview(org,batch,gen_random_uuid(),'{"siteCode":0,"systemCode":1}','{}');raise exception 'unauthorized preview';exception when insufficient_privilege then null;end;
  begin perform public.import_upload(org,gen_random_uuid(),'no.csv',repeat('a',64),'{"headers":["a","b"],"rows":[{"number":2,"cells":["x","y"]}]}');raise exception 'unauthorized upload';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
-- A coordinator may preview; revoking the membership immediately withdraws access.
insert into public.memberships(organization_id,user_id,role) values('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000104','coordinator') on conflict(organization_id,user_id) do update set role='coordinator',active=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
select public.import_preview('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.import_batch')::uuid,gen_random_uuid(),'{"siteCode":0,"systemCode":1}','{}');
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
do $$ begin
 begin perform public.import_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.import_batch')::uuid);raise exception 'revoked access';exception when insufficient_privilege then null;end;
 begin perform count(*) from hvac_private.import_batches;raise exception 'raw batch read';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.import_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.import_batch')::uuid);raise exception 'anonymous access';exception when insufficient_privilege then null;end;
end $$;
reset role;
