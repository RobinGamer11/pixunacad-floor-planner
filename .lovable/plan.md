## Ziel

Drei Erweiterungen für Projektmappe & CAD-Oberfläche:

1. **Undo/Redo für alle Aktionen** in Projektmappe (CAD hat bereits eigene History).
2. **Freies Papierformat** in Seiteneinstellung mit individueller Breite/Höhe (mm).
3. **Tablet-Hilfsrad**: umschaltbares On-Screen-Bedienrad mit RMB, LMB, SHIFT, ESC, ENTF — als Ersatz für fehlende Maus/Tastatur.

---

## 1) Undo / Redo (Projektmappe)

**Ort:** `src/lib/projectStore.ts`

- Neben `state` einen History-Stack pro Projekt: `history: { past: Project[]; future: Project[] }` (in-memory Map, nicht persistiert; letzte ~50 Zustände).
- Vor jedem projektspezifischen `setState`, das ein `Project` mutiert (updateProject, alle Seiten-/Element-/Sheets-/Mappen-Mutationen), aktuellen `Project`-Snapshot in `past` pushen und `future` leeren.
- Neue API:
  - `projectStore.undo(projectId)` — pop `past` → aktueller Zustand in `future`.
  - `projectStore.redo(projectId)`
  - `projectStore.canUndo(projectId) / canRedo(projectId)`
- Ausnahmen: reine UI-/Selection-Toggles (activeMappeId Wechsel, timelinePosition-Preview) NICHT in History.

**Ort:** `src/pages/ProjectWorkspace.tsx`

- `WorkspaceHeader` bekommt echte `canUndo/canRedo/onUndo/onRedo` (heute Dummy).
- Keyboard-Shortcuts: `Ctrl/Cmd+Z`, `Ctrl+Shift+Z` / `Ctrl+Y` — nur wenn Fokus nicht in Input/Textarea/contentEditable.

**CAD-Oberfläche:** bereits vorhanden, nichts ändern.

---

## 2) Freies Papierformat mit Breite/Höhe

**Ort:** `src/pages/ProjectWorkspace.tsx` (Seiteneinstellung, ab Zeile ~3114 `Row label="Format"`).

- Wenn `page.format === "frei"`: unter Format-Dropdown zwei Zahlfelder erscheinen lassen:
  - „Breite (mm)" → `page.customWidthMm`
  - „Höhe (mm)" → `page.customHeightMm`
- Beim ersten Umschalten auf „frei" Defaults aus `paper.ts` (400×300) übernehmen falls leer.
- Ausrichtungs-Buttons (hoch/quer) für „frei" durch einen Tausch-Button ersetzen (W↔H).
- `FORMAT_SIZES["frei"]` bleibt Fallback; überall wo `FORMAT_SIZES[page.format]` verwendet wird, stattdessen `getPageSizeMm(page)` aus `paper.ts` nutzen (bereits vorhanden). Vorkommen in `ProjectWorkspace.tsx` (`FORMAT_SIZES[...]`) migrieren.

---

## 3) Tablet-Hilfsrad

### 3a) Toggle-Button im Header

**Ort:** `src/components/workspace/WorkspaceHeader.tsx`

- Neuer Button links neben Mülltonne: `HelpCircle` (lucide) mit Tooltip „Tablet-Hilfsrad".
- Aktiv-Zustand visuell markiert (Gold-Hintergrund).
- Props: `tabletAidOn`, `onToggleTabletAid`.
- Auf CAD- und Projektmappen-Seite State im Page-Component halten (persistiert in localStorage per `projectStore` optional).

### 3b) Das Rad (neue Komponente)

**Datei:** `src/components/TabletAidWheel.tsx`

- Fixed positionierter runder Container (default unten-links, ~180 px). Per Pointer-Drag am Rand verschiebbar; Position in localStorage.
- 5 Buttons kreisförmig angeordnet mit Icons + Labels:
  - **LMB** (`MousePointer2`) — simuliert linke Maustaste
  - **RMB** (`MousePointer2` gespiegelt / Kontextmenu-Icon)
  - **SHIFT** (`ArrowBigUp`)
  - **ESC** (Text)
  - **ENTF** (`Trash2` oder Text "DEL")
- Verhalten:
  - Zwei Modi je Button: **Tap** = einmaliger Event, **Long-Press** oder aktives Halten = „gedrückt halten" (sticky). Zwei-Hände-Betrieb: Nutzer hält z. B. SHIFT-Symbol mit Finger A, zeichnet mit Finger B im Canvas.
  - Solange ein Modifier gedrückt gehalten wird, Button visuell aktiv.

### 3c) Event-Injektion

**Neues Utility:** `src/lib/virtualInput.ts`

- `pressKey(code)`: dispatched synthetisches `KeyboardEvent('keydown'/'keyup')` an `document.activeElement || document`. Für ESC (`Escape`), ENTF (`Delete`).
- `holdKey(code, on: boolean)`: für SHIFT — hält `keydown` ohne `keyup` bis release.
- `pressMouseButton(button, on)`: dispatched `pointerdown/pointerup/contextmenu` an dem Element unter dem letzten CAD-/Canvas-Zeiger. Da CAD/Projektmappe pointer-basierte Tools haben, echte `PointerEvent`s mit `bubbles: true, pointerType: 'touch', button` auslösen.
- Für RMB: auf CAD-Canvas ein `contextmenu`-Event feuern (Input.ts liest `mouse.right`); Halten setzt `mouse.right = true` per patchbarer Bridge. Einfachste Variante: `document.dispatchEvent(new MouseEvent('contextmenu', {...}))` genügt für die aktuellen Rechtsklick-Handler.
- Da Input.ts native `pointerdown/pointerup` mit `button: 2` liest, synthetisieren wir diese direkt auf das aktuelle Canvas (Ziel via `document.querySelector('canvas')` im aktiven `<main>`).

### 3d) Einbindung

- `CadPage.tsx` und `ProjectWorkspace.tsx`: `useState` für `aidOn`, Header-Toggle verdrahten, `<TabletAidWheel />` conditional rendern.

---

## Technische Details

- History-Deep-Clone via `structuredClone(project)`.
- Undo-Kappung: 50 Einträge, dann `past.shift()`.
- `page.customWidthMm/customHeightMm` sind bereits im Type vorhanden (`paper.ts` nutzt sie). Grenzen: 50–2000 mm.
- Virtual-Input-Events müssen `isTrusted=false` erlauben — unsere Handler prüfen das nicht, also OK.
- Kein neues npm-Paket nötig.

## Reihenfolge der Umsetzung

1. Freies Format (isoliert, klein).
2. Undo/Redo (Store + Header + Shortcuts).
3. Tablet-Hilfsrad (Komponente + virtualInput + Einbindung in beide Seiten).