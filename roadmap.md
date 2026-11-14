# Roadmap – Export/Muster-Auftrag (Basis bdffd521)
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
