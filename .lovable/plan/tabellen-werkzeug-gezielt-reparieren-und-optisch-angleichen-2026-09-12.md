# Tabellen-Werkzeug gezielt reparieren und optisch angleichen

## Ziel
Das vorhandene gemeinsame Tabellenmodell und die bestehenden Tabellenkomponenten bleiben erhalten. CAD und Projektmappe erhalten denselben Ablauf: Einstellungen wählen, Platzierung aktivieren, Position auf der Zeichenfläche anklicken, neue Tabelle ausgewählt lassen und anschließend direkt weiterbearbeiten.

## Umsetzung

### 1. Gemeinsame Hauptaktion reparieren
- In `TableToolSettings.tsx` den sichtbaren Bereich „+ Neue Tabelle“ als echten, touchfreundlichen Hauptbutton ausführen.
- Derselbe Callback startet in CAD und Projektmappe den vorhandenen Tabellen-Platzierungsmodus.
- Die im gemeinsamen Kontext gewählten Werte für Spalten und Zeilen werden unverändert an die jeweilige Platzierung weitergegeben.
- Bei bereits ausgewählter Tabelle bleibt dieselbe Hauptaktion zum Start einer weiteren Platzierung verfügbar; kein zweiter Platzierungsweg entsteht.

### 2. Projektmappen-Platzierung auf Positionsklick umstellen
- Die sofortige mittige Erzeugung aus `placeTableOnPage()` entfernen.
- Beim Aktivieren zunächst nur den Tabellenmodus sichtbar aktivieren.
- Den bereits vorhandenen Seiten-Zeigerfluss so ergänzen, dass der nächste Klick auf die Seite genau dort eine Tabelle mit den gewählten Zeilen/Spalten erzeugt.
- Standardgröße weiterhin aus dem bestehenden mm-Modell berechnen; die Tabelle bleibt nach dem Setzen ausgewählt und die Werkzeugeinstellungen bleiben offen.
- Bestätigen/Abbrechen und Undo/Redo weiterhin über den bestehenden Projekt-Store abwickeln.

### 3. CAD-Lebenszyklus korrigieren
- `TableTool.ts` erzeugt und selektiert weiterhin das native Szenenobjekt, wechselt danach aber nicht mehr über den allgemeinen Auswahlwerkzeug-Ablauf in den Seitenreiter.
- Nach der Platzierung bleibt die Tabelle ausgewählt, das Tabellenpanel sichtbar und der Tabellenkontext erhalten.
- Eine weitere Platzierung startet nur durch „+ Neue Tabelle“; bewusster Werkzeugwechsel oder Bestätigen beendet den Platzierungsmodus.
- Allgemeine Auswahl-, Werkzeug- und Seitenreiterlogik anderer Werkzeuge bleibt unverändert.

### 4. Bestehendes PixunaCAD-Design übernehmen
- `TableToolSettings.tsx` mit den vorhandenen Panel-, Feld-, Rahmen-, Hauptaktions- und Aktivzuständen angleichen.
- Reihenfolge: „+ Neue Tabelle“, Grundeinstellungen; nach Auswahl „Tabelle bearbeiten“, Spalten/Zeilen, „Rahmen & Hintergrund“, „Zellrahmen“, „Zahlenformat“, „Tabellenmodus“ und größere Formelaktionen.
- Kleine Bearbeitungsschaltflächen auf sichere Touchgrößen bringen; Inhalte auf schmalen Ansichten umbrechen statt abschneiden.
- Keine Formeln, Formate, Werte, Ebenen, Exporte oder gespeicherten Daten ändern.

### 5. Nachtmodus ohne globale Farb-Invertierung
- In `CadTableLayer.tsx` den globalen `invert`-/`hue-rotate`-Filter und den festen weißen Overlay-Hintergrund entfernen.
- Interaktiven Bearbeitungsrahmen, Auswahlzustände, Eingabefelder, Filtermenü, Formelhinweise und Symbole in `TableElementView.tsx` über vorhandene semantische Theme-Farben gestalten.
- Die eigentliche Tabellen-/Papierdarstellung und damit Druck/PDF unverändert lassen; nur Bearbeitungs-UI und Overlays werden themengerecht.

## Prüfung
- CAD und Projektmappe: Hauptbutton anklicken, abweichende Zeilen-/Spaltenzahl wählen, Position anklicken, Auswahl und geöffnetes Tabellenpanel prüfen.
- Danach Zellbearbeitung, Filter, Formeln, Rahmen, Hintergrund und Zahlenformate stichprobenartig prüfen.
- Hell-/Nachtmodus sowie Desktop- und schmale Touch-Ansicht visuell prüfen.
- Gezielte Tabellen-Tests, TypeScript-Prüfung und Produktions-Build ausführen; vollständigen Diff auf unbeabsichtigte Änderungen prüfen.
- Abschließend sicheren Commit erstellen und ohne Force-Push auf GitHub `main` übertragen; Commit auf GitHub verifizieren.
