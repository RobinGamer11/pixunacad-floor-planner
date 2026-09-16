# PixunaCAD Desktop-Dichte vereinheitlichen

## Ziel
Die CAD-Oberfläche erhält bei normalem Browser-Zoom auf Laptop und Desktop eine kompakte Standard-Dichte, die optisch der bisherigen Lovable-Vorschau entspricht. Die Zeichenfläche selbst wird nicht skaliert.

## Umsetzung
1. Die CAD-Seite und ihre gemeinsame Kopfzeile erhalten eindeutige Klassen für gezielte Dichte-Regeln.
2. Ab dem Desktop-Breakpoint von 1024 px werden ausschließlich die UI-Flächen verdichtet:
   - niedrigere Kopfzeile und kompaktere Kopfzeilen-Aktionen,
   - schmalere linke Werkzeugleiste und kleinere Werkzeugschaltflächen,
   - schmalere rechte Einstellungsleiste,
   - kompaktere Tabs, Innenabstände, Eingabefelder, Listen und Beschriftungen.
3. Unterhalb von 1024 px greifen diese Regeln nicht. Die bestehende touchfreundliche Tablet-/Handy-Darstellung und ihre Panel-Logik bleiben bestehen.
4. Es wird weder `zoom` noch `transform: scale(...)` verwendet. CAD-Weltmaßstab, Renderer, Canvas-Maße, Raster, Fangpunkte sowie Maus-/Touch-Koordinaten bleiben unangetastet.

## Prüfung
- Desktop bei 1440 × 900 und 1920 × 1080: kompakte, konsistente Kopfzeile und Seitenleisten; Zeichenfläche bleibt scharf und interaktiv.
- Tablet bei 1023 px sowie Handy: bestehende Größen und adaptive Darstellung unverändert.
- Auswahl, Zeichnen und Panel-Bedienung auf Desktop kurz prüfen.
- TypeScript-Prüfung, relevante Tests und Produktions-Build ausführen.

## Technische Details
Die Dichte wird über desktopbegrenzte CSS-Regeln und semantische Klassen umgesetzt, nicht über eine globale Seitenskalierung. Damit ändert sich nur der Platzbedarf der Bedienelemente; die CAD-Engine erhält weiterhin echte CSS-Pixel und unveränderte Koordinaten.
