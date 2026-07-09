## Ziel

Das CAD-Blatt in der Projektmappe soll wie im Screenshot aussehen und bedienbar sein: blauer gestrichelter Rahmen, blaue Eck-/Kantenpunkte und eine kompakte weiße HUB-Box mit Symbolen für Verschieben, Drehen und Skalieren. Zusätzlich bekommt das Dokumentenwerkzeug in der CAD-HUB-Box ein Löschen-Symbol.

## Ursache

In der Projektmappe laufen aktuell zwei konkurrierende Bearbeitungsschichten für `cad-view`:

- `ElementView` rendert den gewünschten blauen Rahmen und eigene Handles/HUB-Buttons.
- `CadOverlayLayer` übergibt `cad-view` zusätzlich als `externalDocs` an die Mini-CAD-Engine, wodurch die Dokumenten-HUB-Logik/Hit-Tests der Engine ebenfalls aktiv werden.

Dadurch entsteht abweichendes Design und Events für Verschieben, Drehen, Kantenbearbeitung/Skalieren werden teilweise von der falschen Ebene abgefangen.

## Umsetzung

1. **CAD-Blatt in der Projektmappe eindeutig über `ElementView` steuern**
   - `cad-view` aus `externalDocs` entfernen.
   - `externalDocs` weiterhin nur für echte PDF-/Bild-Dokumente nutzen, damit deren Snap-/Dokumentenlogik unverändert bleibt.
   - `cad-view` im Standardmodus dauerhaft über der CAD-Overlay-Canvas halten, damit Klicks/Drag auf Rahmen, HUB und Handles sicher bei `ElementView` landen.

2. **HUB-Design für CAD-Blatt auf Screenshot-Design setzen**
   - Blauer gestrichelter Rahmen wie im Screenshot.
   - Weiße HUB-Box oben links/oben am Rahmen mit exakt drei Symbolbuttons:
     - Verschieben
     - Drehen
     - Skalieren
   - Aktuellen „Duplizieren/Löschen“-Button beim CAD-Blatt entfernen; „Löschen“ wird durch „Skalieren“ ersetzt.
   - PDF/Bild-HUB in der Projektmappe nicht unnötig ändern, außer falls dieselbe Komponente davon profitiert.

3. **Funktionen zuverlässig verdrahten**
   - Verschieben: Drag auf CAD-Blatt/Move-Button startet die bestehende Positionsänderung.
   - Drehen: Rotationsfunktion über bestehenden `onRotate`-Handler beibehalten.
   - Skalieren: Button/Handles nutzen bestehende Größenlogik; Ecken bleiben proportional mit Shift.
   - Kantenbearbeitung: Kanten-Handles bleiben aktiv und ändern die sichtbare Blattfläche wie bisher, aber ohne Event-Konflikt mit der Mini-CAD-Engine.

4. **Dokumentenwerkzeug-HUB um Löschen ergänzen**
   - In der CAD-Oberfläche (`CadEditor`) in der vorhandenen Dokumenten-HUB-Box ein `Trash2`-Symbol ergänzen.
   - Klick löscht das selektierte Dokument aus der CAD-Szene, schließt die HUB-Box und leert die Auswahl.
   - Falls die Projektmappen-Dokumenten-HUB (`CadOverlayLayer`) dieselbe Dokumenten-HUB anzeigt, dort optisch/funktional analog ergänzen, damit die Bedienung konsistent bleibt.

5. **Validierung nach Umsetzung**
   - Projektmappe öffnen, CAD-Blatt auswählen: nur ein blauer Rahmen und nur die gewünschte HUB-Box sichtbar.
   - Verschieben, Drehen, Skalieren und Kantenziehen am CAD-Blatt testen.
   - CAD-Dokument im Dokumentenwerkzeug auswählen und Löschen-Symbol testen.
   - Sicherstellen, dass PDF/Bild-Dokumente und CAD-Snap im Seiteneditor nicht regressieren.