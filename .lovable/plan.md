## Ziel
PDFs im CAD-Canvas sollen bei jedem Zoom gestochen scharf bleiben (wie in Adobe), inklusive aktiver Farb-Filter.

## Was heute passiert
- Jede PDF-Seite wird als **ein einziges Raster-Bitmap** pro Dokument gecached (`_pdfAdaptiveCache` in `Renderer.ts`).
- Neu-Rasterung nur, wenn Zoom > 25 % nach oben oder < 40 % nach unten aus dem letzten Render springt.
- Hartes Cap: max. **6000 px** pro Kante — bei starkem Zoom skaliert das Bitmap hoch → sichtbare „Partikel/Pixel".
- Filter (`_getFilteredBitmap`) arbeitet auf genau diesem Basis-Bitmap → erbt dieselbe Unschärfe.
- Keine `imageSmoothingQuality`-Einstellung.

## Neue Strategie: Viewport-Tile-Rendering

Statt eines Vollseiten-Rasters wird **nur der aktuell sichtbare Ausschnitt** jedes PDFs bei der tatsächlichen Bildschirm-Pixeldichte gerendert. Das ergibt Adobe-ähnliche Schärfe unabhängig vom Zoom, ohne Speicher zu sprengen.

### Ablauf pro PDF-Dokument, pro Frame
1. Basis-Bitmap (niedrige Auflösung, ganze Seite) bleibt als **Fallback** erhalten und wird sofort gezeichnet — nie leere Fläche beim Panning.
2. Aus Kamera-Viewport + Doc-Rotation den in PDF-Punkten sichtbaren Rechtecks-Ausschnitt (`clipRect`) berechnen.
3. Ziel-Auflösung des Tiles = `clipRect_screen_px × devicePixelRatio`, gedeckelt (z. B. 4096² pro Tile, sonst in bis zu 4 Kacheln aufgeteilt).
4. Debounced (~120 ms nach Zoom-/Pan-Ende) `pdfjs.page.render()` mit `viewport = page.getViewport({ scale, offsetX, offsetY })` in ein Offscreen-Canvas.
5. Fertiges Tile wird gecached mit Key = `docId|clipRect|zoom-bucket`; LRU max ~6 Tiles pro Dokument.
6. Beim nächsten Draw: erst Fallback, dann passendes Tile über die exakte Region gezeichnet → scharfe Kanten.
7. Filter (`applyFilterToCanvas`) wird auf **jedes Tile** angewandt und im selben Cache-Eintrag gehalten (Key erweitert um Filter-Signatur).

### Renderer-Anpassungen
- `ctx.imageSmoothingEnabled = true` + `imageSmoothingQuality = "high"` beim Zeichnen von Dokumenten.
- `_getDocAdaptiveBitmap`: bleibt als Low-Res-Fallback (Cap z. B. auf 3000 px reduziert, spart Speicher).
- Neuer `_getDocViewportTile(doc, viewport)`-Pfad in `_drawSingleDocument` ersetzt den bisherigen Draw des Vollseiten-Rasters, sobald ein passendes Tile fertig ist.
- Cache-Invalidierung bei: Filter-Wechsel, Opacity spielt keine Rolle (`globalAlpha` reicht), Doc-Rotation und -Größe fließen in den Key ein.

### pdfjs-Nutzung
- `renderPdfPageToCanvas` in `documentImport.ts` bekommt eine Variante `renderPdfPageRegionToCanvas(sourceB64, pageIndex, targetWidthPx, targetHeightPx, offsetPt, sizePt)` — nutzt `getViewport({ scale, offsetX, offsetY })` und den `intent: "display"`-Render-Task.
- Laufende Renderings werden bei neuem Zoom via `renderTask.cancel()` abgebrochen, damit sich Requests nicht stauen.

### Sicherheitsnetze
- Maximal 1 aktiver Render-Task pro Dokument gleichzeitig.
- Bei extrem tiefem Zoom (Tile-Zielauflösung > 4096) automatische 2×2-Kachelung.
- Beim Panning ohne Zoomänderung wird nur nachgerendert, wenn der neue Sichtausschnitt > 25 % außerhalb des zuletzt gerenderten Tiles liegt.

## Betroffene Dateien
- `src/cad/Renderer.ts` — neuer Tile-Cache, angepasstes `_drawSingleDocument`, Smoothing-Setting.
- `src/cad/documentImport.ts` — neue Region-Render-Funktion, Render-Task-Handle für Cancel.
- `src/cad/constants.ts` — neue Defaults: `documentTileMaxPx = 4096`, `documentFallbackMaxPx = 3000`, `documentTileDebounceMs = 120`.

## Nicht Teil dieses Plans
- Vektor-Overlay (SVG/DOM-Layer) — würde Interaktion und Filter deutlich verkomplizieren.
- Änderungen am „Auflösen"-Workflow (`pdfVectorExtract.ts`).
- Änderungen am Bild-Rendering (JPG/PNG) — die sind bereits pixelgenau.