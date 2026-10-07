-- Paket 3: kontrollierter Projektspeicher.
-- * Betreiberwerte (Konto-/Projekt-/Datei-Limit, globale Reserve) liegen in
--   `storage_quota_settings`. Solange dort KEIN Wert eingetragen ist, werden
--   alle speichervergrößernden Cloud-Schreibvorgänge (neue Assets) abgelehnt.
--   Lesen, Löschen und bereits vorhandene Assets bleiben unberührt.
-- * Zuordnung des Verbrauchs immer über `network_projects.owner_id`
--   (nicht über die hochladende Person) – geteilte Projekte belasten das
--   Konto des Projektinhabers.
-- * Uploads laufen in zwei Schritten: atomare Reservierung → Upload →
--   Bestätigung. Storage-Policies erlauben einen Upload nur bei offener
--   Reservierung derselben Person für genau diesen Pfad.

-- ------------------------------------------------------------ Einstellungen
create table if not exists public.storage_quota_settings (
  id boolean primary key default true check (id),
  account_bytes bigint,          -- PLATZHALTER: vom Betreiber einzutragen
  project_bytes bigint,          -- PLATZHALTER
  file_bytes bigint,             -- PLATZHALTER (Obergrenze je Datei)
  global_bytes bigint,           -- PLATZHALTER (Gesamtbudget aller Konten)
  global_reserve_bytes bigint,   -- PLATZHALTER (freizuhaltende Reserve)
  json_payload_bytes bigint not null default 1048576, -- je CAD-Objekt
  updated_at timestamptz not null default now()
);
insert into public.storage_quota_settings (id) values (true) on conflict do nothing;

grant select on public.storage_quota_settings to authenticated;
grant all on public.storage_quota_settings to service_role;
alter table public.storage_quota_settings enable row level security;
drop policy if exists "quota settings readable" on public.storage_quota_settings;
create policy "quota settings readable" on public.storage_quota_settings
  for select to authenticated using (true);

-- ------------------------------------------------------------------ Assets
create table if not exists public.storage_assets (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  path text not null,
  content_hash text,
  kind text not null check (kind in ('raster_tile', 'attachment')),
  bytes bigint not null check (bytes >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'active', 'deleting', 'deleted')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  deleted_at timestamptz,
  unique (bucket, path)
);
create index if not exists storage_assets_owner_idx on public.storage_assets(owner_id) where status in ('reserved', 'active');
create index if not exists storage_assets_project_idx on public.storage_assets(project_id, status);

grant select on public.storage_assets to authenticated;
grant all on public.storage_assets to service_role;
alter table public.storage_assets enable row level security;
drop policy if exists "assets of member projects" on public.storage_assets;
create policy "assets of member projects" on public.storage_assets
  for select to authenticated using (public.is_project_member(project_id, auth.uid()));
-- Schreiben ausschließlich über die security-definer-Funktionen unten.

-- Referenzen: welches Manifest/Element verweist auf ein Asset.
create table if not exists public.storage_asset_refs (
  asset_id uuid not null references public.storage_assets(id) on delete cascade,
  project_id text not null,
  ref_kind text not null,     -- z. B. 'raster_manifest', 'contribution_attachment'
  ref_id text not null,
  created_at timestamptz not null default now(),
  primary key (asset_id, ref_kind, ref_id)
);
grant select on public.storage_asset_refs to authenticated;
grant all on public.storage_asset_refs to service_role;
alter table public.storage_asset_refs enable row level security;
drop policy if exists "refs of member projects" on public.storage_asset_refs;
create policy "refs of member projects" on public.storage_asset_refs
  for select to authenticated using (public.is_project_member(project_id, auth.uid()));

-- ------------------------------------------------------------- Funktionen
create or replace function public.storage_usage(_project_id text)
returns table (account_used bigint, project_used bigint, account_limit bigint, project_limit bigint, file_limit bigint)
language sql stable security definer set search_path = public
as $$
  with p as (select owner_id from public.network_projects where id = _project_id),
       s as (select * from public.storage_quota_settings where id)
  select
    coalesce((select sum(a.bytes) from public.storage_assets a, p where a.owner_id = p.owner_id and a.status in ('reserved','active')), 0),
    coalesce((select sum(a.bytes) from public.storage_assets a where a.project_id = _project_id and a.status in ('reserved','active')), 0),
    (select account_bytes from s), (select project_bytes from s), (select file_bytes from s)
  where public.is_project_member(_project_id, auth.uid());
$$;

/**
 * Atomare Reservierung. Ein bereits aktives Asset mit gleichem Pfad wird
 * wiederverwendet (inhaltsadressiert, kein Doppelverbrauch).
 * Fehler: PIXUNA_FORBIDDEN, PIXUNA_QUOTA_UNCONFIGURED, PIXUNA_QUOTA_FILE,
 *         PIXUNA_QUOTA_PROJECT, PIXUNA_QUOTA_ACCOUNT, PIXUNA_QUOTA_GLOBAL.
 */
create or replace function public.storage_reserve_upload(
  _project_id text, _bucket text, _path text, _hash text, _kind text, _bytes bigint
)
returns table (asset_id uuid, already_present boolean)
language plpgsql security definer set search_path = public
as $$
declare
  s public.storage_quota_settings%rowtype;
  owner uuid;
  existing public.storage_assets%rowtype;
  acc bigint; prj bigint; glob bigint;
  new_id uuid;
begin
  if auth.uid() is null or not public.project_can_edit(_project_id, auth.uid()) then
    raise exception 'PIXUNA_FORBIDDEN';
  end if;
  if _bytes is null or _bytes < 0 then raise exception 'PIXUNA_BAD_SIZE'; end if;
  if _path not like _project_id || '/%' then raise exception 'PIXUNA_BAD_PATH'; end if;

  select * into existing from public.storage_assets where bucket = _bucket and path = _path for update;
  if found and existing.status = 'active' then
    return query select existing.id, true; return;
  end if;

  select owner_id into owner from public.network_projects where id = _project_id for update;
  select * into s from public.storage_quota_settings where id;
  if s.account_bytes is null or s.project_bytes is null or s.file_bytes is null then
    raise exception 'PIXUNA_QUOTA_UNCONFIGURED';
  end if;
  if _bytes > s.file_bytes then raise exception 'PIXUNA_QUOTA_FILE'; end if;

  -- Verfallene Reservierungen (> 1 h) zählen nicht mehr.
  update public.storage_assets set status = 'deleted', deleted_at = now()
   where status = 'reserved' and created_at < now() - interval '1 hour' and owner_id = owner;

  select coalesce(sum(bytes),0) into prj from public.storage_assets where project_id = _project_id and status in ('reserved','active');
  if prj + _bytes > s.project_bytes then raise exception 'PIXUNA_QUOTA_PROJECT'; end if;
  select coalesce(sum(bytes),0) into acc from public.storage_assets where owner_id = owner and status in ('reserved','active');
  if acc + _bytes > s.account_bytes then raise exception 'PIXUNA_QUOTA_ACCOUNT'; end if;
  if s.global_bytes is not null then
    select coalesce(sum(bytes),0) into glob from public.storage_assets where status in ('reserved','active');
    if glob + _bytes > s.global_bytes - coalesce(s.global_reserve_bytes, 0) then raise exception 'PIXUNA_QUOTA_GLOBAL'; end if;
  end if;

  if found then
    update public.storage_assets set status = 'reserved', bytes = _bytes, created_by = auth.uid(), created_at = now(), deleted_at = null
     where id = existing.id returning id into new_id;
  else
    insert into public.storage_assets (project_id, owner_id, bucket, path, content_hash, kind, bytes)
    values (_project_id, owner, _bucket, _path, _hash, _kind, _bytes) returning id into new_id;
  end if;
  return query select new_id, false;
end;
$$;

create or replace function public.storage_confirm_upload(_asset_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.storage_assets set status = 'active', confirmed_at = now()
   where id = _asset_id and created_by = auth.uid() and status = 'reserved';
  if not found then raise exception 'PIXUNA_NO_RESERVATION'; end if;
end;
$$;

create or replace function public.storage_cancel_upload(_asset_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.storage_assets set status = 'deleted', deleted_at = now()
   where id = _asset_id and created_by = auth.uid() and status = 'reserved';
end;
$$;

create or replace function public.storage_add_ref(_asset_id uuid, _ref_kind text, _ref_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare pid text;
begin
  select project_id into pid from public.storage_assets where id = _asset_id;
  if pid is null or not public.project_can_edit(pid, auth.uid()) then raise exception 'PIXUNA_FORBIDDEN'; end if;
  insert into public.storage_asset_refs (asset_id, project_id, ref_kind, ref_id)
  values (_asset_id, pid, _ref_kind, _ref_id) on conflict do nothing;
end;
$$;

-- Hilfsfunktion für Storage-Policies: offene Reservierung dieser Person?
create or replace function public.storage_has_reservation(_bucket text, _path text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.storage_assets
    where bucket = _bucket and path = _path and status = 'reserved' and created_by = auth.uid());
$$;

grant execute on function public.storage_usage(text) to authenticated;
grant execute on function public.storage_reserve_upload(text, text, text, text, text, bigint) to authenticated;
grant execute on function public.storage_confirm_upload(uuid) to authenticated;
grant execute on function public.storage_cancel_upload(uuid) to authenticated;
grant execute on function public.storage_add_ref(uuid, text, text) to authenticated;
grant execute on function public.storage_has_reservation(text, text) to authenticated;

-- ------------------------------------------------------- Bucket Rasterkacheln
insert into storage.buckets (id, name, public, file_size_limit)
values ('raster-tiles', 'raster-tiles', false, 8388608)
on conflict (id) do nothing;

drop policy if exists "raster tiles read" on storage.objects;
create policy "raster tiles read" on storage.objects for select to authenticated
  using (bucket_id = 'raster-tiles' and public.is_project_member(split_part(name, '/', 1), auth.uid()));
drop policy if exists "raster tiles upload with reservation" on storage.objects;
create policy "raster tiles upload with reservation" on storage.objects for insert to authenticated
  with check (bucket_id = 'raster-tiles' and public.storage_has_reservation('raster-tiles', name));

-- Anhänge: Upload nur noch mit Reservierung (zusätzlich zur bestehenden Policy).
drop policy if exists "attachments require reservation" on storage.objects;
create policy "attachments require reservation" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'project-attachments' or public.storage_has_reservation('project-attachments', name));

-- ------------------------------------------------- Große JSON-Schreibwege
create or replace function public.cad_object_payload_guard()
returns trigger language plpgsql set search_path = public
as $$
declare lim bigint;
begin
  select json_payload_bytes into lim from public.storage_quota_settings where id;
  if new.payload is not null and octet_length(new.payload::text) > coalesce(lim, 1048576)
     and (tg_op = 'INSERT' or octet_length(new.payload::text) > octet_length(coalesce(old.payload::text, ''))) then
    raise exception 'PIXUNA_QUOTA_PAYLOAD';
  end if;
  return new;
end;
$$;
drop trigger if exists cad_object_payload_guard on public.cad_object_state;
create trigger cad_object_payload_guard before insert or update on public.cad_object_state
  for each row execute function public.cad_object_payload_guard();
