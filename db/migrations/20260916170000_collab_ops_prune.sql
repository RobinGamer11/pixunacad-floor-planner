-- Begrenzt die Operationslisten der Live-Zusammenarbeit.
--
-- Hintergrund: Einzeloperationen werden nur noch für den kurzen Nachlauf
-- gebraucht (Nachholen einer Verbindungslücke). Der dauerhafte Stand liegt in
-- den Zustandstabellen (`cad_object_state` / `mappe_object_state`) und im
-- vollständigen Projektstand (`project_documents`) – das bleibt die
-- Wiederherstellungsbasis.
--
-- Eine Operation wird nur gelöscht, wenn
--   a) sie älter als das Nachhol-Fenster ist UND
--   b) ihr Zustand sicher im gemeinsamen Zustand enthalten ist,
--      also eine Zustandszeile mit mindestens dieser Revision existiert.
--
-- Additiv und wiederholbar ausführbar.

-- Nachhol-Fenster: großzügig über der Nachlaufzeit der Clients.
create or replace function public.collab_ops_retention()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

create index if not exists cad_object_ops_project_created_idx
  on public.cad_object_ops (project_id, created_at);
create index if not exists mappe_object_ops_project_created_idx
  on public.mappe_object_ops (project_id, created_at);

create or replace function public.prune_cad_object_ops(_project_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cad_object_ops o
   where o.project_id = _project_id
     and o.created_at < now() - public.collab_ops_retention()
     and exists (
       select 1
         from public.cad_object_state s
        where s.project_id = o.project_id
          and s.sheet_id  = o.sheet_id
          and s.object_id = o.object_id
          and s.revision >= o.object_version
     );
$$;

create or replace function public.prune_mappe_object_ops(_project_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.mappe_object_ops o
   where o.project_id = _project_id
     and o.created_at < now() - public.collab_ops_retention()
     and exists (
       select 1
         from public.mappe_object_state s
        where s.project_id = o.project_id
          and s.page_id   = o.page_id
          and s.object_id = o.object_id
          and s.revision >= o.object_version
     );
$$;

revoke all on function public.prune_cad_object_ops(text) from public;
revoke all on function public.prune_mappe_object_ops(text) from public;

-- Aufräumen gelegentlich direkt beim Schreiben anstoßen (ohne Cron-Abhängigkeit).
create or replace function public.collab_prune_tick()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nur selten, damit normale Schreibvorgänge nicht ausgebremst werden.
  if random() < 0.02 then
    if tg_table_name = 'cad_object_ops' then
      perform public.prune_cad_object_ops(new.project_id);
    else
      perform public.prune_mappe_object_ops(new.project_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists cad_object_ops_prune on public.cad_object_ops;
create trigger cad_object_ops_prune
  after insert on public.cad_object_ops
  for each row execute function public.collab_prune_tick();

drop trigger if exists mappe_object_ops_prune on public.mappe_object_ops;
create trigger mappe_object_ops_prune
  after insert on public.mappe_object_ops
  for each row execute function public.collab_prune_tick();
