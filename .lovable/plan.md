## Ziel

1. **Text-Werkzeug 1:1** aus der CAD-Oberfläche im Seiten-Editor verfügbar machen — inklusive Snap, Guide-Anchors, Inline-Editor (contenteditable mit Bold/Italic/Color/Size/Symbol), Auto-Größe, Wrap, Hintergrund/Border-Settings.
2. **Margin-Snap** sichtbar machen: blaue Snap-Linien & Fangpunkte an *allen vier Rändern beidseitig* (außen=Seitenkante, innen=Marginkante) — Fangpunkte werden zur Zeit von Rändern und Seitenkante überdeckt, weil das CAD-Canvas exakt seitengroß ist.

## Phase D — Text-Werkzeug

### MiniCad erweitern (`src/cad/embed/MiniCad.ts`)
Bisher kennt MiniCad nur `lineTool`. Wir fügen `textTool` + `textEditor` + Selection-Modell hinzu und stubsen die übrigen CadApp-Felder, die `TextTool` / `TextEditorOverlay` lesen:

- Neue Felder: `textTool: TextTool`, `textEditor: TextEditorOverlay`, `selection: Selection|null`, `activeTool` (Pointer auf aktives Tool-Instance — wird von `TextEditorOverlay._onDocMouseDown` geprüft).
- Neue Methoden: `setSelection(sel)`, `clearSelection()`, `beginTextEdit(box)`, `getCurrentTextStyle()`, `setTextDefaults({...})`.
- Erweiterung von `setActiveTool`: zusätzlich `"text"`; aktiviert/deaktiviert `textTool`, setzt `activeTool`-Pointer.
- Renderer-Patch: `_drawTextBoxes?.()` zusätzlich im `render()` aufrufen, damit Boxen erscheinen.
- `serialize()`/`_restore()`: `textBoxes[]` mitnehmen (id, center, widthM/heightM, rotationRad, html, style, labelId).
- `_tick`: `if (activeTool === "text") textTool.update(input)`.

### DOM-Hosts (`src/components/page/CadOverlayLayer.tsx`)
- Refs + DOM für **Text-Editor**: `editor` (contenteditable div, anfangs `.hidden`), `toolbar` mit `boldBtn`, `italicBtn`, `colorInput`, `sizeSelect`, `symbolSelect`. Styles aus den Defaults der CAD-Oberfläche (kleines weißes Bar oberhalb der Box).
- Refs an `MiniCad`-Konstruktor durchreichen (neues `dom.textEditor`-Objekt).
- Neue Props: `textColor`, `textFontSize`, `textBold`, `textItalic`, `textAlpha`, `textBgColor`, `textBgAlphaPct`, `textWrap`, `textAlign`, `textBorderEnabled`, `textBorderColor`, `textBorderWidthPx`. Effect ruft `engine.setTextDefaults({...})` auf.

### UI / Werkzeugleiste (`src/pages/ProjectWorkspace.tsx`)
- `PageTool` um `"text"` (existiert) → CAD-Pfad einschlagen, nicht mehr den Legacy-`addElement("text",...)`.
- In `PageCanvas`: `activeTool === "text" ? "text" : ...` an `CadOverlayLayer` weiterreichen; pointer-events ON wenn `text` aktiv. Den alten "Text"-Klick-Handler auf der Seite entfernen, damit der CAD-Editor exklusiv reagiert.
- Werkzeugeinstellungen "Text" um die fehlenden Felder erweitern: Schriftgröße, Farbe, Bold/Italic, Ausrichtung (links/mitte/rechts), Transparenz, Hintergrundfarbe + Hintergrund-Alpha, Wrap-Toggle, Border-Toggle (mit Farbe + Breite). Alle Werte fließen via Props → `setTextDefaults`.

### Transparenz
- `defaultTextAlpha` (0..1) → bei `getCurrentTextStyle()` in `textColor` als rgba kodieren (gleicher Helper wie für Linien). Hintergrund: `textBgAlphaPct` ist bereits eigener Wert in `TextBoxStyle`.

## Phase F — Margin-Snap & Foreground

### `MiniCad._rebuildPageFrame` (4 → 8 Segmente)
Heute werden 4 unsichtbare Segmente an den Seitenkanten erzeugt. Erweiterung: **4 zusätzliche Segmente** an den Margin-Innenkanten (Position aus aktuellem `pageMarginsMm`).
- Neuer Init-Param `pageMarginsMm: number` + Methode `setPageMargins(mm)` → ruft `_rebuildPageFrame()` neu auf.
- `CadOverlayLayer` reicht `page.margins ?? 0` und aktualisiert via Effect.

### Foreground / Clipping fixen
Snap-Visualisierungen (blaue Linie + Dot) werden vom `Renderer.overlay` exakt auf dem Page-Canvas gezeichnet. Bei Edge-Snap (x=0/W bzw. y=0/H) wird der Dot zur Hälfte vom Canvas-Rand geclippt; bei Margin-Snap überdeckt zusätzlich der graue Margin-Border (`hsl(0 0% 92%)`) den Dot.

Fix-Strategie:
- **Padding ums Canvas:** `MiniCad.applyZoom` erweitert Canvas-Größe um konstante `frameSnapPaddingPx = 14` (CSS-Pixel, unabhängig vom Zoom) auf jeder Seite. Camera-Offset wird um `+padding` verschoben, sodass Weltkoordinate `(0,0)` bei `padding,padding` landet. Geometrie bleibt visuell identisch, Snap-Dots an Page-Edges sind komplett sichtbar.
- **Canvas-Sibling-Position:** `CadOverlayLayer` rendert das Canvas mit `left: -padding; top: -padding;` (statt `left:0;top:0`) und Pointer-Events bleiben am Wrapper.
- **Margin-Overlay z-Index:** Margin-Border-Div in `PageCanvas` bekommt `zIndex: 0`; `CadOverlayLayer` bekommt `zIndex: 30`. Damit liegen Snap-Visualisierungen über dem grauen Margin-Ring auf beiden Seiten der Marginkante.

## Reihenfolge

1. Phase F (klein, eigenständig, schneller Win — Frame + Margin snap + Canvas-Padding + z-Index).
2. Phase D Schritt 1: MiniCad um TextTool/TextEditor erweitern, Serialisierung, Tool-Switching.
3. Phase D Schritt 2: CadOverlayLayer DOM-Hosts, Text-Defaults-Pipe.
4. Phase D Schritt 3: ProjectWorkspace Toolbar-Werkzeugeinstellungen ausbauen, alten Text-Code im PageCanvas-Handler entfernen.
5. Manuelle Verifikation per Playwright-Screenshot: Text platzieren → editieren → Bold/Italic → Snap an Linie & Margin → Transparenz.

## Offene Frage
Alte `kind: "text"`-Elemente (Legacy `projectStore.addElement("text",...)`): bleiben **read-only sichtbar** wie bisher (`ElementView`), neue Texte werden ausschließlich als CAD-TextBoxen erstellt. Keine automatische Migration. OK?
