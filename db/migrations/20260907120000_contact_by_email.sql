-- Kontaktanfragen ausschließlich über die vollständige E-Mail-Adresse.
--
-- Die Suche läuft serverseitig: der Browser bekommt niemals ein
-- E-Mail-Verzeichnis, sondern nur genau den einen Treffer einer exakt
-- angegebenen Adresse (oder nichts). Der Anzeigename bleibt öffentlich.

create or replace function public.find_profile_by_email(email text)
returns table (id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         coalesce(nullif(trim(p.display_name), ''), '') as display_name,
         p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where auth.uid() is not null
    and u.id <> auth.uid()
    and length(trim(coalesce(email, ''))) > 3
    and lower(u.email) = lower(trim(email))
  limit 1;
$$;

revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;
