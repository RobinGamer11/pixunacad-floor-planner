-- =====================================================================
-- PixunaCAD – Paket 04–06
--   * Schritt 04: Zeiterfassung (Arbeitszeiten) und Abwesenheiten
--   * Schritt 05: Geräte/Werkzeuge, Gerätebuchungen, Beitragsanhänge
--   * Schritt 06: gemeinsame Kalender/Übersichten (nur Leseabfragen,
--                 keine zusätzliche Datenhaltung)
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt (VITE_SUPABASE_URL).
-- Einmalig im SQL-Editor ausführen. Baut auf
--   20260821140000_network.sql und 20260831093000_project_access.sql auf.
--
-- Eigenschaften:
--  * rein additiv, wiederholbar (idempotent), keine Datenlöschung
--  * Rechte bauen auf project_role_of / project_can_edit /
--    project_can_manage_members aus Paket 01 auf
-- =====================================================================

-- ====================================================== 1) Arbeitszeiten
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  -- Beitrags-Id aus dem Projektdokument (kein FK – Beiträge liegen im Dokument).
  item_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  break_minutes integer not null default 0,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_range_valid check (ended_at > started_at),
  constraint time_entries_break_valid check (
    break_minutes >= 0
    and break_minutes <= (extract(epoch from (ended_at - started_at)) / 60)
  )
);

create index if not exists time_entries_project_idx on public.time_entries(project_id, started_at);
create index if not exists time_entries_item_idx on public.time_entries(item_id);
create index if not exists time_entries_user_idx on public.time_entries(user_id, started_at);

grant select, insert, update, delete on public.time_entries to authenticated;
grant all on public.time_entries to service_role;
alter table public.time_entries enable row level security;

-- Lesen: alle Projektbeteiligten (Auswertung je Beitrag/Person).
drop policy if exists "time_entries_select_members" on public.time_entries;
create policy "time_entries_select_members" on public.time_entries
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

-- Eigene Zeiten: erfassen/ändern/löschen, sofern Schreibrecht im Projekt.
-- Fremde Zeiten: nur mit ausdrücklicher Verwaltungsberechtigung.
drop policy if exists "time_entries_insert_own_or_manager" on public.time_entries;
create policy "time_entries_insert_own_or_manager" on public.time_entries
  for insert to authenticated
  with check (
    (user_id = auth.uid() and public.project_can_edit(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  );

drop policy if exists "time_entries_update_own_or_manager" on public.time_entries;
create policy "time_entries_update_own_or_manager" on public.time_entries
  for update to authenticated
  using (
    (user_id = auth.uid() and public.project_can_edit(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  )
  with check (
    (user_id = auth.uid() and public.project_can_edit(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  );

drop policy if exists "time_entries_delete_own_or_manager" on public.time_entries;
create policy "time_entries_delete_own_or_manager" on public.time_entries
  for delete to authenticated
  using (
    (user_id = auth.uid() and public.project_can_edit(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  );

-- ====================================================== 2) Abwesenheiten
-- Eine Abwesenheit gehört zur Person, nicht zu einem Projekt oder Beitrag.
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'other',
  starts_on date not null,
  ends_on date not null,
  note text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint absences_kind_valid check (kind in ('vacation', 'sick', 'other')),
  constraint absences_status_valid check (status in ('planned', 'confirmed', 'cancelled')),
  constraint absences_range_valid check (ends_on >= starts_on)
);

create index if not exists absences_user_idx on public.absences(user_id, starts_on);

grant select, insert, update, delete on public.absences to authenticated;
grant all on public.absences to service_role;
alter table public.absences enable row level security;

-- Vollzugriff auf die eigenen Abwesenheiten (inkl. Art und Bemerkung).
drop policy if exists "absences_select_own" on public.absences;
create policy "absences_select_own" on public.absences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "absences_write_own" on public.absences;
create policy "absences_write_own" on public.absences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Datenschutz: Andere sehen Abwesenheiten NICHT über die Tabelle, sondern
-- ausschließlich über diese Funktion. Art und Bemerkung werden dabei
-- serverseitig entfernt – nicht bloß im Frontend versteckt.
create or replace function public.absences_for_projects(_project_ids text[])
returns table (
  id uuid,
  user_id uuid,
  starts_on date,
  ends_on date,
  kind text,
  note text,
  status text,
  masked boolean
)
language sql stable security definer set search_path = public as $$
  with visible_projects as (
    select p.id
      from public.network_projects p
     where p.id = any(_project_ids)
       and public.project_role_of(p.id, auth.uid()) is not null
  ),
  people as (
    -- Personen, deren Abwesenheit in den freigegebenen Projekten relevant ist.
    select distinct m.user_id
      from public.project_members m
      join visible_projects v on v.id = m.project_id
    union
    select p.owner_id from public.network_projects p join visible_projects v on v.id = p.id
  )
  select a.id,
         a.user_id,
         a.starts_on,
         a.ends_on,
         case when a.user_id = auth.uid() then a.kind else null end as kind,
         case when a.user_id = auth.uid() then a.note else null end as note,
         a.status,
         (a.user_id <> auth.uid()) as masked
    from public.absences a
   where a.status <> 'cancelled'
     and (a.user_id = auth.uid() or a.user_id in (select user_id from people));
$$;

grant execute on function public.absences_for_projects(text[]) to authenticated;

-- ================================================ 3) Geräte / Werkzeuge
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  responsible_id uuid references auth.users(id) on delete set null,
  note text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_owner_idx on public.devices(owner_id);

grant select, insert, update, delete on public.devices to authenticated;
grant all on public.devices to service_role;
alter table public.devices enable row level security;

create table if not exists public.device_bookings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  project_id text not null references public.network_projects(id) on delete cascade,
  item_id text,
  responsible_id uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Nachvollziehbare, ausdrückliche Übersteuerung einer Konfliktwarnung.
  override_reason text,
  override_by uuid references auth.users(id) on delete set null,
  override_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_bookings_range_valid check (ends_at > starts_at)
);

create index if not exists device_bookings_device_idx on public.device_bookings(device_id, starts_at);
create index if not exists device_bookings_project_idx on public.device_bookings(project_id, starts_at);
create index if not exists device_bookings_item_idx on public.device_bookings(item_id);

grant select, insert, update, delete on public.device_bookings to authenticated;
grant all on public.device_bookings to service_role;
alter table public.device_bookings enable row level security;

-- Ein Gerät ist sichtbar für Besitzer, verantwortliche Person und für alle
-- Beteiligten von Projekten, in denen es gebucht ist.
create or replace function public.device_visible(_device_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.devices d
     where d.id = _device_id
       and (d.owner_id = _user_id or d.responsible_id = _user_id)
  ) or exists (
    select 1 from public.device_bookings b
     where b.device_id = _device_id
       and public.project_role_of(b.project_id, _user_id) is not null
  );
$$;

create or replace function public.device_manageable(_device_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.devices d
     where d.id = _device_id
       and (d.owner_id = _user_id or d.responsible_id = _user_id)
  );
$$;

drop policy if exists "devices_select_related" on public.devices;
create policy "devices_select_related" on public.devices
  for select to authenticated using (public.device_visible(id, auth.uid()));

drop policy if exists "devices_insert_own" on public.devices;
create policy "devices_insert_own" on public.devices
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "devices_update_owner" on public.devices;
create policy "devices_update_owner" on public.devices
  for update to authenticated
  using (owner_id = auth.uid() or responsible_id = auth.uid())
  with check (owner_id = auth.uid() or responsible_id = auth.uid());

-- Geräte mit Historie werden archiviert, nicht gelöscht: Löschen bleibt dem
-- Besitzer vorbehalten und nur, solange keine Buchung existiert.
drop policy if exists "devices_delete_owner_unused" on public.devices;
create policy "devices_delete_owner_unused" on public.devices
  for delete to authenticated
  using (
    owner_id = auth.uid()
    and not exists (select 1 from public.device_bookings b where b.device_id = id)
  );

drop policy if exists "device_bookings_select_related" on public.device_bookings;
create policy "device_bookings_select_related" on public.device_bookings
  for select to authenticated
  using (
    public.project_role_of(project_id, auth.uid()) is not null
    or public.device_manageable(device_id, auth.uid())
  );

drop policy if exists "device_bookings_write_editors" on public.device_bookings;
create policy "device_bookings_write_editors" on public.device_bookings
  for all to authenticated
  using (
    public.project_can_edit(project_id, auth.uid())
    and (public.device_visible(device_id, auth.uid()))
  )
  with check (
    public.project_can_edit(project_id, auth.uid())
    and (public.device_visible(device_id, auth.uid()))
  );

-- Konfliktprüfung gegen ALLE gespeicherten Buchungen des Geräts, auch in
-- Projekten ohne eigene Berechtigung. Details werden dann maskiert.
create or replace function public.device_booking_conflicts(
  _device_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _exclude_id uuid default null
)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  project_id text,
  project_name text,
  item_id text,
  responsible_id uuid,
  masked boolean
)
language sql stable security definer set search_path = public as $$
  select b.id,
         b.starts_at,
         b.ends_at,
         case when vis then b.project_id else null end,
         case when vis then p.name else null end,
         case when vis then b.item_id else null end,
         case when vis then b.responsible_id else null end,
         not vis
    from public.device_bookings b
    join public.network_projects p on p.id = b.project_id
    cross join lateral (
      select public.project_role_of(b.project_id, auth.uid()) is not null as vis
    ) v
   where b.device_id = _device_id
     and public.device_visible(_device_id, auth.uid())
     and (_exclude_id is null or b.id <> _exclude_id)
     -- Direkt aneinandergrenzende Buchungen sind kein Konflikt.
     and b.starts_at < _ends_at
     and b.ends_at > _starts_at;
$$;

grant execute on function public.device_booking_conflicts(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ============================================ 4) Beitragsanhänge (Dateien)
create table if not exists public.contribution_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  item_id text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contribution_attachments_item_idx
  on public.contribution_attachments(project_id, item_id);
-- Dieselbe Datei darf mehrfach zugeordnet werden, ohne erneut hochzuladen.
create unique index if not exists contribution_attachments_unique_link
  on public.contribution_attachments(project_id, item_id, storage_path);

grant select, insert, delete on public.contribution_attachments to authenticated;
grant all on public.contribution_attachments to service_role;
alter table public.contribution_attachments enable row level security;

drop policy if exists "attachments_select_members" on public.contribution_attachments;
create policy "attachments_select_members" on public.contribution_attachments
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

drop policy if exists "attachments_write_editors" on public.contribution_attachments;
create policy "attachments_write_editors" on public.contribution_attachments
  for all to authenticated
  using (public.project_can_edit(project_id, auth.uid()))
  with check (public.project_can_edit(project_id, auth.uid()));

-- Privater Dateispeicher. Pfadschema: <project_id>/<item_id>/<zeit>-<name>
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-attachments', 'project-attachments', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "attachment_objects_select" on storage.objects;
create policy "attachment_objects_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-attachments'
    and public.project_role_of((storage.foldername(name))[1], auth.uid()) is not null
  );

drop policy if exists "attachment_objects_insert" on storage.objects;
create policy "attachment_objects_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-attachments'
    and public.project_can_edit((storage.foldername(name))[1], auth.uid())
  );

drop policy if exists "attachment_objects_delete" on storage.objects;
create policy "attachment_objects_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-attachments'
    and public.project_can_edit((storage.foldername(name))[1], auth.uid())
  );

-- Eine entfernte Zuordnung darf eine anderweitig genutzte Datei nicht
-- löschen: Der Client ruft nach dem Entfernen diese Funktion auf; sie meldet,
-- ob die Datei noch irgendwo verlinkt ist.
create or replace function public.attachment_still_linked(_storage_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contribution_attachments a where a.storage_path = _storage_path
  );
$$;

grant execute on function public.attachment_still_linked(text) to authenticated;
