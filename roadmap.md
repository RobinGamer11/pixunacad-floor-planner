# Umsetzungspaket 1 – Projektzugriff, Netzwerk/Team, Beiträge

## Bibliothek – Bedienungsdetails
- [x] Primär- und Sekundäraktionen klar hervorheben
- [x] Drei-Punkte-Menüs ohne Abschneiden und mit automatischer Öffnungsrichtung anzeigen
- [x] Automatische Sektion „Hilfe & Kurzbefehle“ aus CAD und Projektmappe entfernen
- [x] Einmal-Platzierung und Fangpunkt-Transformationen stabilisieren

## Aktuelle Oberflächenanpassung
- [x] Mehr Abstand zwischen Reiterkopf und Inhalt
- [x] Organisations-Ansichtsauswahl direkt über der gewählten Ansicht
- [x] Dokumente-Reiter als klare Dokumentenliste mit Suche und vorhandenen Aktionen

## Schritt 1 – Gemeinsamer Projektzugriff und Rollen
- [x] Migration `db/migrations/20260831093000_project_access.sql` (Rollen, Overrides, `project_documents`, RLS, Guard-Trigger, RPC `save_project_document`)
- [x] Client-Rechte-Layer `src/lib/projectAccess.ts` (+ Hooks)
- [x] Zentraler Schreibschutz im `projectStore` (`setWriteGuard`, `onWriteBlocked`, `applySharedProject`)
- [x] Gemeinsame Projektdaten `src/lib/projectDocuments.ts` + `src/lib/sharedProjectSync.ts` (Versions-Konflikterkennung)
- [x] Geteilte Projekte aus persönlicher Workspace-Sicherung ausgenommen
- [ ] Migration im Supabase-Projekt einspielen (manuell durch den Nutzer)
- [ ] Read-only-Kennzeichnung in CAD/Mappe/Finanzen-Oberflächen (Buttons deaktivieren)

## Schritt 2 – Netzwerk und Projekt-Team
- [ ] Netzwerk-Reiter: Projekte/Teams + Kontakte, Ownership-Anzeige
- [ ] Team-Reiter je Projekt: Avatar, Rolle, Abweichungen, offene Beiträge
- [ ] Mitgliederverwaltung (nur Berechtigte), Rollenwechsel, Entfernen

## Schritt 3 – Einheitliche Beiträge
- [ ] Datenmodell „Beitrag“ (Name, Beschreibung, Status, Kategorie, Priorität, Verantwortliche[], Start/Ende)
- [ ] „+ Beitrag“ ersetzt Aufgabe/Termin/Notiz, Migration der Altdaten (IDs erhalten)
- [ ] Projektzeitraum prominent am Projekt
- [ ] Kalender, Ansichtstrahl, Projektnetz auf gemeinsame Beiträge umstellen
- [ ] Responsive Team-/Beitrags-UI (Desktop/Tablet/Smartphone)

# Umsetzungspaket 2 – Zeiterfassung, Geräte, Anhänge, Übersichten

## Schritt 4 – Zeiterfassung und Abwesenheiten
- [x] Migration `db/migrations/20260901090000_time_devices_attachments.sql` (`time_entries`, `absences`, RLS, maskierte RPC `absences_for_projects`)
- [x] Datenschicht `src/lib/opsStore.ts` (Netto-Zeiten, Auswertung je Beitrag/Person)
- [x] Zeiterfassung im Beitrags-Editor (`ContributionTimePanel`, Soll/Ist)
- [x] Eigene Abwesenheiten im Netzwerk-Reiter „Kalender“
- [ ] Migration im Supabase-Projekt einspielen (manuell durch den Nutzer)

## Schritt 5 – Geräte/Werkzeuge und Beitragsanhänge
- [x] Tabellen `devices`, `device_bookings`, `contribution_attachments` + privater Storage-Bucket
- [x] Gerätebuchung am Beitrag inkl. Konfliktwarnung und begründeter Übersteuerung
- [x] Geräteverwaltung im Netzwerk-Reiter „Geräte“ (Archivieren statt Löschen)
- [x] Anhänge am Beitrag (Upload, Öffnen, Zuordnung entfernen ohne Datenverlust)

## Schritt 6 – Gemeinsame Kalender und Übersichten
- [x] Board-Kalender mit Ebenen „Abwesenheiten“ und „Geräte“
- [x] Projektübergreifender Kalender im Netzwerk
- [x] Zeit-Auswertung je Projekt/Person in der Team-Ansicht

## Bibliothek: 2-Punkt-Skalierung
- Fangpunkt-Menü kennt zusätzlich "2-Punkt skalieren" (SCALE_2PT).
- Angeklickter Fangpunkt ist Fixpunkt, gegenüberliegender Punkt wird bewegt/gefangen.
- Kontextanzeige an der Zeichnung (Länge + Faktor), Hub-Eingabe möglich.
- Escape stellt Position und Skalierung wieder her, Bestätigen = ein Undo-Schritt.

## CAD: Stempel entfernt, Raster 85 % Transparenz, objektbasierte Live-Zusammenarbeit
- Stempel-Werkzeug vollständig entfernt (Werkzeug, Panel, Auswahl, Renderer, Serialisierung); alte Stempel-Daten werden beim Laden ignoriert, das Altfeld `_stickerEditOwnerId` bleibt aus Kompatibilitätsgründen erhalten.
- Raster startet mit 85 % Transparenz (Deckkraft 0.15).
- Neue Kollaborationsschicht `src/lib/cadCollab/*`: Änderungserkennung je Objekt aus dem bestehenden Serialisierungsstand, Einzeloperationen in `cad_object_ops`, weiche Sperren in `cad_object_locks` (RLS über bestehende Projektmitgliedschaft), Realtime-Vorschau und Präsenz nur flüchtig. Fremde Änderungen erzeugen keinen eigenen Verlaufsschritt (`markExternalChange`). Der gemeinsame Projektstand bleibt Initialstand und Sicherheitskopie.

## Live-Zusammenarbeit (CAD + Projektmappe)
- Serverseitige Revisionen: `cad_object_state` / `mappe_object_state` mit
  `cad_write_object` / `mappe_write_object` (Migration
  `db/migrations/20260916150000_collab_revisions.sql` – im SQL-Editor ausführen).
- CAD: Live-Vorschau während Gesten, weiche Sperren an Auswahl/Werkzeugwechsel,
  Präsenz je Blatt inkl. Zeiger, Bibliotheksdefinitionen und Ordner mitsynchron.
- Projektmappe: eigene Schicht `src/lib/mappeCollab/*` (Seiten und Elemente
  einzeln), Vorschau beim Verschieben, Sperrhinweis, Präsenz je Seite,
  Text-/Tabelleneingaben werden bei Konflikt nicht still überschrieben.
- Gesamtstand (`project_documents`) bleibt nur Erststand und Sicherheitskopie.
- Offen: Abnahme mit zwei Browser-Sitzungen, Übertragung nach GitHub main.
