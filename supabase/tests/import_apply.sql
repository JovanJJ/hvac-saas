set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000101',true);
do $$
declare org uuid:='a1000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
 batch uuid:=gen_random_uuid();again uuid;preview jsonb;prior jsonb;grid jsonb;result jsonb;retry jsonb;op uuid:=gen_random_uuid();mapping jsonb:='{"siteCode":0,"systemCode":1,"room":2,"serial":3}';new_id uuid;snapshot jsonb;
begin
 perform public.save_operation(org,c,'customer','{"name":"Fiktivan M5d klijent"}');
 perform public.save_operation(org,s,'site',jsonb_build_object('customerId',c,'code',s,'name','Fiktivna lokacija','address','Primer 9','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,s2,'site',jsonb_build_object('customerId',c,'code',s2,'name','Druga lokacija','address','Primer 10','timeZone','Europe/Belgrade'));
 perform public.save_operation(org,a,'system',jsonb_build_object('siteId',s,'code','KL-01','room','Stara prostorija','model','Sačuvan model','serial','00001','manufacturer','Sačuvan proizvođač'));
 perform public.save_operation(org,b,'system',jsonb_build_object('siteId',s,'code','KL-02','room','Kancelarija','serial','00002'));
 grid:=jsonb_build_object('headers',jsonb_build_array('Lokacija','Sistem','Prostorija','Serijski broj'),'rows',jsonb_build_array(
 jsonb_build_object('number',2,'cells',jsonb_build_array(s,'kl-01','Nova prostorija','')),
 jsonb_build_object('number',3,'cells',jsonb_build_array(s,'KL-02','Kancelarija','00002')),
 jsonb_build_object('number',4,'cells',jsonb_build_array(s,'KL-03','Čačak','00003')),
 jsonb_build_object('number',5,'cells',jsonb_build_array(s2,'KL-03','Druga lokacija','00004'))));
 perform public.import_upload(org,batch,'fiktivno.csv',repeat('a',64),grid);
 perform public.import_preview(org,batch,gen_random_uuid(),mapping,'{}');
 preview:=public.import_detail(org,batch)->'preview';prior:=preview;
 begin perform public.import_apply(org,batch,(preview->>'id')::uuid,preview->>'digest',op,false);raise exception 'missing confirmation';exception when invalid_parameter_value then null;end;
 begin perform public.import_apply(org,batch,(preview->>'id')::uuid,repeat('b',64),op,true);raise exception 'altered digest';exception when sqlstate 'PT409' then null;end;
 perform public.import_preview(org,batch,gen_random_uuid(),mapping,'{}');
 begin perform public.import_apply(org,batch,(prior->>'id')::uuid,prior->>'digest',op,true);raise exception 'superseded preview';exception when sqlstate 'PT409' then null;end;
 preview:=public.import_detail(org,batch)->'preview';
 result:=public.import_apply(org,batch,(preview->>'id')::uuid,preview->>'digest',op,true);
 if result->>'created'<>'2' or result->>'updated'<>'1' or result->>'skipped'<>'1' then raise exception 'wrong counts: %',result;end if;
 new_id:=(result->'rows'->2->>'systemId')::uuid;
 if new_id=(result->'rows'->3->>'systemId')::uuid then raise exception 'cross-site identity collapsed';end if;
 if not exists(select 1 from public.systems where organization_id=org and id=a and room='Nova prostorija' and serial='' and model='Sačuvan model' and manufacturer='Sačuvan proizvođač' and version=2) then raise exception 'selected fields/identity/version failed';end if;
 if not exists(select 1 from public.systems where organization_id=org and id=b and version=1) then raise exception 'skipped version changed';end if;
 snapshot:=public.register_detail(org,'system',a);
 retry:=public.import_apply(org,batch,(preview->>'id')::uuid,preview->>'digest',op,true);
 if retry<>result or public.register_detail(org,'system',a)<>snapshot then raise exception 'lost response replay changed result';end if;
 retry:=public.import_apply(org,batch,(preview->>'id')::uuid,preview->>'digest',gen_random_uuid(),true);
 if retry<>result then raise exception 'second operation duplicated batch';end if;
 begin perform public.import_apply(org,batch,(preview->>'id')::uuid,repeat('b',64),op,true);raise exception 'changed receipt payload';exception when sqlstate 'PT409' then null;end;
 begin perform public.import_preview(org,batch,gen_random_uuid(),mapping,'{}');raise exception 'applied batch remapped';exception when sqlstate 'PT409' then null;end;
 perform public.import_preview(org,batch,(preview->>'id')::uuid,mapping,'{}');
 if public.import_detail(org,batch)->'application'->>'created'<>'2' then raise exception 'durable result absent';end if;
 -- A fresh upload matches the same stable IDs and performs no unnecessary writes.
 again:=gen_random_uuid();perform public.import_upload(org,again,'ponovo.csv',repeat('a',64),grid);
 perform public.import_preview(org,again,gen_random_uuid(),mapping,'{}');prior:=public.import_detail(org,again)->'preview';
 retry:=public.import_apply(org,again,(prior->>'id')::uuid,prior->>'digest',gen_random_uuid(),true);
 if retry->>'created'<>'0' or retry->>'updated'<>'0' or retry->>'skipped'<>'4' or retry->'rows'->2->>'systemId'<>new_id::text then raise exception 'reimport duplicated identities';end if;
 perform set_config('hvac_test.apply_batch',batch::text,true);perform set_config('hvac_test.apply_preview',preview::text,true);perform set_config('hvac_test.apply_op',op::text,true);
 -- One invalid row prevents every business write.
 again:=gen_random_uuid();perform public.import_upload(org,again,'greska.csv',repeat('c',64),jsonb_set(grid,'{rows,0,cells,2}','""'));
 perform public.import_preview(org,again,gen_random_uuid(),mapping,'{}');prior:=public.import_detail(org,again)->'preview';
 begin perform public.import_apply(org,again,(prior->>'id')::uuid,prior->>'digest',gen_random_uuid(),true);raise exception 'invalid batch applied';exception when invalid_parameter_value then null;end;
 if public.register_detail(org,'system',a)<>snapshot then raise exception 'invalid batch partially applied';end if;
 -- A metadata edit after review rejects the complete batch, even unchanged selected values.
 again:=gen_random_uuid();perform public.import_upload(org,again,'zastarelo.csv',repeat('d',64),grid);
 perform public.import_preview(org,again,gen_random_uuid(),mapping,'{}');prior:=public.import_detail(org,again)->'preview';
 perform public.register_command(org,a,gen_random_uuid(),'system.update',2,jsonb_build_object('code','KL-01','room','Naknadna promena','model','Sačuvan model','manufacturer','Sačuvan proizvođač','serial',''));
 begin perform public.import_apply(org,again,(prior->>'id')::uuid,prior->>'digest',gen_random_uuid(),true);raise exception 'stale batch applied';exception when sqlstate 'PT409' then null;end;
 if public.import_detail(org,again)->'application' is distinct from 'null'::jsonb then raise exception 'stale application receipt';end if;
 -- New identity appearing after review also invalidates the whole batch.
 again:=gen_random_uuid();grid:=jsonb_set(grid,'{rows}',jsonb_build_array(jsonb_build_object('number',2,'cells',jsonb_build_array(s,'KL-99','Šuma',''))));
 perform public.import_upload(org,again,'nova-oznaka.csv',repeat('e',64),grid);perform public.import_preview(org,again,gen_random_uuid(),mapping,'{}');prior:=public.import_detail(org,again)->'preview';
 perform public.save_operation(org,gen_random_uuid(),'system',jsonb_build_object('siteId',s,'code','KL-99','room','Upisano posle pregleda'));
 begin perform public.import_apply(org,again,(prior->>'id')::uuid,prior->>'digest',gen_random_uuid(),true);raise exception 'new identity appeared';exception when sqlstate 'PT409' then null;end;
 -- Archival after review invalidates all rows, even if their own system versions match.
 again:=gen_random_uuid();perform public.import_upload(org,again,'arhiviranje.csv',repeat('e',64),grid);
 perform public.import_preview(org,again,gen_random_uuid(),mapping,'{}');prior:=public.import_detail(org,again)->'preview';
 perform public.register_command(org,c,gen_random_uuid(),'customer.archive',1,'{}');
 begin perform public.import_apply(org,again,(prior->>'id')::uuid,prior->>'digest',gen_random_uuid(),true);raise exception 'archived parent applied';exception when sqlstate 'PT409' then null;end;
 perform public.register_command(org,c,gen_random_uuid(),'customer.restore',2,'{}');

end $$;
-- No role may use someone else's receipt as an authorization shortcut.
do $$ declare person text;p jsonb:=current_setting('hvac_test.apply_preview')::jsonb;begin
 foreach person in array array['a1000000-0000-4000-8000-000000000102','a1000000-0000-4000-8000-000000000103','a1000000-0000-4000-8000-000000000104'] loop
  perform set_config('request.jwt.claim.sub',person,true);
  begin perform public.import_apply('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.apply_batch')::uuid,(p->>'id')::uuid,p->>'digest',current_setting('hvac_test.apply_op')::uuid,true);raise exception 'unauthorized apply';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
insert into public.memberships(organization_id,user_id,role) values('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000104','coordinator') on conflict(organization_id,user_id) do update set role='coordinator',active=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000104',true);
do $$ declare p jsonb:=current_setting('hvac_test.apply_preview')::jsonb;begin
 perform public.import_apply('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.apply_batch')::uuid,(p->>'id')::uuid,p->>'digest',gen_random_uuid(),true);
 declare batch uuid:=gen_random_uuid();detail jsonb;next_preview jsonb;result jsonb;begin
  detail:=public.import_detail('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.apply_batch')::uuid);
  perform public.import_upload('a1000000-0000-4000-8000-000000000001',batch,'koordinator.csv',repeat('f',64),detail->'grid');
  perform public.import_preview('a1000000-0000-4000-8000-000000000001',batch,gen_random_uuid(),detail->'preview'->'mapping','{}');
  next_preview:=public.import_detail('a1000000-0000-4000-8000-000000000001',batch)->'preview';
  result:=public.import_apply('a1000000-0000-4000-8000-000000000001',batch,(next_preview->>'id')::uuid,next_preview->>'digest',gen_random_uuid(),true);
  if result->>'updated'<>'1' then raise exception 'coordinator did not apply metadata';end if;
 end;
 begin perform count(*) from hvac_private.import_applications;raise exception 'raw application access';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.memberships set active=false where organization_id='a1000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000104';
set local role authenticated;
do $$ declare p jsonb:=current_setting('hvac_test.apply_preview')::jsonb;begin
 begin perform public.import_apply('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.apply_batch')::uuid,(p->>'id')::uuid,p->>'digest',gen_random_uuid(),true);raise exception 'revoked apply';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ declare p jsonb:=current_setting('hvac_test.apply_preview')::jsonb;begin
 begin perform public.import_apply('a1000000-0000-4000-8000-000000000001',current_setting('hvac_test.apply_batch')::uuid,(p->>'id')::uuid,p->>'digest',gen_random_uuid(),true);raise exception 'anonymous apply';exception when insufficient_privilege then null;end;
end $$;
reset role;
