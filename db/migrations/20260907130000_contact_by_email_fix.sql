-- Kontaktsuche über die vollständige E-Mail-Adresse – Namenskonflikt behoben.
--
-- Vorher hieß der Parameter `email` und kollidierte mit der Spalte
-- `auth.users.email`. In `lower(u.email) = lower(trim(email))` konnte damit
-- beidseitig die Tabellenspalte gemeint sein; die Bedingung war praktisch
-- immer wahr und es konnte ein fremdes, falsches Konto zurückkommen.
--
-- Jetzt heißt der Parameter eindeutig `p_email`. Es wird ausschließlich exakt
-- gegen die vollständige Adresse verglichen. Eigene Adresse, Teiltreffer und
-- „irgendein erster Benutzer“ sind ausgeschlossen.

-- Parametername lässt sich nicht per CREATE OR REPLACE ändern → vorher entfernen.
drop function if exists public.find_profile_by_email(text);

create function public.find_profile_by_email(p_email text)
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
    and position('@' in trim(coalesce(p_email, ''))) > 1
    and lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;
