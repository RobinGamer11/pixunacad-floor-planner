-- =====================================================================
-- PixunaCAD – Projekteinladungen (additiv)
--
-- Einladungen liegen serverseitig in derselben Datenbasis wie Netzwerk und
-- Projektfreigabe. Es entsteht keine zweite, rein lokale Teamliste.
-- Einmalig im SQL-Editor des eigenen Supabase-Projekts ausführen.
-- =====================================================================

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.network_projects(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, invitee_id)
);

create index if not exists project_invitations_invitee_idx on public.project_invitations(invitee_id);

grant select, insert, update, delete on public.project_invitations to authenticated;
grant all on public.project_invitations to service_role;

alter table public.project_invitations enable row level security;

do $$ begin
  create policy "project_invitations_select_related" on public.project_invitations
    for select to authenticated
    using (invitee_id = auth.uid()
           or public.project_role_of(project_id, auth.uid()) is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "project_invitations_insert_manager" on public.project_invitations
    for insert to authenticated
    with check (public.project_can_manage_members(project_id, auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "project_invitations_update_manager_or_invitee" on public.project_invitations
    for update to authenticated
    using (invitee_id = auth.uid() or public.project_can_manage_members(project_id, auth.uid()))
    with check (invitee_id = auth.uid() or public.project_can_manage_members(project_id, auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "project_invitations_delete_manager_or_invitee" on public.project_invitations
    for delete to authenticated
    using (invitee_id = auth.uid() or public.project_can_manage_members(project_id, auth.uid()));
exception when duplicate_object then null; end $$;

-- Annahme einer Einladung: erzeugt die Mitgliedschaft mit dem vorgesehenen
-- Rang und den vorgesehenen Einzelberechtigungen. Ownership bleibt unberührt.
create or replace function public.accept_project_invitation(_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare inv public.project_invitations;
begin
  select * into inv from public.project_invitations
   where id = _invitation_id and invitee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Einladung nicht gefunden oder nicht offen.';
  end if;

  insert into public.project_members (project_id, user_id, role, permissions, added_by)
  values (inv.project_id, inv.invitee_id, inv.role, inv.permissions, inv.created_by)
  on conflict (project_id, user_id)
  do update set role = excluded.role, permissions = excluded.permissions, updated_at = now();

  update public.project_invitations
     set status = 'accepted', updated_at = now()
   where id = inv.id;
end;
$$;

revoke all on function public.accept_project_invitation(uuid) from public;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
