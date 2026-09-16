-- =====================================================================
-- PixunaCAD – Objektbasierte CAD-Live-Zusammenarbeit
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt dieses Repositorys
-- (VITE_SUPABASE_URL). Einmalig im SQL-Editor ausführen.
--
-- Eigenschaften:
--  * Rein additiv – `project_documents` (gemeinsamer Gesamtstand) bleibt als
--    Erststand, Wiederherstellung und Sicherheitskopie unverändert erhalten.
--  * Wiederholbar (idempotent).
--  * Rechte ausschließlich über die bestehenden Funktionen
--    `project_role_of` / `project_can_edit` (Migration 20260831093000).
-- =====================================================================

-- --------------------------------------------- 1) Einzelne Objektänderungen
create table if not exists public.cad_object_ops (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  sheet_id text not null,
  object_id text not null,
  object_kind text not null,
  change_type text not null check (change_type in ('create', 'update', 'delete')),
  payload jsonb,
  object_version bigint not null default 1,
  seq bigserial,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cad_object_ops_project_seq_idx
  on public.cad_object_ops(project_id, seq);
create index if not exists cad_object_ops_object_idx
  on public.cad_object_ops(project_id, sheet_id, object_id);

grant select, insert on public.cad_object_ops to authenticated;
grant all on public.cad_object_ops to service_role;
alter table public.cad_object_ops enable row level security;

drop policy if exists "cad_object_ops_select_members" on public.cad_object_ops;
create policy "cad_object_ops_select_members" on public.cad_object_ops
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

drop policy if exists "cad_object_ops_insert_editors" on public.cad_object_ops;
create policy "cad_object_ops_insert_editors" on public.cad_object_ops
  for insert to authenticated
  with check (
    public.project_can_edit(project_id, auth.uid())
    and actor_id = auth.uid()
  );

-- Kein update/delete: die Operationsliste ist ein reines Protokoll.

-- ------------------------------------ 2) Kurzlebige Bearbeitungsmarkierungen
create table if not exists public.cad_object_locks (
  project_id text not null references public.network_projects(id) on delete cascade,
  sheet_id text not null,
  object_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  expires_at timestamptz not null default now() + interval '30 seconds',
  updated_at timestamptz not null default now(),
  primary key (project_id, sheet_id, object_id)
);

create index if not exists cad_object_locks_expiry_idx
  on public.cad_object_locks(expires_at);

grant select, insert, update, delete on public.cad_object_locks to authenticated;
grant all on public.cad_object_locks to service_role;
alter table public.cad_object_locks enable row level security;

drop policy if exists "cad_object_locks_select_members" on public.cad_object_locks;
create policy "cad_object_locks_select_members" on public.cad_object_locks
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

-- Setzen/verlängern/lösen darf nur, wer bearbeiten darf – und nur die eigene
-- Markierung. Abgelaufene Fremdmarkierungen dürfen übernommen werden.
drop policy if exists "cad_object_locks_insert_editors" on public.cad_object_locks;
create policy "cad_object_locks_insert_editors" on public.cad_object_locks
  for insert to authenticated
  with check (public.project_can_edit(project_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "cad_object_locks_update_owner" on public.cad_object_locks;
create policy "cad_object_locks_update_owner" on public.cad_object_locks
  for update to authenticated
  using (
    public.project_can_edit(project_id, auth.uid())
    and (user_id = auth.uid() or expires_at < now())
  )
  with check (public.project_can_edit(project_id, auth.uid()) and user_id = auth.uid());

drop policy if exists "cad_object_locks_delete_owner" on public.cad_object_locks;
create policy "cad_object_locks_delete_owner" on public.cad_object_locks
  for delete to authenticated
  using (
    public.project_can_edit(project_id, auth.uid())
    and (user_id = auth.uid() or expires_at < now())
  );

-- ------------------------------------------------ 3) Realtime-Veröffentlichung
do $$ begin
  alter publication supabase_realtime add table public.cad_object_ops;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.cad_object_locks;
exception when duplicate_object then null; end $$;
