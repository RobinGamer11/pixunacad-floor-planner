-- =====================================================================
-- PixunaCAD – Serverseitige Revisionen für die Live-Zusammenarbeit
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt dieses Repositorys
-- (VITE_SUPABASE_URL). Einmalig im SQL-Editor ausführen.
--
-- Ergänzt Migration 20260916120000 (cad_object_ops / cad_object_locks) um:
--  * eine eindeutige, serverseitig vergebene Revision je Objekt,
--  * eine atomare Schreibfunktion mit Konfliktprüfung,
--  * dieselbe Mechanik für die Projektmappe (eigenes Elementmodell).
--
-- Rein additiv und wiederholbar. `project_documents` bleibt unverändert als
-- Erststand, Wiederherstellung und Sicherheitskopie.
-- =====================================================================

-- ============================================================ 1) CAD-Zustand
create table if not exists public.cad_object_state (
  project_id text not null references public.network_projects(id) on delete cascade,
  sheet_id text not null,
  object_id text not null,
  object_kind text not null,
  revision bigint not null default 1,
  payload jsonb,
  deleted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, sheet_id, object_id)
);

create index if not exists cad_object_state_project_idx
  on public.cad_object_state(project_id, sheet_id);

grant select on public.cad_object_state to authenticated;
grant all on public.cad_object_state to service_role;
alter table public.cad_object_state enable row level security;

drop policy if exists "cad_object_state_select_members" on public.cad_object_state;
create policy "cad_object_state_select_members" on public.cad_object_state
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

-- Geschrieben wird ausschließlich über die Funktion unten (security definer).

-- --------------------------------------------- 2) Atomare CAD-Schreibfunktion
-- Gibt zurück, ob die Änderung übernommen wurde. Bei Ablehnung liefert sie den
-- aktuell gültigen Stand genau dieses einen Objekts zurück – niemals mehr.
create or replace function public.cad_write_object(
  _project_id text,
  _sheet_id text,
  _object_id text,
  _object_kind text,
  _change_type text,
  _payload jsonb,
  _base_revision bigint
)
returns table (accepted boolean, revision bigint, payload jsonb, deleted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_rev bigint;
  cur_payload jsonb;
  cur_deleted boolean;
  next_rev bigint;
begin
  if not public.project_can_edit(_project_id, auth.uid()) then
    raise exception 'PIXUNA_FORBIDDEN';
  end if;
  if _change_type not in ('create', 'update', 'delete') then
    raise exception 'PIXUNA_BAD_CHANGE_TYPE';
  end if;

  select s.revision, s.payload, s.deleted
    into cur_rev, cur_payload, cur_deleted
  from public.cad_object_state s
  where s.project_id = _project_id
    and s.sheet_id = _sheet_id
    and s.object_id = _object_id
  for update;

  -- Konflikt: zwischenzeitlich hat jemand anderes dasselbe Objekt geändert.
  if cur_rev is not null and _base_revision is not null and _base_revision < cur_rev then
    return query select false, cur_rev, cur_payload, cur_deleted;
    return;
  end if;

  next_rev := coalesce(cur_rev, 0) + 1;

  insert into public.cad_object_state as st
    (project_id, sheet_id, object_id, object_kind, revision, payload, deleted, updated_by, updated_at)
  values
    (_project_id, _sheet_id, _object_id, _object_kind, next_rev, _payload,
     _change_type = 'delete', auth.uid(), now())
  on conflict (project_id, sheet_id, object_id) do update
    set revision = next_rev,
        object_kind = excluded.object_kind,
        payload = excluded.payload,
        deleted = excluded.deleted,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  insert into public.cad_object_ops
    (project_id, sheet_id, object_id, object_kind, change_type, payload, object_version, actor_id)
  values
    (_project_id, _sheet_id, _object_id, _object_kind, _change_type, _payload, next_rev, auth.uid());

  return query select true, next_rev, _payload, _change_type = 'delete';
end;
$$;

revoke all on function public.cad_write_object(text, text, text, text, text, jsonb, bigint) from public;
grant execute on function public.cad_write_object(text, text, text, text, text, jsonb, bigint) to authenticated;

-- ===================================================== 3) Projektmappe: Ops
create table if not exists public.mappe_object_ops (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  page_id text not null,
  object_id text not null,
  object_kind text not null,
  change_type text not null check (change_type in ('create', 'update', 'delete')),
  payload jsonb,
  object_version bigint not null default 1,
  seq bigserial,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mappe_object_ops_project_seq_idx
  on public.mappe_object_ops(project_id, seq);

grant select on public.mappe_object_ops to authenticated;
grant all on public.mappe_object_ops to service_role;
alter table public.mappe_object_ops enable row level security;

drop policy if exists "mappe_object_ops_select_members" on public.mappe_object_ops;
create policy "mappe_object_ops_select_members" on public.mappe_object_ops
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

create table if not exists public.mappe_object_state (
  project_id text not null references public.network_projects(id) on delete cascade,
  page_id text not null,
  object_id text not null,
  object_kind text not null,
  revision bigint not null default 1,
  payload jsonb,
  deleted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, page_id, object_id)
);

grant select on public.mappe_object_state to authenticated;
grant all on public.mappe_object_state to service_role;
alter table public.mappe_object_state enable row level security;

drop policy if exists "mappe_object_state_select_members" on public.mappe_object_state;
create policy "mappe_object_state_select_members" on public.mappe_object_state
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

create or replace function public.mappe_write_object(
  _project_id text,
  _page_id text,
  _object_id text,
  _object_kind text,
  _change_type text,
  _payload jsonb,
  _base_revision bigint
)
returns table (accepted boolean, revision bigint, payload jsonb, deleted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_rev bigint;
  cur_payload jsonb;
  cur_deleted boolean;
  next_rev bigint;
begin
  if not public.project_can_edit(_project_id, auth.uid()) then
    raise exception 'PIXUNA_FORBIDDEN';
  end if;
  if _change_type not in ('create', 'update', 'delete') then
    raise exception 'PIXUNA_BAD_CHANGE_TYPE';
  end if;

  select s.revision, s.payload, s.deleted
    into cur_rev, cur_payload, cur_deleted
  from public.mappe_object_state s
  where s.project_id = _project_id
    and s.page_id = _page_id
    and s.object_id = _object_id
  for update;

  if cur_rev is not null and _base_revision is not null and _base_revision < cur_rev then
    return query select false, cur_rev, cur_payload, cur_deleted;
    return;
  end if;

  next_rev := coalesce(cur_rev, 0) + 1;

  insert into public.mappe_object_state as st
    (project_id, page_id, object_id, object_kind, revision, payload, deleted, updated_by, updated_at)
  values
    (_project_id, _page_id, _object_id, _object_kind, next_rev, _payload,
     _change_type = 'delete', auth.uid(), now())
  on conflict (project_id, page_id, object_id) do update
    set revision = next_rev,
        object_kind = excluded.object_kind,
        payload = excluded.payload,
        deleted = excluded.deleted,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  insert into public.mappe_object_ops
    (project_id, page_id, object_id, object_kind, change_type, payload, object_version, actor_id)
  values
    (_project_id, _page_id, _object_id, _object_kind, _change_type, _payload, next_rev, auth.uid());

  return query select true, next_rev, _payload, _change_type = 'delete';
end;
$$;

revoke all on function public.mappe_write_object(text, text, text, text, text, jsonb, bigint) from public;
grant execute on function public.mappe_write_object(text, text, text, text, text, jsonb, bigint) to authenticated;

-- ------------------------------ 4) Projektmappe: weiche Bearbeitungshinweise
create table if not exists public.mappe_object_locks (
  project_id text not null references public.network_projects(id) on delete cascade,
  page_id text not null,
  object_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  expires_at timestamptz not null default now() + interval '30 seconds',
  updated_at timestamptz not null default now(),
  primary key (project_id, page_id, object_id)
);

grant select, insert, update, delete on public.mappe_object_locks to authenticated;
grant all on public.mappe_object_locks to service_role;
alter table public.mappe_object_locks enable row level security;

drop policy if exists "mappe_object_locks_select_members" on public.mappe_object_locks;
create policy "mappe_object_locks_select_members" on public.mappe_object_locks
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

drop policy if exists "mappe_object_locks_insert_editors" on public.mappe_object_locks;
create policy "mappe_object_locks_insert_editors" on public.mappe_object_locks
  for insert to authenticated
  with check (public.project_can_edit(project_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "mappe_object_locks_update_owner" on public.mappe_object_locks;
create policy "mappe_object_locks_update_owner" on public.mappe_object_locks
  for update to authenticated
  using (
    public.project_can_edit(project_id, auth.uid())
    and (user_id = auth.uid() or expires_at < now())
  )
  with check (public.project_can_edit(project_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "mappe_object_locks_delete_owner" on public.mappe_object_locks;
create policy "mappe_object_locks_delete_owner" on public.mappe_object_locks
  for delete to authenticated
  using (
    public.project_can_edit(project_id, auth.uid())
    and (user_id = auth.uid() or expires_at < now())
  );

-- ------------------------------------------------ 5) Realtime-Veröffentlichung
do $$ begin
  alter publication supabase_realtime add table public.mappe_object_ops;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.mappe_object_locks;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.cad_object_locks;
exception when duplicate_object then null; end $$;
