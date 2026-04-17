---
name: Hatch Tool
description: Polygon-Erstellung/Bearbeitung (H) mit Farben, Flächenlabel, Punkt- und Kantenbearbeitung sowie Bezeichnungs-ID-Zuordnung.
type: feature
---
Schraffurwerkzeug (Hotkey H).

- Erstellung: Linksklick = Punkt, Doppelklick / Enter = Polygon schließen.
- Während Zeichnen: Rechtsklick auf Draft-Punkt aktiviert Ortho-/Referenzlinien (gleicher Toggle-Mechanismus wie LineTool).
- Style: Füllfarbe, Strichfarbe, Strichbreite, Füll-Alpha %.
- Bezeichnungs-ID: Hatches teilen IDs mit Linien (gleiche Sichtbarkeits- und Layer-Regeln).
- Flächenanzeige: optionales m²-Label, world-space-skaliert (Font + Padding × cam.scale / strokeWidthBaseScale), verschiebbar via offsetX/offsetY.
- SelectTool-Bearbeitung an Hatch-Punkten (identisch zu Linienpunkten):
  - Move: Punkt frei mit Snap/Ortho verschieben.
  - Translate: gesamtes Polygon per Delta verschieben.
  - Rotate: Punkt rotiert um Polygon-Centroid als Pivot.
  - Delete: Punkt entfernen (Nachbarn schließen die Lücke); bei ≤3 Punkten wird die ganze Schraffur gelöscht.
- Doppelklick auf Hatch-Kante im SelectTool fügt einen neuen Punkt an Klickposition ein.
