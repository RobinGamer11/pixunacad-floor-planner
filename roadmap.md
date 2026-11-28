# Roadmap – Export/Muster-Auftrag (Basis bdffd521)
## Cloud-Abschluss (Basis 69cde11a)
- [x] Kontogetrennte Dokumentablage und bestätigte lokale Speicherung
- [x] Revisionsgebundene Dateibereinigung implementiert; SQL lokal zweimal und mit Berechtigungs-/Referenz-/Quotentests geprüft
- [x] Persönliche Struktur beim Laden und bei Cloudplatzhaltern anwenden, bewusst leere Zuordnungen übernehmen
- [x] Berechtigungsabhängiges Laden, Anfragezusammenfassung und sichtbare Fehler
- [x] Dauerhafte Änderungen, Bereichsfehler, allgemeine Organisation und vollständige Sicherung
- [x] CAD-Baselines, Teilbestätigungen, Löschzustände, Bibliothek und Export-Wiederherstellung regressionsgeprüft
- [x] 83 Regressionen, saubere npm-ci-Installation, gezieltes Lint, automatische Typ-/Produktionsprüfung und echte IndexedDB-/Offline-Browserprüfung
- [ ] SQL-Anwendung in der bestehenden Cloud: manueller Anwendungsschritt für 20261127195500_document_references.sql erforderlich
- [ ] Angemeldete Cloud-/Zweigeräte-Abnahme: keine nutzbare Testsitzung verfügbar
- [ ] GitHub-main-Übertragung und Vercel-Abnahme des Abschlusscommits: nach Plattformübertragung zu verifizieren
## Kontogetrennte Speicherung und Projektöffnung (Basis 0f623ecd)
- [x] Lokale Kontotrennung einschließlich CAD, offener Änderungen und Abgleichsstände; unklare Altbestände erhalten
- [x] Einstellungs-Allowlist und sichere einmalige Altübernahme
- [x] Konfliktsichere Metadaten-Sicherung und Cloud-Projektindex mit Fehlerzuständen
- [x] Verbindliche Sicherungsergebnisse und Speicheranzeige
- [x] Gemeinsame Projektbereitschaft, reale Ladephasen und Illustration; keine Ersatzdaten bei Ladefehlern
- [x] 57 Regeltests, echte IndexedDB-Browserprüfung, Ladeansicht Desktop/Handy, Vorschau-Build; Bericht in docs/project-storage-verification.md
- [ ] Angemeldete Cloud-Abnahme auf zwei Geräten: kein nutzbarer externer Testaccount verfügbar

- [x] 1. 2D-Muster beim Herauszoomen glätten (hatchPatterns.ts)
- [x] 2. Export-Nahzoom (20 mm ≈ 400 px)
- [x] 3. Export-Einstellungen: „Zeichnung platzieren“ + „Seite einrichten“
- [x] 4. Vektor-PDF (drawProjectionToPdf) + Maßstabstest
- [x] Hilfsrad-Größe 0–100 %, Knöpfe am Rad, 3D-Fenster einklappbar wie CAD

## Handyoberfläche und gemeinsamer Speicherstatus (Basis 68a78b33)
- [x] Auswahlaktionen und Zentrieren auf der Zeichenfläche, beschriftete Mehr-Kacheln und deutliche Kopf-/Bearbeitungsbuttons
- [x] Hilfe startet pro Projektsitzung ausgeschaltet
- [x] Projektbezogene lokale und Cloud-Speichersignale im gemeinsamen Kopfsymbol zusammenführen
- [x] Bedienfenster zuverlässig schließen und Ziehzustand zurücksetzen
- [x] Regeltests: 23 bestanden; isolierte Browserprüfung CAD/3D/Export (keine angemeldete Projektabnahme)
- [ ] Angemeldete Projektabnahme inklusive echter lokaler/Cloud-Speicherung: Projektzugriff im Browser führt zu /login, keine nutzbare Testsitzung verfügbar

## Export-Leiste, Scrollhinweise, Handy-Symbole (Basis 945b12cb)
- [x] Export-Fenster links ein-/ausklappbar (gleiches Symbol wie rechts)
- [x] Scrollhinweise breiter/deutlicher
- [x] Handy: Hilfsrad kehrt nach Fensterschließen an Ursprungsplatz zurück
- [x] Handy: Zentrieren nur in CAD; Reihenfolge Infobox, Auswahl, Vorder/Hintergrund, Kopieren, Löschen, Zentrieren
- [x] Handy: Eigenschaften links neben Werkzeuge (Werkzeuge mittig)
- [x] Kopf: CAD/3D/Export deutlicher als Knöpfe

## Kopfzeile, Scrollhinweise, Handy-Export, 3D-Ränder
- [x] Gerätespeicher-Hinweis unten links entfernt; Cloudsymbol im Kopf (Desktop/Tablet)
- [x] Präsentieren auf Tablet nur Symbol
- [x] Scrollhinweise dunkler Verlauf
- [x] Modusrahmen heller, Buttons dunkler
- [x] Handy-Export: Exportfenster-Symbolbutton oben links
- [x] 3D: Mehrfachauswahl/Blätter oben am Rand; Kopiersymbol oben rechts am Handy raus
- [x] Speichern-Symbol, Handy-Exportleiste, heller Modusrahmen, Ausrichtungssymbole
