# Bibliotheksobjekte: stabiler Platzierungs- und Transformationsablauf

## Ziel
Platzierte Bibliotheksobjekte werden nach einer einzelnen Platzierung sofort ausgewählt und lassen sich zuverlässig über ihre Fangpunkte verschieben, drehen und proportional skalieren.

## Umsetzung
- `LibraryPlacementTool.commit()` auf Einmal-Platzierung umstellen: erzeugte Instanz merken, Platzierungszustand beenden, zum Auswahlwerkzeug wechseln und die neue Instanz auswählen.
- Auswahlrahmen und fünf Fangpunkte der neuen Instanz direkt nach dem Platzieren sichtbar halten; keine automatische Folgeplatzierung auslösen.
- In `SelectTool.update()` das Fangpunkt-Menü für eine ausgewählte Bibliotheksinstanz mit `handleIndex` vom allgemeinen Ausblend-Fallback ausnehmen.
- Den MOVE-Mauspfad bei `libraryHandle` über `_applyLibraryMove(...)` führen, einschließlich Vorschau und final aufgelöstem Fangpunkt.
- Längen-Hub für MOVE so anbinden, dass der berechnete Zielpunkt ebenfalls `_applyLibraryMove(...)` nutzt.
- Skalierung per Maus und Längen-Hub bei `libraryHandle` konsequent über `_applyLibraryScale(...)` führen; proportionale Skalierung beibehalten.
- Bestehende Drehung über `_applyLibraryRotate(...)`, Objekt-/Rasterfang, Rechtsklick-Hilfslinien, Escape-Rücksetzung und genau einen History-Schritt pro Abschluss absichern.
- Keine Mehrfachplatzierung zum normalen „Platzieren“-Button hinzufügen; bestehende Bibliotheksdaten, Oberfläche und andere CAD-Werkzeuge unverändert lassen.

## Prüfung
- Gezielt automatisierte Tests für Einmal-Platzierung, Auswahlübergang, stabiles Fangpunkt-Menü sowie MOVE/SCALE per Maus und Hub ergänzen oder anpassen.
- TypeScript-Prüfung, relevante Vitest-Tests, ESLint der geänderten Dateien und Produktions-Build ausführen.
- Git-Diff auf unbeabsichtigte Änderungen prüfen und den relevanten CAD-Ablauf soweit möglich in der Vorschau kontrollieren.
- Änderungen anschließend ohne Force-Push auf GitHub `main` übertragen und den Commit dort verifizieren.
