
## Ist-Zustand (kurz)

- **CAD-Modell**: bereits 1:1 in Welt-Metern gespeichert (`Camera.scale` ist nur px/m fürs Zeichnen). ✅ passt konzeptionell, muss nur unangetastet bleiben.
- **Seiten**: `ProjectPage.format` ist ein Label (`"A3-quer"`), das erst zur Renderzeit über `FORMAT_SIZES` in mm aufgelöst wird. Element-Koordinaten (`x/y/w/h`) sind in **Prozent der Seite**, nicht in mm.
- **CAD-Blatt-Einfügen**: erzeugt ein `cad-view`-Element mit `viewSnapshot` (PNG) + `scale`-String. Kein echter Viewport (kein Modellmittelpunkt, keine Rotation, keine Layer, kein Live-Ausschnitt) — beim Maßstabswechsel wird nur das Bild neu skaliert bzw. neu exportiert.
- **PDF-Export der Projektmappe** (`projectPdfExport.ts`): rastert die Seite über `pxPerMm` und packt sie in ein mm-PDF. Größe stimmt zwar, aber Vektor-CAD-Inhalt wird als Bitmap ausgegeben, und die Viewport-Skala steckt nur im vorab erzeugten Snapshot.
- **Bildschirmdarstellung**: `pxPerMm = (1100 / refFmt.w) * (zoom/100)` — Bildschirmzoom und mm sind zwar getrennt, aber Elemente rechnen intern in %.

Damit erfüllt das Projekt die geforderte Trennung nur teilweise: Paper-Maßstab wirkt heute als *Snapshot-Skalierung*, nicht als lebender Viewport.

## Ziel

Layout-/Paper-Space-Verhalten wie in Archicad/AutoCAD:

1. Seiten & alle Seitenelemente intern in **Papier-mm**.
2. CAD-Blätter als **echte Viewports** mit `{xMm, yMm, wMm, hMm, scaleDen, modelCenter{xM,yM}, rotationDeg, visibleLayers?}`.
3. Maßstab **nur** zwischen Papier-mm und Modell-m (`modelLenM = paperLenMm * scaleDen / 1000`).
4. Bildschirmzoom (`pxPerMm`) rein für die Darstellung; ändert den CAD-Maßstab nie.
5. PDF-Export in echten mm; Viewport rendert sein Modell-Fenster direkt (kein globales Canvas-Scale).
6. Maßstab ändern → Viewport-Rahmen bleibt auf Papier gleich groß, sichtbarer Modellausschnitt ändert sich um Mittelpunkt.

## Umsetzung (in dieser Reihenfolge, jede Stufe unabhängig lauffähig)

### Stufe 1 — Papierformat & mm-Basis konsolidieren

- `src/lib/paper.ts` (neu): kanonische Formatliste (`A0–A4`, hoch/quer, `frei`), `getPageSizeMm(page) → {wMm, hMm}` inkl. `page.customWidthMm/customHeightMm` für `"frei"`. `ProjectPage` bekommt optional `customWidthMm/customHeightMm`.
- `FORMAT_SIZES` in `ProjectWorkspace.tsx` und `projectPdfExport.ts` durch diese eine Quelle ersetzen.
- **Kein** Schema-Bruch für bestehende Seiten: Alt-Format-Labels bleiben gültig.

### Stufe 2 — Elementkoordinaten in mm (mit Migration)

- `PageElement` bekommt kanonisch `xMm, yMm, wMm, hMm` (Nummer). Legacy `x/y/w/h` (%) bleiben lesbar.
- Loader-Migration in `projectStore`: fehlt `xMm`, aus (`x%`, `format`) einmalig berechnen und in-place speichern. Danach schreibt UI nur noch mm.
- Alle Lese-/Schreibstellen in `ProjectWorkspace.tsx` (Drag, Resize, Selection-Marquee, Snap-Rechnungen, Guides, `runDeleteSelection`, Punch-Layout) auf mm umstellen. `pxPerMm` bleibt nur der Bildschirm-Transformer.

### Stufe 3 — CAD-Viewport-Datenmodell

- Neuer Elementtyp `"cad-viewport"` (in `ElementKind`) mit Feldern:
  ```ts
  scaleDen: number;              // 100 für 1:100
  modelCenter: { xM: number; yM: number };
  rotationDeg: number;
  visibleLayers?: string[];      // reserviert
  sheetId: string;               // welches CAD-Blatt/Scene
  ```
  Legacy `"cad-view"`-Elemente werden beim Laden gemappt (Snapshot bleibt als Fallback-Thumbnail erhalten, `scale`-String → `scaleDen`; `modelCenter` aus Snapshot-Metadaten bzw. Scene-Bounds).
- `Sheet` erhält optional `defaultScaleDen` (aus altem `scale`-String migriert).

### Stufe 4 — Live-Renderer für Viewports (Bildschirm)

- `src/components/page/CadViewportView.tsx` (neu, ersetzt in Stufe 5 das PNG-basierte `cad-view`-Rendering):
  - Berechnet sichtbaren Modellbereich: `modelWm = wMm * scaleDen / 1000`, `modelHm = hMm * scaleDen / 1000`.
  - Rendert die Scene direkt in ein Offscreen-Canvas der Größe `wMm * pxPerMm × hMm * pxPerMm` mittels bestehender Renderer-Bausteine (`Renderer`, `Scene`) — Kamera wird pro Viewport aus `modelCenter`, `scaleDen` und Ziel-Canvas-Größe abgeleitet, **nicht** aus dem Editor-Zustand.
  - Kein CSS-Transform-Zoom; Änderungen am Seitenzoom triggern nur neues Rendern mit anderem `pxPerMm`.
- Übergangs-Fallback: fehlt die Scene, wird der bisherige `viewSnapshot` als Bild angezeigt.

### Stufe 5 — Interaktionen am Viewport

- **Rahmen skalieren** (Drag am Handle): ändert `wMm/hMm`, nicht `scaleDen`. Modellausschnitt wächst/schrumpft entsprechend.
- **Maßstab ändern** (Inspector-Dropdown): ändert nur `scaleDen`; `modelCenter` bleibt; `wMm/hMm` bleiben. Vorschau/PDF zeigen sofort neuen Ausschnitt.
- **Pan innerhalb des Viewports** (Alt-Drag oder eigener Handle): verschiebt `modelCenter`. Klare UX-Trennung zu „Viewport auf Seite verschieben“.
- Rotation: bestehender `rotation`-Griff schreibt `rotationDeg`.

### Stufe 6 — Aus CAD-Oberfläche einfügen (Ersatz für Snapshot-Pipeline)

- `CadPage.confirmSheetPdf`: statt `canvasRegionToPdfBytes` + PNG-Snapshot künftig `stashPendingSheetPdf({ mode, viewportSpec: { xMm, yMm, wMm, hMm, scaleDen, modelCenter, rotationDeg } })`.
  - Für `mode: "view"`: `wMm/hMm` aus aktueller Canvas-CSS-Größe und Kamera-Maßstab → Papier-mm; `modelCenter` aus Kamera-Offset.
  - Für `mode: "frame"`: analog aus dem aufgezogenen Rahmen.
- `ProjectWorkspace.tsx` Import-Pipeline (~Zeile 480) legt statt `cad-view`-PNG ein `cad-viewport`-Element an. PNG-Snapshot bleibt optional als Vorschau, bis der Live-Renderer greift.

### Stufe 7 — PDF-Export in echten mm

- `projectPdfExport.ts`:
  - Seitenpapier aus Stufe 1 (mm).
  - Elemente nach Kind:
    - Text/Shape/Line/Guide: direkt in mm-Koordinaten via pdf-lib (kein Bitmap-Detour).
    - Bild/PDF: `drawImage`/eingebettete PDF-Seite in mm-Box.
    - `cad-viewport`: rendert Scene in `wMm × hMm` mit hoher DPI (z. B. 300 dpi = `wMm/25.4*300` px) und bettet als Bitmap ein — oder ideal via Vector-Draw ins PDF, falls Renderer eine PDF-Ausgabe unterstützt (kann in einem Folgeschritt kommen).
  - Kein `fit to page`, keine Nachskalierung. Jede Seite wird als exakt `wMm × hMm` PDF-Seite ausgegeben (bereits vorhandenes MM_TO_PT bleibt).
- Druckhinweis in der Print-Dialog-UI: „Skalierung: Tatsächliche Größe (100 %)".

### Stufe 8 — Aufräumen

- Alten `cad-view`-Renderpfad entfernen, sobald Migration + Live-Renderer stabil.
- README / Memory: „Alle Seiten- und Viewport-Koordinaten sind in Papier-mm; Maßstab nur zwischen Papier-mm und Modell-m; Bildschirmzoom ist reine Darstellung."

## Technische Kernformeln

```text
modelLenM   = paperLenMm * scaleDen / 1000
paperLenMm  = modelLenM * 1000 / scaleDen
viewport.modelWm = viewport.wMm * scaleDen / 1000
screenPx    = mm * pxPerMm             // nur Darstellung
pdfPt       = mm * 72 / 25.4           // Export
```

## Nicht im Scope

- Änderungen an der CAD-Oberfläche selbst (bleibt 1:1 in Metern).
- Neue Layer-Verwaltung (`visibleLayers` nur Feld reserviert).
- Vektor-PDF-Ausgabe der CAD-Szene (Stufe 7 nutzt zunächst hochaufgelöste Bitmap-Einbettung im mm-Rahmen — messbar korrekt, nur nicht selektierbar).

## Offene Frage vor Umsetzung

Migration bestehender Projekte: Sollen alte `cad-view`-PNG-Snapshots erhalten bleiben (als Fallback-Vorschau bis der Live-Viewport erstmals rendert), oder beim ersten Öffnen automatisch durch echte Viewports ersetzt und der Snapshot verworfen werden? Empfehlung: Snapshot behalten, bis Nutzer den Viewport interaktiv anfasst.
