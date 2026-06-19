# Linie 1:1 im Seiten-Canvas

Ziel: Das Werkzeug „Linie" im Seiteneditor verhält sich exakt wie in der CAD-Oberfläche — gleiches Snapping, Ortho, Hub (Längen-/Winkel-Eingabe), Punkt-Edit. Spätere Iterationen erweitern um „Text" und „Schraffur" nach demselben Muster.

## Vorgehen

### 1. CAD-Engine entkoppeln
- Neuer Einstiegspunkt `src/cad/embed/MiniCad.ts`: instanziiert die nötigen Bausteine ohne CAD-Toolbar/Side-Panels.
- Wiederverwendet 1:1: `Scene`, `Renderer`, `Camera`, `Input`, `TopologyEngine`, `LineHub`, `PointEditMenu`, `LineTool`, `snapDraw`, `geometry`, `LabelManager`.
- Mock-Implementierungen für `CadApp`-Felder, die `LineTool` anfasst, aber im Seitenkontext nicht gebraucht werden (z. B. `pipette`, `eraser`, Sheet/Plan-Manager) — als No-Op-Stubs, damit `LineTool` unverändert bleibt.
- Wichtig: `LineTool.ts` wird **nicht** verändert — die Engine-Hülle stellt dieselbe Schnittstelle bereit wie `CadApp`.

### 2. Einbettung im Seiten-Canvas
- In `PageCanvas` (innerhalb `src/pages/ProjectWorkspace.tsx`) zwei neue Layer **über** dem bestehenden Seiteninhalt:
  - `<canvas>` für die CAD-Engine (deckt das Blatt exakt ab, gleiche Pixelmaße wie die Seite ohne View-Scale)
  - DOM-Container für `LineHub` und `PointEditMenu` (die Engine erzeugt deren UI selbst)
- Kamera-Setup: 1 mm Welt = 1 mm Seite (Welt-Ursprung links oben). Kein Pan/Zoom in der Engine — der Page-Zoom skaliert den Canvas via CSS-Transform mit (gleiches `scale` wie die Seite).
- Mouse/Keyboard-Events laufen über den vorhandenen `Input`-Adapter; nur aktiv, wenn `activeTool === "line"`.

### 3. Persistenz
- Engine-Szene wird pro Seite gehalten: neues Feld `ProjectPage.cadOverlay` (serialisierte Scene als JSON) in `projectStore.ts`.
- Speichern bei jeder Commit-Aktion (Linie fertiggestellt, Punkt verschoben, gelöscht); Laden beim Seitenwechsel.
- Existierende `kind: "line"`-PageElements bleiben für nicht-CAD-Linien (z. B. künftige einfache Hilfslinien) bestehen — werden separat unter der CAD-Schicht gerendert.

### 4. Cleanup bestehender Provisorien
- Der jetzige „Klick-Klick"-Provisorischer-Linien-Modus für `activeTool === "line"` wird durch die Engine ersetzt.
- Hilfslinie (`guide`) bleibt vorerst beim bisherigen, einfachen SVG-Mechanismus (hellblau gestrichelt) — Hilfslinien sind nicht-druckend und brauchen kein CAD-Snap.

### 5. Nicht in diesem Schritt
- Text-Werkzeug und Schraffur-Werkzeug folgen in eigenen Iterationen nach demselben Muster (jeweils mit Tool-Settings-Panel im Inspector).
- CAD-Zeichenblatt-Platzierung (`cad-view`) bleibt unverändert.

## Technische Details

**Neue Dateien**
- `src/cad/embed/MiniCad.ts` — Engine-Hülle, exportiert `createMiniCad({ canvas, mmWidth, mmHeight, hubContainer, onChange })`
- `src/cad/embed/CadAppLike.ts` — Typdefinition / Stub-Felder, die `LineTool` erwartet
- `src/components/page/CadOverlayLayer.tsx` — React-Wrapper, der `MiniCad` lifecycle-managed

**Geänderte Dateien**
- `src/pages/ProjectWorkspace.tsx` — Overlay einbinden, Provisorium für `line`-Tool entfernen
- `src/lib/projectStore.ts` — `cadOverlay?: SerializedScene` an `ProjectPage`

**Risiken**
- `LineTool` greift auf viele `CadApp`-Felder zu (`hub`, `renderer`, `topology`, `labels`, `id`, `scene`, `input`, `pointEditMenu`, `pipette`, …). Jeder Zugriff muss in `MiniCad` mindestens als No-Op existieren, sonst Runtime-Fehler. Erste Implementierungsrunde wird Lücken aufdecken — kurze Korrektur-Iterationen einplanen.
- Koordinaten-Mapping: CSS-Scale auf dem Engine-Canvas darf Maus-Koordinaten nicht verfälschen — `Input` muss `getBoundingClientRect()` nutzen (tut es bereits), das die Skalierung berücksichtigt.

## Validierung
- Im Seiteneditor „Linie" aktivieren → erste Linie ziehen → Snap-Punkte erscheinen identisch zur CAD-Oberfläche → Hub erscheint mit Länge/Winkel → Eingabe & Enter committen → Linie bleibt sichtbar nach Tool-Wechsel → Seitenwechsel & Rücksprung lädt sie wieder.
- Ortho (Shift) und Punkt-Edit (Klick auf Endpunkt) wie in CAD.
