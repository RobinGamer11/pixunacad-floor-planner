-- Startseiten-Inhalte (Projektangaben, Übersicht, Aufgaben/Termine, Finanzen,
-- Dokumentenstruktur) revisionsgeschützt und kontogetrennt in der Cloud.
-- Bestehende CAD-Daten (`cad_object_state`, `cad_object_ops`) bleiben unberührt.

create table if not exists public.project_home_state (
  project_id text primary key references public.network_projects(id) on delete cascade,
  revision bigint not null default 1,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.project_home_state enable row level security;

drop policy if exists "project_home_state_select" on public.project_home_state;
create policy "project_home_state_select"
  on public.project_home_state
  for select
  to authenticated
  using (public.project_can_read(project_id));

drop policy if exists "project_home_state_insert" on public.project_home_state;
create policy "project_home_state_insert"
  on public.project_home_state
  for insert
  to authenticated
  with check (public.project_can_edit(project_id));

drop policy if exists "project_home_state_update" on public.project_home_state;
create policy "project_home_state_update"
  on public.project_home_state
  for update
  to authenticated
  using (public.project_can_edit(project_id))
  with check (public.project_can_edit(project_id));

grant select, insert, update on public.project_home_state to authenticated;

create or replace function public.save_project_home_state(
  _project_id text,
  _payload jsonb,
  _base_revision bigint
)
returns table (
  accepted boolean,
  revision bigint,
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.project_home_state%rowtype;
  v_next bigint;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.project_can_edit(_project_id) then
    raise exception 'PIXUNA_FORBIDDEN: Keine Schreibberechtigung für dieses Projekt.';
  end if;

  select * into v_existing
  from public.project_home_state
  where project_id = _project_id
  for update;

  if not found then
    if _base_revision <> 0 then
      return query select false, 0::bigint, '{}'::jsonb, v_now;
      return;
    end if;
    insert into public.project_home_state (project_id, revision, payload, updated_at, updated_by)
    values (_project_id, 1, coalesce(_payload, '{}'::jsonb), v_now, auth.uid())
    returning project_home_state.revision, project_home_state.payload, project_home_state.updated_at
    into v_next, payload, updated_at;
    return query select true, v_next, payload, updated_at;
    return;
  end if;

  if v_existing.revision <> _base_revision then
    return query select false, v_existing.revision, v_existing.payload, v_existing.updated_at;
    return;
  end if;

  v_next := v_existing.revision + 1;
  update public.project_home_state
  set revision = v_next,
      payload = coalesce(_payload, '{}'::jsonb),
      updated_at = v_now,
      updated_by = auth.uid()
  where project_id = _project_id;

  return query select true, v_next, coalesce(_payload, '{}'::jsonb), v_now;
end;
$$;

revoke all on function public.save_project_home_state(text, jsonb, bigint) from public;
grant execute on function public.save_project_home_state(text, jsonb, bigint) to authenticated;