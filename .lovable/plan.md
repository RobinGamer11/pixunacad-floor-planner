# Plan: Bewegter Hintergrund auf der Hauptseite + echtes Benutzer-Netzwerk

## Bestandsaufnahme (geprüft)

- **Auth:** eigener, schlanker Fetch-Client `src/lib/supabase.ts` (nur Publishable Key, Session in local/sessionStorage). `AuthProvider` + `RequireAuth` funktionieren und bleiben unverändert.
- **Supabase:** eigenes, externes Projekt (`.env`). Kein Datenbankzugriff aus dieser Umgebung heraus — Migrationen kann ich **nicht selbst ausführen**. Ich lege sie als SQL-Datei im Repo ab; du führst sie einmalig im Supabase SQL-Editor aus.
- **Projekte:** rein lokal in `projectStore` (`pixuna.projects.v3`), gespiegelt über `workspaceSync` in `user_workspaces`. Projekte haben bereits stabile `id` — diese wird als gemeinsame Netzwerk-ID übernommen, **keine ID-Änderung, keine Migration bestehender Projekte**.
- **Netzwerk-Ansicht:** `SharedView` in `ProjectsHome.tsx` — Profil-Editor + leerer Kontakte-Platzhalter.
- **Hauptseite:** `hub === "home"` — nur Überschrift und „Inhalte folgen in Kürze".
- **Realtime:** der bestehende Fetch-Client kann kein Realtime. Ich ergänze `@supabase/supabase-js` **ausschließlich für die Netzwerkschicht** (eigener Client, `persistSession: false`, Token kommt aus der bestehenden Session). Die bestehende Auth-Logik wird nicht ersetzt.

## 1. Bewegter Hintergrund auf der Hauptseite

Die Canvas-Animation aus `Login.tsx` wird in eine wiederverwendbare Komponente `src/components/AuroraBackground.tsx` ausgelagert (identische Optik: Farbverlauf, Orbs, Grid, Partikel). `Login.tsx` nutzt danach diese Komponente (kein visueller Unterschied), und die Hauptseite (`hub === "home"`) bekommt denselben Hintergrund mit heller Textfarbe darüber.

## 2. Datenmodell (SQL-Migration, neu)

Neue Datei `supabase/migrations/<ts>_network.sql`, ausschließlich additiv:

| Tabelle | Inhalt |
| --- | --- |
| `profiles` | `id` (= `auth.users.id`), `display_name`, `avatar_url`, `role`, `updated_at`. Trigger legt Profil beim Signup an; Backfill für bestehende Nutzer. |
| `contacts` | `requester_id`, `addressee_id`, `status` (`pending`/`accepted`/`declined`), Unique-Paar, Check `requester_id <> addressee_id`. |
| `network_projects` | `id` (= lokale Projekt-ID), `owner_id`, `name`, `updated_at`. Wird beim Öffnen der Startseite aus dem lokalen Store hochgespiegelt (upsert). |
| `project_members` | `project_id`, `user_id`, `role` (`owner`/`member`), `added_by`. |
| `presence` | `user_id`, `status` (`online`/`away`/`busy`/`offline`), `last_seen_at`. |

`GRANT`s für `authenticated` (+ `service_role`) je Tabelle, danach RLS.

## 3. RLS (Kernpunkt)

- `profiles`: SELECT nur für sich selbst, bestätigte Kontakte, Kontaktanfrage-Gegenparteien und Mitglieder gemeinsamer Projekte — plus eine gezielte Suche über eine `security definer`-RPC `search_profiles(query)`, die ausschließlich `id`, `display_name`, `avatar_url` zurückgibt (keine E-Mail). UPDATE nur `auth.uid() = id`.
- `contacts`: SELECT/INSERT nur wenn `auth.uid()` Requester oder Adressat ist; INSERT erzwingt `requester_id = auth.uid()`; Annehmen/Ablehnen (UPDATE auf `status`) nur durch den Adressaten; Löschen durch beide Seiten.
- `network_projects`: schreiben nur der Owner (`owner_id = auth.uid()`), lesen Owner und Mitglieder.
- `project_members`: einfügen/entfernen nur der Projekt-Owner (über `security definer`-Funktion `is_project_owner`, damit keine Rekursion entsteht) — ein Nutzer kann sich **nicht selbst** in fremde Projekte eintragen. Lesen dürfen Owner und Mitglieder desselben Projekts.
- `presence`: INSERT/UPDATE nur `user_id = auth.uid()` (fremder Status nicht manipulierbar); lesen nur Kontakte und Projektkollegen.
- Kein `service_role`, kein Secret Key im Frontend.

## 4. Frontend

- `src/lib/networkClient.ts` — Supabase-JS-Client, der Access-Token/Refresh aus dem bestehenden `supabase`-Objekt übernimmt und bei Auth-Wechsel aktualisiert.
- `src/lib/networkStore.ts` — Hook-basierter Store: Profil, Kontakte, Anfragen, Projektmitglieder, Präsenz. Lädt initial, abonniert Realtime (`postgres_changes` auf `contacts`, `project_members`, `presence`), meldet eigene Präsenz (Heartbeat + `visibilitychange` + Abmeldung → `offline`), spiegelt lokale Projekte nach `network_projects`.
- `src/components/network/…` — neue Ansicht in `SharedView` mit drei Tabs:
  1. **Kontakte** — pro Projekt eine einklappbare Gruppe `Projektname (2/4)` mit Avatar, Name, Statuszeile, Statuspunkt und (noch inaktivem) Chat-Symbol; darunter Gruppe **Allgemein** für Kontakte ohne Projektzuordnung. Kompakte Liste im Stil der Referenz, aber mit den bestehenden PixunaCAD-Tokens.
  2. **Projekte / Teams** — Projekte mit Mitgliedern, Personen hinzufügen/entfernen. Datenstruktur (`project_id` + `user_id` als Paar) ist so gehalten, dass späteres Drag&Drop nur noch ein UI-Aufsatz ist.
  3. **Kontaktanfragen** — eingehende Anfragen mit Annehmen/Ablehnen, plus Suchfeld zum Finden registrierter Nutzer und Senden einer Anfrage.
- Der bestehende Profil-Editor bleibt, schreibt zusätzlich Anzeigename/Avatar/Status nach `profiles` bzw. `presence`.
- Status-Farben: grün online, gelb abwesend, rot beschäftigt, grau offline (Typ `ProfileStatus` wird um `away` erweitert, rückwärtskompatibel).

## Nicht Teil dieses Schritts
Chat-Funktion (nur Symbol), Live-CAD, gemeinsame Cursor, Migration des Projekt-Workspaces.

## Nach der Umsetzung
Typecheck + Tests + Build; Prüfung von Login, vorhandenen Projekten, Netzwerk-Tabs. Die SQL-Migration muss **du** einmalig im Supabase-SQL-Editor ausführen — vorher zeigt die Netzwerk-Ansicht einen deutlichen Hinweis statt Fehlermeldungen. Danach Commit; Push auf GitHub `main` gebe ich dir als PowerShell-Befehl mit.
