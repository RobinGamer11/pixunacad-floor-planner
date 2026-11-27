-- Run ONLY in a disposable PostgreSQL fixture, never against production.
-- Fixture tables match the existing storage_quota_v2 and CAD column names;
-- apply 20261127195500_document_references.sql twice before this file.
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*)=2 from storage_asset_refs where asset_id='10000000-0000-0000-0000-000000000001'), 'idempotent backfill';
  assert (select bytes=1000 and status='active' from storage_assets where project_id='p'), 'migration preserves asset';
  assert not has_function_privilege('anon','public.storage_prepare_document_cleanup(text,bigint,text,text)','execute'), 'anon forbidden';
  assert has_function_privilege('authenticated','public.storage_prepare_document_cleanup(text,bigint,text,text)','execute'), 'authenticated grant';
  assert not storage_prepare_document_cleanup('p',1,'project-attachments','p/docs/a.pdf'), 'confirmed home refs protected';
  begin
    perform storage_prepare_document_cleanup('p',0,'project-attachments','p/docs/a.pdf');
    raise exception 'stale acknowledgement accepted';
  exception when others then if sqlerrm <> 'PIXUNA_STALE_CONFIRMATION' then raise; end if; end;
end $$;
set test.uid = '';
do $$ begin
  begin perform storage_prepare_document_cleanup('p',1,'project-attachments','p/docs/a.pdf'); raise exception 'anonymous accepted';
  exception when others then if sqlerrm <> 'PIXUNA_FORBIDDEN' then raise; end if; end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000002';
do $$ begin
  begin perform storage_prepare_document_cleanup('p',1,'project-attachments','p/docs/a.pdf'); raise exception 'unauthorized editor accepted';
  exception when others then if sqlerrm <> 'PIXUNA_FORBIDDEN' then raise; end if; end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into cad_object_state(project_id,sheet_id,object_id,payload,deleted)
values('p','s','doc','{"storagePath":"p/docs/a.pdf"}',false);
update project_home_state set revision=2,payload='{"files":[]}' where project_id='p';
do $$ begin assert not storage_prepare_document_cleanup('p',2,'project-attachments','p/docs/a.pdf'), 'CAD ref protected'; end $$;
insert into project_home_state values('q',1,'{"files":[],"overview":{"attachment":"p/docs/a.pdf"}}');
update cad_object_state set deleted=true where object_id='doc';
do $$ begin assert not storage_prepare_document_cleanup('p',2,'project-attachments','p/docs/a.pdf'), 'other confirmed project protected'; end $$;
update project_home_state set payload='{"files":[]}' where project_id='q';
do $$ begin
 assert storage_prepare_document_cleanup('p',2,'project-attachments','p/docs/a.pdf'), 'cleanup prepared';
 assert (select bytes=1000 from storage_assets where project_id='p'), 'quota remains until physical removal';
 begin
   update project_home_state set payload='{"files":[{"id":"undo","storagePath":"p/docs/a.pdf","storageBucket":"project-attachments"}]}' where project_id='p';
   raise exception 'new home reference raced past prepared deletion';
 exception when others then if sqlerrm not in ('PIXUNA_ASSET_MISSING','PIXUNA_ASSET_BUSY') then raise; end if; end;
 begin
   update cad_object_state set deleted=false where object_id='doc';
   raise exception 'new CAD reference raced past prepared deletion';
 exception when others then if sqlerrm <> 'PIXUNA_ASSET_BUSY' then raise; end if; end;
 assert (select payload='{"files":[]}'::jsonb from project_home_state where project_id='p'), 'failed publication rolls back';
 assert (select count(*)=1 from storage_claim_cleanup('p',200)), 'controlled cleanup claim';
 assert storage_finalize_delete(array['10000000-0000-0000-0000-000000000001'::uuid])=0, 'physical object still exists';
 assert (select bytes=1000 from storage_assets where project_id='p'), 'quota not prematurely released';
end $$;
delete from storage.objects where bucket_id='project-attachments' and name='p/docs/a.pdf';
do $$ begin
 assert storage_finalize_delete(array['10000000-0000-0000-0000-000000000001'::uuid])=1, 'physical deletion confirmed';
 assert (select bytes=0 and status='deleted' from storage_assets where project_id='p'), 'quota now released';
 assert storage_finalize_delete(array['10000000-0000-0000-0000-000000000001'::uuid])=0, 'finalization repeatable';
end $$;
select 'document reference / permission / revision / quota assertions passed' as result;
