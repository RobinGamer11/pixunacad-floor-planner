# Plan: Wand-Preview reparieren & Innenwand-Aufbau vereinheitlichen

## Punkt 01 — Preview wird beim Zeichnen der zweiten Wand nicht angezeigt

### Diagnose
In `WallTool._drawOverlay()` (Zeilen ~687–722) wird die Live-Vorschau gebaut.
Sobald bereits eine Wand mit gleichem `labelId` existiert, wird der Pfad
mit `WallTopologyGraph.build([...others, previewWall])` + `computeHealedWallLines`
genommen. Vermutete Ursache:

- Der Preview-Wall hat erst **einen** echten Eckpunkt + den Maus-Punkt
  (`allCorners = [...corners, previewPt]`, also Länge 2). Wenn `previewPt` per
  Snap **exakt auf der bestehenden Wand** liegt (Wand-Endpunkt-Snap, häufig
  beim ersten Mausmove nach Commit), entsteht im Graphen ein Knoten zwischen
  den beiden Wänden, und `computeHealedWallLines` klemmt die Preview-Main-Linie
  auf den selben Punkt → `mainCorners` kollabiert auf einen Punkt → keine
  sichtbare Linie. Außerdem wird `subCorners`/`helpCorners` aus der gehealten
  Variante NICHT gezeichnet, sondern aus dem rohen Offset — der ist bei nur
  2 Punkten aber sichtbar. Mainline (die eigentliche Wand) fehlt.

### Fix
1. Preview-Wall **nicht** in den Topologie-Graph einhängen, solange er nur
   2 Eckpunkte hat **und** noch kein echter zweiter Klick erfolgte.
   Stattdessen: rohe `computeWallLines` für die Preview verwenden und die
   gehealten Endpunkte **nur** am Startpunkt (Index 0, bereits committed)
   anwenden, nicht am Maus-Punkt.
2. Konkret in `_drawOverlay`:
   - Immer `computeWallLines` als Grundlage benutzen.
   - Anschließend nur die Eckpunkte mit Index < `this.corners.length` durch
     gehealte Werte ersetzen (über `computeHealedWallLines` mit allen
     `others`-Wänden, aber das Preview-Endstück bleibt roh).
3. Falls die Maus tatsächlich auf einer bestehenden Wand snappt
   (`snap.wallId`), trotzdem den rohen Endpunkt anzeigen — der Snap-Dot
   markiert den Anschluss bereits visuell.

## Punkt 02 — Innenwände codeseitig wie Außenwände, nur Priorität unterscheidet

Aktuelle Sonderfälle für `kind === "inner"`/`"outer"` entfernen, sodass
Geometrie, Heal und Topologie identisch laufen. Priorität (für
Konfliktauflösung beim Heal/Trim) bleibt das einzige Unterscheidungsmerkmal.

### Änderungen

- **`src/cad/wallHeal.ts`** (Z. 99 & 140):
  Die Bedingung `if (wall.kind === "outer" && ow.kind === "inner") continue;`
  entfernen. Stattdessen wird die Priorität (`priorityIndex`) verwendet, um
  bei Konflikten zu entscheiden, welche Wand gewinnt — Außen heilt jetzt auch
  gegen Innen, aber Außen-Klemmungen werden nur akzeptiert, wenn die
  Nachbarwand gleiche oder höhere Priorität hat.
  → Konkret: Außen vs. Innen → Außen ignoriert Innen weiterhin beim Klemmen
  (Innen darf Außen nicht stutzen), aber das wird über
  `priorityIndex(ow.kind, …) <= priorityIndex(wall.kind, …)` ausgedrückt
  statt über hartkodierte `kind`-Checks. Resultat ist verhaltensgleich,
  Code aber einheitlich.

- **`src/cad/TopologyEngine.ts`** (Z. ~200):
  `activeDrawingWallKind`-Sonderlogik (`preferSub` für inner-vs-outer)
  entfernen. Sub-Linien werden für alle Wand-Arten gleichermaßen als
  Snap-Kandidat angeboten; die Priorität entscheidet rein über `priorityWallId`
  und Distanz, nicht über `kind`. `activeDrawingWallKind` kann
  als Feld entfernt werden (auch Setzer in `WallTool.activate/cancel/update`).

- **`src/cad/Scene.ts`** (Z. 403):
  `priority` bleibt kind-abhängig (Außen=200, Innen=100) — das ist die
  gewünschte Einzelausnahme.

- **`src/cad/WallTopologyGraph.ts`** (`priorityIndex`):
  Unverändert — ist der zentrale Punkt, an dem die Priorität wirkt.

- **`src/cad/wallUnion.ts` / `src/cad/Scene.ts`** (Default-Fillfarbe):
  Bleibt `kind`-abhängig (rein visuell, nicht topologisch).

### Erwartetes Verhalten
- Innenwand und Außenwand werden geometrisch identisch gezeichnet, gehealt,
  getrimmt, verbunden.
- An T-Stößen Außen↔Innen gewinnt weiterhin Außen (höhere Priorität) —
  Innenwand mitert/stoppt an Außenkante, nicht umgekehrt.
- Snap-Verhalten beim Zeichnen ist für beide Wandtypen gleich.

## Betroffene Dateien
- `src/cad/WallTool.ts` (Preview-Fix + `activeDrawingWallKind` entfernen)
- `src/cad/TopologyEngine.ts` (Sub-Snap-Sonderlogik entfernen, Feld weg)
- `src/cad/wallHeal.ts` (Kind-Checks durch Prioritäts-Vergleich ersetzen)
- ggf. `src/cad/TopologyEngine.wallSnap.test.ts` (Tests anpassen)
