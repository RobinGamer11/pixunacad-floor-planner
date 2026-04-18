# Memory: index.md
Updated: now

# Project Memory

## Core
PixunaCAD: Architektur-CAD-Programm für Grundrisse.
Stack: TypeScript/React, Tailwind CSS, CAD-spezifische CSS-Variablen.
Design: Helles und modernes Aesthetic.
Constraint: Funktionalität des ursprünglichen Linienwerkzeugs muss 1:1 identisch zum Referenzcode bleiben.
Roadmap: Zuerst funktionaler CAD-Editor, Benutzerregistrierung und Projektspeicherung später.

## Memories
- [Editor Core](mem://features/editor-core) — Details zu Snapping, Ortho-Beschränkungen, Punktbearbeitung und Auswahlmechanismen
- [Layer System](mem://features/layer-system) — Organisation von Objekten via Bezeichnungs-ID (Ebenen) inkl. Sichtbarkeits-/Snapping-Regeln
- [Hatch Tool](mem://features/hatch-tool) — Polygon-Erstellung/Bearbeitung (H) mit Farben, verschiebbarem m²-Label und Punktbearbeitung
- [Undo/Redo](mem://features/undo-redo) — JSON-Snapshot-History mit Polling, Strg+Z/Y
- [Clipboard & Pipette](mem://features/clipboard-pipette) — Strg+C/V (Vorschau am Cursor) und Pipette (P, Stil+ID, Shift=nur Stil)
