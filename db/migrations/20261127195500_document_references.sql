-- Apply after 20261124120000_project_home_state.sql and storage_quotas_v2.sql.
-- Additive, repeatable; existing project payloads and permission functions stay intact.
begin;

-- Publication and reference changes share the home-state transaction.
create or replace function public.sync_home_document_refs()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  f jsonb;
  a public.storage_assets%rowtype;
begin
  -- Lock referenced assets in a stable order against cleanup/add_ref.
  perform 1 from public.storage_assets s
   where s.project_id = new.project_id
     and exists (select 1 from jsonb_array_elements(coalesce(new.payload->'files', '[]'::jsonb)) x
       where x->>'storagePath' = s.path and coalesce(x->>'storageBucket', s.bucket) = s.bucket)
   order by s.id for update;
  delete from public.storage_asset_refs r
   where r.project_id = new.project_id and r.ref_kind = 'home_document';
  for f in select * from jsonb_array_elements(coalesce(new.payload->'files', '[]'::jsonb)) loop
    if nullif(f->>'storagePath', '') is null then continue; end if;
    select * into a from public.storage_assets s
     where s.project_id = new.project_id and s.path = f->>'storagePath'
       and s.bucket = coalesce(f->>'storageBucket', s.bucket);
    if not found or a.status <> 'active' then raise exception 'PIXUNA_ASSET_MISSING'; end if;
    insert into public.storage_asset_refs(asset_id, project_id, ref_kind, ref_id)
      values(a.id, new.project_id, 'home_document', f->>'id') on conflict do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function public.sync_home_document_refs() from public, anon, authenticated;
drop trigger if exists home_document_refs on public.project_home_state;
create trigger home_document_refs after insert or update of payload on public.project_home_state
for each row execute function public.sync_home_document_refs();

-- Backfill ONLY existing confirmed references; never delete existing refs/data.
insert into public.storage_asset_refs(asset_id, project_id, ref_kind, ref_id)
select distinct a.id, h.project_id, 'home_document', f->>'id'
 from public.project_home_state h
 cross join lateral jsonb_array_elements(coalesce(h.payload->'files', '[]'::jsonb)) f
 join public.storage_assets a on a.project_id = h.project_id and a.path = f->>'storagePath'
  and a.bucket = coalesce(f->>'storageBucket', a.bucket) and a.status = 'active'
 where f->>'id' is not null
on conflict do nothing;

-- Lock and track attachment paths also inside CAD/Export and nested home payloads.
-- A new reference cannot race past a prepared physical deletion.
create or replace function public.sync_confirmed_attachment_refs()
returns trigger language plpgsql security definer set search_path = public
as $$
declare a public.storage_assets%rowtype; pl jsonb; rk text; rid text;
begin
  if tg_table_name = 'cad_object_state' then
    rk := 'cad_document';
    rid := new.project_id || chr(31) || new.sheet_id || chr(31) || new.object_id;
    pl := case when new.deleted then null else new.payload end;
  else
    rk := 'home_payload'; rid := new.project_id; pl := new.payload;
  end if;
  delete from public.storage_asset_refs
    where project_id = new.project_id and ref_kind = rk and ref_id = rid;
  for a in select * from public.storage_assets s
    where s.kind = 'attachment' and pl is not null
      and jsonb_path_exists(pl, '$.** ? (@ == $path)', jsonb_build_object('path', s.path))
    order by s.id for update
  loop
    if a.status <> 'active' then raise exception 'PIXUNA_ASSET_BUSY'; end if;
    if auth.uid() is null or public.project_role_of(a.project_id, auth.uid()) is null then
      raise exception 'PIXUNA_FORBIDDEN';
    end if;
    insert into public.storage_asset_refs(asset_id, project_id, ref_kind, ref_id)
      values(a.id, new.project_id, rk, rid) on conflict do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function public.sync_confirmed_attachment_refs() from public, anon, authenticated;
drop trigger if exists home_attachment_refs on public.project_home_state;
create trigger home_attachment_refs after insert or update of payload on public.project_home_state
for each row execute function public.sync_confirmed_attachment_refs();
drop trigger if exists cad_attachment_refs on public.cad_object_state;
create trigger cad_attachment_refs after insert or update of payload, deleted on public.cad_object_state
for each row execute function public.sync_confirmed_attachment_refs();

-- Additive backfill; preserve existing references and all project payloads.
insert into public.storage_asset_refs(asset_id, project_id, ref_kind, ref_id)
select a.id, h.project_id, 'home_payload', h.project_id
from public.project_home_state h join public.storage_assets a on a.kind = 'attachment' and a.status = 'active'
 and jsonb_path_exists(h.payload, '$.** ? (@ == $path)', jsonb_build_object('path', a.path))
on conflict do nothing;
insert into public.storage_asset_refs(asset_id, project_id, ref_kind, ref_id)
select a.id, s.project_id, 'cad_document', s.project_id || chr(31) || s.sheet_id || chr(31) || s.object_id
from public.cad_object_state s join public.storage_assets a on a.kind = 'attachment' and a.status = 'active'
 and jsonb_path_exists(s.payload, '$.** ? (@ == $path)', jsonb_build_object('path', a.path))
where not s.deleted on conflict do nothing;

create or replace function public.storage_prepare_document_cleanup(
  _project_id text, _revision bigint, _bucket text, _path text
) returns boolean language plpgsql security definer set search_path = public
as $$
declare a public.storage_assets%rowtype; r bigint;
begin
  if auth.uid() is null or not public.project_can_edit(_project_id, auth.uid()) then
    raise exception 'PIXUNA_FORBIDDEN';
  end if;
  select revision into r from public.project_home_state where project_id = _project_id for update;
  if r is distinct from _revision then raise exception 'PIXUNA_STALE_CONFIRMATION'; end if;
  select * into a from public.storage_assets
   where project_id = _project_id and bucket = _bucket and path = _path for update;
  if not found then raise exception 'PIXUNA_ASSET_MISSING'; end if;
  if a.status = 'deleted' then return true; end if;
  -- Conservative reference check: all confirmed home/CAD payload values and explicit refs.
  if exists(select 1 from public.storage_asset_refs where asset_id = a.id)
    or exists(select 1 from public.project_home_state h
      where jsonb_path_exists(h.payload, '$.** ? (@ == $path)', jsonb_build_object('path', _path)))
    or exists(select 1 from public.cad_object_state s where not s.deleted
      and jsonb_path_exists(s.payload, '$.** ? (@ == $path)', jsonb_build_object('path', _path)))
  then return false; end if;
  if a.kind <> 'attachment' or a.status not in ('active', 'deleting') then
    raise exception 'PIXUNA_ASSET_BUSY';
  end if;
  update public.storage_assets set status = 'deleting' where id = a.id;
  return true;
end;
$$;
revoke all on function public.storage_prepare_document_cleanup(text,bigint,text,text) from public, anon;
grant execute on function public.storage_prepare_document_cleanup(text,bigint,text,text) to authenticated;
commit;
