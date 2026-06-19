## Ziel

Im Seiteneditor (`ProjectWorkspace`) erhält der Tab **„Werkzeug"** (rechts neben „Seiteneinstellung") vier Werkzeuge: **Hilfslinie, Linie, Text, CAD**. Linie/Text/Schraffur sollen funktional 1:1 zur CAD-Oberfläche sein. CAD bettet ein vorhandenes Zeichenblatt als platzierbares Element ein.

## Realitäts-Check (wichtig)

Die CAD-Engine (`src/cad/CadApp.ts`, 2766 Zeilen) ist eng an die Vollbild-CAD-Oberfläche gekoppelt: sie erwartet eigene DOM-Panels (Linien-, Hatch-, Text-Settings, IdPanel, SheetPanel, PlanPanel, TextEditorOverlay), eigene Toolbar, ein eigenes Canvas, eigene Tastaturhooks (Strg+Z, P, H, T, L …) und globale Maus-/Touch-Listener.

**„1:1 wie in CAD"** heißt deshalb realistisch: die CAD-Engine wird in einem **Container über dem Seiten-Canvas** instanziiert — nicht in einer separat reimplementierten Version. Die Zeichnung wird als CAD-Szene gespeichert (eigener Layer pro Seite) und bei der Druckansicht in Seitenkoordinaten gerendert.

## Schritte

### 1. Werkzeug-Tab umbauen (`src/pages/ProjectWorkspace.tsx`)
Vier Sektionen statt der heutigen Element-Auswahl:

```text
WERKZEUG
┌──────────────────────────────────┐
│ [ Hilfslinie ] [ Linie ]        │
│ [ Text      ] [ CAD   ]         │
└──────────────────────────────────┘
+ aktive Tool-Sektion darunter
```

Auswahl setzt `activeTool: 'guide' | 'line' | 'text' | 'cad' | null` im Workspace-State; der Seiten-Canvas reagiert darauf.

### 2. Hilfslinie (`guide`)
- Neuer Element-Typ `guide` in `projectStore.ts` (Polyline in mm, Stil hellblau gestrichelt).
- Im Seiten-Canvas: gleiche Zeichenmechanik wie „Linie" (Click-Click), aber gerendert als `<svg>`-Polyline `stroke="#7DD3FC" stroke-dasharray="6 4"`.
- Wird in einer späteren `print`/`export`-Ansicht ausgeblendet (Flag `nonPrinting: true`).

### 3. Linie / Text / Schraffur — CAD-Engine einbetten
- Neues Feld `ProjectPage.cadOverlay?: CadSceneJson` (serialisierte Scene; nutzt vorhandenes Scene-Snapshot-Format).
- Neue Komponente `PageCadOverlay` mountet ein eigenes `<canvas>` über dem Seiten-Canvas (gleiche Pixel-Größe, gleiche `mmToPx`-Skala) und instanziiert `new CadApp(canvas, …)`.
- `CadApp`-Kamera wird so initialisiert, dass mm-Welt 1:1 zum Seiten-mm passt; Panning/Zoom des CAD wird deaktiviert (Zoom kommt vom Seiten-Zoom).
- Tool-Auswahl im Werkzeug-Tab triggert `cadApp.activateTool(ToolIds.LINE | TEXT | HATCH)`.
- Die nötigen DOM-Panels (Line/Text/Hatch-Settings) werden in den Werkzeug-Tab rechts gerendert (versteckte Container, die `CadApp` als Refs bekommt) — so funktionieren ID-Wahl, Farben, Größen 1:1.
- Auf `cadApp`-Änderungen wird Scene serialisiert und in `projectStore.updatePage(..., { cadOverlay })` gespeichert.

**Hinweis:** Wenn der Aufwand zu groß wird, sage Bescheid — dann liefere ich erst Hilfslinie + CAD-Blatt (Schritt 5) aus und Linie/Text/Schraffur in einer zweiten Iteration.

### 4. Werkzeug-Sektionen rechts
- Bei aktivem Tool wird unter den vier Buttons die zugehörige CAD-Settings-Panel-DOM eingeblendet (versteckte Refs aus Schritt 3) — Layout an PixunaCAD-Helligkeit angepasst.

### 5. CAD-Werkzeug (Zeichenblatt platzieren)
- Section „CAD" im Werkzeug-Tab:
  - Oben Button **„Zur CAD-Oberfläche →"** → `navigate('/project/<id>/cad')`.
  - Dropdown **„Zeichenblatt"** aus `project.sheets`.
  - Maßstab-Anzeige (read-only aus Sheet) + Button **„Auf Seite einfügen"** → erstellt `PageElement { kind: 'cad-view', sheetId, scale, snapshot }` in `activePage`.
- Unter dem Dropdown: Liste der **bereits eingefügten** CAD-Blätter dieser Seite. Jede Zeile:
  - Vorschau-Thumbnail des Sheets (klein), Sheet-Name, aktueller Maßstab.
  - Inputs: Maßstab (`1:50`, `1:100`, …) bearbeitbar pro Instanz.
  - Symbol **Aktualisieren** (Refresh-Icon) → kopiert aktuellen Sheet-Stand neu, Maßstab bleibt.
  - Klick auf Zeile → selektiert das CAD-Element auf der Seite (kein Sprung zur CAD-Oberfläche; gemäß Antwort).
- Auf der Seite wird das CAD-View 1:1 im gewählten Maßstab gerendert (mm-Welt aus Sheet × 1/Scale × `mmToPx`).

### 6. Speicher-Schema (`src/lib/projectStore.ts`)
```ts
ElementKind += 'guide'
interface PageElement {
  // bestehend …
  scale?: string;      // CAD-View
  cadSnapshot?: any;   // CAD-View: serialisierte Scene-Kopie
  points?: {x:number;y:number}[]; // guide
  nonPrinting?: boolean;
}
ProjectPage.cadOverlay?: any;   // optionale eingebettete CAD-Scene (Schritt 3)
```
Plus Store-Helfer: `updateCadElement(projectId, pageId, elementId, patch)`, `refreshCadElement(projectId, pageId, elementId)`.

## Was bleibt unangetastet
- Linkes Tool-Rail (Großbuttons) und CAD-Oberfläche selbst.
- Bestehende Seiten-, Zoom-, Lochungs-, Margin-Logik.
- Alle nicht genannten Bereiche von `ProjectsHome.tsx`.

## Offene Frage / Risiko
Punkt 3 (CAD-Engine in den Seiten-Canvas einbetten) ist der mit Abstand größte Brocken — die Panels müssen mit gerendert werden, sonst funktionieren ID-Auswahl/Farbe/Schraffur-Settings nicht. Ich starte mit Schritten 1, 2, 5, 6 (sofort sichtbarer Mehrwert) und ziehe Schritt 3 in einer Folgeiteration nach, sofern du nicht aktiv „alles in einem Rutsch" wünschst.
