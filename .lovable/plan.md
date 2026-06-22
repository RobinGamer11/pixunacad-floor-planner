## Ziel
Drei Anpassungen umsetzen: Selection-Bug in der Projektmappe, ein Default-Wert für Fenster, große CAD-Oberflächen-Umstrukturierung.

---

## 1. Projektmappen-Seite — Selection-Bug
**Symptom:** Gesetzte Objekte (Sheets / Kacheln) lassen sich nicht mehr auswählen / bearbeiten.

**Vorgehen:**
- `src/pages/ProjectWorkspace.tsx` durchsuchen nach den Klick-/Pointer-Handlern der Sheet-/Objekt-Kacheln.
- Prüfen, ob ein kürzlich eingefügter Overlay-/HubBox-Wrapper Pointer-Events blockiert (`pointer-events-none` fehlt, `z-index`-Stapel, oder ein nicht-geschlossener Drag-State).
- Fix: Pointer-Events korrigieren oder verlorene `onClick`-Handler restaurieren.

*(Ursache derzeit unbekannt → erst Analyse, dann gezielter Fix; keine Spekulations-Refactors.)*

---

## 2. Fenster-Default: Laibungsdicke 0,09 m
- In `src/cad/DoorTool.ts` (Settings-Defaults) bzw. in der Default-Logik in `src/components/CadEditor.tsx`, die beim Umschalten auf `window` greift, `doorJambThickM` für **Fenster** auf `0.09` setzen.
- Türen bleiben bei `0.08`.

---

## 3. CAD-Oberfläche — Design & Layout-Umbau
Visuelle Sprache an `ProjectWorkspace`-Seite angleichen (helles Theme, gleiche Tokens, gleiche Card-/Border-Stile). Layout strikt dreigeteilt.

### Layout-Struktur
```
┌──────┬─────────────────────────┬──────────────────────┐
│ Tool │                         │  Tabs:               │
│ Icons│       CAD Canvas        │  [Werkzeug] [Blätter]│
│      │                         │  [Ebenen]            │
│ (nur │                         │ ┌──────────────────┐ │
│ Icons│                         │ │  aktiver Tab-    │ │
│ )    │                         │ │  Inhalt          │ │
│      │                         │ └──────────────────┘ │
└──────┴─────────────────────────┴──────────────────────┘
```

### Linke Spalte (schmal, ~56 px)
- Nur Werkzeug-Icons + Undo/Redo/Pipette/Raster (wie bisher im collapsed-Modus).
- Alle Einstellungs-Panels (Linie / Schraffur / Maßkette / Text / Sticker / Dokument / Wand / Door…) wandern nach rechts.
- Collapse-Knopf entfällt (Spalte ist immer schmal).

### Mittlere Spalte
- Canvas + Floating-Elemente (LineHub, DoorHub, PointEditMenu, TextEditor, Sticker-Pencil, Maßstab-Drop-Up) — unverändert.

### Rechte Spalte (~260 px)
- Card-Optik passend zur Projektmappe.
- Tab-Leiste oben mit drei Tabs:
  1. **Werkzeugeinstellung** — rendert das Settings-Panel des aktuell aktiven Werkzeugs (bedingt sichtbar, wie bisher per `activeTool`).
  2. **Zeichenblätter** — enthält:
     - Bestehendes `sheetPanelRef`-Panel (Zeichnungs-IDs / Blätter)
     - Bestehendes `planPanelRef`-Panel (Druckpläne) **darunter** in derselben Tab-Ansicht.
  3. **Ebenen** — enthält `idPanelRef` (Bezeichnungs-IDs).
- Die bisherigen frei schwebenden Panels oben rechts (absolute positioniert) entfallen, die DOM-Knoten wandern in den jeweiligen Tab — Refs bleiben gleich, damit `CadApp.attachSheetPanel` / `attachPlanPanel` / Id-Verdrahtung weiter funktionieren.

### Farb-/Designtokens
- Hintergründe & Borders über bestehende semantische Tokens (`--background`, `--card`, `--border`, `--primary`) statt der CAD-eigenen dunklen Verläufe.
- `cad-toolbar-btn` / `cad-settings-panel` Styles in `src/index.css` an helles Theme angleichen (oder per neuer Klasse überschreiben), damit das CAD-Inneren-UI dieselbe Optik wie die Projektmappe hat.

### Technische Notizen
- Die zahlreichen `useRef`-Anker für Settings-Inputs bleiben — wir bewegen nur den JSX-Knoten in den `Werkzeugeinstellung`-Tab. Die Engine-Anbindung in `useEffect` (Zeile ~250–500) erwartet die Refs zum Mount-Zeitpunkt; das ist mit Tabs nur dann sicher, wenn alle Settings-Panels gemountet (aber mit `hidden`/`display:none` für inaktive) bleiben — also Tabs per CSS-Sichtbarkeit, nicht per Conditional-Render.
- Sheet/Plan/Id-Panels analog: immer im DOM, Tab-Wechsel toggelt nur Sichtbarkeit.
- Druckpläne-Block bleibt strukturell wie bisher, nur Position ändert sich (unter Zeichenblätter-Tab).

---

## Out of scope
- Keine Änderungen am Verhalten der Werkzeuge oder Door/Window-Engine.
- Keine Änderungen am Persist-/Restore-Pfad.
