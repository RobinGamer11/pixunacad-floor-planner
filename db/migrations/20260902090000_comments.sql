-- =====================================================================
-- PixunaCAD – Paket 07: Kommentare in CAD und Projektmappe
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt (VITE_SUPABASE_URL).
-- Einmalig im SQL-Editor ausführen. Baut auf
--   20260821140000_network.sql und 20260831093000_project_access.sql auf.
--
-- Eigenschaften:
--  * rein additiv, wiederholbar (idempotent), keine Datenlöschung
--  * Rechte über project_role_of / project_can_comment /
--    project_can_manage_members aus Paket 01
--  * Autor, Projekt und Zeitstempel werden serverseitig erzwungen
-- =====================================================================

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  -- "cad" = Zeichenblatt, "mappe" = Projektmappen-/Buchseite
  context text not null check (context in ('cad', 'mappe')),
  -- Stabile Blatt-/Seiten-Id aus dem Projektdokument (kein FK).
  sheet_id text not null,
  -- Optionale Buch-/Mappen-Id (z. B. Finanzbuch), sonst null.
  book_id text,
  -- CAD: Weltkoordinaten in Metern. Mappe: Prozent der Seitenbreite/-höhe.
  pos_x double precision not null,
  pos_y double precision not null,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  author_id uuid not null default auth.uid() references auth.users(id) on delete set default,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists project_comments_project_idx
  on public.project_comments(project_id, context, sheet_id);
create index if not exists project_comments_author_idx
  on public.project_comments(author_id, status);

-- Serverseitiger Schutz: Autor, Projekt und Kontext sind unveränderlich,
-- Zeitstempel werden nicht vom Client gesetzt.
create or replace function public.project_comments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    new.edited_at := null;
    if new.status = 'done' then
      new.resolved_at := now();
      new.resolved_by := auth.uid();
    else
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
    return new;
  end if;

  -- UPDATE: Verankerung und Urheberschaft bleiben fest.
  new.id := old.id;
  new.project_id := old.project_id;
  new.context := old.context;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  new.updated_at := now();

  -- Fremde Texte dürfen nicht unter dem Namen des Autors umgeschrieben werden.
  if new.body is distinct from old.body then
    if auth.uid() <> old.author_id then
      raise exception 'Nur der Autor darf den Kommentartext ändern.';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  -- Position darf nur der Autor verschieben.
  if (new.pos_x, new.pos_y, new.sheet_id, new.book_id)
     is distinct from (old.pos_x, old.pos_y, old.sheet_id, old.book_id)
     and auth.uid() <> old.author_id then
    raise exception 'Nur der Autor darf die Position ändern.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      new.resolved_at := now();
      new.resolved_by := auth.uid();
    else
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  else
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  end if;

  return new;
end;
$$;

drop trigger if exists project_comments_guard_trg on public.project_comments;
create trigger project_comments_guard_trg
  before insert or update on public.project_comments
  for each row execute function public.project_comments_guard();

grant select, insert, update, delete on public.project_comments to authenticated;
grant all on public.project_comments to service_role;
alter table public.project_comments enable row level security;

-- Lesen: alle Projektbeteiligten (auch Viewer).
drop policy if exists "project_comments_select_members" on public.project_comments;
create policy "project_comments_select_members" on public.project_comments
  for select to authenticated
  using (public.project_role_of(project_id, auth.uid()) is not null);

-- Schreiben: eigenes Kommentieren genügt (Viewer eingeschlossen). Das Recht
-- schaltet ausdrücklich KEIN Schreibrecht am Projektinhalt frei.
drop policy if exists "project_comments_insert_commenters" on public.project_comments;
create policy "project_comments_insert_commenters" on public.project_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.project_can_comment(project_id, auth.uid())
  );

-- Ändern: Autor (eigener Kommentar) oder Moderation (owner/admin).
drop policy if exists "project_comments_update_author_or_moderator" on public.project_comments;
create policy "project_comments_update_author_or_moderator" on public.project_comments
  for update to authenticated
  using (
    (author_id = auth.uid() and public.project_can_comment(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  )
  with check (
    (author_id = auth.uid() and public.project_can_comment(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  );

drop policy if exists "project_comments_delete_author_or_moderator" on public.project_comments;
create policy "project_comments_delete_author_or_moderator" on public.project_comments
  for delete to authenticated
  using (
    (author_id = auth.uid() and public.project_can_comment(project_id, auth.uid()))
    or public.project_can_manage_members(project_id, auth.uid())
  );
