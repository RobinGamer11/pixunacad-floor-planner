---
name: Hatch Tool
description: Polygon-/Rechteck-Schraffur (H) mit Farben, Flächenlabel, Punkt- und Kantenbearbeitung sowie Bezeichnungs-ID-Zuordnung.
type: feature
---
Schraffurwerkzeug (Hotkey H).

- Zeichenmodi (Auswahl per Icon-Buttons ganz oben in den Schraffureinstellungen):
  - Polygon (Spline-Icon, Default): Linksklick = Punkt, Doppelklick / Enter / Klick auf Startpunkt = schließen.
  - Rechteck (RectangleHorizontal-Icon): 3 Klicks – Punkt A, Punkt B (definiert erste Kante + Achse), dritter Klick legt Breite/Seite des Rechtecks fest.
- Modus-Wechsel via `HatchTool.setDrawMode("polygon" | "rectangle")` (bricht laufende Zeichnung ab); UI-Sync via `onDrawModeChange`-Callback.
- Während Zeichnen (beide Modi): Tab öffnet Hub für Länge/Winkel-Eingabe, Shift = Ortho, Space = Referenzwinkel-Snap.
- Während Polygon-Zeichnen: Rechtsklick auf Draft-Punkt aktiviert Ortho-/Referenzlinien (gleicher Toggle-Mechanismus wie LineTool).
- Style: Füllfarbe, Strichfarbe, Strichbreite, Füll-Alpha %.
- Bezeichnungs-ID: Hatches teilen IDs mit Linien (gleiche Sichtbarkeits- und Layer-Regeln).
- Flächenanzeige: optionales m²-Label, world-space-skaliert, verschiebbar via offsetX/offsetY.
- SelectTool-Bearbeitung an Hatch-Punkten: Move, Translate, Rotate (um Polygon-Centroid), Delete (≤3 Punkte ⇒ Hatch wird gelöscht). Doppelklick auf Hatch-Kante fügt Punkt ein.
