-- =====================================================================
-- PixunaCAD – Paket 1 / Teilschritt 1: Gemeinsamer Projektzugriff & Rollen
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt dieses Repositorys
-- (VITE_SUPABASE_URL). Einmalig im SQL-Editor ausführen.
--
-- Eigenschaften:
--  * Rein additiv – bestehende Tabellen (profiles, contacts, network_projects,
--    project_members, presence, user_workspaces) bleiben erhalten.
--  * Wiederholbar (idempotent): mehrfaches Ausführen erzeugt keine Duplikate.
--  * Keine Löschung von Bestandsdaten, keine Änderung vorhandener Ownership.
-- =====================================================================

-- ------------------------------------------------ 1) Rollen & Overrides
-- Rollen liegen ausschließlich an der Mitgliedschaft (project_members),
-- niemals am Profil. 'owner' wird weiterhin über network_projects.owner_id
-- geführt und ist in project_members nicht zulässig.

alter table public.project_members
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Altbestand ZUERST bereinigen, sonst schlägt der Constraint fehl.
-- Der ursprüngliche Wert wird in permissions.legacy_role gesichert und geht
-- damit nicht still verloren.
update public.project_members
   set permissions = coalesce(permissions, '{}'::jsonb)
                     || jsonb_build_object('legacy_role', role),
       role = case when role = 'owner' then 'admin' else 'member' end
 where role not in ('admin', 'member', 'viewer');

do $$ begin
  alter table public.project_members
    add constraint project_members_role_valid
    check (role in ('admin', 'member', 'viewer'));
exception when duplicate_object then null; end $$;

-- ------------------------------------------- 2) Geteilte Projektinhalte
-- Bewusst getrennt von user_workspaces: dort liegen weiterhin die rein
-- persönlichen Daten (inkl. privater Projekte). Geteilte Projekte werden
-- ausschließlich hier – pro Projekt – gespeichert.

create table if not exists public.project_documents (
  project_id text primary key references public.network_projects(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists project_documents_updated_idx on public.project_documents(updated_at);

grant select on public.project_documents to authenticated;
grant all on public.project_documents to service_role;
alter table public.project_documents enable row level security;

-- ================================================ 3) Berechtigungslogik
-- SECURITY DEFINER, damit RLS-Policies sich nicht rekursiv auswerten.

create or replace function public.project_role_of(_project_id text, _user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.network_projects p
                  where p.id = _project_id and p.owner_id = _user_id) then 'owner'
    else (select m.role from public.project_members m
           where m.project_id = _project_id and m.user_id = _user_id)
  end;
$$;

create or replace function public.project_permissions_of(_project_id text, _user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select m.permissions from public.project_members m
                    where m.project_id = _project_id and m.user_id = _user_id), '{}'::jsonb);
$$;

-- Inhalte bearbeiten: owner/admin/member ja, viewer nein – jeweils durch eine
-- individuelle Abweichung überschreibbar. Ownership bleibt unantastbar.
create or replace function public.project_can_edit(_project_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.project_role_of(_project_id, _user_id) is null then false
    when public.project_role_of(_project_id, _user_id) = 'owner' then true
    when public.project_permissions_of(_project_id, _user_id) ? 'can_edit'
      then (public.project_permissions_of(_project_id, _user_id) ->> 'can_edit')::boolean
    else public.project_role_of(_project_id, _user_id) in ('admin', 'member')
  end;
$$;

-- Mitglieder verwalten: owner/admin. Eine Abweichung kann Rechte nur
-- entziehen, niemals einem member/viewer Verwaltungsrechte geben.
create or replace function public.project_can_manage_members(_project_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.project_role_of(_project_id, _user_id) = 'owner' then true
    when public.project_role_of(_project_id, _user_id) = 'admin'
      then coalesce((public.project_permissions_of(_project_id, _user_id) ->> 'can_manage_members')::boolean, true)
    else false
  end;
$$;

-- Kommentieren: alle Mitglieder inkl. viewer (Kommentar-Paket folgt später).
create or replace function public.project_can_comment(_project_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.project_role_of(_project_id, _user_id) is null then false
    when public.project_permissions_of(_project_id, _user_id) ? 'can_comment'
      then (public.project_permissions_of(_project_id, _user_id) ->> 'can_comment')::boolean
    else true
  end;
$$;

-- ================================================ 4) Policies: Dokumente
drop policy if exists "project_documents_select_members" on public.project_documents;
create policy "project_documents_select_members" on public.project_documents
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

drop policy if exists "project_documents_write_editors" on public.project_documents;
create policy "project_documents_write_editors" on public.project_documents
  for all to authenticated
  using (public.project_can_edit(project_id, auth.uid()))
  with check (public.project_can_edit(project_id, auth.uid()));

-- Schreibrechte auf Tabellenebene nur für Editoren-Pfade; die RLS-Policy
-- oben entscheidet zusätzlich pro Zeile.
grant insert, update on public.project_documents to authenticated;

-- ============================== 5) Policies & Schutz: Mitgliederverwaltung
-- Lesen: alle Projektbeteiligten (auch ohne persönlichen Kontakt).
drop policy if exists "project_members_select_related" on public.project_members;
create policy "project_members_select_related" on public.project_members
  for select to authenticated
  using (user_id = auth.uid() or public.project_role_of(project_id, auth.uid()) is not null);

drop policy if exists "project_members_insert_owner" on public.project_members;
drop policy if exists "project_members_insert_manager" on public.project_members;
create policy "project_members_insert_manager" on public.project_members
  for insert to authenticated
  with check (public.project_can_manage_members(project_id, auth.uid()));


drop policy if exists "project_members_update_owner" on public.project_members;
drop policy if exists "project_members_update_manager" on public.project_members;
create policy "project_members_update_manager" on public.project_members
  for update to authenticated
  using (public.project_can_manage_members(project_id, auth.uid()))
  with check (public.project_can_manage_members(project_id, auth.uid()));

drop policy if exists "project_members_delete_owner_or_self" on public.project_members;
drop policy if exists "project_members_delete_manager_or_self" on public.project_members;
create policy "project_members_delete_manager_or_self" on public.project_members
  for delete to authenticated
  using (public.project_can_manage_members(project_id, auth.uid()) or user_id = auth.uid());

-- Feinregeln, die eine Policy allein nicht abbilden kann:
--  * Admins dürfen weder Owner noch andere Admins verwalten.
--  * Niemand darf sich selbst befördern oder Verwaltungsrechte zuschreiben.
--  * 'owner' ist in project_members generell unzulässig.
create or replace function public.project_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  is_delete boolean := (tg_op = 'DELETE');
  target_project text;
  target_user uuid;
  old_role text;
  new_role text;
  new_permissions jsonb;
begin
  if is_delete then
    target_project := old.project_id;
    target_user := old.user_id;
    old_role := old.role;
  else
    target_project := new.project_id;
    target_user := new.user_id;
    new_role := new.role;
    new_permissions := coalesce(new.permissions, '{}'::jsonb);
    if tg_op = 'UPDATE' then old_role := old.role; end if;
  end if;

  -- Server-/Wartungszugriffe ohne Benutzerkontext bleiben unberührt.
  if actor is null then
    if is_delete then return old; end if;
    return new;
  end if;

  actor_role := public.project_role_of(target_project, actor);

  -- Austritt aus eigenem Willen ist immer erlaubt.
  if is_delete and target_user = actor then
    return old;
  end if;

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'PIXUNA_FORBIDDEN: keine Berechtigung zur Mitgliederverwaltung';
  end if;

  if new_role = 'owner' then
    raise exception 'PIXUNA_FORBIDDEN: Ownership wird über das Projekt geführt';
  end if;

  if actor_role = 'admin' then
    if target_user = actor then
      raise exception 'PIXUNA_FORBIDDEN: eigene Rolle oder Rechte nicht änderbar';
    end if;
    if coalesce(old_role, '') = 'admin' or coalesce(new_role, '') = 'admin' then
      raise exception 'PIXUNA_FORBIDDEN: Admins dürfen keine Admins verwalten';
    end if;
    if public.project_role_of(target_project, target_user) = 'owner' then
      raise exception 'PIXUNA_FORBIDDEN: Owner ist geschützt';
    end if;
    -- Verwaltungsrechte selbst darf nur der Owner vergeben/entziehen.
    if not is_delete and new_permissions ? 'can_manage_members' then
      raise exception 'PIXUNA_FORBIDDEN: Verwaltungsrechte nur durch den Owner';
    end if;
  end if;

  if is_delete then return old; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_members_guard_trg on public.project_members;
create trigger project_members_guard_trg
  before insert or update or delete on public.project_members
  for each row execute function public.project_members_guard();

-- ============================ 6) Speichern mit Konflikterkennung (RPC)
-- Ein veralteter Gesamtstand darf neuere Änderungen nicht still überschreiben.
create or replace function public.save_project_document(
  _project_id text,
  _payload jsonb,
  _expected_version bigint
)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  current_version bigint;
  next_version bigint;
begin
  if auth.uid() is null then
    raise exception 'PIXUNA_FORBIDDEN: nicht angemeldet';
  end if;
  if not public.project_can_edit(_project_id, auth.uid()) then
    raise exception 'PIXUNA_FORBIDDEN: kein Schreibrecht für dieses Projekt';
  end if;

  select version into current_version
    from public.project_documents
   where project_id = _project_id
     for update;

  if current_version is null then
    insert into public.project_documents (project_id, payload, version, updated_at, updated_by)
    values (_project_id, _payload, 1, now(), auth.uid());
    return 1;
  end if;

  if _expected_version is not null and _expected_version <> current_version then
    raise exception 'PIXUNA_CONFLICT: % <> %', _expected_version, current_version;
  end if;

  next_version := current_version + 1;
  update public.project_documents
     set payload = _payload,
         version = next_version,
         updated_at = now(),
         updated_by = auth.uid()
   where project_id = _project_id;
  return next_version;
end;
$$;

revoke all on function public.save_project_document(text, jsonb, bigint) from public;
grant execute on function public.save_project_document(text, jsonb, bigint) to authenticated;

-- Projekte, in denen ich Mitglied bin, müssen lesbar sein (nicht nur eigene).
drop policy if exists "network_projects_select_members" on public.network_projects;
create policy "network_projects_select_members" on public.network_projects
  for select to authenticated
  using (public.project_role_of(id, auth.uid()) is not null);

-- Projektstammdaten ändern: Owner und Admins; Ownership-Wechsel nur Owner.
drop policy if exists "network_projects_update_owner" on public.network_projects;
drop policy if exists "network_projects_update_manager" on public.network_projects;
create policy "network_projects_update_manager" on public.network_projects
  for update to authenticated
  using (public.project_role_of(id, auth.uid()) in ('owner', 'admin'))
  with check (public.project_role_of(id, auth.uid()) in ('owner', 'admin'));

create or replace function public.network_projects_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.owner_id is distinct from old.owner_id
     and old.owner_id <> auth.uid() then
    raise exception 'PIXUNA_FORBIDDEN: Ownership darf nur der Owner übergeben';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists network_projects_guard_trg on public.network_projects;
create trigger network_projects_guard_trg
  before update on public.network_projects
  for each row execute function public.network_projects_guard();

-- Profile von Projektbeteiligten müssen auch ohne persönlichen Kontakt
-- lesbar sein (Team-Reiter, Verantwortliche).
drop policy if exists "profiles_select_related" on public.profiles;
create policy "profiles_select_related" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.has_contact_link(auth.uid(), id)
    or public.shares_project(auth.uid(), id)
  );

-- ================================================================ Realtime
do $$ begin
  alter publication supabase_realtime add table public.project_documents;
exception when duplicate_object then null; end $$;
