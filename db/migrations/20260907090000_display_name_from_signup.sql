-- Kontoname aus der Registrierung übernehmen.
--
-- Bisher hat der Trigger `handle_new_user` immer den vorderen Teil der
-- E-Mail-Adresse als Anzeigename gesetzt. Ab jetzt wird der bei der
-- Registrierung eingegebene Benutzername aus den Benutzer-Metadaten
-- verwendet; ohne Angabe bleibt es beim bisherigen Verhalten.
--
-- Additiv und wiederholbar. Bestehende, selbst vergebene Namen werden NICHT
-- überschrieben.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text;
begin
  wanted := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    ''
  )), '');

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(wanted, split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nachtrag für bereits registrierte Konten, deren Profilname noch leer ist
-- oder unverändert dem E-Mail-Präfix entspricht.
update public.profiles p
set display_name = btrim(coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name'
    )),
    updated_at = now()
from auth.users u
where u.id = p.id
  and nullif(btrim(coalesce(
        u.raw_user_meta_data ->> 'display_name',
        u.raw_user_meta_data ->> 'full_name',
        ''
      )), '') is not null
  and (
    btrim(coalesce(p.display_name, '')) = ''
    or btrim(p.display_name) = split_part(u.email, '@', 1)
  );
