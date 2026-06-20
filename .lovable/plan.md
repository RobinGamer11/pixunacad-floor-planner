## Ziel

CAD-Blatt, PDF und Bild als vollwertige CAD-Objekte auf der Seite — mit Snap, Hilfslinien-Erzeugung, einheitlicher Hub-Box und Kanten-Drag wie beim Schraffur-Werkzeug. Zusätzlich „Duplizieren" für Linien und Hilfslinien.

## Was heute existiert

- `cad-view` (CAD-Blatt), `pdf`, `image` sind reine HTML-Boxen in `ProjectWorkspace.tsx` (Prozent-Koordinaten in `PageElement`).
- Snap-Provider (Rahmen, Seitenrand, Linien, Hatches) leben in `MiniCad`/`TopologyEngine`. Page-Elements sind dort unbekannt → keine Snap-Punkte/-Linien, kein Rechtsklick-Hilfslinien-Toggle.
- Hub-Box (Verschieben / Drehen) existiert nur in `MiniCad` für Segmente/Hatches/Text/Sticker. Page-Elements haben eigene React-Resize/Move-Handles (anderes Bedien-Modell).
- Schraffur-Edge-Drag (`HatchTool._dragEdge`) zieht eine ganze Kante ohne Eckpunkte zu verschieben.
- Linien / Hilfslinien Inspector hat: Farbe, Stärke, Mittelpunkt, Teilung — aber kein „Duplizieren".

## Umfang

### 1. Page-Elements als Snap-Provider in MiniCad

Neue API in `MiniCad`: `setExternalRects(rects: ExternalRect[])` mit
`{ id, kind: "cad-sheet" | "pdf" | "image", xMM, yMM, wMM, hMM, rotationRad }`.

`TopologyEngine` bekommt eine zusätzliche Quelle „external rects":
- Snap-Punkte: 4 Ecken + Mittelpunkt (+ optional 4 Kantenmitten).
- Snap-Linien: 4 Kanten (für Achsen-/Lot-Snap, wie Seitenrahmen).
- Label-ID-Schema: `__ext_rect_<id>__`, ausgenommen von normaler Auswahl (analog `__page_frame__`).

`ProjectWorkspace` ruft `setExternalRects` immer dann auf, wenn Page-Element-Liste sich ändert (`useEffect` über `activePage.elements`).

Rechtsklick-Hilfslinie auf einem Ecken-/Mittel-Snap funktioniert dann automatisch über die bestehende `_toggleGuideAnchorFromSnap`-Logik im `LineTool`/Right-Click-Path.

### 2. Einheitliche Hub-Box für CAD-Blatt / PDF / Bild

Ziel: gleiches Aussehen + Aktionen wie bei CAD-Objekten (Verschieben, Drehen, Duplizieren).

Implementierungsweg:
- Hub-Box bleibt React-DOM (passt zu den HTML-Boxen). Wir vereinheitlichen Optik mit der CAD-Hub-Box (gleiche Buttons/Icons/Farben — Quelle: `MiniCad`-Hub-Box-Styles).
- Buttons: `Verschieben` (Drag aktiv, schon vorhanden), `Drehen` (mit Eckhandle → Winkel), `Duplizieren` (neues `PageElement` mit +12 px Offset), `Löschen` (vorhanden).
- Rotation existiert teils schon (`rotation` auf PageElement). Wir setzen ein dediziertes Rotation-Handle wie in MiniCad.
- Hub-Box-Komponente neu: `src/components/page/ElementHubBox.tsx`, gemeinsam genutzt von `cad-view`, `pdf`, `image`.

### 3. Kanten-Drag wie Schraffur

In `ElementHubBox`: zusätzliches Hover-Highlight + Drag-Handle entlang jeder der 4 Kanten — Drag mutiert nur diese Kante (Breite/Höhe + ggf. Position).
- Top-Edge zieht ändert `y` + `h`.
- Right-Edge ändert `w`.
- Bottom-Edge ändert `h`.
- Left-Edge ändert `x` + `w`.
Snap an MiniCad-Snap-Punkte (über vorhandene MiniCad-Snap-API, falls erreichbar; sonst freier Drag mit Pixel-Snap auf MM-Raster). Verhalten orientiert sich an `HatchTool._dragEdge` aber für achsenparallele Rechtecke.

### 4. „Duplizieren" für Linien und Hilfslinien

- Im Inspector-Panel von Linie und Hilfslinie neuer Button „Duplizieren" (gleiches Icon wie bei der neuen Hub-Box).
- Aktion: in `MiniCad` neue Methode `duplicateSelection()` → erzeugt Kopie des/der selektierten Segmente mit +5mm Versatz in X/Y, übernimmt `labelId`, `midpointSnap`, `divisionSnap`, Farbe, Stärke. Selektion wechselt auf die Kopie.

## Technische Details

### Geänderte/Neue Dateien

- `src/cad/embed/MiniCad.ts` — `setExternalRects()`, `duplicateSelection()`, Snap-Filter für `__ext_rect_*`.
- `src/cad/TopologyEngine.ts` — externe Rechtecke in Snap-Quelle einbeziehen.
- `src/cad/SelectTool.ts` — `__ext_rect_*` aus Auswahl filtern (wie Page-Frame).
- `src/cad/Scene.ts` — `duplicateSegments(ids)` Helper (Geometrie-Kopie).
- `src/components/page/CadOverlayLayer.tsx` — neue Prop `externalRects`, durchreichen an Engine; `onEngineReady`-API um `duplicateSelection` erweitert.
- `src/components/page/ElementHubBox.tsx` — neue Komponente.
- `src/pages/ProjectWorkspace.tsx`
  - `cad-view`, `pdf`, `image` rendern mit `ElementHubBox`.
  - `externalRects` aus `activePage.elements` ableiten, Px → MM mit Page-Format.
  - Inspector für Linie/Hilfslinie: Duplizier-Button.

### Koordinaten

- Page-Elements: Prozent von Seite. MiniCad arbeitet in MM. Umrechnung über bestehende Page-Format-Helpers (`pageMmDims(format)`) in `ProjectWorkspace`.

## Reihenfolge

1. `duplicateSelection` + Inspector-Button (klein, sofort testbar).
2. `ElementHubBox` ohne Edge-Drag — Buttons (Move, Rotate, Duplicate) für `cad-view`/`pdf`/`image`.
3. Edge-Drag in `ElementHubBox`.
4. Externe Rects → MiniCad Snap.

Frage: OK so umsetzen, oder zuerst nur Teil 1+2 (kleinste, sofort sichtbare Verbesserungen), und 3+4 separat?
