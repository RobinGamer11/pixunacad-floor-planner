# Kontoübergreifende Projektspeicherung (PC / Tablet / Handy)

Stand geprüft: lokal = `origin/main` (`add66714`).

## Ziel
Derselbe Benutzer sieht auf allen Geräten denselben gespeicherten CAD- und Mappenstand. Einzelarbeit bleibt ressourcenschonend (kein Realtime), Teammodus bleibt unverändert.

## Schritte

1. **Automatische Registrierung**
   - Beim Erstellen eines Projekts in `ProjectsHome` (bzw. `projectStore.createProject`) sofort `ensureSharedProject(id, name)` aufrufen.
   - Beim Öffnen von CAD/Mappe ebenfalls aufrufen (idempotent, gecached).
   - Bestehende Besitzer werden nie überschrieben.

2. **Persönliche Cloudbasis statt „nur geteilt“**
   - `projectAccess` erhält neben `shared` ein Merkmal `cloud` (Projekt existiert in `network_projects` und ich habe eine Rolle).
   - Objektweises Sichern (`projectSync`, cadCollab/mappeCollab `opsRepo`) wird für alle `cloud`-Projekte erlaubt, nicht nur für geteilte.
   - Realtime/Präsenz/Sperren starten weiterhin erst ab einer weiteren *Person* – der Solo-Pfad nutzt nur einmalige Abfragen.

3. **Einmalmigration bestehender lokaler Projekte**
   - Für lokale Projekte ohne Cloudstand: Hinweis „Nur auf diesem Gerät“ + Button „Diesen Gerätestand in die Cloud übernehmen“.
   - Existiert bereits ein Cloudstand und lokal abweichender Inhalt: Dialog mit Gegenüberstellung (Stand, letzte Änderung, Anzahl Objekte) → „Cloudstand laden“ oder „Gerätestand als Hauptstand übernehmen“. Keine automatische Vermischung.
   - Danach Cloudstand = verbindliche Quelle (Markierung pro Projekt lokal gespeichert).

4. **Laden beim Öffnen / Zurückkehren**
   - Beim Projektöffnen und bei `visibilitychange`/`focus`: Cloud-Revision abfragen (leichtgewichtig).
   - Keine ungesicherten lokalen Änderungen → Cloudstand objektweise übernehmen.
   - Ungesicherte Änderungen → Status „Aktualisierung verfügbar“, Entscheidung durch den Benutzer.
   - Zusätzlicher Button „Aus Cloud aktualisieren“ neben „In Cloud sichern“.

5. **Status-Anzeige** im Kopfbereich:
   „Nur auf diesem Gerät“ · „Ungesicherte Änderungen“ · „In Cloud gesichert“ · „Aktualisierung verfügbar“ · „Live im Team“.

6. **Gleiches Konto auf mehreren Geräten**
   - Erkennung über Revisionsvergleich (kein Realtime nötig). Präsenzzählung zählt weiterhin nur andere Personen für den Teammodus.

## Unverändert
- Zeichenlogik, Renderer, Werkzeuge.
- `user_workspaces` bleibt reine Einstellungs-Sicherung (keine Gesamtsnapshots).
- RLS bleibt aktiv; nur eigene Projekte/Freigaben sichtbar.

## Technische Details
- Betroffen: `projectStore.ts`, `projectRegistration.ts`, `projectAccess.ts`, `projectAccessProvider.tsx`, `projectSync.ts`, `sharedProjectSync.ts`, `cadCollab/session.ts`, `mappeCollab/session.ts`, `ProjectsHome.tsx`, `CadPage.tsx`, `ProjectWorkspace.tsx`, `WorkspaceHeader.tsx`.
- Neue Datei `src/lib/cloudProjectState.ts` (Status + Revisionsabfrage + Migrationsentscheidung).
- Voraussetzung: Migrationen `20260916150000_collab_revisions.sql` und `20260916170000_collab_ops_prune.sql` müssen im SQL-Editor ausgeführt sein; ggf. kleine Zusatz-Migration für eine RPC „letzte Revision pro Projekt“.
- Tests: Unit-Tests für Statusermittlung und Migrationsentscheidung; Typprüfung, Build.
