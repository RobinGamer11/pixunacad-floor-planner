# CAD-Blatt: Default-Sheet + Live-Referenz mit exaktem Maßstab

## Ziel
Das Werkzeug „CAD-Blatt" in der Projektmappe soll (a) auch das Default-Zeichenblatt anbieten und (b) eine **lebende Referenz** auf die Original-Vektorgeometrie sein – ohne Bitmap-Zwischenschritt, ohne Fit-to-Frame, mit mathematisch exaktem Maßstab.

## Änderungen

### 1. Default-Sheet freigeben
`src/components/CadEditor.tsx` (Zeile 680) filtert `s.id !== "default-sheet"` beim Sync in `projectStore`. Dieser Filter wird entfernt, damit auch das Default-Blatt in `project.sheets` landet und im „CAD-Blatt"-Dropdown auswählbar wird. Der Löschschutz bleibt in `SheetManager.deleteSheet` (mindestens ein Blatt erforderlich) unverändert.

### 2. Live-Scene-Persistenz statt Snapshot
Bisher wird pro Sheet nur ein JPEG-`thumbnail` in `project.sheets[i].thumbnail` gespeichert; das `cad-viewport`-Element hält `viewSnapshot` als DataURL und `CadViewportView` skaliert dieses Bild via `object-contain` in den Rahmen → dadurch entsteht die falsche Skalierung.

Neu:
- `Sheet` in `src/lib/projectStore.ts` bekommt ein Feld `sceneJson?: string` (serialisierte Szene aus `CadApp._serializeScene`), das bei jedem `persist()` in `CadEditor` mitgeschrieben wird.
- Das Thumbnail bleibt nur noch als optionale UI-Preview für Listen (SheetPanel, Blatt-Auswahl); es wird **nie** für den Viewport-Render verwendet.
- `PageElement` (kind `cad-viewport`) speichert ausschließlich Referenzdaten: `sheetId`, `scaleDen`, `modelCenterM`, `viewportRotationDeg`, `visibleLayers`, `lastSyncAt`. `viewSnapshot` wird für neue Elemente nicht mehr geschrieben (Legacy-Feld bleibt lesbar für Altdaten).

### 3. Exakte Maßstabsberechnung im Viewport
`src/components/page/CadViewportView.tsx` wird umgebaut:
- Ermittelt Rahmengröße in **Papier-mm** aus `element.wMm/hMm` (Fallback aus `w/h` × Seitenformat).
- Berechnet den sichtbaren Modellausschnitt exakt: `modelWmm = wMm * scaleDen`, `modelHmm = hMm * scaleDen` (entspricht `wMm/1000 * scaleDen` in Metern).
- Rendert die Szene über eine neue Funktion `renderSceneRegionToCanvas(sceneJson, centerM, modelWm, modelHm, rotationDeg, pxPerMm)` in ein Offscreen-Canvas. Die Pixelauflösung dient nur der Bildschirmdarstellung – der Weltausschnitt ist unabhängig davon.
- Kein `object-contain`, kein `background-size: contain`; der Renderer füllt den Rahmen 1:1.

### 4. Renderer-Hilfsroutine
Neue Datei `src/cad/SceneRegionRenderer.ts`:
- Lädt/Deserialisiert `sceneJson` in eine transiente `Scene`.
- Instanziert einen `Renderer` mit einer virtuellen Kamera, die zentrum + Weltmaße + Rotation exakt abbildet (nutzt die vorhandenen Layer-Zeichenroutinen aus `Renderer.ts`).
- Zeichnet in ein `HTMLCanvasElement`, das `CadViewportView` per `useEffect` in einem `<canvas ref>` ausgibt.
- Ergebnis wird gecached pro (sheetId, sceneHash, viewport-params) und bei `lastSyncAt`-Änderung invalidiert.

### 5. Manuelle & automatische Aktualisierung
- Der „Aktualisieren"-Button (Refresh-Icon in `CadToolSection`) setzt nur noch `lastSyncAt = now()` und triggert damit den Re-Render (kein Snapshot-Kopieren mehr).
- Optional automatisch: wenn `project.sheets[i].sceneJson` sich ändert, invalidiert der Renderer-Cache und alle Viewports auf dieses Sheet werden neu gezeichnet.

### 6. Skalen-Nachbearbeitung
Das Maßstab-Dropdown im rechten Panel schreibt weiterhin `scale`/`scaleDen` in das Element. Da der Viewport den Maßstab live aus diesen Feldern berechnet, wirkt jede Änderung sofort ohne erneuten Import. Rahmen-Ecken-Handles verändern nur `wMm/hMm` (Papier-Ausschnittsgröße), niemals `scaleDen` – dadurch bleibt „1 mm Papier = scaleDen mm Modell" invariant.

### 7. PDF-Export
`src/lib/projectPdfExport.ts` und `sheetPdfExport.ts` rendern CAD-Viewports über dieselbe `renderSceneRegionToCanvas`-Route mit einer sehr hohen `pxPerMm`-Auflösung – jedoch weiterhin ohne „Fit-to-Page". Die Ziel-mm-Fläche wird 1:1 in die PDF-mm-Fläche übernommen. Kein `scale`-Flag beim Einbetten, keine Seitenskalierung.

## Technisches Detail

- **Kernformel:** `paperMm * scaleDen = modelMm` (bzw. `modelM = paperMm * scaleDen / 1000`). Diese ist bereits an einigen Stellen implementiert und wird zur alleinigen Wahrheit gemacht.
- **Bitmap-Verbot:** `viewSnapshot` wird bei neuen Elementen nicht mehr gesetzt; `CadViewportView` verwendet es nur, wenn `sceneJson` fehlt (Altdaten-Fallback) – und markiert dann sichtbar „Legacy-Snapshot".
- **Cache-Key:** Hash aus `sceneJson.length + updatedAt`, damit große Szenen nicht bei jedem Frame neu serialisiert werden.
- **Rotation:** Vor dem Zeichnen der Szene in Renderer-Koordinaten (nicht per CSS-Transform des Ausgabe-Canvas), damit auch beim PDF-Export exakt.
- **Kein Fit-to-Page:** Alle Aufrufer der PDF-Engine setzen explizit `fit: false` / entfernen `scale`-Parameter für CAD-Viewport-Elemente.

## Nicht im Umfang
- Layer-Sichtbarkeitsschalter im Viewport-Inspektor (Feld `visibleLayers` wird nur vorbereitet).
- Migration bestehender `cad-view`-Bitmap-Elemente (bleiben mit Legacy-Fallback lesbar).
