-- =====================================================================
-- PixunaCAD – Speichergrenzen Version 2 (konsolidierte Endfassung)
-- =====================================================================
-- Anwendung: komplett im Supabase SQL-Editor ausführen. Funktioniert in
-- beiden Ausgangslagen:
--   a) 20261007120000_storage_quotas.sql wurde NIE angewendet  → diese Datei genügt
--      (bitte die alte Datei NICHT vorher einspielen).
--   b) die alte Datei wurde bereits angewendet               → wird korrigiert.
-- Wiederholtes Ausführen ist unschädlich (idempotent).
--
-- Korrigiert gegenüber Version 1:
--   * Existenz eines Assets steht in eigener Variable (kein FOUND-Missbrauch).
--   * Eine zentrale Transaktionssperre (Einstellungszeile FOR UPDATE)
--     serialisiert ALLE Quotenentscheidungen → keine Überbuchung von Konto-
--     oder Gesamtbudget durch parallele Uploads in verschiedenen Projekten.
--   * Reserviert wird die wirksame Bucket-Obergrenze, nicht die Browserangabe
--     (1-Byte-Trick unmöglich). Bestätigung liest die echte Größe aus
--     storage.objects und gibt nur die Differenz frei.
--   * Abgelaufene/fehlgeschlagene Reservierungen bleiben gezählt (Status
--     `deleting`), bis der Client die Datei über die Storage-API entfernt
--     hat und storage_finalize_delete die Entfernung geprüft hat.
--   * Exakte Pfadprüfung statt LIKE-Wildcard; Hashpfade sind unveränderlich.
--   * Gesamtbelegung umfasst ALLE Dateien in storage.objects (auch andere
--     Buckets/Altdateien), nicht nur von PixunaCAD erfasste Assets.
--
-- Annahme: Die 1-GB-Dateiquote des Supabase-Free-Tarifs gehört allein
-- diesem Projekt. Andere Supabase-Projekte desselben Kontos kann diese
-- Datenbank nicht sehen.
-- Limits: MB dezimal (1 MB = 1.000.000 Bytes).
-- =====================================================================

-- ---------------------------------------------------- 0. Voraussetzungen
do $$
begin
  if to_regclass('public.network_projects') is null then
    raise exception 'Voraussetzung fehlt: Tabelle network_projects (Migration 20260821140000_network.sql zuerst anwenden).';
  end if;
  if to_regprocedure('public.is_project_member(text,uuid)') is null then
    raise exception 'Voraussetzung fehlt: Funktion is_project_member (Migration 20260821140000_network.sql).';
  end if;
  if to_regprocedure('public.project_can_edit(text,uuid)') is null then
    raise exception 'Voraussetzung fehlt: Funktion project_can_edit (Migration 20260831093000_project_access.sql).';
  end if;
end $$;

-- --------------------------------------------------------- 1. Einstellungen
create table if not exists public.storage_quota_settings (
  id boolean primary key default true check (id),
  account_bytes bigint,
  project_bytes bigint,
  file_bytes bigint,
  global_bytes bigint,
  global_reserve_bytes bigint,
  json_payload_bytes bigint not null default 1048576,
  updated_at timestamptz not null default now()
);
alter table public.storage_quota_settings add column if not exists schema_version int not null default 1;
alter table public.storage_quota_settings add column if not exists reservation_ttl interval not null default interval '1 hour';
insert into public.storage_quota_settings (id) values (true) on conflict do nothing;

-- Startprofil. Effektive Dateigrenze = global_bytes − global_reserve_bytes = 700.000.000 Bytes.
-- project_bytes/account_bytes aus der Speicherprobe (scripts/storage_probe.py, docs/storage-probe.md):
--   Stress-Pixelprojekt 700 Kacheln ≈ 7,2 MB; × 2 (Browser-PNG weniger dicht) × 3 (Verlauf bis zur
--   Verdichtung) ≈ 43 MB → Projekt 50 MB. Konto 150 MB = 3 Stressprojekte oder ~50 typische.
update public.storage_quota_settings set
  project_bytes        =   50000000,
  account_bytes        =  150000000,
  global_bytes         = 1000000000,
  global_reserve_bytes =  300000000,
  file_bytes           =   10000000,
  json_payload_bytes   =    1048576,
  schema_version       = 2,
  updated_at           = now()
where id;

grant select on public.storage_quota_settings to authenticated;
grant all on public.storage_quota_settings to service_role;
revoke insert, update, delete on public.storage_quota_settings from authenticated, anon;
alter table public.storage_quota_settings enable row level security;
drop policy if exists "quota settings readable" on public.storage_quota_settings;
create policy "quota settings readable" on public.storage_quota_settings
  for select to authenticated using (true);

-- ----------------------------------------------------------------- 2. Assets
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
alter table public.storage_assets add column if not exists cleanup_attempts int not null default 0;
create index if not exists storage_assets_owner_idx on public.storage_assets(owner_id) where status in ('reserved', 'active', 'deleting');
create index if not exists storage_assets_project_idx on public.storage_assets(project_id, status);

grant select on public.storage_assets to authenticated;
grant all on public.storage_assets to service_role;
revoke insert, update, delete on public.storage_assets from authenticated, anon;
alter table public.storage_assets enable row level security;
drop policy if exists "assets of member projects" on public.storage_assets;
create policy "assets of member projects" on public.storage_assets
  for select to authenticated using (public.is_project_member(project_id, auth.uid()));

create table if not exists public.storage_asset_refs (
  asset_id uuid not null references public.storage_assets(id) on delete cascade,
  project_id text not null,
  ref_kind text not null,
  ref_id text not null,
  created_at timestamptz not null default now(),
  primary key (asset_id, ref_kind, ref_id)
);
grant select on public.storage_asset_refs to authenticated;
grant all on public.storage_asset_refs to service_role;
revoke insert, update, delete on public.storage_asset_refs from authenticated, anon;
alter table public.storage_asset_refs enable row level security;
drop policy if exists "refs of member projects" on public.storage_asset_refs;
create policy "refs of member projects" on public.storage_asset_refs
  for select to authenticated using (public.is_project_member(project_id, auth.uid()));

-- Altlast V1: dort als 'deleted' markierte, aber evtl. noch vorhandene Dateien wieder zählen.
update public.storage_assets a set status = 'deleting'
 where a.status = 'deleted'
   and exists (select 1 from storage.objects o where o.bucket_id = a.bucket and o.name = a.path);

-- ------------------------------------------------------------ 3. Funktionen
-- Gezählt werden reserved + active + deleting (Datei könnte existieren).
create or replace function public.storage_counted(_status text)
returns boolean language sql immutable as $$ select _status in ('reserved','active','deleting') $$;

-- Gesamtbelegung: alle physischen Dateien + offene Reservierungen ohne Datei.
create or replace function public.storage_global_used()
returns bigint language sql stable security definer set search_path = public, storage
as $$
  select coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 0)) from storage.objects o), 0)
       + coalesce((select sum(a.bytes) from public.storage_assets a
                    where a.status = 'reserved'
                      and not exists (select 1 from storage.objects o where o.bucket_id = a.bucket and o.name = a.path)), 0);
$$;

drop function if exists public.storage_usage(text);
create function public.storage_usage(_project_id text)
returns table (account_used bigint, project_used bigint, reserved bigint,
               account_limit bigint, project_limit bigint, file_limit bigint, schema_version int)
language sql stable security definer set search_path = public
as $$
  with p as (select owner_id from public.network_projects where id = _project_id),
       s as (select * from public.storage_quota_settings where id)
  select
    coalesce((select sum(a.bytes) from public.storage_assets a, p where a.owner_id = p.owner_id and public.storage_counted(a.status)), 0),
    coalesce((select sum(a.bytes) from public.storage_assets a where a.project_id = _project_id and public.storage_counted(a.status)), 0),
    coalesce((select sum(a.bytes) from public.storage_assets a where a.project_id = _project_id and a.status = 'reserved'), 0),
    (select account_bytes from s), (select project_bytes from s), (select file_bytes from s), (select schema_version from s)
  where auth.uid() is not null and public.is_project_member(_project_id, auth.uid());
$$;

-- Wirksame Uploadobergrenze eines Buckets (Bucketlimit ∧ file_bytes).
create or replace function public.storage_bucket_cap(_bucket text)
returns bigint language sql stable security definer set search_path = public, storage
as $$
  select least(coalesce((select b.file_size_limit from storage.buckets b where b.id = _bucket), 9223372036854775807),
               coalesce((select file_bytes from public.storage_quota_settings where id), 0));
$$;

drop function if exists public.storage_reserve_upload(text, text, text, text, text, bigint);
create function public.storage_reserve_upload(
  _project_id text, _bucket text, _path text, _hash text, _kind text, _bytes bigint
)
returns table (asset_id uuid, already_present boolean)
language plpgsql security definer set search_path = public, storage
as $$
declare
  s public.storage_quota_settings%rowtype;
  v_owner uuid;
  v_existing public.storage_assets%rowtype;
  v_has_existing boolean;
  v_cap bigint;
  v_reserve bigint;
  v_acc bigint; v_prj bigint; v_glob bigint;
  v_id uuid;
begin
  if auth.uid() is null or not public.project_can_edit(_project_id, auth.uid()) then
    raise exception 'PIXUNA_FORBIDDEN';
  end if;
  if _bucket not in ('raster-tiles', 'project-attachments') then raise exception 'PIXUNA_BAD_BUCKET'; end if;
  if _kind not in ('raster_tile', 'attachment')
     or (_bucket = 'raster-tiles') <> (_kind = 'raster_tile') then raise exception 'PIXUNA_BAD_KIND'; end if;
  if _bytes is null or _bytes < 0 then raise exception 'PIXUNA_BAD_SIZE'; end if;
  -- exakter Präfixvergleich (kein LIKE mit Platzhalterzeichen aus der Projekt-ID)
  if left(_path, length(_project_id) + 1) <> _project_id || '/' or position('..' in _path) > 0 then
    raise exception 'PIXUNA_BAD_PATH';
  end if;

  -- Zentrale Sperre: alle Quotenentscheidungen laufen nacheinander.
  select * into s from public.storage_quota_settings where id for update;
  if s.account_bytes is null or s.project_bytes is null or s.file_bytes is null or s.global_bytes is null then
    raise exception 'PIXUNA_QUOTA_UNCONFIGURED';
  end if;

  select * into v_existing from public.storage_assets where bucket = _bucket and path = _path for update;
  v_has_existing := found;   -- sofort festhalten
  if v_has_existing then
    if v_existing.project_id <> _project_id then raise exception 'PIXUNA_BAD_PATH'; end if;
    if v_existing.status = 'active' then return query select v_existing.id, true; return; end if;
    if v_existing.status = 'reserved' and v_existing.created_by = auth.uid()
       and v_existing.created_at > now() - s.reservation_ttl then
      return query select v_existing.id, false; return;   -- idempotente Wiederholung
    end if;
    if v_existing.status in ('reserved', 'deleting') then raise exception 'PIXUNA_ASSET_BUSY'; end if;
  end if;

  select owner_id into v_owner from public.network_projects where id = _project_id;
  if v_owner is null then raise exception 'PIXUNA_FORBIDDEN'; end if;

  v_cap := public.storage_bucket_cap(_bucket);
  if _bytes > v_cap then raise exception 'PIXUNA_QUOTA_FILE'; end if;
  -- Konservativ die wirksame Obergrenze reservieren (Bucket erzwingt sie beim Upload).
  v_reserve := v_cap;

  -- Abgelaufene Reservierungen: weiter gezählt, aber zur Bereinigung freigegeben.
  update public.storage_assets set status = 'deleting'
   where status = 'reserved' and created_at < now() - s.reservation_ttl;

  select coalesce(sum(bytes),0) into v_prj from public.storage_assets where project_id = _project_id and public.storage_counted(status);
  if v_prj + v_reserve > s.project_bytes then raise exception 'PIXUNA_QUOTA_PROJECT'; end if;
  select coalesce(sum(bytes),0) into v_acc from public.storage_assets where owner_id = v_owner and public.storage_counted(status);
  if v_acc + v_reserve > s.account_bytes then raise exception 'PIXUNA_QUOTA_ACCOUNT'; end if;
  v_glob := public.storage_global_used();
  if v_glob + v_reserve > s.global_bytes - coalesce(s.global_reserve_bytes, 0) then raise exception 'PIXUNA_QUOTA_GLOBAL'; end if;

  if v_has_existing then
    update public.storage_assets set status = 'reserved', bytes = v_reserve, created_by = auth.uid(),
           created_at = now(), deleted_at = null, confirmed_at = null, owner_id = v_owner
     where id = v_existing.id returning id into v_id;
  else
    insert into public.storage_assets (project_id, owner_id, bucket, path, content_hash, kind, bytes, created_by)
    values (_project_id, v_owner, _bucket, _path, _hash, _kind, v_reserve, auth.uid()) returning id into v_id;
  end if;
  if v_id is null then raise exception 'PIXUNA_RESERVE_FAILED'; end if;
  return query select v_id, false;
end;
$$;

-- Bestätigung: echte Datei muss existieren, echte Größe ersetzt Reservierung.
drop function if exists public.storage_confirm_upload(uuid);
create function public.storage_confirm_upload(_asset_id uuid)
returns bigint language plpgsql security definer set search_path = public, storage
as $$
declare a public.storage_assets%rowtype; v_size bigint; v_found boolean;
begin
  perform 1 from public.storage_quota_settings where id for update;
  select * into a from public.storage_assets where id = _asset_id for update;
  if not found or a.created_by <> auth.uid() or a.status <> 'reserved' then raise exception 'PIXUNA_NO_RESERVATION'; end if;
  select (o.metadata->>'size')::bigint into v_size from storage.objects o where o.bucket_id = a.bucket and o.name = a.path;
  v_found := found;
  if not v_found then raise exception 'PIXUNA_UPLOAD_MISSING'; end if;
  if v_size is null or v_size > a.bytes then
    update public.storage_assets set status = 'deleting' where id = a.id;   -- bleibt gezählt bis entfernt
    raise exception 'PIXUNA_QUOTA_FILE';
  end if;
  update public.storage_assets set status = 'active', bytes = v_size, confirmed_at = now() where id = a.id;
  return v_size;
end;
$$;

-- Abbruch: nicht sofort freigeben – Datei könnte teilweise existieren.
create or replace function public.storage_cancel_upload(_asset_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.storage_assets set status = 'deleting'
   where id = _asset_id and created_by = auth.uid() and status = 'reserved';
end;
$$;

create or replace function public.storage_add_ref(_asset_id uuid, _ref_kind text, _ref_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare a public.storage_assets%rowtype;
begin
  select * into a from public.storage_assets where id = _asset_id for update;
  if not found or not public.project_can_edit(a.project_id, auth.uid()) then raise exception 'PIXUNA_FORBIDDEN'; end if;
  if a.status <> 'active' then raise exception 'PIXUNA_ASSET_BUSY'; end if;  -- nie ein Löschkandidat neu veröffentlichen
  insert into public.storage_asset_refs (asset_id, project_id, ref_kind, ref_id)
  values (_asset_id, a.project_id, _ref_kind, _ref_id) on conflict do nothing;
end;
$$;

-- Referenz lösen; letzte Referenz eines Rasterassets → Löschkandidat.
create or replace function public.storage_release_ref(_asset_id uuid, _ref_kind text, _ref_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare a public.storage_assets%rowtype;
begin
  select * into a from public.storage_assets where id = _asset_id for update;
  if not found or not public.project_can_edit(a.project_id, auth.uid()) then raise exception 'PIXUNA_FORBIDDEN'; end if;
  delete from public.storage_asset_refs where asset_id = _asset_id and ref_kind = _ref_kind and ref_id = _ref_id;
  if a.kind = 'raster_tile' and a.status = 'active'
     and not exists (select 1 from public.storage_asset_refs r where r.asset_id = _asset_id) then
    update public.storage_assets set status = 'deleting' where id = _asset_id;
  end if;
end;
$$;

-- Liefert begrenzt Löschkandidaten des Projekts (Client löscht über Storage-API).
create or replace function public.storage_claim_cleanup(_project_id text, _limit int default 50)
returns table (asset_id uuid, bucket text, path text)
language plpgsql security definer set search_path = public
as $$
declare s public.storage_quota_settings%rowtype;
begin
  if auth.uid() is null or not public.project_can_edit(_project_id, auth.uid()) then raise exception 'PIXUNA_FORBIDDEN'; end if;
  select * into s from public.storage_quota_settings where id;
  update public.storage_assets set status = 'deleting'
   where project_id = _project_id and status = 'reserved' and created_at < now() - s.reservation_ttl;
  return query
    update public.storage_assets a set cleanup_attempts = a.cleanup_attempts + 1
     where a.id in (select x.id from public.storage_assets x
                     where x.project_id = _project_id and x.status = 'deleting'
                     order by x.created_at limit greatest(1, least(coalesce(_limit, 50), 200)))
    returning a.id, a.bucket, a.path;
end;
$$;

-- Budget erst freigeben, wenn die Datei physisch nicht mehr existiert.
create or replace function public.storage_finalize_delete(_asset_ids uuid[])
returns int language plpgsql security definer set search_path = public, storage
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'PIXUNA_FORBIDDEN'; end if;
  update public.storage_assets a set status = 'deleted', deleted_at = now(), bytes = 0
   where a.id = any(_asset_ids) and a.status = 'deleting'
     and public.project_can_edit(a.project_id, auth.uid())
     and not exists (select 1 from storage.objects o where o.bucket_id = a.bucket and o.name = a.path);
  get diagnostics n = row_count;
  delete from public.storage_asset_refs r using public.storage_assets a
   where r.asset_id = a.id and a.id = any(_asset_ids) and a.status = 'deleted';
  return n;
end;
$$;

-- Für Storage-Policies.
create or replace function public.storage_has_reservation(_bucket text, _path text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.storage_assets
    where bucket = _bucket and path = _path and status = 'reserved' and created_by = auth.uid());
$$;
create or replace function public.storage_is_deletable(_bucket text, _path text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.storage_assets a
    where a.bucket = _bucket and a.path = _path and a.status = 'deleting'
      and public.project_can_edit(a.project_id, auth.uid()));
$$;

-- Rechte: nur angemeldete Nutzer, nie PUBLIC/anon.
do $$
declare f text;
begin
  foreach f in array array[
    'public.storage_counted(text)', 'public.storage_global_used()', 'public.storage_usage(text)',
    'public.storage_bucket_cap(text)',
    'public.storage_reserve_upload(text,text,text,text,text,bigint)', 'public.storage_confirm_upload(uuid)',
    'public.storage_cancel_upload(uuid)', 'public.storage_add_ref(uuid,text,text)',
    'public.storage_release_ref(uuid,text,text)', 'public.storage_claim_cleanup(text,int)',
    'public.storage_finalize_delete(uuid[])', 'public.storage_has_reservation(text,text)',
    'public.storage_is_deletable(text,text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke execute on function public.storage_global_used() from authenticated;

-- ----------------------------------------------------------------- 4. Buckets
-- Rasterkacheln: 2 MB je Datei (technische Kachelgrenze), Anhänge: 10 MB.
insert into storage.buckets (id, name, public, file_size_limit)
values ('raster-tiles', 'raster-tiles', false, 2000000)
on conflict (id) do update set file_size_limit = 2000000, public = false;
update storage.buckets set file_size_limit = 10000000 where id = 'project-attachments';

drop policy if exists "raster tiles read" on storage.objects;
create policy "raster tiles read" on storage.objects for select to authenticated
  using (bucket_id = 'raster-tiles' and public.is_project_member(split_part(name, '/', 1), auth.uid()));
drop policy if exists "raster tiles upload with reservation" on storage.objects;
create policy "raster tiles upload with reservation" on storage.objects for insert to authenticated
  with check (bucket_id = 'raster-tiles' and public.storage_has_reservation('raster-tiles', name));
-- Hashpfade unveränderlich: kein UPDATE; Löschen nur für Löschkandidaten.
drop policy if exists "raster tiles delete candidates" on storage.objects;
create policy "raster tiles delete candidates" on storage.objects for delete to authenticated
  using (bucket_id = 'raster-tiles' and public.storage_is_deletable('raster-tiles', name));

drop policy if exists "attachments require reservation" on storage.objects;
create policy "attachments require reservation" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'project-attachments' or public.storage_has_reservation('project-attachments', name));
drop policy if exists "attachments no overwrite" on storage.objects;
create policy "attachments no overwrite" on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('project-attachments', 'raster-tiles'));

-- ------------------------------------------------------- 5. JSON-Schreibwege
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
do $$
begin
  if to_regclass('public.cad_object_state') is not null then
    execute 'drop trigger if exists cad_object_payload_guard on public.cad_object_state';
    execute 'create trigger cad_object_payload_guard before insert or update on public.cad_object_state for each row execute function public.cad_object_payload_guard()';
  end if;
end $$;

-- ------------------------------------- 6. Pixel-Manifeste gemeinsam veröffentlichen
-- Alle offenen Blatt-Keys einer Aktion in EINER Transaktion: zuerst Revisions-
-- prüfung aller Keys (eine Abweichung → nichts wird geschrieben), dann Manifest,
-- Verlauf und Assetreferenzen. Referenzen leitet der Server aus dem
-- veröffentlichten Manifest ab (_hashes); nicht mehr referenzierte Raster-
-- kacheln werden Löschkandidaten und erst nach physischer Entfernung
-- (storage_finalize_delete) aus dem Verbrauch genommen.
-- _items: [{ "key": text, "base": bigint, "payload": jsonb|null, "hashes": [text] }]
drop function if exists public.raster_publish_manifests(text, jsonb);
create or replace function public.raster_publish_manifests(_project_id text, _items jsonb)
returns table (key text, accepted boolean, conflict boolean, revision bigint)
language plpgsql security definer set search_path = public
as $$
declare
  it jsonb; k text; b bigint; cur bigint; nr bigint; pl jsonb;
  hs text[]; ids uuid[]; released uuid[]; v_conflict boolean := false; v_missing int;
begin
  if not public.project_can_edit(_project_id, auth.uid()) then raise exception 'PIXUNA_FORBIDDEN'; end if;
  if jsonb_typeof(_items) <> 'array' then raise exception 'PIXUNA_BAD_ITEMS'; end if;
  -- Gleiche zentrale Sperre wie alle Quoten-/Löschentscheidungen.
  perform 1 from public.storage_quota_settings where id for update;

  -- 1) Alle Zeilen sperren und Revisionen prüfen.
  for it in select * from jsonb_array_elements(_items) loop
    k := it->>'key'; b := coalesce((it->>'base')::bigint, 0);
    select s.revision into cur from public.cad_object_state s
     where s.project_id = _project_id and s.sheet_id = '__raster__' and s.object_id = k for update;
    if coalesce(cur, 0) <> b then v_conflict := true; end if;
  end loop;
  if v_conflict then
    return query
      select i->>'key', false,
             coalesce(s.revision, 0) <> coalesce((i->>'base')::bigint, 0),
             coalesce(s.revision, 0)
        from jsonb_array_elements(_items) i
        left join public.cad_object_state s
          on s.project_id = _project_id and s.sheet_id = '__raster__' and s.object_id = i->>'key';
    return;
  end if;

  -- 2) Alle referenzierten Kacheln müssen als aktive Assets existieren.
  select count(*) into v_missing
    from (select distinct jsonb_array_elements_text(coalesce(i->'hashes', '[]'::jsonb)) h
            from jsonb_array_elements(_items) i) x
   where not exists (select 1 from public.storage_assets a
                      where a.project_id = _project_id and a.kind = 'raster_tile'
                        and a.content_hash = x.h and a.status = 'active');
  if v_missing > 0 then raise exception 'PIXUNA_ASSET_MISSING'; end if;

  -- 3) Schreiben + Referenzen umschalten.
  for it in select * from jsonb_array_elements(_items) loop
    k := it->>'key'; pl := it->'payload'; if jsonb_typeof(pl) = 'null' then pl := null; end if;
    select s.revision into cur from public.cad_object_state s
     where s.project_id = _project_id and s.sheet_id = '__raster__' and s.object_id = k;
    nr := coalesce(cur, 0) + 1;
    insert into public.cad_object_state as st
      (project_id, sheet_id, object_id, object_kind, revision, payload, deleted, updated_by, updated_at)
    values (_project_id, '__raster__', k, 'rasterManifest', nr, pl, pl is null, auth.uid(), now())
    on conflict (project_id, sheet_id, object_id) do update
      set revision = nr, object_kind = excluded.object_kind, payload = excluded.payload,
          deleted = excluded.deleted, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    insert into public.cad_object_ops
      (project_id, sheet_id, object_id, object_kind, change_type, payload, object_version, actor_id)
    values (_project_id, '__raster__', k, 'rasterManifest',
            case when pl is null then 'delete' when cur is null then 'create' else 'update' end, pl, nr, auth.uid());

    select coalesce(array_agg(x), '{}') into hs from jsonb_array_elements_text(coalesce(it->'hashes', '[]'::jsonb)) x;
    select coalesce(array_agg(a.id), '{}') into ids from public.storage_assets a
     where a.project_id = _project_id and a.kind = 'raster_tile' and a.status = 'active' and a.content_hash = any(hs);
    with del as (
      delete from public.storage_asset_refs r
       where r.project_id = _project_id and r.ref_kind = 'raster_manifest' and r.ref_id = k
         and not (r.asset_id = any(ids))
      returning r.asset_id)
    select coalesce(array_agg(asset_id), '{}') into released from del;
    insert into public.storage_asset_refs (asset_id, project_id, ref_kind, ref_id)
      select unnest(ids), _project_id, 'raster_manifest', k on conflict do nothing;
    update public.storage_assets a set status = 'deleting'
     where a.id = any(released) and a.kind = 'raster_tile' and a.status = 'active'
       and not exists (select 1 from public.storage_asset_refs r where r.asset_id = a.id);
    key := k; accepted := true; conflict := false; revision := nr;
    return next;
  end loop;
end;
$$;
revoke all on function public.raster_publish_manifests(text, jsonb) from public, anon;
grant execute on function public.raster_publish_manifests(text, jsonb) to authenticated;

-- Bestand: Referenzen aus bereits veröffentlichten Manifesten wiederherstellen
-- (frühere Clients führten sie nur sitzungsweise). Idempotent.
insert into public.storage_asset_refs (asset_id, project_id, ref_kind, ref_id)
select distinct a.id, s.project_id, 'raster_manifest', s.object_id
  from public.cad_object_state s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'layers', '[]'::jsonb)) l
  cross join lateral jsonb_array_elements(coalesce(l->'entries', '[]'::jsonb)) e
  cross join lateral jsonb_array_elements(coalesce(e->'tiles', '[]'::jsonb)) t
  join public.storage_assets a
    on a.project_id = s.project_id and a.kind = 'raster_tile' and a.status = 'active' and a.content_hash = t->>'hash'
 where s.sheet_id = '__raster__' and not s.deleted
on conflict do nothing;
-- Aktive Rasterkacheln ohne jede Referenz (verwaist durch frühere Abläufe) → Löschkandidat.
update public.storage_assets a set status = 'deleting'
 where a.kind = 'raster_tile' and a.status = 'active' and a.confirmed_at < now() - interval '1 day'
   and not exists (select 1 from public.storage_asset_refs r where r.asset_id = a.id);

-- ------------------------------------------- 9. Projekt- und Kontolimit
-- WIRD NACH DER SPEICHERMESSUNG GESETZT (siehe Abschlussbericht). Bis dahin
-- bleiben neue Cloud-Uploads mit „Cloud-Einrichtung fehlt“ gesperrt, alles
-- wird lokal gespeichert. Kein ungeprüfter Wert.

-- ---------------------------------------------------------- 10. Prüfabfragen
select 'Schema-Version' as pruefung, schema_version::text as ergebnis from public.storage_quota_settings where id
union all select 'Limits vollständig',
  case when account_bytes is not null and project_bytes is not null and file_bytes is not null and global_bytes is not null
       then 'ja' else 'NEIN – Projekt-/Kontolimit fehlt noch' end from public.storage_quota_settings where id
union all select 'Effektive Dateigrenze (Bytes)', (global_bytes - global_reserve_bytes)::text from public.storage_quota_settings where id
union all select 'Dateien gesamt in storage.objects (Bytes)', coalesce(sum((metadata->>'size')::bigint),0)::text from storage.objects
union all select 'Offene Reservierungen (Bytes)', coalesce(sum(bytes),0)::text from public.storage_assets where status = 'reserved'
union all select 'Funktion raster_publish_manifests vorhanden', (to_regprocedure('public.raster_publish_manifests(text,jsonb)') is not null)::text
union all select 'Löschkandidaten (Bytes)', coalesce(sum(bytes),0)::text from public.storage_assets where status = 'deleting'
union all select 'Datenbankgröße', pg_size_pretty(pg_database_size(current_database()))
union all select 'Policies raster-tiles', count(*)::text from pg_policies where schemaname = 'storage' and policyname like 'raster tiles%';

select relname as tabelle, pg_size_pretty(pg_total_relation_size(c.oid)) as groesse_inkl_indizes
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc limit 10;
