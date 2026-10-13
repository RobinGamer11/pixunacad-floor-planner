# AGENTS.md – src/cad

## Annotation input and library guides
- Infobox placement taps use `Input.canvasTapHandler`; Input owns wheel, mouse-pan and touch gestures so annotation overlays never block navigation.
- Library frame corners come from `LibrarySnapSource` for snapping and `guideGeometry` for right-click; library incident detail directions are omitted to prevent dense guide fans without altering other object guides.

## Treppen
- Treppen sind ein einzelnes `Stair`-Objekt; Stufen, Podeste, Fangpunkte und Beschriftung leitet nur `src/cad/stairGeometry.ts` ab – nie als eigene Scene-Objekte speichern.
- Treppen-Knöpfe = DOM, nie Geometrie; Cursor-Reset in `CadApp.setTool`.
- Treppengriffe laufen über das gemeinsame `PointEditMenu` (CadApp leitet im Bearbeitungsmodus an `StairTool.onPointMenuAction` weiter); bearbeitbare Kanten liefert nur `stairEditableEdges`.
- Restlängen vor Podesten verteilt nur `computeStairGeometry` (max. `MAX_TREAD_ADJUST_M`); Podeste wachsen nie automatisch.
