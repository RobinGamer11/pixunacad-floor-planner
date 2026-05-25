## Problem

Beim aktuellen Render verbinden sich die **Bezugslinien** (durch `wallConnect`-Trim) an gemeinsamen Knoten sauber, aber die **gegenüberliegenden Wandkanten** (Sub-/Hilfslinie) tun das nicht.

Grund: `getWallUnionGroups` → `unionWallSolids` → `buildWallSolidRing` baut pro Wand ein **rohes Rechteck** aus `computeWallLines` (ohne Heal). An einem geteilten Bezugslinien-Endpunkt enden beide Rechtecke senkrecht zu ihrer eigenen Achse — die Boolean-Union ergibt eine L-Form, die innen geschlossen ist, **außen aber eine Lücke / nicht-gemiterte Kante** zeigt.

Die Heal-Logik (`wallHeal.ts → computeHealedWallLines`) berechnet bereits die echten Gehrungspunkte für `main`, `sub` und `help` an jedem Knoten — sie wird nur **nirgends mehr aufgerufen**.

## Lösung (ArchiCAD-Stil)

Pro Wand werden die Solid-Ringe aus den **healed** Main+Sub-Linien gebaut, nicht aus den rohen. Die anschließende Boolean-Union liefert dann automatisch saubere Außengehrungen, T-Stöße und X-Knoten — genau wie in ArchiCAD.

## Schritte

1. **`src/cad/wallSolid.ts`**: neue Funktion `buildHealedWallSolidRing(wall, others, graph)` die intern `computeHealedWallLines` statt `computeWallLines` nutzt. `buildWallSolidRing` bleibt für Selektion / Hit-Test bestehen (oder leitet auf die neue durch).

2. **`src/cad/wallUnion.ts`**:
   - `unionWallSolids(walls, allWalls, graph)` (neue Signatur) baut pro Wand das **healed** Polygon.
   - `getWallUnionGroups(walls, labelId, graph)` reicht Graph + komplette Wandliste durch und nimmt die Topologie-Version in den Cache-Hash mit auf (damit Heal-Änderungen bei Nachbar-Edits invalidieren).

3. **`src/cad/Renderer.ts`** (Zeile 797 / 856):
   - Aufruf auf `getWallUnionGroups(this.scene.walls, labelId, this.scene.getWallTopology())` umstellen.
   - Selektions-Overlay (Zeile 856) ebenfalls über `buildHealedWallSolidRing` rendern, damit der blaue Selektions-Body identisch zur Union-Form ist.

4. **`src/cad/SelectTool.ts`** (Zeile 241): Hit-Test darf weiter das rohe Rechteck nehmen (großzügiger), oder gleich auf healed umstellen — präzisere Selektion, aber kein Korrektheits-Problem. **Beibehalten**, um Drift bei T-Stößen zu vermeiden.

5. **Cache-Invalidierung**: Hash in `getWallUnionGroups` um `scene.getWallTopology()`-Version (z. B. die bereits vorhandene `_wallTopologyHash`) erweitern. Sonst werden Änderungen einer Nachbarwand nicht in fremde Healed-Solids übernommen.

## Erwartetes Ergebnis

- L-Ecke (zwei AW gleicher Dicke, 90°): saubere Außen-Gehrung, kein Versatz an der Außenkante.
- T-Stoß (IW endet an AW): Stirnseite der IW liegt exakt an der AW-Innenkante (durch Heal + Prio-Subtraktion bereits korrekt).
- X-Kreuzung gleicher Priorität: alle vier Außenkanten mitern sauber am Knoten.
- AW-Kreuzung mit IW: AW läuft durch (Prio 200 > 100, Subtraktion erhalten), IW endet sauber an AW-Innenkante.

## Nicht enthalten

- Profilierte Wände / Mehrschicht-Wände.
- Manuelle Override-Gehrungswinkel.
- 3D.
