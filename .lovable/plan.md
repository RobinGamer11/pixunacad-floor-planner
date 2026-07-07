## Leitplanke (nicht verhandelbar)

**CAD-Oberfläche bleibt in Verhalten, Optik und Persistenz exakt wie heute.** Jede Änderung an CAD-Code ist rein struktureller Natur (Code-Extraktion in geteilte Komponenten, identische Props/Refs/Callbacks). Vor jedem Merge: die CAD-Oberfläche wird durch Sicht­kontrolle in denselben Zustand gebracht wie vorher (Werkzeuge, Hatch-Settings-Panel, floating DocHub, Undo/Redo, Zeichenblätter, Druckmodus).

## 1. Rechtes Panel — Einklappen wie linker „Seiten"-Sidebar

Aktuell hat das rechte Panel eine eigene 24 px-Griffleiste links — wirkt wie ein zweites Fenster. Der linke Sidebar in der Projektmappe (Z. 316–331 `src/pages/ProjectWorkspace.tsx`) hat den `PanelLeftClose`-Button **in der Kopfzeile** neben Titel/„+".

- **`src/pages/ProjectWorkspace.tsx` — `RightInspector`** (Z. ~1605–1626): linke Griffleiste entfernen; kleinen `PanelRightClose`-Button in die Tab-Leiste rechts neben „Ebenen" einfügen.
- **`src/components/CadEditor.tsx`** (Z. ~1517–1546): analog — linke Griffleiste entfernen, `PanelRightClose`-Button wieder in der Tab-Leiste. **Kein weiteres CAD-Verhalten ändert sich.**
- Eingeklappter Zustand (schmaler `PanelRightOpen`-Griff) bleibt unverändert.

## 2. Werkzeug-Vereinheitlichung „Linie", „Schraffur", „PDF einfügen", „Bild"

Ziel: In Projektmappe verhalten sich diese vier Werkzeuge 1:1 wie in CAD — dieselben Settings-Panels, dieselben Hub-Boxen, dieselbe Optik. **Die CAD-Oberfläche selbst bekommt dabei nur eine Umverdrahtung auf denselben Komponentenbaum, keine Funktionsänderung.**

### 2a. Bestandsaufnahme

- **Linie**: MiniCad kann es schon (`MiniTool = "line"`), Settings-UI in Projektmappe ist aber eine eigene React-Version.
- **Schraffur**: nur in CAD (`HatchTool`, 4 Draw-Modes, großes Settings-Panel).
- **PDF einfügen** / **Bild**: in CAD über `DocumentTool` + `documentImport.ts` + floating DocHub (Move/Rotate/Scale/Crop). In Projektmappe direkt via `projectStore.addElement({kind:"pdf"})`, kein Hub.

### 2b. Architektur — geteilte Komponenten & erweitertes MiniCad

**Schritt 1 — Reine Extraktion (Verhalten CAD unverändert):**
Neue Dateien unter `src/components/cad/shared/`:
- `HatchSettingsPanel.tsx` — 1:1-Extraktion des Hatch-Blocks aus `CadEditor.tsx` inkl. aller Refs, per Props reingereicht.
- `LineSettingsPanel.tsx` — 1:1-Extraktion der Linien-Einstellungen.
- `DocumentSettingsPanel.tsx` + `DocumentHubBox.tsx` — 1:1-Extraktion der PDF/Bild-Panels und der floating Hub-Box (Z. 1213 ff. + `docHub*`-States).

`CadEditor.tsx` wird darauf umgestellt und danach visuell/funktional gegengeprüft (Sichtkontrolle in Preview, Undo/Redo/Selektion/Hub testen). Diese Phase darf **keine** Änderung an CAD-Verhalten bringen.

**Schritt 2 — MiniCad erweitern:**
- `MiniTool` in `src/cad/embed/MiniCad.ts` um `"hatch" | "document"` erweitern.
- `HatchTool` und `DocumentTool` (aus `src/cad/`) an die MiniCad-`Scene`/`Renderer` hängen (dieselbe Engine wie CAD).
- `MiniCad.beginDocumentImport(file)` ruft `importFile` aus `documentImport.ts` und delegiert an `DocumentTool.beginPlacement`.
- Persistenz: neue Objekte werden über den bestehenden `MiniCad.onChange`-Serialisierer in den Page-State geschrieben (wie schon bei Linien).

**Schritt 3 — Projektmappe verdrahten:**
- `PageTool` (in `ProjectWorkspace.tsx`, Z. 78) um `"hatch" | "document"` erweitern.
- Buttons „Schraffur", „PDF einfügen", „Bild":
  - Schraffur → `setActiveTool("hatch")`.
  - PDF / Bild → Datei-Picker (PDF bzw. `image/png,image/jpeg`) → `miniCadRef.current?.beginDocumentImport(file)`.
- `RightInspector` rendert je nach aktivem Werkzeug / Selektion die shared Panels (`HatchSettingsPanel`, `DocumentSettingsPanel`, `LineSettingsPanel`) — dieselben Komponenten, die auch die CAD-Oberfläche nutzt.
- `CadOverlayLayer` reicht die neuen Tools und die Hub-Box-DOM-Refs durch.

**Rückwärtskompatibilität:** bestehende `kind:"pdf"` / `kind:"image"` React-Elemente in gespeicherten Projekten rendern wie bisher. Nur **neu** eingefügte PDFs/Bilder in der Projektmappe laufen über die CAD-Engine.

### 2c. Tool-Rail-Optik in Projektmappe

„Linie / Schraffur / PDF einfügen / Bild" bekommen `showLabel` und die gleiche Reihenfolge/Trennlinien wie das CAD-Rail — CAD-Rail selbst unverändert.

## Reihenfolge & Verifikation

1. Punkt 1 (Panel-Toggle) — sofort. CAD-Sichtkontrolle: Panel öffnet/schließt, Tabs & Druckmodus wie vorher.
2. Punkt 2 in drei Etappen, nach jeder Etappe CAD-Oberfläche prüfen:
   1. Extraktion in shared Komponenten (kein Verhaltenswechsel).
   2. MiniCad erweitern (nur additive Änderungen).
   3. Projektmappen-Werkzeuge anschließen, RightInspector auf shared Panels umstellen.

## Technische Details

- Neue Dateien: `src/components/cad/shared/{HatchSettingsPanel,LineSettingsPanel,DocumentSettingsPanel,DocumentHubBox}.tsx`.
- Betroffen: `src/cad/embed/MiniCad.ts`, `src/components/page/CadOverlayLayer.tsx`, `src/components/CadEditor.tsx`, `src/pages/ProjectWorkspace.tsx`.
- Keine Änderungen an `projectStore`-Schema; alte Elemente bleiben lauffähig.
- Keine Änderungen an CAD-Persistenz oder CAD-Sheet-Manager.
