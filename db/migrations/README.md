# SQL-Skripte für den Supabase-SQL-Editor

Alle Dateien sind additiv und wiederholbar (idempotent). Bestehende
`user_workspaces`-Daten und fremde Trigger auf `auth.users` bleiben unberührt.

## Reihenfolge (unbedingt einhalten)

1. `20260821140000_network.sql` – Profile, Kontakte, Netzwerk-Projekte, Mitglieder, Präsenz
2. `20260821160000_chat.sql` – Unterhaltungen, Mitglieder, Nachrichten
3. `20260831093000_project_access.sql` – Rollen, Rechte, geteilte Projektdokumente
4. `20260901090000_time_devices_attachments.sql` – Zeiten, Abwesenheiten, Geräte, Anhänge
5. `20260902090000_comments.sql` – Kommentare in CAD/Projektmappe

Jede Datei komplett in den SQL-Editor kopieren und einzeln ausführen. `NOTICE …
skipping` bei Wiederholungen ist erwartet.

## Korrekturen in dieser Fassung

- **Chat-Erstanlage:** `on conflict (direct_key) where direct_key is not null`
  bzw. `on conflict (project_id) where project_id is not null` – passend zu den
  partiellen Unique-Indizes.
- **Chat-Mitgliedschaften:** Änderbar ist nur `last_read_at`
  (Spaltenrecht + `conversation_members_guard`); `conversation_id`, `user_id`
  und `role` sind unveränderlich.
- **Geräte:** Löschschutz bezieht sich eindeutig auf `public.devices.id`;
  Geräte mit Buchungen lassen sich nicht löschen, Historie bleibt erhalten.
- **Wiederholbarkeit:** `project_members_delete_manager_or_self` wird vor dem
  Anlegen entfernt; ungültige Altrollen werden **vor** dem Constraint bereinigt
  und der Ursprungswert in `permissions.legacy_role` gesichert.
- **Kontakte:** Neue Anfragen sind zwingend `pending`; Beteiligte sind
  unveränderlich; bestätigen darf nur der Empfänger.

## Geprüft

Lokal gegen PostgreSQL 17 mit synthetischen Daten: Erstinstallation, zweiter
Durchlauf, Erstanlage von Direkt- und Projektchat, Rechteverstöße (alle
abgewiesen), Geräte-Löschschutz, Erhalt von `user_workspaces` und fremdem
Auth-Trigger.
