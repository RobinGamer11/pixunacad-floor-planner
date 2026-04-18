---
name: Hatch Tool
description: Polygon-, Rechteck- und Kreis-/Sektor-Modus (H) mit Farben, Flächenlabel, Punktbearbeitung und Bezeichnungs-ID-Zuordnung.
type: feature
---

# Schraffurwerkzeug

Drei Zeichenmodi auswählbar via Icon-Toggle ganz oben in den Schraffureinstellungen:

1. **Polygon** (Spline-Icon, Default): freie Klick-Folge, Doppelklick oder Klick auf Startpunkt schließt.
2. **Rechteck** (RectangleHorizontal-Icon): 3-Klick-Workflow — Startpunkt A, erste Kante zu B (definiert Achse), dritter Klick legt Breite normal zur Achse fest.
3. **Kreis / Sektor** (Circle-Icon): 3 Klicks
   - Klick 1: Mittelpunkt
   - Klick 2: Radiuspunkt (definiert Radius + Startwinkel des Sektors)
   - Klick 3: Endwinkel des Sektors
   - **Doppelklick** oder **Enter** im Bogen-Status committet stattdessen einen **Vollkreis** (96 Segmente).
   - Vollkreis-Polygon enthält keinen Mittelpunkt; Sektor enthält Mittelpunkt als ersten Punkt (Pie Slice).
   - Hub (Tab) zeigt Länge=Radius, Winkel=Start- bzw. Endwinkel und erlaubt numerische Eingabe; Bestätigung im Radius-Status springt direkt in Bogen-Status, Bestätigung im Bogen-Status committet Vollkreis.

Shift = Ortho gegenüber Mittelpunkt (im Kreis-Modus). Tab öffnet/fokussiert Hub in allen Modi. Escape bricht ab.

Erstellte Schraffuren sind danach normale Polygon-Hatches und identisch editierbar (Punkte verschieben, löschen, Edge-Insert via Doppelklick im SelectTool, Flächenlabel etc.).

Geometriehilfsfunktion: `buildCircleOrSectorPoints(center, radius, startDeg, endDeg, segments=96)` in `geometry.ts`.
