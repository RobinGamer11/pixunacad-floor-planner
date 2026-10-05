# Umsetzungspaket 1 – Projektzugriff, Netzwerk/Team, Beiträge

## Aktuelle Korrekturen
- [x] Projekt-bearbeiten-Inhalt ausschließlich zwischen fester Kopf- und Fußzeile scrollen
- [x] Sichtbare CAD-Transparentpausen vollständig als schreibgeschützte Fang- und Hilfslinienquelle nutzen

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

## CAD-Oberfläche: einheitliche Desktop-Dichte
- [x] Kompakte Kopfzeile sowie kompakte Werkzeug- und Einstellungsleisten ab 1024 px.
- [x] Keine globale Skalierung; CAD-Canvas, Weltmaßstab und Eingabekoordinaten bleiben unverändert.
- [x] Tablet- und Handy-Dichte unterhalb 1024 px bleibt unverändert.

## Ein Speicherweg pro Projekt (zentrale Synchronisierungsrichtlinie)
- `src/lib/projectSync.ts` entscheidet allein: lokal / manuell sichern / Bereitschaft / live.
- `src/lib/cloudBaseline.ts` merkt den zuletzt bestätigten Cloud-Stand (nur Prüfsummen).
- CAD und Projektmappe melden sich als Quellen an und sichern objektweise.
- Entfernt: automatischer Projekt-Upload (`scheduleSharedSave`) und `saveProjectDocument`.
- Persönliche Einstellungen bleiben getrennt (`workspaceSync.tsx`).

## Grundfunktionen-Matrix (Undo/Redo, Kopieren/Einfügen, Pipette)

| Objektart | Undo/Redo | Kopieren/Einfügen | Mehrfach-Einfügen | Pipette |
| --- | --- | --- | --- | --- |
| Linie / Bogen / Rechteck | ja | ja | ja | ja (Farbe, Stärke, Linienart, Transparenz, Effekte) |
| Polygon | ja | ja | ja | ja (wie Schraffur/Kontur) |
| Wand | ja | ja (inkl. Türen/Fenster der Wand) | ja | ja (Farbe, Füllung, Muster) |
| Tür / Fenster | ja | ja (folgt der kopierten Wand) | ja | – (keine freien Stileigenschaften) |
| Schraffur inkl. Muster | ja | ja | ja | ja (vollständige Musterübertragung) |
| Freihand / Stift | ja | ja | ja | ja |
| Text | ja | ja | ja | ja (Textformat, nie Inhalt) |
| Maß / Maßkette | ja | ja | ja | ja (Maßketten-Stil) |
| Tabelle | ja | ja (Inhalt + Maßstab, neue ID) | ja | ja (nur Darstellungsstil, nie Zellen) |
| Dokument (PDF/Bild) | ja | ja (inkl. Darstellungseinstellungen) | ja | ja (Transparenz, Filter, Freistellen) |
| Bibliotheksobjekt | ja | ja (Instanz mit Einfügepunkt, Drehung, Skalierung) | ja | – (keine freien Stileigenschaften) |
| Projektmappen-Elemente | ja | ja | ja | ja (über die eingebettete Zeichenfläche) |

Regeln: Vorschau/Hover erzeugt keinen Undo-Schritt; jede bestätigte Aktion genau
einen; Abbruch einer schwebenden Kopie entfernt alle Kopien ohne Historienrest.
Die Pipette überträgt nie Geometrie, Position, Größe, Drehung, Inhalt oder IDs
und meldet bei nicht zueinander passenden Objektarten einen kurzen Hinweis.

- [x] Kontoübergreifende Projektspeicherung inkl. cloud/shared-Trennung, Mappen-CAD-Ausschnitte aus Cloud, cloudweiter Papierkorb (offen: SQL-Migrationen, Abnahme auf zwei echten Geräten)

- [ ] Export-Bereich auf CAD-Plan-Engine (Plan mit Präzisierungen, wartet auf Freigabe)
- [ ] Export: Undo erfasst alle Exportseiten/Ordner/Overlays über Seiten- und Moduswechsel hinweg
- [ ] Export: Transparenzpause cloudfähig, Bearbeitungsregel, Freischaltung erst nach Cloud-Commit, docs/export-architecture.md

## Export – Stand
- [x] Seiten/Ordner-Baum, Drag&Drop, Exportauswahl, PDF inkl. Anmerkungen, Seiteneinstellungen, Transparenzpause, verknüpfte Ausschnitte
- [x] Cloud-Objektsync für Exportstrukturen (simulierter Zwei-Geräte-Test)
- [ ] Echter Zwei-Geräte-Test (Nutzer), danach Reiter freischalten
- [x] contentRevision für direkte Scene-Mutationen/Ebenensichtbarkeit
- [ ] Browser-Abnahme mit Anmeldung
- [x] Export: Seiteneinstellungen im Mappen-Stil, Lochungsmuster, echter Seitenverbund (spreadLayouts cloudfähig), letzte Seite geschützt, CAD-Startansicht
- [ ] Browser-/Tablet-Abnahme Verbund-Ziehen und Verbund-PDF (Nutzer)
- [x] Export: nur aktive Seite verschiebbar, flüchtiger Modus „Seitenanordnung bearbeiten“, blaue Eckpunkte, symbolischer Ausschnitt-Hub, Cursor-Reset, Transparenzpause als schreibgeschützte Fangquelle

## CAD-Bedienung Tablet – Stand
- [x] Maßkette verschieben als Transform-Sitzung: Symbol = scharfstellen, erster Kontakt greift nur (kein Sprung), Vorschau rein visuell (`Renderer.dimensionMovePreview`), Speichern nur per „✓ Fixieren“/Enter mit genau einem Undo-Schritt, Esc/Abbrechen stellt die Ausgangslage her, Finger anheben bestätigt nie
- [x] „Hintergrund entfernen“ vollständig entfernt (Funktion, Renderer-Masken, Speicherung); alte Felder werden beim Laden verworfen
- [x] Bildbearbeitung auf dem Tablet wieder vertikal scrollbar (keine pauschalen Stop-Propagation-Handler im Filterbereich)
- [ ] Abnahme auf echtem Tablet (Nutzer)

## Alte Projektmappe entfernt – Stand
- [x] Mappe-Reiter, Bildschirm, Zwischenablage, Cloud-Pfade, Seiten-/Vorlagenlogik und Altdateien entfernt; `/project/:id` leitet auf CAD weiter
- [x] Versionierte Bereinigung alter Mappenfelder (lokal + Cloud), Hilfe-Schalter neutral als `helpOn`
- [x] Projektübersicht zählt CAD-Blätter; CAD-Druckpläne und Export unverändert
- [ ] Abnahme im Browser mit Anmeldung (Nutzer)

## Alte CAD-Druckplan-Bedienung entfernt – Stand
- [x] PlanPanel, Häkchen-Auswahl, „PDF drucken“, alter Exportieren-Knopf entfernt; Exportseiten/Plan-Szenen/Ausschnitte unverändert
- [ ] Abnahme im Browser mit echtem Projekt (Nutzer)

## Treppe (Stufe A: gerade + Podest)
- [x] stairGeometry (treadCount/riserCount getrennt, Podest-Regeln, Grenzverschiebung, eindeutige Fangpunkte) + Tests
- [x] Stair in Scene/Serde/Klon/Cloud-Diff
- [x] Renderer, Fangpunkte, Auswahl/Verschieben
- [x] StairTool (Vorschau → Häkchen/Enter, Bezug an erster Stufe) + Einstellungspanel
- [x] Gewendelte Stufen je Knick direkt im Einstellungsfenster wählbar; Rundtreppe weiterhin nicht verfügbar
- [ ] Echte Abnahme im Browser/Tablet (Platzierung, Griffe, Export-PDF)

## Gesamtkorrektur Export-Ausschnitte / Treppe (03.10.)
- [x] A: Ausschnitt verschieben/drehen/Kanten als Vorschau-Sitzung (armed → greifen → Vorschau; nur ✓/Enter speichert, Escape verwirft, ein Undo)
- [x] B1–B3: Eckpodest = Laufbreite × Laufbreite, kein Aufblasen, Restlänge als Warnung, Podesttiefe je Knick (`landingDepthsM`)
- [x] B4: Bezug A/B statt L/R
- [x] B5: Geschosshöhe/Steigungen/Lauflänge/Restlänge live beim Platzieren
- [x] C: Treppenbearbeitung über normales Punktmenü (3 Fangpunkte je Kante, Kante bewegen, ganze Treppe verschieben/drehen), Werte rechts editierbar
- [x] D: Rechtsklick-Hilfslinien und Shift in allen Treppenschritten; alle Treppenkanten als Fangquellen
- [x] E: Unit-Tests (Kanten, Podest einzeln, Zahl = Griff, Verschieben/Drehen, parallele Hilfslinie)
- [ ] E: Browser-/Tablet-Abnahme und Zwei-Geräte-Test – Vorschau verlangt Anmeldung, im Sandkasten keine Sitzung verfügbar

## Treppe – Einstellungen und Laufrichtung
- [x] Gewendelt/Podest-Wahl unter „Gewendelte Stufen“ mit Anzahl und Mindestauftritt; Geschosshöhe direkt unter Schrittmaßregel
- [x] Warnung je Zustand einmal oben; Schritt 02 fängt den Gegenpunkt der Startkante bei Maus, Finger und Stift
- [ ] Platzierung und Einstellungen auf echtem Tablet abnehmen (Nutzer)
- [x] Gemeinsamer Aktionsablauf: `CadApp.runAction` (1 Undo, Fehler = vollständige Rücknahme); Freihand, Linie, Polygon, Schraffur, Füllen, Wand, Text-Rastern angebunden; hängende Druckzustände (Hilfsrad, Fokusverlust, Capture) behoben
- [ ] Punkt 2 Rest: 250-ms-Fallback-Snapshot ablösen (große Rasterstände), Gerätetests
- [ ] Punkt 3 Tablet/Handy (Kopfzeilen-Geste), Punkt 4 Pixelmodus-Speicher, Punkt 5 PDF-Auflösung (Referenz-PDF fehlt)
