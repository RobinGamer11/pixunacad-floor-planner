# Treppenwerkzeug – Korrekturen (Bedienung, Geometrie, CAD-Integration)

Ausgangsstand: `main` bei `dff14cb4`. Datenmodell bleibt: eine Treppe = ein `Stair`-Objekt, alles Sichtbare wird aus `stairGeometry.ts` abgeleitet.

## 1. Optik und Cursor
- Treppe nutzt CAD-Farben, blaue Fangpunkte (`drawSnapDot`), normale Auswahlrahmen und das bestehende Häkchen; gelbe/weiße Sondergriffe entfallen.
- `StairTool.update()` setzt kein `crosshair` mehr: leer = `default`, nur über Griffen `pointer`/`move`.
- Zentrales Zurücksetzen auf `default` in `CadApp.setTool`, bei Escape, Abbruch, Bestätigung und Unmount.

## 2. Platzieren
- Schritt 1 setzt die Startkante der ersten Stufe (Endpunkte + Mitte sichtbar/fangbar).
- Schritt 2: Richtung relativ zur Startkante, Fang über bestehende TopologyEngine (Punkte, Kanten, Raster, Hilfslinien), mittiger Laufpfeil in der Vorschau.
- Tablet: erster Kontakt nur Vorschaupunkt, Fingerheben bestätigt nie, nur Häkchen/Enter; Häkchen-Koordinaten nie als Geometrie.
- Desktop ohne Tabletmodus: kein Häkchen, Klick oder Enter bestätigt.

## 3. Bezug L/R
- Beide Kanten mit L/R beschriftet, gewählte Kante dick in CAD-Blau.
- Desktop: Klick auf L/R legt fest; Tablet: L/R markiert, Häkchen/Enter legt fest.

## 4. Referenzlinie und Podeste
- Shift = orthogonal je Abschnitt (auch nach Ecke/Podest); Rechtsklick nutzt die bestehende Hilfslinienlogik.
- `computeStairGeometry`: Podest wird bündig vergrößert, damit kein Spalt entsteht; Normstufen behalten Standardauftritt; keine Teilstufen; Ungültiges wird gewarnt.
- Podeste entstehen automatisch an Ecken bzw. bei abweichendem Auftritt; Knöpfe „Podest hinzufügen/entfernen" entfallen.

## 5. Beschriftung
- Oben `5 STG`, unten `17,5 / 28 cm`; Laufbreite nur bei aktivem Schalter; Steigungsanzahl auch im Panel bei „Steigung".

## 6. Bearbeitung nach Auswahl
- Klick wählt ganze Treppe, rechter Reiter springt auf „Werkzeugeinstellungen", Griffe erscheinen sofort (Stufengrenzen, Laufbreite, Referenzpunkte, Podestkanten/-ecken).
- Griff antippen = nur auswählen. Button „Verschieben" startet Sitzung mit Vorschau, Fang und Maß relativ zur Ausgangslage; Häkchen/Enter = genau ein Undo-Schritt, Escape verwirft; kein direktes Ziehen. Button „Stufen & Linie bearbeiten" entfällt.

## 7. Maße und Reset je Stufe
- Ausgewählter Griff zeigt Tiefe, Standardauftritt, Differenz; Podest: Tiefe, Breite, Nachbarstufen; Laufbreite: Gesamtmaß.
- Reset-Symbol neben „Verschieben": Stufe auf Standard, Podest verschwindet ggf.; bei Pflicht-Eckpodest deaktiviert mit Erklärung; ein Undo-Schritt.

## 8. Panel-Reihenfolge
Ebenenauswahl (wie Linienwerkzeug) → Schrittmaßregel (große Option, Häkchen links) → Auftritt → Steigung inkl. Anzahl → Laufbreite → Schrittmaß → Geschosshöhe (berechnet + „Geschosshöhe vorgeben") → Treppenrichtung → Anzeige (Pfeil, Startkreis, Beschriftung, Laufbreite als CAD-Toggles). „Gewendelt" wird ausgeblendet, Datenfelder bleiben intern.

## 9. Ebenen
- Gleiche Ebenenauswahl wie Linienwerkzeug; neue Treppen erhalten aktive Ebene, bestehende wechseln darüber.
- Sichtbarkeit/Sperre wirken in Renderer, Auswahl, Fang, Export/PDF, Transparenzpause; Ebene umbenennen/löschen/verschieben/Gruppenauswahl berücksichtigt Treppen. Keine eigene Ebenenlogik.

## Technische Details
- Dateien: `stairGeometry.ts` (+Tests), `StairTool.ts`, `stairDraw.ts`, `StairSettingsPanel.tsx`, `CadApp.ts` (Cursor-Reset, Tablet-Flag), `CadEditor.tsx` (Reiterwechsel, Ebenenauswahl), `SelectTool.ts`, `Renderer.ts`, `TopologyEngine.ts`, `tracingSnapGeometry.ts`, Ebenen-Operationen in `Scene.ts`.
- Vorher je Baustein repositoryweite Nutzungssuche; Persistenz rückwärtskompatibel (alte Treppen ohne neue Felder laden unverändert).
- Tests: lückenloses Podest, Standardauftritte, Reset/Podest-Verschwinden, Beschriftung, Cursor-Reset, Häkchen-Koordinaten nie Geometrie, Ebenen-Sichtbarkeit/Sperre. Danach Typecheck, Build, volle Testsuite.
