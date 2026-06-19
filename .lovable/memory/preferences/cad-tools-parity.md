---
name: CAD-Werkzeuge 1:1 in Seiteneditor
description: Werkzeuge "Text", "Schraffur" und "Linie" müssen im Seiteneditor exakt wie in der CAD-Oberfläche funktionieren
type: preference
---
Die Werkzeuge **Text**, **Schraffur (Hatch)** und **Linie** sollen im Seiteneditor (ProjectWorkspace) immer **funktional identisch** zur CAD-Oberfläche (`src/cad/*`) sein.

**Wie anzuwenden:**
- Beim Einbinden dieser Tools in den Seiteneditor die bestehenden Klassen aus `src/cad/` (LineTool, TextTool, HatchTool, Scene, Renderer, Input, Snapping, Hub, PointEditMenu) **wiederverwenden**, nicht reimplementieren.
- Keine vereinfachten Parallel-Implementierungen anlegen — sonst driften Verhalten (Snap, Ortho, Hub, Punkt-Edit) auseinander.
- Änderungen am CAD-Linientool weiterhin gemäß bestehender Core-Regel 1:1 zum Referenzcode halten — der Seiteneditor erbt diese Garantie automatisch.

**Warum:** Konsistentes Bedienverhalten zwischen CAD-Oberfläche und Seiteneditor; vermeidet Pflege zweier Engines.
