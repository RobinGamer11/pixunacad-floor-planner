-- =====================================================================
-- PixunaCAD – Paket 07b: Antworten und Erwähnungen in Kommentaren
--
-- Ziel-Datenbank: das eigene, externe Supabase-Projekt (VITE_SUPABASE_URL).
-- Einmalig im SQL-Editor ausführen. Setzt 20260902090000_comments.sql voraus.
--
-- Eigenschaften:
--  * rein additiv, wiederholbar (idempotent), keine Datenlöschung
--  * keine neuen Tabellen, keine neuen Rechte: es gelten weiterhin die
--    Policies aus 20260902090000_comments.sql
--  * eine Erwähnung erteilt ausdrücklich KEINE Zugriffsrechte
-- =====================================================================

alter table public.project_comments
  add column if not exists parent_id uuid
    references public.project_comments(id) on delete cascade,
  add column if not exists mentions uuid[] not null default '{}'::uuid[];

create index if not exists project_comments_parent_idx
  on public.project_comments(parent_id);

-- Guard erweitern: Verankerung, Urheberschaft, Thread-Zuordnung fest.
create or replace function public.project_comments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_project text;
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    new.edited_at := null;
    new.mentions := coalesce(new.mentions, '{}'::uuid[]);

    -- Antworten müssen zum selben Projekt und Kontext gehören.
    if new.parent_id is not null then
      select project_id into parent_project
        from public.project_comments where id = new.parent_id;
      if parent_project is null or parent_project <> new.project_id then
        raise exception 'Antwort gehört nicht zum selben Projekt.';
      end if;
    end if;

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
  new.parent_id := old.parent_id;
  new.updated_at := now();

  if new.body is distinct from old.body then
    if auth.uid() <> old.author_id then
      raise exception 'Nur der Autor darf den Kommentartext ändern.';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
    new.mentions := old.mentions;
  end if;

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
