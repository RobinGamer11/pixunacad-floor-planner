## Problem

Beim Zeichnen einer Wand kann zwar bereits auf den Sub-/Gehrungspunkt einer Nachbarwand gefangen werden (`includeWallOffsetSnaps`), aber:

1. `trimWallEndpointsToNeighbors` zieht den Endpunkt nach dem Commit zurück auf die nächste **Bezugslinie** des Nachbarn — die Wand „rutscht" weg vom Gehrungspunkt zurück auf die Reflinie.
2. Selbst ohne Trim wäre die Verbindung nur geometrisch: der Sub-Mitre-Punkt ist kein Topologie-Knoten. Beim Verschieben/Drehen einer V-Wand würde die angedockte Wand stehenbleiben und der Anschluss bräche.

## Korrektur

Der Anschluss an Sub-/Gehrungskanten soll **nur geometrisch fixiert** werden: Beim Zeichnen bleibt der gefangene Punkt exakt dort, aber er wird später nicht mit der Host-Wand mitgezogen.

### 1. Daten-Modell (`Scene.ts`)

Pro Wand ein neues optionales Feld:

```ts
type WallCornerAnchor =
  | { kind: "subMiter"; hostWallId: string; hostCornerIndex: number }
  | { kind: "subEdge";  hostWallId: string; hostEdgeIndex: number; t: number };

// auf Wall:
cornerAnchors?: (WallCornerAnchor | null)[]; // index-parallel zu corners
```

Serialisierung in `CadApp.ts` (snapshot/restore) analog zu `hiddenCornerIndices` ergänzen.

### 2. Anker beim Commit setzen (`WallTool.ts`)

Bei `_commitPoint` / chain-Knoten: wenn `this.snap.wallId` gesetzt ist UND `snap.wallLine === "sub"`:
- Bei Punkt-Snap auf Sub-Eckpunkt → `{kind:"subMiter", hostWallId, hostCornerIndex}` (Index aus dem getroffenen `subCorners[i]` zurückrechnen).
- Bei Linien-Snap auf Sub-Kante → `{kind:"subEdge", hostWallId, hostEdgeIndex, t}`.

Anker werden in `wall.cornerAnchors[idx]` geschrieben (vor `_runConnectionPipeline`).

### 3. Trim respektiert Anker (`wallConnect.ts`)

`trimWallEndpointsToNeighbors` überspringt Endpunkte, die einen `cornerAnchors[idx]` besitzen — der gefangene Sub-/Gehrungspunkt bleibt erhalten.

### 4. Maintenance / Recompute (`wallTopologyMaintenance.ts`)

Kein Recompute/Mitziehen der Anker. `runWallTopologyMaintenance` darf diese Punkte nur index-parallel mitführen, wenn die eigene Wand gesplittet oder bereinigt wird.

### 5. Topologie-Graph erweitern (`WallTopologyGraph.ts`)

Beim Build zusätzlich für jeden Anker eine Inzidenz auf der Host-Wand am betreffenden Sub-Knoten registrieren (analog `tjunction`-Inzidenz), damit Heal der V-Wände korrekt erkennt: an dieser Stelle hängt etwas → Mitre-Berechnung bleibt stabil.

Optional in dieser Iteration weglassen, falls Heal ohnehin geometrisch korrekt rechnet — Punkt 4 reicht für das sichtbare Andocken.

### 6. Bereinigung bei Wand-Mutation

In `SelectTool._clearEditState` und überall, wo Anker-Hosts gelöscht/geändert werden: `runWallTopologyMaintenance` führt automatisch `reapplySubAnchors` aus, daher kein extra Hook nötig.

## Ergebnis

- Beim Zeichnen rastet die Wand am Sub-/Gehrungspunkt ein und **bleibt** dort (kein Trim-Rücksprung).
- Verschiebt/dreht/skaliert man später eine der V-Wände, bleibt die angedockte Wand an ihrer eigenen Position und wird nicht automatisch mitgezogen.
- Wird die Host-Wand gelöscht, löst sich der Anker auf, der Endpunkt verbleibt zuletzt-bekannt.
- Keine Änderung am UI/Wall-Settings-Panel nötig.

## Betroffene Dateien

- `src/cad/Scene.ts` — Feld `cornerAnchors`
- `src/cad/CadApp.ts` — Snapshot/Restore
- `src/cad/WallTool.ts` — Anker beim Commit setzen
- `src/cad/wallConnect.ts` — Trim respektiert Anker
- `src/cad/wallTopologyMaintenance.ts` — neuer `reapplySubAnchors`-Pass
- `src/cad/WallTopologyGraph.ts` — optional Anker-Inzidenzen
- Test in `src/cad/TopologyEngine.wallSnap.test.ts` ergänzen: Anker bleibt nach Verschieben der Host-Wand korrekt.
