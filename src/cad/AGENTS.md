# AGENTS.md – src/cad

## Treppen
- Treppen sind ein einzelnes `Stair`-Objekt; Stufen, Podeste, Fangpunkte und Beschriftung leitet nur `src/cad/stairGeometry.ts` ab – nie als eigene Scene-Objekte speichern.
- Treppen-Knöpfe = DOM, nie Geometrie; Cursor-Reset in `CadApp.setTool`.
- Treppengriffe laufen über das gemeinsame `PointEditMenu` (CadApp leitet im Bearbeitungsmodus an `StairTool.onPointMenuAction` weiter); bearbeitbare Kanten liefert nur `stairEditableEdges`.
- Restlängen vor Podesten verteilt nur `computeStairGeometry` (max. `MAX_TREAD_ADJUST_M`); Podeste wachsen nie automatisch.
