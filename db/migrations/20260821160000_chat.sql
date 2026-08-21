-- =====================================================================
-- PixunaCAD – Chat (Direktchat + Projektchat)
--
-- Baut auf 20260821140000_network.sql auf (profiles, contacts,
-- network_projects, project_members, presence). Erst NACH dieser Datei
-- ausführen. Rein additiv.
-- =====================================================================

-- ------------------------------------------------------- Unterhaltungen
do $$ begin
  create type public.conversation_type as enum ('direct', 'project');
exception when duplicate_object then null; end $$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null,
  -- Projektchat: stabile lokale Projekt-ID; Direktchat: null
  project_id text references public.network_projects(id) on delete cascade,
  -- Direktchat: sortiertes Benutzerpaar "kleinere_uuid|groessere_uuid"
  direct_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_shape check (
    (type = 'direct' and project_id is null and direct_key is not null)
    or (type = 'project' and project_id is not null and direct_key is null)
  )
);

-- Genau eine logische Unterhaltung je Benutzerpaar bzw. je Projekt.
create unique index if not exists conversations_direct_key_uidx
  on public.conversations(direct_key) where direct_key is not null;
create unique index if not exists conversations_project_uidx
  on public.conversations(project_id) where project_id is not null;

grant select on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz not null default 'epoch',
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members(user_id);

grant select, insert, update on public.conversation_members to authenticated;
grant all on public.conversation_members to service_role;
alter table public.conversation_members enable row level security;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_len check (length(body) between 1 and 4000)
);

create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

-- ============================================== Hilfsfunktionen (definer)

create or replace function public.can_access_conversation(_conversation_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.type = 'project' then public.is_project_member(c.project_id, _user_id)
      else exists (
        select 1 from public.conversation_members m
        where m.conversation_id = c.id and m.user_id = _user_id
      )
    end
    from public.conversations c
    where c.id = _conversation_id
  ), false);
$$;

-- Direktchat öffnen bzw. bestehende Unterhaltung wiederverwenden.
create or replace function public.start_direct_conversation(_other_user uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
begin
  if me is null or _other_user is null or me = _other_user then
    raise exception 'Ungültige Unterhaltung.';
  end if;
  if not public.are_contacts(me, _other_user) and not public.shares_project(me, _other_user) then
    raise exception 'Direktchat nur mit bestätigten Kontakten oder Projektkollegen möglich.';
  end if;

  key := case when me < _other_user then me::text || '|' || _other_user::text
              else _other_user::text || '|' || me::text end;

  select id into conv from public.conversations where direct_key = key;
  if conv is null then
    insert into public.conversations (type, direct_key, created_by)
    values ('direct', key, me)
    on conflict (direct_key) do nothing
    returning id into conv;
    if conv is null then
      select id into conv from public.conversations where direct_key = key;
    end if;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me), (conv, _other_user)
  on conflict do nothing;

  return conv;
end;
$$;

-- Projektchat öffnen bzw. anlegen – nur für aktuelle Projektmitglieder.
create or replace function public.ensure_project_conversation(_project_id text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null or not public.is_project_member(_project_id, me) then
    raise exception 'Kein Zugriff auf diesen Projektchat.';
  end if;

  select id into conv from public.conversations where project_id = _project_id;
  if conv is null then
    insert into public.conversations (type, project_id, created_by)
    values ('project', _project_id, me)
    on conflict (project_id) do nothing
    returning id into conv;
    if conv is null then
      select id into conv from public.conversations where project_id = _project_id;
    end if;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me)
  on conflict do nothing;

  return conv;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public;
revoke all on function public.ensure_project_conversation(text) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.ensure_project_conversation(text) to authenticated;

-- Zeitstempel der Unterhaltung bei neuer Nachricht aktualisieren.
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- =============================================================== Policies

-- Unterhaltungen: lesen nur Beteiligte (Direkt) bzw. Projektmitglieder.
drop policy if exists "conversations_select_participants" on public.conversations;
create policy "conversations_select_participants" on public.conversations
  for select to authenticated
  using (public.can_access_conversation(id, auth.uid()));

-- Anlegen ausschließlich über die geprüften SECURITY-DEFINER-Funktionen.

-- Mitglieder einer Unterhaltung
drop policy if exists "conversation_members_select" on public.conversation_members;
create policy "conversation_members_select" on public.conversation_members
  for select to authenticated
  using (public.can_access_conversation(conversation_id, auth.uid()));

-- Nur die eigene Zeile, und nur wenn Zugriff auf die Unterhaltung besteht
-- (z. B. Lesestand in einem Projektchat).
drop policy if exists "conversation_members_insert_self" on public.conversation_members;
create policy "conversation_members_insert_self" on public.conversation_members
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_conversation(conversation_id, auth.uid()));

drop policy if exists "conversation_members_update_self" on public.conversation_members;
create policy "conversation_members_update_self" on public.conversation_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nachrichten
drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants" on public.messages
  for select to authenticated
  using (public.can_access_conversation(conversation_id, auth.uid()));

-- Nachrichten immer mit eigener sender_id und nur in erlaubten Unterhaltungen.
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id, auth.uid()));

-- ================================================================ Realtime
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; end $$;
