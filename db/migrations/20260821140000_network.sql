-- =====================================================================
-- PixunaCAD – Netzwerk (Profile, Kontakte, Projektmitglieder, Präsenz)
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt dieses Repositorys
-- (VITE_SUPABASE_URL). Einmalig im Supabase SQL-Editor ausführen.
-- Rein additiv: bestehende Tabellen (z. B. user_workspaces) bleiben unberührt.
-- =====================================================================

-- ---------------------------------------------------------------- Profile
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- --------------------------------------------------------------- Kontakte
do $$ begin
  create type public.contact_status as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null; end $$;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status public.contact_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_distinct check (requester_id <> addressee_id),
  constraint contacts_unique_pair unique (requester_id, addressee_id)
);

create index if not exists contacts_addressee_idx on public.contacts(addressee_id);
create index if not exists contacts_requester_idx on public.contacts(requester_id);

grant select, insert, update, delete on public.contacts to authenticated;
grant all on public.contacts to service_role;
alter table public.contacts enable row level security;

-- ------------------------------------------------------ Netzwerk-Projekte
-- id entspricht der bereits bestehenden lokalen Projekt-ID (Text), damit
-- vorhandene Projekte ohne ID-Änderung übernommen werden können.
create table if not exists public.network_projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists network_projects_owner_idx on public.network_projects(owner_id);

grant select, insert, update, delete on public.network_projects to authenticated;
grant all on public.network_projects to service_role;
alter table public.network_projects enable row level security;

create table if not exists public.project_members (
  project_id text not null references public.network_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members(user_id);

grant select, insert, update, delete on public.project_members to authenticated;
grant all on public.project_members to service_role;
alter table public.project_members enable row level security;

-- ---------------------------------------------------------------- Präsenz
create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'offline',
  last_seen_at timestamptz not null default now(),
  constraint presence_status_valid check (status in ('online', 'away', 'busy', 'offline'))
);

grant select, insert, update on public.presence to authenticated;
grant all on public.presence to service_role;
alter table public.presence enable row level security;

-- ================================================ Hilfsfunktionen (definer)
-- SECURITY DEFINER verhindert rekursive RLS-Auswertung in den Policies.

create or replace function public.are_contacts(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contacts c
    where c.status = 'accepted'
      and ((c.requester_id = _a and c.addressee_id = _b)
        or (c.requester_id = _b and c.addressee_id = _a))
  );
$$;

create or replace function public.has_contact_link(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contacts c
    where ((c.requester_id = _a and c.addressee_id = _b)
        or (c.requester_id = _b and c.addressee_id = _a))
  );
$$;

create or replace function public.is_project_owner(_project_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.network_projects p
    where p.id = _project_id and p.owner_id = _user_id
  );
$$;

create or replace function public.is_project_member(_project_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = _project_id and m.user_id = _user_id
  ) or public.is_project_owner(_project_id, _user_id);
$$;

create or replace function public.shares_project(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.network_projects p
    left join public.project_members m on m.project_id = p.id
    where (p.owner_id = _a or m.user_id = _a)
      and (p.owner_id = _b or m.user_id = _b)
  );
$$;

-- Gezielte Personensuche. Gibt ausschließlich öffentliche Anzeigedaten
-- zurück – niemals E-Mail-Adressen oder andere Kontodaten.
create or replace function public.search_profiles(query text)
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(coalesce(query, '')) >= 2
    and p.display_name ilike '%' || query || '%'
  order by p.display_name
  limit 20;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

-- ============================================================== Policies

-- Profile ---------------------------------------------------------------
drop policy if exists "profiles_select_related" on public.profiles;
create policy "profiles_select_related" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.has_contact_link(auth.uid(), id)
    or public.shares_project(auth.uid(), id)
  );

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Kontakte --------------------------------------------------------------
drop policy if exists "contacts_select_own" on public.contacts;
create policy "contacts_select_own" on public.contacts
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "contacts_insert_as_requester" on public.contacts;
create policy "contacts_insert_as_requester" on public.contacts
  for insert to authenticated with check (requester_id = auth.uid());

-- Annehmen/Ablehnen darf ausschließlich der Empfänger der Anfrage.
drop policy if exists "contacts_update_addressee" on public.contacts;
create policy "contacts_update_addressee" on public.contacts
  for update to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

drop policy if exists "contacts_delete_participants" on public.contacts;
create policy "contacts_delete_participants" on public.contacts
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Netzwerk-Projekte -----------------------------------------------------
drop policy if exists "network_projects_select_members" on public.network_projects;
create policy "network_projects_select_members" on public.network_projects
  for select to authenticated
  using (owner_id = auth.uid() or public.is_project_member(id, auth.uid()));

drop policy if exists "network_projects_insert_owner" on public.network_projects;
create policy "network_projects_insert_owner" on public.network_projects
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "network_projects_update_owner" on public.network_projects;
create policy "network_projects_update_owner" on public.network_projects
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "network_projects_delete_owner" on public.network_projects;
create policy "network_projects_delete_owner" on public.network_projects
  for delete to authenticated using (owner_id = auth.uid());

-- Projektmitglieder -----------------------------------------------------
drop policy if exists "project_members_select_related" on public.project_members;
create policy "project_members_select_related" on public.project_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_project_member(project_id, auth.uid()));

-- Nur der Projekt-Owner darf Mitglieder eintragen. Damit kann sich niemand
-- selbst in ein fremdes Projekt schreiben.
drop policy if exists "project_members_insert_owner" on public.project_members;
create policy "project_members_insert_owner" on public.project_members
  for insert to authenticated
  with check (public.is_project_owner(project_id, auth.uid()));

drop policy if exists "project_members_update_owner" on public.project_members;
create policy "project_members_update_owner" on public.project_members
  for update to authenticated
  using (public.is_project_owner(project_id, auth.uid()))
  with check (public.is_project_owner(project_id, auth.uid()));

-- Entfernen: Owner entfernt Mitglieder, Mitglieder dürfen selbst austreten.
drop policy if exists "project_members_delete_owner_or_self" on public.project_members;
create policy "project_members_delete_owner_or_self" on public.project_members
  for delete to authenticated
  using (public.is_project_owner(project_id, auth.uid()) or user_id = auth.uid());

-- Präsenz ---------------------------------------------------------------
drop policy if exists "presence_select_related" on public.presence;
create policy "presence_select_related" on public.presence
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.are_contacts(auth.uid(), user_id)
    or public.shares_project(auth.uid(), user_id)
  );

drop policy if exists "presence_insert_self" on public.presence;
create policy "presence_insert_self" on public.presence
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "presence_update_self" on public.presence;
create policy "presence_update_self" on public.presence
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================================================= Profil-Anlage & Backfill
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select u.id, coalesce(split_part(u.email, '@', 1), '')
from auth.users u
on conflict (id) do nothing;

-- ================================================================ Realtime
do $$ begin
  alter publication supabase_realtime add table public.contacts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.project_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.presence;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
