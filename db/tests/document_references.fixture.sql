-- Disposable PostgreSQL database ONLY. No production data or credentials.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
-- Test doubles only; production permission functions are NOT replaced by the migration.
create function public.project_can_edit(text, uuid) returns boolean language sql stable as $$select $2='00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.project_role_of(text, uuid) returns text language sql stable as $$select case when $2='00000000-0000-0000-0000-000000000001'::uuid then 'owner' end$$;
create table public.storage_assets(id uuid primary key,project_id text,bucket text,path text,kind text,status text,bytes bigint,cleanup_attempts int default 0,created_at timestamptz default now(),deleted_at timestamptz);
grant select on public.storage_assets to authenticated; grant all on public.storage_assets to service_role;
create table public.storage_asset_refs(asset_id uuid references public.storage_assets(id),project_id text,ref_kind text,ref_id text not null,primary key(asset_id,ref_kind,ref_id));
grant select on public.storage_asset_refs to authenticated; grant all on public.storage_asset_refs to service_role;
create table public.project_home_state(project_id text primary key,revision bigint,payload jsonb);
grant select, insert, update on public.project_home_state to authenticated; grant all on public.project_home_state to service_role;
create table public.cad_object_state(project_id text,sheet_id text,object_id text,payload jsonb,deleted boolean default false,primary key(project_id,sheet_id,object_id));
grant select on public.cad_object_state to authenticated; grant all on public.cad_object_state to service_role;
create table public.storage_quota_settings(id boolean, reservation_ttl interval);
grant select on public.storage_quota_settings to authenticated; grant all on public.storage_quota_settings to service_role;
insert into public.storage_quota_settings values(true, '1 hour');
create schema storage;
create table storage.objects(bucket_id text,name text);
insert into storage.objects values('project-attachments','p/docs/a.pdf');
insert into public.storage_assets(id,project_id,bucket,path,kind,status,bytes) values ('10000000-0000-0000-0000-000000000001','p','project-attachments','p/docs/a.pdf','attachment','active',1000);
insert into public.project_home_state values('p',1,'{"files":[{"id":"a","storageBucket":"project-attachments","storagePath":"p/docs/a.pdf"}]}');
-- Existing quota functions are loaded from storage_quotas_v2 by the test runner.
