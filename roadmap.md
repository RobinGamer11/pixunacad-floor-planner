# Umsetzungspaket 1 – Projektzugriff, Netzwerk/Team, Beiträge

## Option B – Manuell bewegen und Vercel, 25.10.2026
- [x] 3D-Ansichtswechsel: r169-Absturz reproduziert; Helper-Freigabe korrigiert; 15 Tests und Browser-Unmount ohne Fehler geprüft
- [x] Gemeinsame flüchtige 3D-Auswahl und Transformationssitzung mit Weltachsen, Zahlenfeldern, Übernehmen/Verwerfen
- [x] Originalobjekte, räumliche Orientierung, Wandöffnungen, Serialisierung und gemeinsames Undo/Redo anbinden
- [x] 91 Tests; getrennte Browserprüfung: Zahlen, ungültige Eingabe, Höhenpfeil ziehen, Auswahl/Gruppe, Verwerfen, Undo/Redo
- [ ] Angemeldete Abnahme, echtes Tablet und neue GLB-Exportabnahme – keine verfügbare Sitzung bzw. kein Tablet
- [x] npm-Lockdatei regulär mit unveränderten Versionsvorgaben synchronisieren
- [x] Sauberes npm ci: 535 Pakete erfolgreich installiert; automatische Typ-/Buildprüfung fehlerfrei
- [ ] Produktionsbuild nach sauberem npm ci – manuelle Projektbuilds sind hier nicht zulässig; automatische Lovable-Prüfung ersetzt diese spezifische Prüfung nicht
- [ ] GitHub-main-Übertragung verifizieren (Commit/Push wird von Lovable verwaltet)

## Infobox, Pipette, Fangpunkte – 14.10.2026
- [x] Infobox-Einstellungen schließen bei Werkzeug-/Auswahlwechsel automatisch, ohne X
- [x] Ausgewählte Infoboxen leuchten blau; Augen im Kopf entfernt
- [x] Infoboxen sitzen beim Bewegen/Zoomen exakt fest
- [x] Pipette: Enter = mit Werkzeug + Eigenschaften der Quelle weiterzeichnen (Optionsschritt)
- [x] Fangpunkte des ausgewählten Objekts haben Vorrang vor deckungsgleichen Punkten

## Cutter & Bogenerhalt – 13.10.2026
- [x] Cutter-Werkzeug (Axt-Symbol unter Lineal, 3-Schritt-Anleitung, Enter/Doppelklick teilt Objekte)
- [x] Gewölbte Schraffurkanten beim Verbinden/Schneiden als echte Bögen erhalten

## Objekteinstellungen – Korrektur 12.10.2026
- [x] Objektname/ID mittig und mit tiefer liegenden Untertabs anzeigen
- [x] „Sonstiges“ beim Öffnen von Infos und bei Objektwechsel automatisch aufklappen
- [x] Schraffur-Höhenkörper weiß mit schwarzem Umriss darstellen

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
- [x] Punkt 3 Kopfzeilen-Geste achsen-/scrollabhängig
- [x] Punkt 5 PDF: echte Strichbreiten (CTM, Hairline), Flächen ohne Rand, Texte ohne Umbruch/Abschneiden, Breite+Drehung wie Original; Referenztest
- [x] Punkt 5 Rest: Clipping (Rechteck), Strichelung, Deckkraft, Löcher; Vergleichsbild erstellt
- [ ] PDF: Linienenden/-verbindungen, nicht-rechteckige Clips, eingebettete Bilder (z. B. orange Fläche) – Einschränkung; Prüfung in der echten CAD-Ansicht offen
- [x] Punkt 4 Pixelmodus: Kachel-Referenzen im Verlauf, Teilbereichs-Rastern, Ablehnung statt Qualitätsverlust, Puffer freigeben
- [ ] Punkt 4: Belastungstest im Browser/Tablet

## Pixelmodus speicherschonend (Auftrag 07.10.2026)
- [x] Durchgang 1: eindeutige Ergebnisse, atomarer Job-Abschluss (1 Undo), sparse Kacheln, Temp-IndexedDB, Fortschritt/Abbrechen, kein Bild-Fallback, Qualitätsregler entfernt
- [ ] Lokale Projektablage IndexedDB statt localStorage (Phase 3, inkl. Formatversion/Migration) (Paket 1 Grundstand umgesetzt)
- [ ] Manifestmodell solidFill/patternFill/paint/erase/checkpoint (Phase 4)
- [ ] Gemischte Auflösungen + RAM-Budget/LRU (Phase 5; erst dann Auflösungsreduktion aktivieren)
- [ ] Alle Rasterkonsumenten (Export, PDF, Ausschnitte, Analyse) (Phase 6)
- [ ] Atomarer Cloud-Manifest-Sync (Phase 7)
- [ ] Serverquoten inkl. ausführbarem Uploadweg (Phase 8, braucht Betreiberwerte)
- [ ] Bereinigung alter Schreibwege (Phase 9)

## Pixelumbau fertigstellen (Auftrag 10.10.2026, mit Präzisierungen Phil)
- [x] SQL-Endfassung V2 (FOUND-Fix, zentrale Sperre, echte Größe, Löschkandidaten bleiben gezählt, Prüfqueries)
- [x] Uploadgrenze vor dem Upload (Client + Bucket + Reservierung der Obergrenze)
- [x] Physische Bereinigung über Storage-API (claim → remove → finalize)
- [x] Lokales Speichern je Projekt, echtes Erfolgsergebnis, kein Rückschreiben während Laden, Cloud auf frischem Gerät
- [x] Cloud: getrennte Meldungen, alle Assets referenziert, Konflikt ohne Revisionsübernahme, portionsweiser Download
- [ ] Kompakte Flächen/Muster (solidFill/patternFill mit Kontur)
- [ ] Automatische Auflösung aktivieren + feiner Strich auf grober Kachel
- [ ] startRasterJob ohne decoded-Sammlung; Budget bis zum Commit
- [x] Undo: Zeichnen + Rasterabschluss als eine Aktion, ohne Nachtrag in fertige Schritte (Schritt wartet auf Jobabschluss)
- [ ] Speichermessung → Projekt-/Kontolimit in SQL eintragen (blockiert durch offene Punkte oben)

## Pixelmodus Paket B
- [x] Speicherprobe mit vielen Pixelobjekten (scripts/storage_probe.py, docs/storage-probe.md)
- [x] Projekt 50 MB / Konto 150 MB in SQL und Client eingetragen
- [ ] SQL-Datei manuell in Supabase anwenden (durch den Nutzer)

## Pixel-Fehlerkorrektur (Auftrag auf Basis 293a7ffa)
- [x] Schritt 1.1 Kacheln bedarfsgerecht laden (Referenzen beim Öffnen, nur Sichtbares, saubere Kacheln verdrängbar, portionsweise Ausgabe)
- [x] Schritt 1.2 Cloud/Lokal je Blatt per Revision + Outbox, Konflikt erhält beide Stände, gemeinsame Veröffentlichung, Bearbeitungssperre beim Laden
- [x] Schritt 1.3 Lokale Blob-Bereinigung, serverseitige Referenzen aus Manifest, Bereinigung bis leer
- [x] Schritt 2.4 Rasterinhalt in Export/PDF (CAD-Ausschnitte, Exportseiten)
- [x] Schritt 2.5 Bildmuster kompakt (patternFill), Haarlinien an Kachelgrenzen
- [ ] SQL-Endfassung in Supabase einspielen (Nutzer)

## Radierer, Bibliothek, Infoboxen – 13.10.2026
- [x] Aktuelle Korrektur: Bibliotheks-Hilfslinien überschaubar halten und Rahmenpunkte wieder fangbar/rechtsklickbar machen (Regressionstests)
- [x] Aktuelle Korrektur: bisherige Infobox-Optik wiederherstellen und Zoomen/Verschieben im Infoboxmodus ermöglichen (Eingabetests)
- [ ] Prüfung im angemeldeten CAD: kein verfügbarer Zugang; /cad führt zur Anmeldung
- [ ] GitHub-main-Übertragung verifizieren: GitHub zeigt noch fc072408; Lovable verwaltet Commit/Push
- [x] Paket 1: Kanten glätten entfernt, auffälliger Smooth-Hinweis, Bibliotheksliste schlank, Vorschaufenster mit Drehen/Spiegeln/Maßen (1:1 am Objekt)
- [ ] Paket 2: Bearbeitung gesetzter Elemente, passgenauer Rahmen + Greifpunkte, R-Klick-Hilfslinien, „Verschieben“, Fangpunkte wie Schraffur
- [ ] Paket 3: Infoboxen (Auswahl, Augen-Schalter, Filter im Auswahlfilter), Auswahlliste im Auswahlwerkzeug mit Shift

## Infobox – Korrektur 14.10.2026
- [x] Altes Pin-Design, bei Information Titel statt Kürzel
- [x] Augen erst bei aktivem Modus, „Aktiviert“ schwarz
- [x] Klick setzt direkt eine Aufgabe-Box (kein Platzhalterpunkt)
- [x] Werkzeugwechsel/andere Auswahl beendet den Infobox-Modus
- [x] Ebenenzählung inkl. Bibliothekselemente, Infoboxen, Tabellen, Türen

## Tablet-Hilfsrad – 14.10.2026
- [x] Stift-Modus entfernt (Stift wie Finger), SPACE-Knopf in der Mitte
- [x] Umranden mit SPACE bei Polygon & Schraffur wieder entfernt (Absturz)
- [x] Kleiner ENTF-Knopf mit Mültonnen-Symbol ganz unten unter dem Rad

- [x] Paket 01 / Schritt 1: Blatt-/Objekthöhen, Anlagenkategorie, 3D-Ableitung
- [x] Paket 01 / Schritt 2: 3D-Ansicht (Three.js, Navigation, Auswahl), Körperbeziehungen
- [x] Paket 01 / Schritt 3: Render-Dossier (PDF/JSON)

## 3D-Einstellungen, Neigung, Wandanschlüsse – 19.10.2026
- [x] Darstellung → 3D-Einstellungen je Objektart (nur wirksame Werte)
- [x] Schraffur neigen (Kante wählen, ziehen/Zahl/Regler, ✓/Enter, Zurücksetzen)
- [x] Begrenzen/Durchbrechen mit geneigten Körpern (echtes Volumen)
- [x] Automatische Wandanschlüsse in 3D (gemeinsame Höhen bereinigt)

## 3D-Bedienung Feinschliff – 19.10.2026
- [x] Raster Ein/Aus hervorgehoben, Standard schwächste Stufe; „Gesamte Szene“ nur Symbol
- [x] Bedienungshilfe im 2D-Stil („Navigation“, Symbole über Text)
- [x] 3D-Einstellungen in Werkzeugen unter „Ebene“; alte Schraffur-Objekthöhe entfernt
- [x] Joysticks einzeln verschiebbar (Griff „Laufen“/„Blick“), Positionen gespeichert
- [x] Zahnrad: Empfindlichkeit Laufen/Blick in %

## 3D-Neigung & Beziehungen – 21.10.2026
- [x] Neigung je Objekt unabhängig (keine Übernahme beim Auswahlwechsel)
- [x] Neigungsvorschau transparent grau mit beiger Kante in der 3D-Ansicht
- [x] Durchbricht „und“ Körper vollständig / Körper abgeschnitten
- [x] „Kante neigen“; Orientierung Grundfläche / Tatsächliche Fläche (2D folgt)
- [x] Rechtsklick dreht wie Linksklick; Klick ins Leere hebt Auswahl auf

## 3D Neigung Paket 1 (Okt 2026)
- [x] Kanten wählen/neigen bei allen Objekten
- [x] Kein Kantenziehen im Neigungsfenster (nur Zahl/Regler)
- [x] Tatsächliche Fläche für alle Objekte inkl. Bilder
- [x] Schalter „Gegenüberliegende Kante neigen“
- [x] Paket 2: Bibliothek/Bilder wie 2D, Infoboxen 3D, Materialien, Bilder wählbar, Türen/Fenster 3D (angemeldete Abnahme offen)

## Paket 02 – 24.10.2026
- [x] Neigungswinkel bis einschließlich 90° sicher ableiten und testen (90° = starres Aufrichten; minimale rücksetzbare 2D-Projektion)
- [x] Bibliotheks-/Bildinhalte auch geneigt anzeigen; Bilder auswählen
- [x] Vertikale auswählbare Infoboxen mit Inhalt und Größen-/Dickenfeldern
- [x] Persistente PBR-Materialien: Bild, Skalierung, Transparenz, Leuchtkraft, Palette, Drag & Drop, GLB
- [x] Parametrische Türen/Fenster mit zwei Materialien und Öffnen/Schließen
- [x] 83 Regressionstests; getrennte 3D-Browserprüfung mit Auswahl, Material-Drop, Türbedienung und gültigem GLB auf Desktop/Handy
- [ ] Angemeldete End-to-End-Abnahme inkl. Materialupload und Zwei-Geräte-Synchronisation – keine verfügbare Sitzung; Projektseite führt zu /login
- [ ] Twinmotion-Import abnehmen – Twinmotion im Prüfumfeld nicht verfügbar
- [ ] GitHub-main-Übertragung – Lovable verwaltet Commit/Push; GitHub main zeigt noch 3a62d5a6
