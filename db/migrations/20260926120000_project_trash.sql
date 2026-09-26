-- Cloudweiter Papierkorb für Projekte.
--
-- Ein Projekt, das auf einem Gerät gelöscht wird, landet auf allen Geräten
-- desselben Kontos (und bei allen Mitgliedern) im Papierkorb. Die Inhalte
-- bleiben erhalten; erst „Endgültig löschen“ entfernt die Projektzeile
-- (Inhalte folgen per bestehender `on delete cascade`).
--
-- Rechte bleiben unverändert: `deleted_at` setzen/leeren dürfen Besitzer und
-- Admins (bestehende Update-Regel), endgültig löschen nur der Besitzer
-- (bestehende Delete-Regel). RLS bleibt aktiv.
--
-- Additiv und wiederholbar ausführbar.

alter table public.network_projects
  add column if not exists deleted_at timestamptz;

create index if not exists network_projects_deleted_idx
  on public.network_projects (deleted_at)
  where deleted_at is not null;
