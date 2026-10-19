# AGENTS.md – src/cad

## Annotation input and library guides
- Infobox placement taps use `Input.canvasTapHandler`; Input owns wheel, mouse-pan and touch gestures so annotation overlays never block navigation.
- Library frame corners come from `LibrarySnapSource` for snapping and `guideGeometry` for right-click; library incident detail directions are omitted to prevent dense guide fans without altering other object guides.

## Treppen
- Treppen sind ein einzelnes `Stair`-Objekt; Stufen, Podeste, Fangpunkte und Beschriftung leitet nur `src/cad/stairGeometry.ts` ab – nie als eigene Scene-Objekte speichern.
- Treppen-Knöpfe = DOM, nie Geometrie; Cursor-Reset in `CadApp.setTool`.
- Treppengriffe laufen über das gemeinsame `PointEditMenu` (CadApp leitet im Bearbeitungsmodus an `StairTool.onPointMenuAction` weiter); bearbeitbare Kanten liefert nur `stairEditableEdges`.
- Restlängen vor Podesten verteilt nur `computeStairGeometry` (max. `MAX_TREAD_ADJUST_M`); Podeste wachsen nie automatisch.

## Pipette & Fangvorrang
- Pipetten-„Weiterzeichnen“ läuft nur über `styleCarry` in `Scene.ts` (flüchtig, beim Werkzeugwechsel gelöscht) – nie Werkzeug-Defaults dauerhaft überschreiben.
- Fangpunkte des ausgewählten Objekts prüft `SelectTool._selectedObjectPointHit` vor allen anderen Treffern, damit deckungsgleiche Fremdpunkte nie gewinnen.
- Infobox-Pins folgen `Renderer.afterRender` synchron; Werkzeug-/Auswahlwechsel schließen Infobox-Einstellungen in `CadApp.setTool`/`setSelection`.

## 3D
- 3D-Körper leitet nur `src/cad/three3d/geometryDerivation.ts` aus bestehenden Szene-Objekten ab – flüchtig, nie gespeichert; 2D bleibt führend.
- Welthöhe = `sheetElevationM` (Blatt) + `objectElevationM` (Objekt, über `objectMeta.ts` serialisiert); `heightM` bleibt Körper-/Maßhöhe, kein zweites Höhenfeld.
